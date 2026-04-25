# JourneyGraph

JourneyGraph is a premium node-based travel planner built on top of a JointJS TypeScript architecture, tailored for high-end family itinerary design.

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

## Planner features

- **Graph-based itinerary builder** with draggable nodes and editable links.
- **Luxury card-style nodes** with icon, title, time window, duration, and metadata.
- **Day grouping** via collapsible lanes (Day 1–Day 4).
- **Stencil palette** for quick node insertion.
- **Inspector panel** for editing node fields (category/day/cost/timing/reservation/notes).
- **Top summary bar** with total cost, activities, duration, and validation alert count.
- **Filters** by day, category, max cost, and priority.
- **Critical path highlighting** (gold edges) and optional/fallback node de-emphasis.
- **Minimap + pan/zoom + graph interactions** preserved.

## Seed Yellowstone itinerary

The app initializes with:

- **Trip:** 4-Day Luxury Family Yellowstone Getaway (Jul 1 – Jul 5, 2026)
- **Travelers:** 3
- **Nodes:** Flights, transfers, attractions, scenic points, restaurants, guided activities, decision/fallback branches

Data source is in `src/seed.ts`.

## Node types

Supported `TripNodeType` values:

- `flight`
- `transport`
- `attraction`
- `restaurant`
- `guided_activity`
- `scenic_point`
- `decision`
- `fallback`

## Data model

Core TypeScript interfaces are in `src/types.ts`:

- `TripPlan`
- `TripDay`
- `TripNodeData`
- `TripNodeType`
- `TripEdgeData`
- `PlannerValidationIssue`
- `ExportedItinerary`

## Validation intelligence

Implemented in `src/planner-utils.ts`:

- Detect overlapping activities
- Flag overbooked days (>4 major activities)
- Flag missing reservations
- Highlight long travel chains
- Suggest a slow day if overloaded
- Mark high-cost nodes

## Export formats

Export actions are available in the top bar:

1. **JSON graph** (`journeygraph-plan.json`)
2. **Markdown itinerary** (`journeygraph-itinerary.md`)
3. **Printable family view** (`journeygraph-family-view.txt`)

## Design language

JourneyGraph styling follows a high-end travel visual system:

- Warm off-white background (`#F7F5F2`)
- Charcoal text (`#1F1F1F`)
- Accent gold + sage/sky/lavender/sand supporting colors
- Rounded cards, soft shadows, generous spacing, and minimal clutter
