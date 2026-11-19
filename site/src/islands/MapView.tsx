/**
 * The map component: MapLibre GL JS drawing the token-built style over the
 * PMTiles basemap, with the library's projects clustered on top. MapLibre is
 * imported only when the map scrolls into view, so pages without a map, and
 * a map page before the map is shown, never load it (P10). The map view
 * (`Library` with `view="map"`) draws the results with it, and the small
 * maps on detail pages draw a project's location or a plant's projects with
 * it, `compact`: shorter, with no layer list or filter tools, and a page
 * scroll that passes over the map instead of zooming it.
 *
 * Overlays come from the registry (config/overlays.json), carried in the
 * style's metadata: the layer list shows each one, and an overlay's data is
 * fetched and its layers added only when it is first switched on.
 *
 * Region filters: with `onPick`, clicking a region of a selectable overlay
 * that is on picks it (the Library turns that into a filter value, as the
 * tree would), and the regions the filters hold are drawn as picked. With
 * `onBox`, the box tool draws a box to filter to, or takes the view as one.
 * A map opened with region filters switches on the overlays that hold them,
 * so a region named on a detail page shows picked when its map link opens.
 *
 * A choropleth overlay (the plant use) has no data of its own: with `use`,
 * it colors the regions of the first of its region overlays that is on (the
 * last when none is), by the figures `use` gives for that overlay, and its
 * legend gives the steps and the number of projects behind them.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { render } from 'preact';
import type { GeoJSONSource, GeoJSONSourceSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { BOUNDS_KEY, BOX_SOURCE, DETAIL_ZOOM, NATIVE_SOURCE, OVERLAY_BEFORE, PALETTE_LAYERS, PALETTE_SOURCE, PROJECT_LAYERS, PROJECT_SOURCE } from '../../../lib/map-style';
import { paletteFeatures, projectFeatures, type Bounds } from '../../../lib/map-data';
import { pickedRegions, type MapPosition } from '../../../lib/filter';
import { activeRegion, beforeLayer, choroplethLayers, choroplethPaint, choroplethSteps, layerList, overlaySource, pickedFilter, pickedLayers, pickLayer, type LegendItem, type OverlayMeta } from '../../../lib/overlays';
import type { RegionUse } from '../../../lib/map-data';
import type { IndexRecord, LibraryIndex } from '../../../lib/types';
import { url } from '../../../lib/site';
import { Card } from '../components/ui/PlantCard';
import { webglAvailable } from '../lib/webgl';
import './map.css';

type Status = 'waiting' | 'loading' | 'ready' | 'unsupported' | 'error';


/** Style URLs are written under the base path; MapLibre and the PMTiles protocol want them absolute. */
function absolute(path: string): string {
  return new URL(path, window.location.href).href;
}

/** MapLibre's stylesheet, added only when the map loads (a CSS import would be put on the page up front). */
function addStylesheet(href: string): Promise<void> {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
    link.onload = () => resolve();
    link.onerror = () => reject(new Error('the map stylesheet did not load'));
    document.head.append(link);
  });
}

/** An overlay's TopoJSON as GeoJSON for MapLibre; topojson-client loads with the first overlay. */
async function overlayData(href: string): Promise<GeoJSONSourceSpecification['data']> {
  const [{ feature }, topology] = await Promise.all([import('topojson-client'), fetch(href).then((r) => r.json())]);
  const [name] = Object.keys(topology.objects);
  return feature(topology, topology.objects[name]) as unknown as GeoJSONSourceSpecification['data'];
}

function Swatch({ item }: { item: LegendItem }) {
  return <span class={`map-swatch map-swatch-${item.mark}`} style={{ '--swatch': item.color }} aria-hidden="true" />;
}

