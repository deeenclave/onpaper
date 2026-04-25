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

  private emit(event: string) {
    (this.handlers[event] || []).forEach((h) => h());
  }

  getCenter() {
    return { lat: 44.6, lng: -110.6 };
  }

  latLngToContainerPoint([lat, lng]: [number, number]) {
    const rect = this.host.getBoundingClientRect();
    const latMin = 44.0;
    const latMax = 45.1;
    const lngMin = -111.2;
    const lngMax = -110.0;
    return {
      x: ((lng - lngMin) / (lngMax - lngMin)) * rect.width,
      y: ((latMax - lat) / (latMax - latMin)) * rect.height
    };
  }

  containerPointToLatLng([x, y]: [number, number]) {
    const rect = this.host.getBoundingClientRect();
    const latMin = 44.0;
    const latMax = 45.1;
    const lngMin = -111.2;
    const lngMax = -110.0;
    return {
      lat: latMax - (y / rect.height) * (latMax - latMin),
      lng: lngMin + (x / rect.width) * (lngMax - lngMin)
    };
  }

  invalidateSize() {
    this.emit('move');
    this.emit('zoom');
  }
}

async function createMapAdapter(hostId: string): Promise<MapAdapter> {
  try {
    const leafletModule = 'leaflet';
    const leafletCssModule = 'leaflet/dist/leaflet.css';
    const leafletPkg = await import(/* @vite-ignore */ leafletModule);
    await import(/* @vite-ignore */ leafletCssModule);
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
  } catch {
    return new FallbackMapAdapter(document.getElementById(hostId) as HTMLElement);
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
<div class="journey-app clean-ui">
  <header class="summary-bar compact">
    <div>
      <h1>JourneyGraph</h1>
      <p>${yellowstoneSeed.title}</p>
    </div>
    <div class="metrics" id="metrics"></div>
    <div class="actions">
      <button id="export-json">JSON</button>
      <button id="export-md">Markdown</button>
      <button id="export-print">Print</button>
    </div>
  </header>

  <section class="filters clean-filters" id="filters"></section>

  <main class="layout clean-layout">
    <aside class="panel panel-compact">
      <h3>Add Node</h3>
      <div id="stencil" class="stencil-buttons"></div>
    </aside>

    <section class="canvas-shell">
      <div id="map"></div>
      <div id="paper"></div>
      <div id="minimap"></div>
    </section>

    <aside class="panel panel-compact">
      <h3>Details</h3>
      <div id="inspector" class="empty-state">Select a node to edit details.</div>
      <details id="issues-wrap">
        <summary>Planner alerts <span id="alert-count"></span></summary>
        <ul class="issues" id="issues"></ul>
      </details>
      <details id="decision-wrap">
        <summary>Trade-off comparator</summary>
        <div id="decision-panel" class="decision-panel">Select a decision node to compare options.</div>
      </details>
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
    linkPinning: false,
    background: { color: 'transparent' },
    interactive: (cv) => !cv.model.get('isDecoration')
  });

  new dia.Paper({
    model: graph,
    el: document.getElementById('minimap') as HTMLElement,
    width: 200,
    height: 130,
    interactive: false,
    async: true,
    cellViewNamespace: shapes,
    background: { color: '#FFFFFFCC' }
  }).scale(0.1);

  const state = {
    day: 1 as number | 'all',
    category: 'all' as TripNodeType | 'all',
    maxCost: Infinity,
    priority: 'all' as 'all' | 'high' | 'medium' | 'low'
  };

  const nodeViews = new Map<string, { card: shapes.standard.Rectangle; strip: shapes.standard.Rectangle }>();

  const positionFor = (node: TripNodeData) => {
    const p = map.latLngToContainerPoint([node.geo.lat, node.geo.lng]);
    return { x: p.x - 120, y: p.y - 44 };
  };

  const nodeIsVisible = (node: TripNodeData) => {
    return (
      (state.day === 'all' || node.day === state.day) &&
      (state.category === 'all' || node.category === state.category) &&
      node.cost <= state.maxCost &&
      (state.priority === 'all' || node.priority === state.priority)
    );
  };

  const renderNode = (node: TripNodeData) => {
    const pos = positionFor(node);
    const card = new shapes.standard.Rectangle({
      id: node.id,
      position: pos,
      size: { width: 240, height: 92 },
      attrs: {
        body: {
          fill: node.weights.joy >= 8 ? '#FFF7EE' : '#F4FAF8',
          stroke: '#E6D8CA',
          strokeWidth: 1,
          rx: 12,
          ry: 12
        },
        label: {
          text: `${node.icon} ${node.title}\n${node.timeWindow} · ${node.duration} · 🌟${node.weights.joy}`,
          fontSize: 12,
          fill: '#1F1F1F',
          textAnchor: 'left',
          textVerticalAnchor: 'top',
          refX: 14,
          refY: 10
        }
      }
    });

    const strip = new shapes.standard.Rectangle({
      id: `${node.id}-strip`,
      position: { x: pos.x + 2, y: pos.y + 2 },
      size: { width: 6, height: 88 },
      isDecoration: true,
      attrs: {
        body: { fill: TYPE_COLORS[node.category], stroke: 'transparent', rx: 4, ry: 4 }
      }
    });

    card.addTo(graph);
    strip.addTo(graph);
    card.embed(strip);
    nodeViews.set(node.id, { card, strip });

    const visible = nodeIsVisible(node);
    card.attr('root/display', visible ? 'block' : 'none');
    strip.attr('root/display', visible ? 'block' : 'none');
  };

  const renderLinks = () => {
    yellowstoneSeed.edges.forEach((edge) => {
      new shapes.standard.Link({
        source: { id: edge.source },
        target: { id: edge.target },
        attrs: {
          line: {
            stroke: edge.critical ? '#D4A373' : '#B8C8D2',
            strokeWidth: edge.critical ? 2.3 : 1.3,
            strokeDasharray: edge.critical ? '0' : '4 3',
            targetMarker: { type: 'path', d: 'M 10 -5 0 0 10 5 z' }
          }
        }
      }).addTo(graph);
    });
  };

  const rerender = () => {
    graph.clear();
    nodeViews.clear();
    yellowstoneSeed.nodes.forEach(renderNode);
    renderLinks();
  };

  const applyFilterVisibility = () => {
    yellowstoneSeed.nodes.forEach((node) => {
      const v = nodeViews.get(node.id);
      if (!v) return;
      const visible = nodeIsVisible(node);
      v.card.attr('root/display', visible ? 'block' : 'none');
      v.strip.attr('root/display', visible ? 'block' : 'none');
    });
  };

  const refreshSummary = () => {
    const issues = validatePlan(yellowstoneSeed);
    const s = summarizePlan(yellowstoneSeed, issues);
    (document.getElementById('metrics') as HTMLElement).innerHTML = `
      <div class="metric"><span>Score</span><strong>${s.tripScore}/10</strong></div>
      <div class="metric"><span>Cost</span><strong>${s.totalCost} EUR</strong></div>
      <div class="metric"><span>Activities</span><strong>${s.totalActivities}</strong></div>
      <div class="metric"><span>Alerts</span><strong>${s.issues}</strong></div>`;

    (document.getElementById('alert-count') as HTMLElement).textContent = `(${issues.length})`;
    (document.getElementById('issues') as HTMLElement).innerHTML = issues
      .slice(0, 8)
      .map((i) => `<li class="${i.severity}">${i.message}</li>`)
      .join('');
  };

  const renderFilters = () => {
    const dayChips = ['all', ...yellowstoneSeed.days.map((d) => d.day.toString())]
      .map((d) => `<button class="chip ${state.day.toString() === d ? 'active' : ''}" data-day="${d}">${d === 'all' ? 'All days' : `Day ${d}`}</button>`)
      .join('');

    (document.getElementById('filters') as HTMLElement).innerHTML = `
      <div class="chip-group">${dayChips}</div>
      <label>Category
        <select id="category-filter">
          <option value="all">All</option>
          ${Object.keys(TYPE_COLORS).map((t) => `<option value="${t}" ${state.category === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <label>Max cost <input id="cost-filter" type="number" min="0" placeholder="No limit" /></label>
      <label>Priority
        <select id="priority-filter">
          <option value="all">All</option>
          <option ${state.priority === 'high' ? 'selected' : ''}>high</option>
          <option ${state.priority === 'medium' ? 'selected' : ''}>medium</option>
          <option ${state.priority === 'low' ? 'selected' : ''}>low</option>
        </select>
      </label>
    `;

    document.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) => {
      b.addEventListener('click', () => {
        const raw = b.dataset.day || 'all';
        state.day = raw === 'all' ? 'all' : Number(raw);
        renderFilters();
        applyFilterVisibility();
      });
    });

    (document.getElementById('category-filter') as HTMLSelectElement).onchange = (e) => {
      state.category = (e.target as HTMLSelectElement).value as TripNodeType | 'all';
      applyFilterVisibility();
    };
    (document.getElementById('cost-filter') as HTMLInputElement).onchange = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      state.maxCost = Number.isFinite(v) && v > 0 ? v : Infinity;
      applyFilterVisibility();
    };
    (document.getElementById('priority-filter') as HTMLSelectElement).onchange = (e) => {
      state.priority = (e.target as HTMLSelectElement).value as typeof state.priority;
      applyFilterVisibility();
    };
  };

  const renderStencil = () => {
    const host = document.getElementById('stencil') as HTMLElement;
    host.innerHTML = '';
    (Object.keys(TYPE_COLORS) as TripNodeType[]).forEach((type) => {
      const btn = document.createElement('button');
      btn.className = 'stencil-btn';
      btn.textContent = `+ ${type.replace('_', ' ')}`;
      btn.style.borderColor = TYPE_COLORS[type];
      btn.onclick = () => {
        const id = `custom-${Math.random().toString(36).slice(2, 9)}`;
        const n = createQuickNode(type, id);
        n.geo = map.getCenter();
        yellowstoneSeed.nodes.push(n);
        rerender();
        refreshSummary();
      };
      host.appendChild(btn);
    });
  };

  const decisionHtml = (decisionId: string) => {
    const options = yellowstoneSeed.edges
      .filter((e) => e.source === decisionId)
      .map((e) => yellowstoneSeed.nodes.find((n) => n.id === e.target))
      .filter((n): n is TripNodeData => Boolean(n));
    if (options.length < 2) return 'Needs 2+ branches.';
    return options
      .map((o) => `<div class='decision-card'><strong>${o.title}</strong><br/>🌟${o.weights.joy} · 💸${o.weights.budgetImpact} · 🚶${o.weights.effort}</div>`)
      .join('');
  };

  paper.on('element:pointerclick', (cv) => {
    const id = cv.model.id.toString();
    const node = yellowstoneSeed.nodes.find((n) => n.id === id);
    if (!node) return;

    nodeViews.forEach((view) => view.card.attr('body/stroke', '#E6D8CA'));
    nodeViews.get(id)?.card.attr('body/stroke', '#D4A373');

    (document.getElementById('inspector') as HTMLElement).innerHTML = `
      <div class='form-field'><label>Title</label><input id='title' value='${node.title}'/></div>
      <div class='form-grid'>
        <div class='form-field'><label>Day</label><input id='day' type='number' value='${node.day}'/></div>
        <div class='form-field'><label>Cost</label><input id='cost' type='number' value='${node.cost}'/></div>
      </div>
      <div class='form-grid'>
        <div class='form-field'><label>Joy</label><input id='joy' type='number' min='0' max='10' value='${node.weights.joy}'/></div>
        <div class='form-field'><label>Effort</label><input id='effort' type='number' min='0' max='10' value='${node.weights.effort}'/></div>
      </div>
      <button id='save'>Save</button>
    `;

    const decisionWrap = document.getElementById('decision-wrap') as HTMLDetailsElement;
    if (node.category === 'decision') {
      decisionWrap.open = true;
      (document.getElementById('decision-panel') as HTMLElement).innerHTML = decisionHtml(node.id);
    }

    document.getElementById('save')?.addEventListener('click', () => {
      node.title = (document.getElementById('title') as HTMLInputElement).value;
      node.day = Number((document.getElementById('day') as HTMLInputElement).value);
      node.cost = Number((document.getElementById('cost') as HTMLInputElement).value);
      node.weights.joy = Number((document.getElementById('joy') as HTMLInputElement).value);
      node.weights.effort = Number((document.getElementById('effort') as HTMLInputElement).value);
      rerender();
      refreshSummary();
      applyFilterVisibility();
    });
  });

  paper.on('element:pointerup', (cv) => {
    const id = cv.model.id.toString();
    const node = yellowstoneSeed.nodes.find((n) => n.id === id);
    const view = nodeViews.get(id);
    if (!node || !view) return;
    const center: [number, number] = [
      view.card.position().x + view.card.size().width / 2,
      view.card.position().y + view.card.size().height / 2
    ];
    node.geo = map.containerPointToLatLng(center);
  });

  const wireExportButtons = () => {
    const download = (name: string, content: string, type: string) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
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

  rerender();
  renderStencil();
  renderFilters();
  refreshSummary();
  wireExportButtons();

  map.on('move', () => {
    yellowstoneSeed.nodes.forEach((n) => {
      const p = positionFor(n);
      const v = nodeViews.get(n.id);
      if (!v) return;
      v.card.position(p.x, p.y);
      v.strip.position(p.x + 2, p.y + 2);
    });
  });
  map.on('zoom', () => map.invalidateSize());

  setTimeout(() => map.invalidateSize(), 150);

  paper.on('blank:mousewheel', (_evt, _x, _y, delta) => {
    const s = paper.scale();
    const next = util.clamp(s.sx + delta * 0.1, 0.6, 1.5);
    paper.scale(next, next);
  });
}
