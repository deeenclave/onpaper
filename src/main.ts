import './styles.css';
import { dia, shapes, util } from '@joint/core';
import { yellowstoneSeed } from './seed';
import { TripNodeData, TripNodeType } from './types';
import {
  exportAsJson,
  exportAsMarkdown,
  exportPrintableFamilyView,
  summarizePlan,
  validatePlan
} from './planner-utils';

const TYPE_COLORS: Record<TripNodeType, string> = {
  flight: '#D4A373',
  transport: '#A9D6E5',
  attraction: '#6B8E7A',
  restaurant: '#EDE0D4',
  guided_activity: '#CDB4DB',
  scenic_point: '#A9D6E5',
  decision: '#D4A373',
  fallback: '#CDB4DB'
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 118;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('No app mount');

app.innerHTML = `
<div class="journey-app">
  <header class="summary-bar">
    <div>
      <h1>JourneyGraph</h1>
      <p>${yellowstoneSeed.title} · ${yellowstoneSeed.dates}</p>
    </div>
    <div class="metrics" id="metrics"></div>
    <div class="actions">
      <button id="export-json">Export JSON</button>
      <button id="export-md">Export Markdown</button>
      <button id="export-print">Printable View</button>
    </div>
  </header>
  <section class="filters" id="filters"></section>
  <main class="layout">
    <aside class="panel" id="stencil-host"><h3>Node Palette</h3><div id="stencil" class="stencil-buttons"></div></aside>
    <section class="canvas-shell">
      <div id="paper"></div>
      <div id="minimap"></div>
    </section>
    <aside class="panel">
      <h3>Inspector</h3>
      <div id="inspector"></div>
      <h3>Validation Alerts</h3>
      <ul class="issues" id="issues"></ul>
    </aside>
  </main>
</div>`;

const graph = new dia.Graph({}, { cellNamespace: shapes });
const paper = new dia.Paper({
  model: graph,
  el: document.getElementById('paper') as HTMLElement,
  width: '100%',
  height: 1000,
  gridSize: 16,
  drawGrid: { name: 'mesh' },
  async: true,
  cellViewNamespace: shapes,
  defaultConnectionPoint: { name: 'boundary' },
  defaultLink: () =>
    new shapes.standard.Link({
      attrs: {
        line: {
          stroke: '#B0B0B0',
          strokeWidth: 1.5,
          targetMarker: { type: 'path', d: 'M 10 -5 0 0 10 5 z' }
        }
      }
    }),
  linkPinning: false,
  background: { color: '#F7F5F2' },
  interactive: (cellView) => !cellView.model.get('isLane')
});

const miniPaper = new dia.Paper({
  model: graph,
  el: document.getElementById('minimap') as HTMLElement,
  width: 240,
  height: 160,
  interactive: false,
  async: true,
  cellViewNamespace: shapes,
  background: { color: '#FFFFFF' }
});
miniPaper.scale(0.12);

paper.on('blank:mousewheel', (_evt, _x, _y, delta) => {
  const scale = paper.scale();
  const next = util.clamp(scale.sx + delta * 0.1, 0.3, 2);
  paper.scale(next, next);
});

let panning = false;
let panOrigin = { x: 0, y: 0 };
paper.on('blank:pointerdown', (_evt, x, y) => {
  panning = true;
  panOrigin = { x, y };
});
paper.on('cell:pointerup blank:pointerup', () => {
  panning = false;
});
paper.on('blank:pointermove', (_evt, x, y) => {
  if (!panning) return;
  const tx = paper.translate().tx + (x - panOrigin.x);
  const ty = paper.translate().ty + (y - panOrigin.y);
  paper.translate(tx, ty);
  panOrigin = { x, y };
});

const nodeCellsById = new Map<string, { card: shapes.standard.Rectangle; strip: shapes.standard.Rectangle }>();
const laneCells = new Map<number, shapes.standard.Rectangle>();

function laneForDay(day: number, y: number): shapes.standard.Rectangle {
  const lane = new shapes.standard.Rectangle({
    id: `lane-${day}`,
    position: { x: 20, y },
    size: { width: 1860, height: 180 },
    isLane: true,
    attrs: {
      body: {
        fill: '#FFFFFFC8',
        stroke: '#EDE0D4',
        rx: 16,
        ry: 16,
        strokeWidth: 1
      },
      label: {
        text: `Day ${day}`,
        fill: '#1F1F1F',
        textAnchor: 'left',
        refX: 18,
        refY: 20,
        fontSize: 14,
        fontWeight: 700
      }
    }
  });
  lane.addTo(graph);
  lane.toBack();
  return lane;
}

function createTravelNode(node: TripNodeData, x: number, y: number) {
  const fill = node.optional ? '#FFFFFFA0' : '#FFFFFF';
  const card = new shapes.standard.Rectangle({
    id: node.id,
    position: { x, y },
    size: { width: NODE_WIDTH, height: NODE_HEIGHT },
    attrs: {
      body: {
        fill,
        stroke: '#EDE0D4',
        strokeWidth: 1.2,
        rx: 14,
        ry: 14
      },
      label: {
        text: `${node.icon} ${node.title}\n${node.timeWindow} · ${node.duration}\n${node.location}`,
        fill: '#1F1F1F',
        fontSize: 12,
        fontFamily: 'Inter, ui-sans-serif',
        textVerticalAnchor: 'top',
        textAnchor: 'left',
        refX: 16,
        refY: 10,
        whiteSpace: 'normal'
      }
    },
    nodeData: node
  });

  const strip = new shapes.standard.Rectangle({
    id: `${node.id}-strip`,
    position: { x: x + 2, y: y + 2 },
    size: { width: 8, height: NODE_HEIGHT - 4 },
    isDecoration: true,
    attrs: {
      body: {
        fill: TYPE_COLORS[node.category],
        stroke: 'transparent',
        rx: 4,
        ry: 4
      }
    }
  });

  card.addTo(graph);
  strip.addTo(graph);
  card.embed(strip);
  nodeCellsById.set(node.id, { card, strip });
}

function createLink(source: string, target: string, label?: string, critical?: boolean) {
  const link = new shapes.standard.Link({
    source: { id: source },
    target: { id: target },
    attrs: {
      line: {
        stroke: critical ? '#D4A373' : '#B0B0B0',
        strokeWidth: critical ? 2.5 : 1.4,
        strokeDasharray: critical ? '0' : '5 3',
        targetMarker: {
          type: 'path',
          d: 'M 10 -5 0 0 10 5 z'
        }
      }
    },
    labels: label
      ? [
          {
            position: 0.5,
            attrs: {
              text: { text: label, fill: '#1F1F1F', fontSize: 11 },
              rect: { fill: '#F7F5F2', stroke: '#EDE0D4', rx: 10, ry: 10 }
            }
          }
        ]
      : undefined
  });
  link.addTo(graph);
}

function renderGraph() {
  graph.clear();
  nodeCellsById.clear();
  laneCells.clear();

  yellowstoneSeed.days.forEach((day, index) => {
    const laneY = 30 + index * 220;
    const lane = laneForDay(day.day, laneY);
    lane.attr('label/text', `Day ${day.day} · ${day.title} · ${day.date}`);
    laneCells.set(day.day, lane);

    const dayNodes = yellowstoneSeed.nodes.filter((n) => n.day === day.day);
    dayNodes.forEach((node, nodeIndex) => {
      const x = 60 + nodeIndex * 290;
      const y = laneY + 44;
      createTravelNode(node, x, y);
    });
  });

  yellowstoneSeed.edges.forEach((e) => createLink(e.source, e.target, e.label, e.critical));
}

function refreshMetricsAndIssues() {
  const issues = validatePlan(yellowstoneSeed);
  const summary = summarizePlan(yellowstoneSeed, issues);
  const metricsEl = document.getElementById('metrics') as HTMLElement;
  metricsEl.innerHTML = `
    <div class="metric"><span>Total Cost</span><strong>${summary.totalCost} EUR</strong></div>
    <div class="metric"><span>Activities</span><strong>${summary.totalActivities}</strong></div>
    <div class="metric"><span>Total Duration</span><strong>${summary.totalDurationHours}h</strong></div>
    <div class="metric"><span>Alerts</span><strong>${summary.issues}</strong></div>`;

  const issuesEl = document.getElementById('issues') as HTMLElement;
  issuesEl.innerHTML = issues
    .map((i) => `<li class="${i.severity}"><strong>${i.severity.toUpperCase()}</strong> ${i.message}</li>`)
    .join('');
}

function addQuickNode(type: TripNodeType) {
  const id = `custom-${Math.random().toString(36).slice(2, 9)}`;
  const data: TripNodeData = {
    id,
    title: `${type.replace('_', ' ')} node`,
    category: type,
    day: 1,
    timeWindow: '09:00–10:00',
    duration: '1h',
    location: 'Custom location',
    cost: 0,
    priority: 'medium',
    reservationStatus: 'not_required',
    notes: '',
    tags: ['new'],
    icon: '📍'
  };
  yellowstoneSeed.nodes.push(data);
  renderGraph();
  refreshMetricsAndIssues();
}

function renderStencil() {
  const stencilHost = document.getElementById('stencil') as HTMLElement;
  stencilHost.innerHTML = '';
  (Object.keys(TYPE_COLORS) as TripNodeType[]).forEach((type) => {
    const button = document.createElement('button');
    button.className = 'stencil-btn';
    button.style.borderColor = TYPE_COLORS[type];
    button.textContent = `+ ${type.replace('_', ' ')}`;
    button.addEventListener('click', () => addQuickNode(type));
    stencilHost.appendChild(button);
  });
}

function renderFilters() {
  const filterEl = document.getElementById('filters') as HTMLElement;
  filterEl.innerHTML = `
    <label>Day <select id="day-filter"><option value="all">All</option>${yellowstoneSeed.days
      .map((d) => `<option value="${d.day}">Day ${d.day}</option>`)
      .join('')}</select></label>
    <label>Category <select id="category-filter"><option value="all">All</option>${Object.keys(TYPE_COLORS)
      .map((type) => `<option value="${type}">${type}</option>`)
      .join('')}</select></label>
    <label>Max Cost <input id="cost-filter" type="number" min="0" placeholder="No limit"/></label>
    <label>Priority <select id="priority-filter"><option value="all">All</option><option>high</option><option>medium</option><option>low</option></select></label>
    <button id="toggle-day-groups">Collapse / Expand Day Groups</button>`;

  const apply = () => {
    const day = (document.getElementById('day-filter') as HTMLSelectElement).value;
    const category = (document.getElementById('category-filter') as HTMLSelectElement).value;
    const costInput = (document.getElementById('cost-filter') as HTMLInputElement).value;
    const maxCost = costInput ? Number(costInput) : Infinity;
    const priority = (document.getElementById('priority-filter') as HTMLSelectElement).value;

    yellowstoneSeed.nodes.forEach((node) => {
      const visible =
        (day === 'all' || node.day === Number(day)) &&
        (category === 'all' || node.category === category) &&
        node.cost <= maxCost &&
        (priority === 'all' || node.priority === priority);
      const bundle = nodeCellsById.get(node.id);
      bundle?.card.attr('root/display', visible ? 'block' : 'none');
      bundle?.strip.attr('root/display', visible ? 'block' : 'none');
    });
  };

  filterEl.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', apply));

  let collapsed = false;
  document.getElementById('toggle-day-groups')?.addEventListener('click', () => {
    collapsed = !collapsed;
    yellowstoneSeed.days.forEach((day) => {
      const lane = laneCells.get(day.day);
      lane?.resize(lane.size().width, collapsed ? 46 : 180);
      yellowstoneSeed.nodes
        .filter((node) => node.day === day.day)
        .forEach((node) => {
          const bundle = nodeCellsById.get(node.id);
          bundle?.card.attr('root/display', collapsed ? 'none' : 'block');
          bundle?.strip.attr('root/display', collapsed ? 'none' : 'block');
        });
    });
  });
}

function attachInspector() {
  paper.on('element:pointerclick', (cellView) => {
    const id = cellView.model.id.toString();
    const data = yellowstoneSeed.nodes.find((n) => n.id === id);
    if (!data) return;

    const inspectorEl = document.getElementById('inspector') as HTMLElement;
    inspectorEl.innerHTML = `
      <div class="form-field"><label>Title</label><input id="ins-title" value="${data.title}"/></div>
      <div class="form-field"><label>Type</label><select id="ins-category">${Object.keys(TYPE_COLORS)
        .map((type) => `<option value="${type}" ${data.category === type ? 'selected' : ''}>${type}</option>`)
        .join('')}</select></div>
      <div class="form-grid">
        <div class="form-field"><label>Day</label><input id="ins-day" type="number" min="1" max="4" value="${data.day}"/></div>
        <div class="form-field"><label>Cost</label><input id="ins-cost" type="number" value="${data.cost}"/></div>
      </div>
      <div class="form-grid">
        <div class="form-field"><label>Time Window</label><input id="ins-time" value="${data.timeWindow}"/></div>
        <div class="form-field"><label>Duration</label><input id="ins-duration" value="${data.duration}"/></div>
      </div>
      <div class="form-field"><label>Reservation</label><select id="ins-reservation">
      ${['required', 'booked', 'pending', 'not_required']
        .map((s) => `<option value="${s}" ${data.reservationStatus === s ? 'selected' : ''}>${s}</option>`)
        .join('')}</select></div>
      <div class="form-field"><label>Notes</label><textarea id="ins-notes">${data.notes}</textarea></div>
      <button id="ins-save">Save node</button>`;

    document.getElementById('ins-save')?.addEventListener('click', () => {
      data.title = (document.getElementById('ins-title') as HTMLInputElement).value;
      data.category = (document.getElementById('ins-category') as HTMLSelectElement).value as TripNodeType;
      data.day = Number((document.getElementById('ins-day') as HTMLInputElement).value);
      data.cost = Number((document.getElementById('ins-cost') as HTMLInputElement).value);
      data.timeWindow = (document.getElementById('ins-time') as HTMLInputElement).value;
      data.duration = (document.getElementById('ins-duration') as HTMLInputElement).value;
      data.reservationStatus = (document.getElementById('ins-reservation') as HTMLSelectElement).value as TripNodeData['reservationStatus'];
      data.notes = (document.getElementById('ins-notes') as HTMLTextAreaElement).value;
      renderGraph();
      refreshMetricsAndIssues();
    });
  });
}

function wireExportButtons() {
  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('export-json')?.addEventListener('click', () => {
    const issues = validatePlan(yellowstoneSeed);
    download('journeygraph-plan.json', exportAsJson(yellowstoneSeed, issues), 'application/json');
  });
  document.getElementById('export-md')?.addEventListener('click', () => {
    const issues = validatePlan(yellowstoneSeed);
    download('journeygraph-itinerary.md', exportAsMarkdown(yellowstoneSeed, issues), 'text/markdown');
  });
  document.getElementById('export-print')?.addEventListener('click', () => {
    download('journeygraph-family-view.txt', exportPrintableFamilyView(yellowstoneSeed), 'text/plain');
  });
}

renderGraph();
renderStencil();
renderFilters();
refreshMetricsAndIssues();
attachInspector();
wireExportButtons();
