import {
  ExportedItinerary,
  PlannerValidationIssue,
  TripNodeData,
  TripNodeType,
  TripPlan
} from './types';

const HIGH_COST_THRESHOLD = 500;

const majorTypes: TripNodeType[] = ['flight', 'transport', 'attraction', 'guided_activity', 'scenic_point'];

function parseTimeWindow(day: string, timeWindow: string): [number, number] | null {
  const [startRaw, endRaw] = timeWindow.split('–');
  if (!startRaw || !endRaw) return null;
  const start = Date.parse(`${day}T${startRaw.slice(0, 5)}:00Z`);
  const endTime = endRaw.includes('+1') ? endRaw.slice(0, 5) : endRaw.slice(0, 5);
  let end = Date.parse(`${day}T${endTime}:00Z`);
  if (endRaw.includes('+1') || end < start) end += 24 * 60 * 60 * 1000;
  return [start, end];
}

export function validatePlan(plan: TripPlan): PlannerValidationIssue[] {
  const issues: PlannerValidationIssue[] = [];

  for (const node of plan.nodes) {
    if (node.reservationStatus === 'required' || node.reservationStatus === 'pending') {
      issues.push({
        type: 'missing_reservation',
        severity: node.reservationStatus === 'pending' ? 'warning' : 'error',
        nodeIds: [node.id],
        day: node.day,
        message: `${node.title} needs reservation follow-up (${node.reservationStatus}).`
      });
    }

    if (node.cost >= HIGH_COST_THRESHOLD) {
      issues.push({
        type: 'high_cost',
        severity: 'info',
        nodeIds: [node.id],
        day: node.day,
        message: `${node.title} is a high-cost item (${node.cost} ${plan.currency}).`
      });
    }
  }

  for (const day of plan.days) {
    const dayNodes = plan.nodes.filter((n) => n.day === day.day);
    const majorCount = dayNodes.filter((n) => majorTypes.includes(n.category)).length;
    if (majorCount > 4) {
      issues.push({
        type: 'overbooked_day',
        severity: 'warning',
        day: day.day,
        message: `Day ${day.day} has ${majorCount} major activities and may be overbooked.`
      });
      issues.push({
        type: 'slow_day_suggestion',
        severity: 'info',
        day: day.day,
        message: `Consider a slow-day cadence on Day ${day.day} with one flexible or optional stop.`
      });
    }

    for (let i = 0; i < dayNodes.length; i += 1) {
      for (let j = i + 1; j < dayNodes.length; j += 1) {
        const a = parseTimeWindow(day.date, dayNodes[i].timeWindow);
        const b = parseTimeWindow(day.date, dayNodes[j].timeWindow);
        if (!a || !b) continue;
        if (a[0] < b[1] && b[0] < a[1]) {
          issues.push({
            type: 'overlap',
            severity: 'warning',
            day: day.day,
            nodeIds: [dayNodes[i].id, dayNodes[j].id],
            message: `Potential overlap between ${dayNodes[i].title} and ${dayNodes[j].title}.`
          });
        }
      }
    }
  }

  const travelChainNodes = plan.nodes.filter((n) => n.category === 'flight' || n.category === 'transport');
  if (travelChainNodes.length >= 3) {
    issues.push({
      type: 'long_travel_chain',
      severity: 'warning',
      nodeIds: travelChainNodes.map((n) => n.id),
      message: `Long travel chain detected (${travelChainNodes.length} segments).`
    });
  }

  return issues;
}

export function summarizePlan(plan: TripPlan, issues: PlannerValidationIssue[]) {
  const totalCost = plan.nodes.reduce((sum, node) => sum + node.cost, 0);
  const totalDurationHours = plan.nodes.reduce((sum, node) => sum + parseDurationHours(node.duration), 0);
  return {
    totalCost,
    totalActivities: plan.nodes.length,
    totalDurationHours: Number(totalDurationHours.toFixed(1)),
    issues: issues.length
  };
}

export function parseDurationHours(duration: string): number {
  const hourMatch = duration.match(/(\d+)h/);
  const minuteMatch = duration.match(/(\d+)m/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  return hours + minutes / 60;
}

export function exportAsJson(plan: TripPlan, issues: PlannerValidationIssue[]): string {
  const payload: ExportedItinerary = {
    plan,
    generatedAt: new Date().toISOString(),
    summary: summarizePlan(plan, issues)
  };
  return JSON.stringify(payload, null, 2);
}

export function exportAsMarkdown(plan: TripPlan, issues: PlannerValidationIssue[]): string {
  const summary = summarizePlan(plan, issues);
  const lines: string[] = [];
  lines.push(`# ${plan.title}`);
  lines.push('');
  lines.push(`**Dates:** ${plan.dates}`);
  lines.push(`**Travelers:** ${plan.travelers} people`);
  lines.push(`**Total Cost:** ${summary.totalCost} ${plan.currency}`);
  lines.push(`**Activities:** ${summary.totalActivities}`);
  lines.push('');

  for (const day of plan.days) {
    lines.push(`## Day ${day.day} — ${day.title} (${day.date})`);
    plan.nodes
      .filter((node) => node.day === day.day)
      .forEach((node: TripNodeData) => {
        lines.push(
          `- ${node.icon} **${node.title}** (${node.category}) · ${node.timeWindow} · ${node.duration} · ${node.location} · ${node.cost} ${plan.currency}`
        );
      });
    lines.push('');
  }

  if (issues.length) {
    lines.push('## Planner Alerts');
    for (const issue of issues) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}

export function exportPrintableFamilyView(plan: TripPlan): string {
  const lines: string[] = [
    `${plan.title}`,
    `${plan.dates} · ${plan.travelers} travelers`,
    '----------------------------------------'
  ];

  for (const day of plan.days) {
    lines.push(`Day ${day.day}: ${day.title}`);
    for (const node of plan.nodes.filter((n) => n.day === day.day)) {
      lines.push(`• ${node.timeWindow} ${node.title} (${node.duration})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
