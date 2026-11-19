/**
 * The map component: MapLibre GL JS drawing the token-built style over the
 * PMTiles basemap, with the library's projects clustered on top. MapLibre is
 * imported only when the map scrolls into view, so pages without a map, and
 * a map page before the map is shown, never load it (P10). The map view
 * (#30) and the small maps on detail pages (#32) build on this.
 *
 * Overlays come from the registry (config/overlays.json), carried in the
 * style's metadata: the layer list shows each one, and an overlay's data is
 * fetched and its layers added only when it is first switched on.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GeoJSONSourceSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { BOUNDS_KEY, OVERLAY_BEFORE, PROJECT_LAYERS, PROJECT_SOURCE } from '../../../lib/map-style';
import { projectFeatures } from '../../../lib/map-data';
import { beforeLayer, layerList, overlaySource, type LegendItem, type OverlayMeta } from '../../../lib/overlays';
import type { LibraryIndex } from '../../../lib/types';
import { url } from '../../../lib/site';
import './map.css';

type Status = 'waiting' | 'loading' | 'ready' | 'unsupported' | 'error';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

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
}

export default function MapView({ label = 'Map of projects', overlays: initial = [], layerList: showList = true }: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const added = useRef(new Map<string, Promise<void>>());
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
          fetch(url('library.json')).then((r) => r.json() as Promise<LibraryIndex>),
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
        style.sources[PROJECT_SOURCE].data = projectFeatures(index.records);
        const m = new maplibregl.Map({
          container: el,
          style,
          bounds: style.metadata[BOUNDS_KEY],
          fitBoundsOptions: { padding: 16 },
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
        map = m;
        mapRef.current = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        m.on('load', () => !cancelled && setStatus('ready'));
        m.on('error', (e) => console.warn('map:', e.error?.message ?? e));

        // A cluster zooms in to where it splits; a project opens a popup linking its page.
        m.on('click', 'project-clusters', async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = m.getSource<import('maplibre-gl').GeoJSONSource>(PROJECT_SOURCE)!;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          m.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom });
        });
        m.on('click', 'project-points', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { name: string; url: string; place: string };
          const body = document.createElement('div');
          const a = document.createElement('a');
          a.href = p.url;
          a.textContent = p.name;
          const place = document.createElement('p');
          place.textContent = p.place;
          body.append(a, place);
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

  const toggle = (id: string, checked: boolean) => setOn((cur) => (checked ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  const legends = registry.filter((o) => o.legend.length && (o.alwaysOn || on.includes(o.id)));

  return (
    <div class="map-view" data-status={status}>
      <div ref={box} class="map-canvas" role="region" aria-label={label} />
      {status === 'unsupported' && <p class="map-note">This browser can't draw the map (it needs WebGL). The list view shows the same entries.</p>}
      {status === 'error' && <p class="map-note">The map didn't load: {message}</p>}
      {(showList || legends.length > 0) && registry.length > 0 && (
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
