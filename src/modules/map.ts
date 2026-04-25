import L from "leaflet";

export type MapBundle = {
  map: L.Map;
  tileLayer: L.TileLayer;
};

export function createMap(container: HTMLElement): MapBundle {
  const map = L.map(container, {
    center: [48.8606, 2.3499],
    zoom: 14,
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    opacity: 0.7,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });

  tileLayer.addTo(map);

  return { map, tileLayer };
}
