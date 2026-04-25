import './styles.css';
import { dia, shapes, util } from '@joint/core';
import { createQuickNode, yellowstoneSeed } from './seed';
import { TripNodeData, TripNodeType } from './types';
import {
  exportAsJson,
  exportAsMarkdown,
  exportPrintableFamilyView,
  summarizePlan,
  validatePlan
} from './planner-utils';

type Point = { x: number; y: number };
type LatLng = { lat: number; lng: number };

type MapAdapter = {
  on: (event: string, handler: () => void) => void;
  getCenter: () => LatLng;
  latLngToContainerPoint: (coords: [number, number]) => Point;
  containerPointToLatLng: (point: [number, number]) => LatLng;
  invalidateSize: () => void;
};

class FallbackMapAdapter implements MapAdapter {
  private center: LatLng = { lat: 44.6, lng: -110.6 };
  private readonly host: HTMLElement;
  private readonly handlers: Record<string, Array<() => void>> = {};

  constructor(host: HTMLElement) {
    this.host = host;
    host.classList.add('fallback-map');
  }

  on(event: string, handler: () => void) {
    this.handlers[event] ??= [];
    this.handlers[event].push(handler);
  }

  emit(event: string) {
    (this.handlers[event] || []).forEach((h) => h());
  }

  getCenter() {
    return this.center;
  }

  latLngToContainerPoint(coords: [number, number]) {
    const rect = this.host.getBoundingClientRect();
    const latMin = 44.0;
    const latMax = 45.1;
    const lngMin = -111.2;
    const lngMax = -110.0;
    const x = ((coords[1] - lngMin) / (lngMax - lngMin)) * rect.width;
    const y = ((latMax - coords[0]) / (latMax - latMin)) * rect.height;
    return { x, y };
  }

  containerPointToLatLng(point: [number, number]) {
    const rect = this.host.getBoundingClientRect();
    const latMin = 44.0;
    const latMax = 45.1;
    const lngMin = -111.2;
    const lngMax = -110.0;
    const lng = lngMin + (point[0] / rect.width) * (lngMax - lngMin);
    const lat = latMax - (point[1] / rect.height) * (latMax - latMin);
    return { lat, lng };
  }

  invalidateSize() {
    this.emit('move');
    this.emit('zoom');
  }
}

async function createMapAdapter(hostId: string): Promise<MapAdapter> {
  const mapEl = document.getElementById(hostId) as HTMLElement;
  try {
    const leafletPkg = await import(/* @vite-ignore */ 'leaflet');
    await import(/* @vite-ignore */ 'leaflet/dist/leaflet.css');
    const L = leafletPkg.default;
    const map = L.map(hostId, { zoomControl: true, attributionControl: true }).setView([44.6, -110.6], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    return {
      on: (event, handler) => map.on(event, handler),
      getCenter: () => {
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng };
      },
      latLngToContainerPoint: (coords) => {
        const p = map.latLngToContainerPoint(coords);
        return { x: p.x, y: p.y };
      },
      containerPointToLatLng: (point) => {
        const ll = map.containerPointToLatLng(point);
        return { lat: ll.lat, lng: ll.lng };
      },
      invalidateSize: () => map.invalidateSize()
    };
  } catch (_err) {
    return new FallbackMapAdapter(mapEl);
  }
}

