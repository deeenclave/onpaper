import { dia, shapes } from "jointjs";
import type { PoiNodeData } from "./poi-data";

export type GraphBundle = {
  graph: dia.Graph;
  paper: dia.Paper;
  nodeById: Map<string, shapes.standard.Rectangle>;
};

const categoryColor: Record<PoiNodeData["category"], string> = {
  attraction: "#5b7cfa",
  scenic: "#4ca98b",
  food: "#e0844b",
  hotel: "#7f72d9",
  activity: "#cc5ea8"
};

export const NODE_SIZE = { width: 160, height: 72 };

export function createGraph(container: HTMLElement, pois: PoiNodeData[]): GraphBundle {
  const graph = new dia.Graph({}, { cellNamespace: shapes });

  const paper = new dia.Paper({
    el: container,
    model: graph,
    width: "100%",
    height: "100%",
    async: true,
    sorting: dia.Paper.sorting.APPROX,
    background: { color: "transparent" },
    cellViewNamespace: shapes,
    defaultLink: () =>
      new shapes.standard.Link({
        attrs: {
          line: {
            stroke: "#384252",
            strokeWidth: 2,
            targetMarker: {
              type: "path",
              d: "M 10 -5 0 0 10 5 z"
            }
          }
        },
        z: 1
      }),
    validateConnection: ({ sourceMagnet, targetMagnet, sourceView, targetView }) => {
      if (!sourceMagnet || !targetMagnet) {
        return false;
      }
      if (sourceView === targetView) {
        return false;
      }
      return sourceMagnet.getAttribute("port-group") === "out" && targetMagnet.getAttribute("port-group") === "in";
    },
    snapLinks: true,
    linkPinning: false,
    interactive: (cellView) => {
      if (cellView.model.isElement()) {
        return {
          elementMove: false,
          addLinkFromMagnet: true,
          stopDelegation: false
        };
      }
      return true;
    }
  });

  const nodeById = new Map<string, shapes.standard.Rectangle>();

  pois.forEach((poi) => {
    const node = new shapes.standard.Rectangle({
      id: poi.id,
      size: NODE_SIZE,
      attrs: {
        body: {
          fill: "#ffffff",
          stroke: "#d5dce8",
          strokeWidth: 1,
          rx: 14,
          ry: 14,
          filter: "drop-shadow(0 8px 18px rgba(55, 75, 102, 0.14))"
        },
        label: {
          text: `${poi.title}\n${poi.category} • joy ${poi.joy}`,
          fontSize: 12,
          fontFamily: "Inter, system-ui, sans-serif",
          fill: "#2f3742",
          textAnchor: "middle",
          textVerticalAnchor: "middle",
          yAlignment: "middle",
          xAlignment: "middle",
          refX: "50%",
          refY: "50%"
        }
      },
      ports: {
        groups: {
          in: {
            position: { name: "top" },
            attrs: {
              circle: {
                r: 4,
                magnet: "passive",
                fill: categoryColor[poi.category],
                stroke: "#ffffff",
                strokeWidth: 1.5
              }
            }
          },
          out: {
            position: { name: "bottom" },
            attrs: {
              circle: {
                r: 4,
                magnet: true,
                fill: categoryColor[poi.category],
                stroke: "#ffffff",
                strokeWidth: 1.5,
                cursor: "crosshair"
              }
            }
          }
        },
        items: [{ group: "in" }, { group: "out" }]
      },
      z: 3
    });

    node.addTo(graph);
    nodeById.set(poi.id, node);
  });

  return { graph, paper, nodeById };
}
