import type L from "leaflet";
import { clamp } from "./math";

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
  const clamped = clamp(opacity, 0.2, 1);
  tileLayer.setOpacity(clamped);
  return clamped;
}