const TYPE_COLORS: Record<TripNodeType, string> = {
  flight: '#D4A373',
  transport: '#A9D6E5',
  attraction: '#6B8E7A',
  restaurant: '#EDE0D4',
  guided_activity: '#CDB4DB',
  scenic_point: '#7FB6CE',
  decision: '#C28F5A',
  fallback: '#B894C7'
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('No app mount');

app.innerHTML = `
<div class="journey-app">
  <header class="summary-bar">
    <div>
      <h1>JourneyGraph</h1>
      <p>${yellowstoneSeed.title} · ${yellowstoneSeed.dates}</p>
    </div>
    <div class="metrics" id="metrics"></div>
    <div class="actions">
      <button id="export-json">Export JSON</button>
      <button id="export-md">Export Markdown</button>
      <button id="export-print">Printable View</button>
    </div>
  </header>
  <section class="filters" id="filters"></section>
  <main class="layout">
    <aside class="panel"><h3>Node Palette</h3><div id="stencil" class="stencil-buttons"></div></aside>
    <section class="canvas-shell">
      <div id="map"></div>
      <div id="paper"></div>
      <div id="minimap"></div>
    </section>
    <aside class="panel">
      <h3>Inspector</h3>
      <div id="inspector"></div>
      <h3>Trade-off Decision</h3>
      <div id="decision-panel" class="decision-panel">Select a decision node to compare competing options.</div>
      <h3>Validation Alerts</h3>
      <ul class="issues" id="issues"></ul>
    </aside>
  </main>
</div>`;

void bootstrap();

async function bootstrap() {
  const map = await createMapAdapter('map');

  const graph = new dia.Graph({}, { cellNamespace: shapes });
  const paper = new dia.Paper({
    model: graph,
    el: document.getElementById('paper') as HTMLElement,
    width: '100%',
    height: 1200,
    gridSize: 1,
    drawGrid: false,
    async: true,
    cellViewNamespace: shapes,
    defaultConnectionPoint: { name: 'boundary' },
    defaultLink: () =>
      new shapes.standard.Link({
        attrs: {
          line: {
            stroke: '#B0B0B0',
            strokeWidth: 1.5,
            targetMarker: { type: 'path', d: 'M 10 -5 0 0 10 5 z' }
          }
        }
      }),
    linkPinning: false,
    background: { color: 'transparent' },
    interactive: (cellView) => !cellView.model.get('isLane') && !cellView.model.get('isDecoration')
  });

  const miniPaper = new dia.Paper({
    model: graph,
    el: document.getElementById('minimap') as HTMLElement,
    width: 240,
    height: 160,
    interactive: false,
    async: true,
    cellViewNamespace: shapes,
    background: { color: '#FFFFFFCC' }
  });
  miniPaper.scale(0.11);

  const nodeCellsById = new Map<string, { card: shapes.standard.Rectangle; strip: shapes.standard.Rectangle }>();
  const laneCells = new Map<number, shapes.standard.Rectangle>();

  const isWarmNode = (node: TripNodeData) => node.weights.joy >= 8;
  const cardFill = (node: TripNodeData) => (node.optional ? '#FFFFFF99' : isWarmNode(node) ? '#FFF7EE' : '#F4FAF8');

  const laneForDay = (day: number) => {
    const lane = new shapes.standard.Rectangle({
      id: `lane-${day}`,
      position: { x: 12, y: day * 12 },
      size: { width: 1880, height: 230 },
      isLane: true,
      attrs: {
        body: { fill: '#FFFFFF58', stroke: '#FFFFFF90', strokeWidth: 2, rx: 18, ry: 18 },
        label: { text: `Day ${day}`, fill: '#1F1F1F', textAnchor: 'left', refX: 18, refY: 18, fontSize: 14, fontWeight: 700 }
      }
    });
    lane.addTo(graph);
    lane.toBack();
    return lane;
  };

  const nodePositionFromGeo = (node: TripNodeData) => {
    const point = map.latLngToContainerPoint([node.geo.lat, node.geo.lng]);
    return { x: point.x - 130, y: point.y - 55 };
  };

  const refreshNodeGeo = (nodeId: string) => {
    const bundle = nodeCellsById.get(nodeId);
    const node = yellowstoneSeed.nodes.find((n) => n.id === nodeId);
    if (!bundle || !node) return;
    const centerPoint: [number, number] = [
      bundle.card.position().x + bundle.card.size().width / 2,
      bundle.card.position().y + bundle.card.size().height / 2
    ];
    node.geo = map.containerPointToLatLng(centerPoint);
  };

  const createTravelNode = (node: TripNodeData) => {
    const position = nodePositionFromGeo(node);
    const card = new shapes.standard.Rectangle({
      id: node.id,
      position,
      size: { width: 260, height: 116 },
      attrs: {
        body: { fill: cardFill(node), stroke: '#EDE0D4', strokeWidth: 1.3, rx: 14, ry: 14 },
        label: {
          text: `${node.icon} ${node.title}\n${node.timeWindow} · ${node.duration}\n${node.location}\n🌟${node.weights.joy}  💸${node.weights.budgetImpact}  🚶${node.weights.effort}`,
          fill: '#1F1F1F',
          fontSize: 12,
          fontFamily: 'Inter, ui-sans-serif',
          textVerticalAnchor: 'top',
          textAnchor: 'left',
          refX: 16,
          refY: 10,
          whiteSpace: 'normal'
        }
      },
      nodeData: node
    });

    const strip = new shapes.standard.Rectangle({
      id: `${node.id}-strip`,
      position: { x: position.x + 2, y: position.y + 2 },
      size: { width: 8, height: 112 },
      isDecoration: true,
      attrs: { body: { fill: TYPE_COLORS[node.category], stroke: 'transparent', rx: 4, ry: 4 } }
    });

    card.addTo(graph);
    strip.addTo(graph);
    card.embed(strip);
    nodeCellsById.set(node.id, { card, strip });
  };

  const createLink = (source: string, target: string, label?: string, critical?: boolean) => {
    new shapes.standard.Link({
      source: { id: source },
      target: { id: target },
      attrs: {
        line: {
          stroke: critical ? '#D4A373' : '#9FB4C5',
          strokeWidth: critical ? 2.6 : 1.5,
          strokeDasharray: critical ? '0' : '4 3',
          targetMarker: { type: 'path', d: 'M 10 -5 0 0 10 5 z' }
        }
      },
      labels: label
        ? [{ position: 0.5, attrs: { text: { text: label, fill: '#1F1F1F', fontSize: 11 }, rect: { fill: '#F7F5F2EE', stroke: '#EDE0D4', rx: 10, ry: 10 } } }]
        : undefined
    }).addTo(graph);
  };

  const renderGraph = () => {
    graph.clear();
    nodeCellsById.clear();
    laneCells.clear();
    yellowstoneSeed.days.forEach((day) => {
      const lane = laneForDay(day.day);
      lane.attr('label/text', `Day ${day.day} · ${day.title}`);
      laneCells.set(day.day, lane);
    });
    yellowstoneSeed.nodes.forEach(createTravelNode);
    yellowstoneSeed.edges.forEach((e) => createLink(e.source, e.target, e.label, e.critical));
  };

  const updateGeoAnchoredLayout = () => {
    yellowstoneSeed.nodes.forEach((node) => {
      const bundle = nodeCellsById.get(node.id);
      if (!bundle) return;
      const pos = nodePositionFromGeo(node);
      bundle.card.position(pos.x, pos.y);
      bundle.strip.position(pos.x + 2, pos.y + 2);
    });
  };

  const decisionComparison = (decisionNodeId: string) => {
    const options = yellowstoneSeed.edges
      .filter((e) => e.source === decisionNodeId)
      .map((edge) => yellowstoneSeed.nodes.find((n) => n.id === edge.target))
      .filter((n): n is TripNodeData => Boolean(n));

    if (options.length < 2) return 'This decision node needs at least two outgoing options.';
    const scored = options.map((option) => {
      const score = Math.max(
        0,
        Math.min(
          10,
          Number(
            (
              option.weights.joy * 0.35 +
              option.weights.uniqueness * 0.25 -
              option.weights.timeCost * 0.15 -
              option.weights.budgetImpact * 0.15 -
              option.weights.effort * 0.1 +
              4.5
            ).toFixed(1)
          )
        )
      );
      return { option, score };
    });

    const recommended = scored.reduce((best, current) => (current.score > best.score ? current : best));
    return `<div class="decision-grid">${scored
      .map(
        ({ option, score }) =>
          `<article class="decision-card ${recommended.option.id === option.id ? 'recommended' : ''}"><h4>${option.icon} ${option.title}</h4><p>Score: <strong>${score}/10</strong></p><p>🌟 ${option.weights.joy} · ⏱️ ${option.weights.timeCost} · 💸 ${option.weights.budgetImpact} · 🚶 ${option.weights.effort} · 🎲 ${option.weights.uniqueness}</p></article>`
      )
      .join('')}</div><p class="decision-note">Recommended now: <strong>${recommended.option.title}</strong>.</p>`;
  };

  const refreshMetricsAndIssues = () => {
    const issues = validatePlan(yellowstoneSeed);
    const summary = summarizePlan(yellowstoneSeed, issues);
    (document.getElementById('metrics') as HTMLElement).innerHTML = `
      <div class="metric"><span>Total Cost</span><strong>${summary.totalCost} EUR</strong></div>
      <div class="metric"><span>Activities</span><strong>${summary.totalActivities}</strong></div>
      <div class="metric"><span>Total Duration</span><strong>${summary.totalDurationHours}h</strong></div>
      <div class="metric"><span>Alerts</span><strong>${summary.issues}</strong></div>
      <div class="metric"><span>Trip Score</span><strong>${summary.tripScore}/10</strong></div>
      <div class="metric"><span>Joy / Effort</span><strong>${summary.joyAverage} / ${summary.effortAverage}</strong></div>`;

    (document.getElementById('issues') as HTMLElement).innerHTML = issues
      .map((i) => `<li class="${i.severity}"><strong>${i.severity.toUpperCase()}</strong> ${i.message}</li>`)
      .join('');
  };

  const pulseNode = (id: string) => {
    const bundle = nodeCellsById.get(id);
    if (!bundle) return;
    bundle.card.attr('body/strokeWidth', 3);
    bundle.card.attr('body/stroke', '#D4A373');
    setTimeout(() => {
      bundle.card.attr('body/strokeWidth', 1.3);
      bundle.card.attr('body/stroke', '#EDE0D4');
    }, 650);
  };

  const renderStencil = () => {
    const host = document.getElementById('stencil') as HTMLElement;
    host.innerHTML = '';
    (Object.keys(TYPE_COLORS) as TripNodeType[]).forEach((type) => {
      const button = document.createElement('button');
      button.className = 'stencil-btn';
      button.style.borderColor = TYPE_COLORS[type];
      button.textContent = `+ ${type.replace('_', ' ')}`;
      button.addEventListener('click', () => {
        const id = `custom-${Math.random().toString(36).slice(2, 9)}`;
        const center = map.getCenter();
        const newNode = createQuickNode(type, id);
        newNode.geo = { lat: center.lat, lng: center.lng };
        yellowstoneSeed.nodes.push(newNode);
        renderGraph();
        refreshMetricsAndIssues();
        pulseNode(id);
      });
      host.appendChild(button);
    });
  };

  const renderFilters = () => {
    const filterEl = document.getElementById('filters') as HTMLElement;
    filterEl.innerHTML = `<label>Day <select id="day-filter"><option value="all">All</option>${yellowstoneSeed.days
      .map((d) => `<option value="${d.day}">Day ${d.day}</option>`)
      .join('')}</select></label>
      <label>Category <select id="category-filter"><option value="all">All</option>${Object.keys(TYPE_COLORS)
        .map((type) => `<option value="${type}">${type}</option>`)
        .join('')}</select></label>
      <label>Max Cost <input id="cost-filter" type="number" min="0" placeholder="No limit"/></label>
      <label>Priority <select id="priority-filter"><option value="all">All</option><option>high</option><option>medium</option><option>low</option></select></label>
      <button id="toggle-day-groups">Collapse / Expand Day Groups</button>`;

    const apply = () => {
      const day = (document.getElementById('day-filter') as HTMLSelectElement).value;
      const category = (document.getElementById('category-filter') as HTMLSelectElement).value;
      const maxCost = Number((document.getElementById('cost-filter') as HTMLInputElement).value || Infinity);
      const priority = (document.getElementById('priority-filter') as HTMLSelectElement).value;
      yellowstoneSeed.nodes.forEach((node) => {
        const visible =
          (day === 'all' || node.day === Number(day)) &&
          (category === 'all' || node.category === category) &&
          node.cost <= maxCost &&
          (priority === 'all' || node.priority === priority);
        const bundle = nodeCellsById.get(node.id);
        bundle?.card.attr('root/display', visible ? 'block' : 'none');
        bundle?.strip.attr('root/display', visible ? 'block' : 'none');
      });
    };

    filterEl.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', apply));
    let collapsed = false;
    document.getElementById('toggle-day-groups')?.addEventListener('click', () => {
      collapsed = !collapsed;
      yellowstoneSeed.days.forEach((day) => laneCells.get(day.day)?.attr('root/display', collapsed ? 'none' : 'block'));
    });
  };

  const attachInspector = () => {
    paper.on('element:pointerclick', (cellView) => {
      const id = cellView.model.id.toString();
      const data = yellowstoneSeed.nodes.find((n) => n.id === id);
      if (!data) return;
      const decisionPanel = document.getElementById('decision-panel') as HTMLElement;
      if (data.category === 'decision') decisionPanel.innerHTML = decisionComparison(data.id);

      const inspector = document.getElementById('inspector') as HTMLElement;
      inspector.innerHTML = `<div class="form-field"><label>Title</label><input id="ins-title" value="${data.title}"/></div>
      <div class="form-field"><label>Type</label><select id="ins-category">${Object.keys(TYPE_COLORS)
        .map((type) => `<option value="${type}" ${data.category === type ? 'selected' : ''}>${type}</option>`)
        .join('')}</select></div>
      <div class="form-grid"><div class="form-field"><label>Day</label><input id="ins-day" type="number" min="1" max="4" value="${data.day}"/></div><div class="form-field"><label>Cost</label><input id="ins-cost" type="number" value="${data.cost}"/></div></div>
      <div class="form-grid"><div class="form-field"><label>Joy</label><input id="ins-joy" type="number" min="0" max="10" value="${data.weights.joy}"/></div><div class="form-field"><label>Uniqueness</label><input id="ins-uniq" type="number" min="0" max="10" value="${data.weights.uniqueness}"/></div></div>
      <div class="form-grid"><div class="form-field"><label>Time Cost</label><input id="ins-time-cost" type="number" min="0" max="10" value="${data.weights.timeCost}"/></div><div class="form-field"><label>Effort</label><input id="ins-effort" type="number" min="0" max="10" value="${data.weights.effort}"/></div></div>
      <div class="form-field"><label>Budget Impact</label><input id="ins-budget" type="number" min="0" max="10" value="${data.weights.budgetImpact}"/></div>
      <button id="ins-save">Save node</button>`;

      document.getElementById('ins-save')?.addEventListener('click', () => {
        data.title = (document.getElementById('ins-title') as HTMLInputElement).value;
        data.category = (document.getElementById('ins-category') as HTMLSelectElement).value as TripNodeType;
        data.day = Number((document.getElementById('ins-day') as HTMLInputElement).value);
        data.cost = Number((document.getElementById('ins-cost') as HTMLInputElement).value);
        data.weights.joy = Number((document.getElementById('ins-joy') as HTMLInputElement).value);
        data.weights.uniqueness = Number((document.getElementById('ins-uniq') as HTMLInputElement).value);
        data.weights.timeCost = Number((document.getElementById('ins-time-cost') as HTMLInputElement).value);
        data.weights.effort = Number((document.getElementById('ins-effort') as HTMLInputElement).value);
        data.weights.budgetImpact = Number((document.getElementById('ins-budget') as HTMLInputElement).value);
        renderGraph();
        refreshMetricsAndIssues();
      });
    });
  };

  const wireExportButtons = () => {
    const download = (filename: string, content: string, mime: string) => {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    document.getElementById('export-json')?.addEventListener('click', () => {
      const issues = validatePlan(yellowstoneSeed);
      download('journeygraph-plan.json', exportAsJson(yellowstoneSeed, issues), 'application/json');
    });
    document.getElementById('export-md')?.addEventListener('click', () => {
      const issues = validatePlan(yellowstoneSeed);
      download('journeygraph-itinerary.md', exportAsMarkdown(yellowstoneSeed, issues), 'text/markdown');
    });
    document.getElementById('export-print')?.addEventListener('click', () => {
      download('journeygraph-family-view.txt', exportPrintableFamilyView(yellowstoneSeed), 'text/plain');
    });
  };

  paper.on('element:pointerup', (cellView) => {
    const id = cellView.model.id.toString();
    if (yellowstoneSeed.nodes.find((n) => n.id === id)) refreshNodeGeo(id);
  });

  renderGraph();
  renderStencil();
  renderFilters();
  refreshMetricsAndIssues();
  attachInspector();
  wireExportButtons();

  map.on('move', updateGeoAnchoredLayout);
  map.on('zoom', updateGeoAnchoredLayout);
  setTimeout(() => {
    map.invalidateSize();
    updateGeoAnchoredLayout();
  }, 150);

  paper.on('blank:mousewheel', (_evt, _x, _y, delta) => {
    const scale = paper.scale();
    const next = util.clamp(scale.sx + delta * 0.1, 0.5, 1.6);
    paper.scale(next, next);
  });
}
