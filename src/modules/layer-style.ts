import type L from "leaflet";

export type LayerStyleState = {
  mapOpacity: number;
};

const DEFAULT_STYLE: LayerStyleState = {
  mapOpacity: 0.7
};

export function getDefaultLayerStyle(): LayerStyleState {
  return { ...DEFAULT_STYLE };
}

export function setMapOpacity(tileLayer: L.TileLayer, opacity: number): number {
  const clamped = Math.max(0.2, Math.min(1, opacity));
  tileLayer.setOpacity(clamped);
  return clamped;
}