export interface MapViewProps {
  label?: string;
  /** Overlays switched on when the map opens, by id. */
  overlays?: string[];
  /** Whether to show the layer list; legends of the overlays that are on show either way. */
  layerList?: boolean;
  /** The index, when the page has it already; otherwise the map fetches it. */
  index?: LibraryIndex;
  /** The projects to draw (lib/map-data.ts); every project in the index when absent. Updates redraw. */
  features?: ReturnType<typeof projectFeatures>;
  /** The palettes to draw; every located palette in the index when neither this nor `features` is given, none when only `features` is. Updates redraw. */
  palettes?: ReturnType<typeof paletteFeatures>;
  /** States to draw as a single plant's native range. */
  nativeStates?: string[];
  /** Where the map opens; the three states when absent. */
  position?: MapPosition;
  /** A box to open on instead, zoomed in no closer than a detail map's zoom (a single point is a box of no size). */
  fit?: Bounds;
  /** A small map on a detail page: shorter, and it zooms with a modifier key or two fingers, so the page scrolls past it. */
  compact?: boolean;
  /** Called when the map settles after a move, and once it first loads. */
  onMove?: (pos: MapPosition, bounds: Bounds) => void;
  /** The query's filters, for drawing the regions they hold as picked. */
  filters?: Record<string, string[]>;
  /** Called when a region of a selectable overlay is clicked; without it regions can't be picked. */
  onPick?: (overlay: OverlayMeta, id: string) => void;
  /** Labels for regions, by overlay and id (from the index facets); a feature's own name otherwise. */
  regionLabel?: (overlay: OverlayMeta, id: string) => string | undefined;
  /** The box filter, drawn on the map. */
  box?: Bounds;
  /** Called with a box drawn or taken from the view, or undefined to clear it; without it there is no box tool. */
  onBox?: (box: Bounds | undefined) => void;
  /** Called with the point clicked anywhere but on a mark: the workspace picks its site's location this way. */
  onLocate?: (lon: number, lat: number) => void;
  /** A choropleth's figures for a region overlay: each region's use and the projects behind them; undefined when there are none to show. */
  use?: (overlay: OverlayMeta) => { regions: RegionUse[]; projects: number } | undefined;
}

/** "1 project", "2–3 projects": a choropleth step's label. */
function stepLabel(min: number, max: number): string {
  return `${min === max ? min : `${min}–${max}`} ${max === 1 ? 'project' : 'projects'}`;
}

/** A box as a GeoJSON polygon, for drawing. */
function boxFeature([w, s, e, n]: Bounds) {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] };
}

/** The project in a popup: its card, as the list view draws it. */
function popupContent(rec: IndexRecord | undefined, p: { name: string; url: string; place: string; quantity?: number }): HTMLElement {
  const body = document.createElement('div');
  body.className = 'map-popup';
  if (rec) render(<Card record={rec} />, body);
  else {
    const a = Object.assign(document.createElement('a'), { href: p.url, textContent: p.name });
    const place = Object.assign(document.createElement('p'), { textContent: p.place });
    body.append(a, place);
  }
  if (p.quantity !== undefined) {
    const q = Object.assign(document.createElement('p'), { className: 'map-popup-quantity', textContent: `Matching plants on its list: ${p.quantity}` });
    body.append(q);
  }
  return body;
}

