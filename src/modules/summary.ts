import type { PoiNodeData } from "./poi-data";

export type ItinerarySummary = {
  count: number;
  totalTimeMinutes: number;
  totalBudget: number;
  avgJoy: number;
  totalEnergy: number;
  avgUniqueness: number;
};

export function calculateSummary(linkedPoiIds: string[], poiById: Map<string, PoiNodeData>): ItinerarySummary {
  const uniqueIds = [...new Set(linkedPoiIds)];
  const pois = uniqueIds
    .map((id) => poiById.get(id))
    .filter((poi): poi is PoiNodeData => Boolean(poi));

  if (pois.length === 0) {
    return {
      count: 0,
      totalTimeMinutes: 0,
      totalBudget: 0,
      avgJoy: 0,
      totalEnergy: 0,
      avgUniqueness: 0
    };
  }

  const totals = pois.reduce(
    (acc, poi) => {
      acc.totalTimeMinutes += poi.timeCostMinutes;
      acc.totalBudget += poi.budgetImpact;
      acc.totalEnergy += poi.energyEffort;
      acc.totalJoy += poi.joy;
      acc.totalUniqueness += poi.uniqueness;
      return acc;
    },
    { totalTimeMinutes: 0, totalBudget: 0, totalEnergy: 0, totalJoy: 0, totalUniqueness: 0 }
  );

  return {
    count: pois.length,
    totalTimeMinutes: totals.totalTimeMinutes,
    totalBudget: totals.totalBudget,
    avgJoy: Number((totals.totalJoy / pois.length).toFixed(1)),
    totalEnergy: totals.totalEnergy,
    avgUniqueness: Number((totals.totalUniqueness / pois.length).toFixed(1))
  };
}
