export type PoiCategory = "attraction" | "scenic" | "food" | "hotel" | "activity";

export type PoiNodeData = {
  id: string;
  title: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  joy: number;
  timeCostMinutes: number;
  budgetImpact: number;
  energyEffort: number;
  uniqueness: number;
};

export const seedPois: PoiNodeData[] = [
  {
    id: "poi-1",
    title: "City Gallery",
    category: "attraction",
    lat: 48.8606,
    lng: 2.3376,
    joy: 8,
    timeCostMinutes: 120,
    budgetImpact: 30,
    energyEffort: 4,
    uniqueness: 7
  },
  {
    id: "poi-2",
    title: "Riverside Walk",
    category: "scenic",
    lat: 48.8573,
    lng: 2.3544,
    joy: 7,
    timeCostMinutes: 60,
    budgetImpact: 0,
    energyEffort: 3,
    uniqueness: 6
  },
  {
    id: "poi-3",
    title: "Market Lunch",
    category: "food",
    lat: 48.8532,
    lng: 2.3499,
    joy: 8,
    timeCostMinutes: 75,
    budgetImpact: 25,
    energyEffort: 2,
    uniqueness: 5
  },
  {
    id: "poi-4",
    title: "Boutique Stay",
    category: "hotel",
    lat: 48.8688,
    lng: 2.3324,
    joy: 6,
    timeCostMinutes: 30,
    budgetImpact: 85,
    energyEffort: 1,
    uniqueness: 6
  },
  {
    id: "poi-5",
    title: "Evening Workshop",
    category: "activity",
    lat: 48.8652,
    lng: 2.3608,
    joy: 9,
    timeCostMinutes: 90,
    budgetImpact: 40,
    energyEffort: 5,
    uniqueness: 8
  }
];