export default function MapView({ label = 'Map of projects', overlays: initial = [], layerList: showList = true, index: given, features, palettes, nativeStates, position, fit, compact = false, onMove, filters, onPick, regionLabel, box: boxFilter, onBox, onLocate, use }: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const added = useRef(new Map<string, Promise<void>>());
  const records = useRef(new Map<string, IndexRecord>());
  const moved = useRef(onMove);
  moved.current = onMove;
  const statesData = useRef<Promise<GeoJSONSourceSpecification['data']> | undefined>(undefined);
  const [rendered, setRendered] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<Status>('waiting');
  const [message, setMessage] = useState('');
  const [registry, setRegistry] = useState<OverlayMeta[]>([]);
  const [on, setOn] = useState<string[]>(initial);
  const [drawing, setDrawing] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | undefined>(undefined);
  // The click handler is set once, so it reads the current overlays and callbacks through a ref.
  const live = useRef({ registry, on, onPick, regionLabel, onLocate });
  live.current = { registry, on, onPick, regionLabel, onLocate };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let map: { remove(): void } | undefined;
    let cancelled = false;

    const start = async () => {
      if (!webglAvailable()) return setStatus('unsupported');
      setStatus('loading');
      try {
        const [maplibregl, { default: workerUrl }, { Protocol }, style, index] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
          import('pmtiles'),
          fetch(url('map/style.json')).then((r) => r.json()),
          given ?? fetch(url('library.json')).then((r) => r.json() as Promise<LibraryIndex>),
          import('maplibre-gl/dist/maplibre-gl.css?url').then(({ default: href }) => addStylesheet(href)),
        ]);
        if (cancelled) return;
        const reg = layerList(style);
        setRegistry(reg);
        // Regions the opening filters hold are drawn picked, so their overlays open switched on.
        const holding = filters ? reg.filter((o) => o.selectable && pickedRegions({ filters }, o.facets).length).map((o) => o.id) : [];
        if (holding.length) setOn((cur) => [...cur, ...holding.filter((id) => !cur.includes(id))]);
        // The worker is a file of its own; the bundler emits it as an asset.
        maplibregl.setWorkerUrl(absolute(workerUrl));
        const protocol = new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        style.glyphs = absolute(style.glyphs).replace('%7Bfontstack%7D', '{fontstack}').replace('%7Brange%7D', '{range}');
        for (const src of Object.values(style.sources) as { url?: string }[]) {
          if (src.url?.startsWith('pmtiles://')) src.url = `pmtiles://${absolute(src.url.slice('pmtiles://'.length))}`;
        }
        records.current = new Map(index.records.map((r) => [r.key, r]));
        style.sources[PROJECT_SOURCE].data = features ?? projectFeatures(index.records);
        style.sources[PALETTE_SOURCE].data = palettes ?? (features ? { type: 'FeatureCollection', features: [] } : paletteFeatures(index.records));
        const m = new maplibregl.Map({
          container: el,
          style,
          ...(position
            ? { center: position.center, zoom: position.zoom }
            : fit
              ? { bounds: fit, fitBoundsOptions: { padding: 48, maxZoom: DETAIL_ZOOM } }
              : { bounds: style.metadata[BOUNDS_KEY], fitBoundsOptions: { padding: 16 } }),
          attributionControl: { compact: true },
          cooperativeGestures: compact,
        });
        map = m;
        mapRef.current = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        const report = () => {
          if (cancelled) return;
          const b = m.getBounds();
          const c = m.getCenter();
          moved.current?.({ center: [c.lng, c.lat], zoom: m.getZoom() }, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        };
        m.on('load', () => {
          if (cancelled) return;
          setStatus('ready');
          report();
        });
        m.on('moveend', report);
        // How many project and palette marks are drawn, for the built-site check (scripts/a11y.ts) and assistive text.
        m.on('idle', () => !cancelled && setRendered(m.queryRenderedFeatures({ layers: [PROJECT_LAYERS[0], PROJECT_LAYERS[2], PALETTE_LAYERS[0]] }).length));
        m.on('error', (e) => console.warn('map:', e.error?.message ?? e));

        // A cluster zooms in to where it splits; a project opens a popup linking its page.
        m.on('click', 'project-clusters', async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = m.getSource<GeoJSONSource>(PROJECT_SOURCE)!;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          m.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom });
        });
        // A click on a region of a selectable overlay that is on picks it; one on a project or cluster doesn't.
        m.on('click', (e) => {
          const { registry: reg, on: shown, onPick: pick, regionLabel: named, onLocate: locate } = live.current;
          if (!pick && !locate) return;
          const projectLayers = [PROJECT_LAYERS[0], PROJECT_LAYERS[2], PALETTE_LAYERS[0]].filter((l) => m.getLayer(l));
          if (projectLayers.length && m.queryRenderedFeatures(e.point, { layers: projectLayers }).length) return;
          // A click that isn't on a mark sets a location, when the map takes one.
          if (locate) return locate(e.lngLat.lng, e.lngLat.lat);
          if (!pick) return;
          const pickable = reg.filter((o) => o.selectable && shown.includes(o.id) && m.getLayer(pickLayer(o.id)));
          if (!pickable.length) return;
          const hits = m.queryRenderedFeatures(e.point, { layers: pickable.map((o) => pickLayer(o.id)) });
          const found = new Map<string, { overlay: OverlayMeta; id: string; name: string }>();
          for (const f of hits) {
            const overlay = pickable.find((o) => pickLayer(o.id) === f.layer.id);
            const id = String(f.properties?.id ?? '');
            if (!overlay || !id || found.has(overlay.id)) continue;
            found.set(overlay.id, { overlay, id, name: named?.(overlay, id) ?? String(f.properties?.name ?? id) });
          }
          const regions = pickable.flatMap((o) => found.get(o.id) ?? []).reverse();
          if (regions.length === 1) return pick(regions[0].overlay, regions[0].id);
          if (!regions.length) return;
          // Several overlays on at once: ask which region the click meant.
          const body = document.createElement('div');
          body.className = 'map-popup map-pick';
          const title = Object.assign(document.createElement('p'), { textContent: 'Filter by' });
          const list = document.createElement('ul');
          list.setAttribute('role', 'list');
          const popup = new maplibregl.Popup({ closeButton: true, maxWidth: 'none' });
          for (const r of regions) {
            const li = document.createElement('li');
            const b = Object.assign(document.createElement('button'), { type: 'button', className: 'link-button', textContent: `${r.name} (${r.overlay.label.toLowerCase()})` });
            b.addEventListener('click', () => {
              popup.remove();
              pick(r.overlay, r.id);
            });
            li.append(b);
            list.append(li);
          }
          body.append(title, list);
          popup.setLngLat(e.lngLat).setDOMContent(body).addTo(m);
        });
        // A project or a palette point opens a popup with its card.
        for (const layer of [PROJECT_LAYERS[2], PALETTE_LAYERS[0]]) {
          m.on('click', layer, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties as { key: string; name: string; url: string; place: string; quantity?: number };
            const body = popupContent(records.current.get(p.key), p);
            new maplibregl.Popup({ closeButton: true, maxWidth: 'none' }).setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates).setDOMContent(body).addTo(m);
          });
        }
        for (const layer of [PROJECT_LAYERS[0], PROJECT_LAYERS[2], PALETTE_LAYERS[0]]) {
          m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
          m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
        }
      } catch (e) {
        if (!cancelled) {
          setMessage((e as Error).message);
          setStatus('error');
        }
      }
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) {
        io.disconnect();
        void start();
      }
    });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      map?.remove();
      mapRef.current = undefined;
    };
  }, []);

  /** Where an overlay's layers go: under the next overlay up already on the map, else under the water (or the projects without a basemap). */
  const placeBefore = (m: MapLibreMap, id: string) => beforeLayer(registry, id, (l) => Boolean(m.getLayer(l)), m.getLayer(OVERLAY_BEFORE) ? OVERLAY_BEFORE : PROJECT_LAYERS[0]);

  /** An overlay's source and layers, added hidden the first time it is asked for; showing them is the caller's. */
  const ensure = (m: MapLibreMap, o: OverlayMeta): Promise<void> => {
    let ready = added.current.get(o.id);
    if (!ready) {
      ready = overlayData(absolute(o.url!)).then((data) => {
        if (mapRef.current !== m) return;
        m.addSource(overlaySource(o.id), { type: 'geojson', data });
        const before = placeBefore(m, o.id);
        for (const l of o.layers) m.addLayer({ ...l, layout: { ...l.layout, visibility: 'none' } } as typeof l, before);
      });
      ready.catch((e) => console.warn(`map: overlay ${o.id}:`, e));
      added.current.set(o.id, ready);
    }
    return ready;
  };

  // Show the overlays that are on, adding each one's source and layers the first time.
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m) return;
    for (const o of registry) {
      if (o.alwaysOn || !o.url) continue;
      const show = () => {
        if (mapRef.current !== m) return;
        for (const l of o.layers) m.setLayoutProperty(l.id, 'visibility', on.includes(o.id) ? 'visible' : 'none');
      };
      const ready = on.includes(o.id) ? ensure(m, o) : added.current.get(o.id);
      void ready?.then(show, () => {});
    }
  }, [status, registry, on]);

  // A choropleth: the regions of its active region overlay, colored by the figures; its layers over the other regions are hidden.
  const choropleths = registry.filter((o) => o.kind === 'choropleth');
  const shownUse = choropleths
    .filter((o) => on.includes(o.id))
    .map((o) => {
      const region = registry.find((r) => r.id === activeRegion(o, on));
      const figures = region ? use?.(region) : undefined;
      const max = Math.max(0, ...(figures?.regions ?? []).map((f) => f.projects));
      return { o, region, figures, steps: choroplethSteps(max, o.ramp ?? []) };
    });
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m) return;
    for (const o of choropleths) {
      const shown = shownUse.find((x) => x.o.id === o.id);
      for (const r of o.regions ?? []) {
        const ids = choroplethLayers(o.id, r);
        if (!shown || shown.region?.id !== r) {
          for (const l of ids) if (m.getLayer(l)) m.setLayoutProperty(l, 'visibility', 'none');
          continue;
        }
        const region = shown.region;
        if (!region.url) continue;
        const paint = choroplethPaint((shown.figures?.regions ?? []).map((f) => ({ id: f.id, value: f.projects })), shown.steps);
        void ensure(m, region).then(() => {
          if (mapRef.current !== m) return;
          if (!m.getLayer(ids[0])) {
            const before = placeBefore(m, o.id);
            for (const l of o.layers.filter((x) => ids.includes(x.id))) m.addLayer(l, before);
          }
          for (const l of ids) m.setFilter(l, paint.filter);
          m.setPaintProperty(ids[0], 'fill-color', paint.color);
          for (const l of ids) m.setLayoutProperty(l, 'visibility', 'visible');
        }, () => {});
      }
    }
    // shownUse follows registry, on, and use.
  }, [status, registry, on, use]);

  // Redraw the projects when the results change.
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m || !features) return;
    m.getSource<GeoJSONSource>(PROJECT_SOURCE)?.setData(features as GeoJSONSourceSpecification['data'] & object);
    m.getSource<GeoJSONSource>(PALETTE_SOURCE)?.setData((palettes ?? { type: 'FeatureCollection', features: [] }) as GeoJSONSourceSpecification['data'] & object);
  }, [status, features, palettes]);

  // Draw the regions the filters hold as picked, on each selectable overlay once its layers are added.
  const filterKey = JSON.stringify(filters ?? {});
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m) return;
    for (const o of registry) {
      if (!o.selectable) continue;
      const ids = pickedRegions({ filters: filters ?? {} }, o.facets);
      void added.current.get(o.id)?.then(() => {
        if (mapRef.current !== m) return;
        for (const l of pickedLayers(o.id)) if (m.getLayer(l)) m.setFilter(l, pickedFilter(ids));
      }, () => {});
    }
    // filterKey stands for filters; `on` adds layers that need their filter set.
  }, [status, registry, on, filterKey]);

  // Draw the box filter.
  const boxKey = boxFilter?.join(',') ?? '';
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m) return;
    m.getSource<GeoJSONSource>(BOX_SOURCE)?.setData((boxFilter ? boxFeature(boxFilter) : { type: 'FeatureCollection', features: [] }) as never);
    // boxKey stands for boxFilter.
  }, [status, boxKey]);

  // Escape leaves the box tool.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawing(false);
        setDrag(undefined);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [drawing]);

  // A single plant's native range: its states, from the states overlay's file.
  const nativeKey = (nativeStates ?? []).join(',');
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m || !m.getSource(NATIVE_SOURCE)) return;
    const src = m.getSource<GeoJSONSource>(NATIVE_SOURCE)!;
    const want = new Set(nativeStates ?? []);
    if (!want.size) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const states = registry.find((o) => o.id === 'states');
    if (!states?.url) return;
    statesData.current ??= overlayData(absolute(states.url));
    statesData.current
      .then((data) => {
        if (mapRef.current !== m) return;
        const fc = data as unknown as { features: { properties?: { id?: string } }[] };
        src.setData({ type: 'FeatureCollection', features: fc.features.filter((f) => want.has(String(f.properties?.id))) } as never);
      })
      .catch((e) => console.warn('map: native range:', e));
    // nativeKey stands for nativeStates.
  }, [status, registry, nativeKey]);

  // The box tool: a drag over the map, on a layer laid over the canvas while the tool is on, so the map doesn't pan.
  const local = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const drawStart = (e: PointerEvent) => {
    const { x, y } = local(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x0: x, y0: y, x1: x, y1: y });
  };
  const drawMove = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = local(e);
    setDrag({ ...drag, x1: x, y1: y });
  };
  const drawEnd = () => {
    const m = mapRef.current;
    const d = drag;
    setDrag(undefined);
    if (!m || !d) return;
    // A click without a drag draws nothing; the tool stays on.
    if (Math.abs(d.x1 - d.x0) < 4 || Math.abs(d.y1 - d.y0) < 4) return;
    const a = m.unproject([d.x0, d.y0]);
    const b = m.unproject([d.x1, d.y1]);
    setDrawing(false);
    onBox?.([a.lng, a.lat, b.lng, b.lat]);
  };
  const useView = () => {
    const m = mapRef.current;
    if (!m) return;
    const b = m.getBounds();
    onBox?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  };

  const toggle = (id: string, checked: boolean) => setOn((cur) => (checked ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  const legends = registry.filter((o) => o.legend.length && (o.alwaysOn || on.includes(o.id)));
  const useLegends = use ? shownUse : [];
  const native = (nativeStates?.length ?? 0) > 0;
  const pickable = onPick ? registry.filter((o) => o.selectable && on.includes(o.id)) : [];
  const tools = Boolean(onBox) && status === 'ready';
  const hasUse = useLegends.length > 0;

  return (
    <div class={compact ? 'map-view map-view-compact' : 'map-view'} data-status={status} data-projects-rendered={rendered}>
      <div ref={box} class="map-canvas" role="region" aria-label={label} />
      {drawing && (
        <div class="map-draw" onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={drawEnd} onPointerCancel={() => setDrag(undefined)}>
          {drag && (
            <div
              class="map-draw-box"
              style={{ left: `${Math.min(drag.x0, drag.x1)}px`, top: `${Math.min(drag.y0, drag.y1)}px`, width: `${Math.abs(drag.x1 - drag.x0)}px`, height: `${Math.abs(drag.y1 - drag.y0)}px` }}
            />
          )}
        </div>
      )}
      {status === 'unsupported' && <p class="map-note">This browser can't draw the map (it needs WebGL). The list view shows the same entries.</p>}
      {status === 'error' && <p class="map-note">The map didn't load: {message}</p>}
      {(showList || legends.length > 0 || native || tools || hasUse) && registry.length > 0 && (
        <div class="map-panel">
          {tools && (
            <div class="map-tools" role="group" aria-labelledby="map-tools-title">
              <p id="map-tools-title" class="map-legend-title">
                Filter by area
              </p>
              <div class="map-tool-buttons">
                <button type="button" class="map-tool" aria-pressed={drawing} onClick={() => setDrawing((d) => !d)}>
                  {drawing ? 'Cancel box' : 'Draw a box'}
                </button>
                <button type="button" class="map-tool" onClick={useView}>
                  Use this view
                </button>
                {boxFilter && (
                  <button type="button" class="link-button" onClick={() => onBox?.(undefined)}>
                    Clear the box
                  </button>
                )}
              </div>
              <p class="map-hint" aria-live="polite">
                {drawing
                  ? 'Drag across the map to draw the box. Escape cancels.'
                  : pickable.length
                    ? `Click a region on the ${pickable.map((o) => o.label.toLowerCase()).join(' or ')} layer to filter by it; click it again to remove it.`
                    : 'Switch on a region layer to pick regions on the map.'}
              </p>
            </div>
          )}
          {showList && (
            <fieldset class="map-layers">
              <legend>Layers</legend>
              {registry.filter((o) => o.kind !== 'choropleth' || use).map((o) => (
                <label key={o.id}>
                  <input type="checkbox" checked={o.alwaysOn || on.includes(o.id)} disabled={o.alwaysOn} onChange={(e) => toggle(o.id, (e.currentTarget as HTMLInputElement).checked)} />
                  {o.label}
                  {o.alwaysOn && <span class="muted"> (always on)</span>}
                </label>
              ))}
            </fieldset>
          )}
          {native && (
            <div class="map-legend-block">
              <p class="map-legend-title">Native range</p>
              <ul role="list" class="map-legend-items">
                <li>
                  <span class="map-swatch map-swatch-fill map-swatch-native" aria-hidden="true" />
                  {(nativeStates ?? []).join(', ')}
                </li>
              </ul>
            </div>
          )}
          {useLegends.map(({ o, region, figures, steps }) => (
            <div class="map-legend-block" key={o.id}>
              <p class="map-legend-title">
                {o.label}
                {region ? ` (${region.label.toLowerCase()})` : ''}
              </p>
              {figures && steps.length ? (
                <>
                  <ul role="list" class="map-legend-items">
                    {steps.map((s) => (
                      <li key={s.min}>
                        <Swatch item={{ label: '', color: s.color, mark: 'fill' }} />
                        {stepLabel(s.min, s.max)}
                      </li>
                    ))}
                  </ul>
                  <p class="map-hint">
                    Projects listing the matching plants, in each region: {figures.projects} {figures.projects === 1 ? 'project' : 'projects'} in all. The library reflects the projects entered, not the region's planting as a whole.
                  </p>
                </>
              ) : (
                <p class="map-hint">Search or filter for plants to see where they are used.</p>
              )}
            </div>
          ))}
          {legends.map((o) => (
            <div class="map-legend-block" key={o.id}>
              <p class="map-legend-title">{o.label}</p>
              <ul role="list" class="map-legend-items">
                {o.legend.map((item) => (
                  <li key={item.label}>
                    <Swatch item={item} />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
