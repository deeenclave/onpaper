import "leaflet/dist/leaflet.css";
import "jointjs/dist/joint.css";
import "./styles.css";

import { dia } from "jointjs";
import { createMap } from "./modules/map";
import { createGraph } from "./modules/graph";
import { seedPois } from "./modules/poi-data";
import { syncPoiNodesToMap } from "./modules/sync";
import { calculateSummary } from "./modules/summary";
import { getDefaultLayerStyle, setMapOpacity } from "./modules/layer-style";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App container not found");
}

app.innerHTML = `
  <div class="workspace">
    <div id="map-layer" class="map-layer"></div>
    <div class="map-soft-gradient"></div>
    <div id="graph-layer" class="graph-layer"></div>

    <aside class="summary-panel ui-layer">
      <h1>Methodical Tourist</h1>
      <p class="summary-subtitle">Connected itinerary summary</p>
      <ul id="summary-list" class="summary-list"></ul>
    </aside>

    <section class="opacity-control ui-layer">
      <label for="map-opacity">Map Opacity</label>
      <input id="map-opacity" type="range" min="20" max="100" value="70" step="1" />
      <output id="opacity-value">70%</output>
    </section>
  </div>
`;

const mapEl = document.getElementById("map-layer");
const graphEl = document.getElementById("graph-layer");
const summaryListEl = document.getElementById("summary-list");
const opacityInput = document.getElementById("map-opacity") as HTMLInputElement | null;
const opacityValue = document.getElementById("opacity-value");

if (!mapEl || !graphEl || !summaryListEl || !opacityInput || !opacityValue) {
  throw new Error("Missing required UI elements");
}

const { map, tileLayer } = createMap(mapEl);
const { graph, paper, nodeById } = createGraph(graphEl, seedPois);
const styleState = getDefaultLayerStyle();

setMapOpacity(tileLayer, styleState.mapOpacity);

const poiById = new Map(seedPois.map((poi) => [poi.id, poi]));

function extractLinkedNodeIds(): string[] {
  return graph
    .getLinks()
    .flatMap((link) => {
      const source = link.get("source") as dia.Link.End;
      const target = link.get("target") as dia.Link.End;
      const sourceId = typeof source.id === "string" ? source.id : undefined;
      const targetId = typeof target.id === "string" ? target.id : undefined;
      return [sourceId, targetId].filter((id): id is string => Boolean(id));
    });
}

function renderSummary(): void {
  const summary = calculateSummary(extractLinkedNodeIds(), poiById);
  summaryListEl.innerHTML = `
    <li><span>Connected POIs</span><strong>${summary.count}</strong></li>
    <li><span>Total time</span><strong>${summary.totalTimeMinutes} min</strong></li>
    <li><span>Total budget</span><strong>$${summary.totalBudget}</strong></li>
    <li><span>Average joy</span><strong>${summary.avgJoy}</strong></li>
    <li><span>Total energy</span><strong>${summary.totalEnergy}</strong></li>
    <li><span>Average uniqueness</span><strong>${summary.avgUniqueness}</strong></li>
  `;
}

function syncAll(): void {
  syncPoiNodesToMap(map, seedPois, nodeById);
  paper.requestUpdate();
}

map.whenReady(syncAll);
map.on("move zoom resize", syncAll);

const graphEvents: Array<keyof dia.Graph.EventMap> = ["add", "remove", "change:source", "change:target"];
graphEvents.forEach((eventName) => {
  graph.on(eventName, (cell) => {
    if (cell.isLink()) {
      renderSummary();
    }
  });
});

opacityInput.addEventListener("input", (event) => {
  const value = Number((event.target as HTMLInputElement).value) / 100;
  styleState.mapOpacity = setMapOpacity(tileLayer, value);
  opacityValue.textContent = `${Math.round(styleState.mapOpacity * 100)}%`;
});

renderSummary();
syncAll();
