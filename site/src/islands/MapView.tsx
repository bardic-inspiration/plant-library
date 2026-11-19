/**
 * The map component: MapLibre GL JS drawing the token-built style over the
 * PMTiles basemap, with the library's projects clustered on top. MapLibre is
 * imported only when the map scrolls into view, so pages without a map, and
 * a map page before the map is shown, never load it (P10). The map view
 * (`Library` with `view="map"`) draws the results with it; the small maps
 * on detail pages (#32) will too.
 *
 * Overlays come from the registry (config/overlays.json), carried in the
 * style's metadata: the layer list shows each one, and an overlay's data is
 * fetched and its layers added only when it is first switched on.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { render } from 'preact';
import type { GeoJSONSource, GeoJSONSourceSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { BOUNDS_KEY, NATIVE_LAYERS, NATIVE_SOURCE, OVERLAY_BEFORE, PROJECT_LAYERS, PROJECT_SOURCE } from '../../../lib/map-style';
import { projectFeatures, type Bounds } from '../../../lib/map-data';
import type { MapPosition } from '../../../lib/filter';
import { beforeLayer, layerList, overlaySource, type LegendItem, type OverlayMeta } from '../../../lib/overlays';
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
  /** States to draw as a single plant's native range. */
  nativeStates?: string[];
  /** Where the map opens; the three states when absent. */
  position?: MapPosition;
  /** Called when the map settles after a move, and once it first loads. */
  onMove?: (pos: MapPosition, bounds: Bounds) => void;
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

export default function MapView({ label = 'Map of projects', overlays: initial = [], layerList: showList = true, index: given, features, nativeStates, position, onMove }: MapViewProps) {
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
        setRegistry(layerList(style));
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
        const m = new maplibregl.Map({
          container: el,
          style,
          ...(position ? { center: position.center, zoom: position.zoom } : { bounds: style.metadata[BOUNDS_KEY], fitBoundsOptions: { padding: 16 } }),
          attributionControl: { compact: true },
          cooperativeGestures: false,
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
        // How many project marks are drawn, for the built-site check (scripts/a11y.ts) and assistive text.
        m.on('idle', () => !cancelled && setRendered(m.queryRenderedFeatures({ layers: [PROJECT_LAYERS[0], PROJECT_LAYERS[2]] }).length));
        m.on('error', (e) => console.warn('map:', e.error?.message ?? e));

        // A cluster zooms in to where it splits; a project opens a popup linking its page.
        m.on('click', 'project-clusters', async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = m.getSource<GeoJSONSource>(PROJECT_SOURCE)!;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          m.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom });
        });
        m.on('click', 'project-points', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { key: string; name: string; url: string; place: string; quantity?: number };
          const body = popupContent(records.current.get(p.key), p);
          new maplibregl.Popup({ closeButton: true, maxWidth: 'none' }).setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates).setDOMContent(body).addTo(m);
        });
        for (const layer of [PROJECT_LAYERS[0], PROJECT_LAYERS[2]]) {
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

  // Show the overlays that are on, adding each one's source and layers the first time.
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m) return;
    for (const o of registry) {
      if (o.alwaysOn || !o.url) continue;
      const visible = on.includes(o.id);
      const show = () => {
        if (mapRef.current !== m) return;
        for (const l of o.layers) m.setLayoutProperty(l.id, 'visibility', on.includes(o.id) ? 'visible' : 'none');
      };
      let ready = added.current.get(o.id);
      if (!ready && visible) {
        const href = absolute(o.url);
        ready = overlayData(href).then((data) => {
          if (mapRef.current !== m) return;
          m.addSource(overlaySource(o.id), { type: 'geojson', data });
          const fallback = m.getLayer(OVERLAY_BEFORE) ? OVERLAY_BEFORE : PROJECT_LAYERS[0];
          const before = beforeLayer(registry, o.id, (id) => Boolean(m.getLayer(id)), fallback);
          for (const l of o.layers) m.addLayer(l, before);
        });
        ready.catch((e) => console.warn(`map: overlay ${o.id}:`, e));
        added.current.set(o.id, ready);
      }
      void ready?.then(show, () => {});
    }
  }, [status, registry, on]);

  // Redraw the projects when the results change.
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m || !features) return;
    m.getSource<GeoJSONSource>(PROJECT_SOURCE)?.setData(features as GeoJSONSourceSpecification['data'] & object);
  }, [status, features]);

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

  const toggle = (id: string, checked: boolean) => setOn((cur) => (checked ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  const legends = registry.filter((o) => o.legend.length && (o.alwaysOn || on.includes(o.id)));
  const native = (nativeStates?.length ?? 0) > 0;

  return (
    <div class="map-view" data-status={status} data-projects-rendered={rendered}>
      <div ref={box} class="map-canvas" role="region" aria-label={label} />
      {status === 'unsupported' && <p class="map-note">This browser can't draw the map (it needs WebGL). The list view shows the same entries.</p>}
      {status === 'error' && <p class="map-note">The map didn't load: {message}</p>}
      {(showList || legends.length > 0 || native) && registry.length > 0 && (
        <div class="map-panel">
          {showList && (
            <fieldset class="map-layers">
              <legend>Layers</legend>
              {registry.map((o) => (
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
