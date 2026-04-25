# JourneyGraph

JourneyGraph is a premium node-based travel planner built with TypeScript + JointJS and anchored to a real map layer (Leaflet + OpenStreetMap).

## Run locally

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
npm run preview
```

## Planner experience

- **Map-anchored workflow canvas**: each POI node is tied to latitude/longitude and renders over Yellowstone geography.
- **Drag-and-drop nodes**: move nodes directly; node geo-coordinates update from canvas interactions.
- **Branching journey graph** with critical path highlighting.
- **Decision support panel** for trade-off comparisons (side-by-side weighted option cards from decision nodes).
- **Running trip score** with live metrics in the top summary row.

## Node weighting model

Each node includes multi-dimensional planning weights:

- 🌟 `joy`
- ⏱️ `timeCost`
- 💸 `budgetImpact`
- 🚶 `effort`
- 🎲 `uniqueness`

These dimensions feed both per-node visuals and aggregate `tripScore` calculations.

## Core features

- Day grouping lanes
- Inspector editing (category, cost, timing, and weights)
- Left palette for quick node insertion by type
- Filters by day/category/cost/priority
- Validation issue list
- Export formats:
  - JSON graph
  - Markdown itinerary
  - Printable family view

## Seed itinerary

The app ships with a full Yellowstone seed plan:

- **Trip**: 4-Day Luxury Family Yellowstone Getaway
- **Dates**: Jul 1 – Jul 5, 2026
- Includes transport, attractions, scenic points, restaurants, guided activities, and decision/fallback branching.

## TypeScript models

Defined in `src/types.ts`:

- `TripPlan`
- `TripDay`
- `TripNodeData`
- `TripNodeType`
- `TripEdgeData`
- `PlannerValidationIssue`
- `ExportedItinerary`
- `TripNodeWeights`
- `GeoPoint`

## Validation intelligence

Implemented in `src/planner-utils.ts`:

- Overlapping activity detection
- Overbooked-day warning (>4 major activities)
- Missing reservation flags
- Long travel chain warnings
- Slow-day recommendations
- High-cost markers

## Design language

- Warm off-white canvas and premium card styling
- Rounded corners + soft shadows
- Warm color emphasis for high-joy nodes, cooler tone for lower-joy/obligatory stops
- Subtle motion in UI controls and issue rendering
