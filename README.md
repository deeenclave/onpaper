# Methodical Tourist (MVP 1)

A minimal TypeScript prototype that combines Leaflet (map) and JointJS (graph overlay) to plan a rough itinerary using real-world POI coordinates.

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

## MVP 1 features

- Leaflet map using OpenStreetMap tiles as the base canvas.
- Transparent JointJS overlay for POI node cards pinned to latitude/longitude.
- Node/map synchronization on pan, zoom, and resize.
- Connect POIs with links to sketch an itinerary sequence.
- Summary panel for connected POIs:
  - count
  - total time
  - total budget
  - average joy
  - total energy
  - average uniqueness
- Replaceable seed data module with 5 generic sample POIs.

## Increment 2 foundation included

- Layered DOM/CSS structure for future visual expansion:
  - base map layer
  - graph overlay layer
  - separate floating UI layer
- Calm map integration baseline (desaturated map treatment + soft gradient blend).
- Rounded glass-like floating panels and controls.
- Map opacity slider (20%–100%, defaults to 70%) that only affects map tiles.
- Nodes and links remain fully opaque so itinerary structure stays visually dominant.

## Architecture (modular)

- `src/modules/map.ts` – Leaflet setup.
- `src/modules/graph.ts` – JointJS setup and connectable POI cards.
- `src/modules/sync.ts` – lat/lng → screen coordinate syncing.
- `src/modules/poi-data.ts` – replaceable POI model + seed data.
- `src/modules/summary.ts` – connected-itinerary aggregate calculations.
- `src/modules/layer-style.ts` – map opacity + future style hooks.
