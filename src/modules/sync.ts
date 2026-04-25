import type L from "leaflet";
import type { shapes } from "jointjs";
import { NODE_SIZE } from "./graph";
import type { PoiNodeData } from "./poi-data";

export function syncPoiNodesToMap(
  map: L.Map,
  pois: PoiNodeData[],
  nodeById: Map<string, shapes.standard.Rectangle>
): void {
  pois.forEach((poi) => {
    const node = nodeById.get(poi.id);
    if (!node) {
      return;
    }

    const point = map.latLngToContainerPoint([poi.lat, poi.lng]);
    node.position(point.x - NODE_SIZE.width / 2, point.y - NODE_SIZE.height / 2);
  });
}
