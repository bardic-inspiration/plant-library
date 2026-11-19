/**
 * The palette workspace (`/workspace/`): a design tool for mocking up a plant
 * list in the browser, with no account (spec: library.md, Palette
 * workspace). Lists live in local storage, several by name; a list can be
 * shared as a URL that encodes it. Feedback (totals, native share, mixes,
 * bloom calendar, compatibility) is computed here from the plants' full
 * entries, fetched as each plant joins the list (P10), with the same
 * functions the build uses (P3). A list exports as a CSV schedule, a
 * palette file, or a print view, and a CSV schedule imports as a new list
 * (lib/export.ts).
 */
import type { ComponentType } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Topology } from 'topojson-specification';
import {
  addPlant,
  addText,
  emptyList,
  fitFilters,
  hasPlant,
  listCompatibility,
  listSummary,
  moveLine,
  removeLine,
  roundPoint,
  sharedFromSearch,
  decodeList,
  shareUrl,
  compatSite,
  updateLine,
  type WorkspaceList,
  type WorkspaceStore,
} from '../../../lib/workspace';
import { applyQuery, emptyQuery, libraryUrl } from '../../../lib/filter';
import { fileName, linesFromCsv, paletteEntry, paletteProblems, printListUrl, recordNameIndex, recordPlant, scheduleCsv, scheduleRows, today } from '../../../lib/export';
import { decodeLayer, featureAt, type GeoLayer } from '../../../lib/geo';
import { OVERLAY_DIR } from '../../../lib/overlays';
import { projectFeatures } from '../../../lib/map-data';
import { HALF_ZONES } from '../../../lib/zones';
import { url } from '../../../lib/site';
import type { IndexRecord, LibraryIndex, PaletteSite, PlantData, PlantListItem } from '../../../lib/types';
import type { MapViewProps } from './MapView';
import { CompatPanel, type CompatPlant } from '../components/ui/CompatPanel';
import { PlantName } from '../components/ui/PlantName';
import { label, vocabList } from '../lib/vocab';
import { buildSearch } from '../lib/search';
import { currentList, readStore, withCurrent, writeStore } from '../lib/workspace-store';
import './workspace.css';

const number = new Intl.NumberFormat('en-US');
const percent = (x: number) => `${Math.round(x * 100)}%`;
const STATE_NAMES: Record<string, string> = { WA: 'Washington', OR: 'Oregon', CA: 'California' };
/** How many "Plants that fit" to list before linking to the rest. */
const FIT_SHOWN = 12;
const SEARCH_SHOWN = 8;

const keyOf = (l: PlantListItem) => (typeof l.plant === 'string' ? undefined : l.plant.ref);

/** The index, loaded once. */
function useIndex(): { index?: LibraryIndex; error?: string } {
  const [state, setState] = useState<{ index?: LibraryIndex; error?: string }>({});
  useEffect(() => {
    fetch(url('library.json'), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`The library index didn't load (${r.status}).`);
        return r.json() as Promise<LibraryIndex>;
      })
      .then((index) => setState({ index }))
      .catch((e: Error) => setState({ error: e.message }));
  }, []);
  return state;
}

/** The full entries of the plants a list refs, fetched as they join it. A plant whose entry doesn't load counts as not in the library. */
function usePlants(keys: string[]): { plants: ReadonlyMap<string, PlantData>; pending: number } {
  const [plants, setPlants] = useState<Map<string, PlantData>>(new Map());
  const asked = useRef(new Set<string>());
  const [pending, setPending] = useState(0);
  useEffect(() => {
    for (const k of keys) {
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      setPending((n) => n + 1);
      fetch(url(`data/${k}.json`))
        .then((r) => (r.ok ? (r.json() as Promise<{ data: PlantData }>) : undefined))
        .then((e) => e && setPlants((cur) => new Map(cur).set(k, e.data)))
        .catch(() => {})
        .finally(() => setPending((n) => n - 1));
    }
  }, [keys.join('\n')]);
  return { plants, pending };
}

/** The state and ecoregion a point is in, from the map's own overlay files, loaded when a location is first set. */
let layers: Promise<{ states: GeoLayer; ecoregions: GeoLayer }> | undefined;
function loadLayers() {
  const one = (id: string) => fetch(url(`${OVERLAY_DIR}/${id}.json`)).then((r) => r.json() as Promise<Topology>).then(decodeLayer);
  layers ??= Promise.all([one('states'), one('ecoregions')]).then(([states, ecoregions]) => ({ states, ecoregions }));
  return layers;
}

interface SiteGeo {
  state?: string;
  ecoregion?: string;
  outside?: boolean;
}

function useSiteGeo(loc: PaletteSite['location']): { geo: SiteGeo; loading: boolean } {
  const [geo, setGeo] = useState<SiteGeo>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!loc) return setGeo({});
    let live = true;
    setLoading(true);
    loadLayers()
      .then(({ states, ecoregions }) => {
        if (!live) return;
        const st = featureAt(states, loc.lon, loc.lat);
        const eco = featureAt(ecoregions, loc.lon, loc.lat);
        setGeo(st ? { state: st.id, ecoregion: eco?.name } : { outside: true });
      })
      .catch(() => live && setGeo({}))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [loc?.lat, loc?.lon]);
  return { geo, loading };
}

function useMapView(): ComponentType<MapViewProps> | undefined {
  const [C, setC] = useState<ComponentType<MapViewProps> | undefined>(undefined);
  useEffect(() => {
    void import('./MapView').then((m) => setC(() => m.default));
  }, []);
  return C;
}

/** Text for a mix: "Shrub 40 (50%), Tree 10 (13%)". */
function mixText(rec: Record<string, number>, list: string, unknown: string): string {
  const total = Object.values(rec).reduce((a, b) => a + b, 0);
  return Object.entries(rec)
    .filter(([, q]) => q > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, q]) => `${id === 'unknown' ? unknown : label(list, id)} ${number.format(q)} (${percent(q / total)})`)
    .join(', ');
}

/** The lists: choose one, start one, rename, delete, and share. */
function ListBar({ store, list, onStore, saved }: { store: WorkspaceStore; list: WorkspaceList; onStore: (s: WorkspaceStore) => void; saved: boolean }) {
  const [copied, setCopied] = useState('');
  const link = useMemo(() => new URL(shareUrl(list), location.href).href, [list]);
  const startNew = () => {
    const fresh = emptyList(`List ${store.lists.length + 1}`);
    onStore({ current: fresh.id, lists: [...store.lists, fresh] });
  };
  const remove = () => {
    if (!confirm(`Delete “${list.name}”? This can't be undone.`)) return;
    const rest = store.lists.filter((l) => l.id !== list.id);
    const lists = rest.length ? rest : [emptyList()];
    onStore({ current: lists[0].id, lists });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Link copied.');
    } catch {
      setCopied('Copy the link from the box.');
    }
  };
  return (
    <section class="ws-lists" aria-labelledby="lists-heading">
      <h2 id="lists-heading" class="visually-hidden">
        Lists
      </h2>
      <div class="ws-row">
        <label class="ws-field">
          <span>List</span>
          <select value={list.id} onChange={(e) => onStore({ ...store, current: (e.currentTarget as HTMLSelectElement).value })}>
            {store.lists.map((l) => (
              <option value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label class="ws-field">
          <span>Name</span>
          <input
            type="text"
            maxLength={200}
            value={list.name}
            onChange={(e) => {
              const name = (e.currentTarget as HTMLInputElement).value.trim();
              onStore(withCurrent(store, (l) => ({ ...l, name: name || l.name })));
            }}
          />
        </label>
        <button type="button" class="ws-button" onClick={startNew}>
          New list
        </button>
        <button type="button" class="ws-button" onClick={remove}>
          Delete list
        </button>
      </div>
      <div class="ws-row">
        <label class="ws-field ws-grow">
          <span>Share link (opens a copy of this list)</span>
          <input type="text" readOnly value={link} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
        </label>
        <button type="button" class="ws-button" onClick={copy}>
          Copy link
        </button>
        <span role="status" class="ws-status">
          {copied}
        </span>
      </div>
      {!saved && <p class="ws-note">This browser isn't saving lists (site data may be blocked), so this list lasts only until the page is closed. The share link still keeps it.</p>}
    </section>
  );
}

/** Find a plant to add, or add a name the library doesn't hold. */
function AddPlants({ index, list, onList }: { index: LibraryIndex; list: WorkspaceList; onList: (l: WorkspaceList) => void }) {
  const [q, setQ] = useState('');
  const search = useMemo(() => buildSearch(index), [index]);
  const byKey = useMemo(() => new Map(index.records.map((r) => [r.key, r])), [index]);
  const hits = useMemo(() => {
    if (!q.trim()) return [];
    return search
      .search(q.trim())
      .map((h) => byKey.get(String(h.id)))
      .filter((r): r is IndexRecord => r?.type === 'plant')
      .slice(0, SEARCH_SHOWN);
  }, [q, search, byKey]);
  return (
    <div class="ws-add">
      <label class="ws-field ws-grow">
        <span>Find a plant to add</span>
        <input type="search" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} placeholder="Botanical or common name" />
      </label>
      {q.trim() && (
        <ul role="list" class="ws-hits" aria-label="Plants matching the search">
          {hits.map((r) => (
            <li>
              <span>
                <PlantName parts={r.nameParts} fallback={r.name} />
                {r.card.commonName ? <span class="muted"> {String(r.card.commonName)}</span> : null}
              </span>
              {hasPlant(list, r.key) ? (
                <span class="muted">On the list</span>
              ) : (
                <button type="button" class="ws-button" aria-label={`Add ${r.name}`} onClick={() => onList(addPlant(list, r.key))}>
                  Add
                </button>
              )}
            </li>
          ))}
          <li>
            <span>{hits.length ? 'Not what you meant?' : 'No plant in the library matches.'}</span>
            <button
              type="button"
              class="ws-button"
              onClick={() => {
                onList(addText(list, q));
                setQ('');
              }}
            >
              Add “{q.trim()}” as a name not in the library
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

const FIELDS = [
  { id: 'quantity', label: 'Quantity' },
  { id: 'size', label: 'Size' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'note', label: 'Note' },
] as const;

/** One line: its plant, its fields, and its controls. */
function Line({ line, i, n, record, plant, grouped, onList, list }: { line: PlantListItem; i: number; n: number; record?: IndexRecord; plant?: PlantData; grouped: boolean; list: WorkspaceList; onList: (l: WorkspaceList) => void }) {
  const name = record?.name ?? (typeof line.plant === 'string' ? line.plant : line.plant.ref);
  return (
    <li class="ws-line">
      <div class="ws-line-name">
        {record ? (
          <a href={record.url}>
            <PlantName parts={record.nameParts} fallback={record.name} />
          </a>
        ) : (
          <span>{name}</span>
        )}
        <span class="muted">{plant?.commonNames[0] ?? (record ? '' : 'Not in the library')}</span>
      </div>
      <div class="ws-line-fields">
        {FIELDS.map((f) => (
          <label class="ws-field">
            <span>{f.label}</span>
            {f.id === 'quantity' ? (
              <input
                type="number"
                min={1}
                step={1}
                aria-label={`${f.label}, ${name}`}
                value={line.quantity === undefined ? '' : String(line.quantity)}
                onChange={(e) => onList(updateLine(list, i, f.id, (e.currentTarget as HTMLInputElement).value))}
              />
            ) : (
              <input
                type="text"
                maxLength={200}
                aria-label={`${f.label}, ${name}`}
                value={line[f.id] ?? ''}
                onChange={(e) => onList(updateLine(list, i, f.id, (e.currentTarget as HTMLInputElement).value))}
              />
            )}
          </label>
        ))}
      </div>
      <div class="ws-line-actions">
        {!grouped && (
          <>
            <button type="button" class="ws-button" disabled={i === 0} aria-label={`Move ${name} up`} onClick={() => onList(moveLine(list, i, -1))}>
              Up
            </button>
            <button type="button" class="ws-button" disabled={i === n - 1} aria-label={`Move ${name} down`} onClick={() => onList(moveLine(list, i, 1))}>
              Down
            </button>
          </>
        )}
        <button type="button" class="ws-button" aria-label={`Remove ${name}`} onClick={() => onList(removeLine(list, i))}>
          Remove
        </button>
      </div>
    </li>
  );
}

/** The lines, in list order or grouped by form (vocabulary order, names not in the library last). */
function Lines({ list, byKey, plants, onList }: { list: WorkspaceList; byKey: ReadonlyMap<string, IndexRecord>; plants: ReadonlyMap<string, PlantData>; onList: (l: WorkspaceList) => void }) {
  const grouped = Boolean(list.grouped);
  const row = (line: PlantListItem, i: number) => {
    const k = keyOf(line);
    return <Line key={`${i}:${k ?? line.plant}`} line={line} i={i} n={list.lines.length} record={k ? byKey.get(k) : undefined} plant={k ? plants.get(k) : undefined} grouped={grouped} list={list} onList={onList} />;
  };
  const indexed = list.lines.map((line, i) => ({ line, i, form: plants.get(keyOf(line) ?? '')?.form }));
  return (
    <>
      <label class="ws-check">
        <input type="checkbox" checked={grouped} onChange={(e) => onList({ ...list, grouped: (e.currentTarget as HTMLInputElement).checked || undefined })} />
        Group by form
      </label>
      {grouped && <p class="ws-hint">Lines are grouped by form; turn grouping off to reorder them.</p>}
      {!grouped ? (
        <ol class="ws-lines" aria-label="Lines">
          {list.lines.map(row)}
        </ol>
      ) : (
        [...vocabList('form').map((f) => ({ id: f.id, title: label('form', f.id) })), { id: undefined, title: 'Not in the library' }].map((g) => {
          const lines = indexed.filter((x) => x.form === g.id);
          if (!lines.length) return null;
          return (
            <div class="ws-group">
              <h3>{g.title}</h3>
              <ol class="ws-lines" aria-label={`${g.title} lines`}>
                {lines.map((x) => row(x.line, x.i))}
              </ol>
            </div>
          );
        })
      )}
    </>
  );
}

/** Site conditions: sun, moisture, drainage, a zone, and a location picked on the map or entered. */
function Site({ index, list, onList, geo, geoLoading }: { index: LibraryIndex; list: WorkspaceList; onList: (l: WorkspaceList) => void; geo: SiteGeo; geoLoading: boolean }) {
  const MapView = useMapView();
  const site = list.site;
  const setSite = (s: PaletteSite) => onList({ ...list, site: s });
  const toggle = (vals: string[] | undefined, v: string, on: boolean) => {
    const next = on ? [...new Set([...(vals ?? []), v])] : (vals ?? []).filter((x) => x !== v);
    return next.length ? next : undefined;
  };
  const checks = (title: string, vocab: string, vals: string[] | undefined, set: (v: string[] | undefined) => void) => (
    <fieldset class="ws-fieldset">
      <legend>{title}</legend>
      {vocabList(vocab).map((v) => (
        <label class="ws-check">
          <input type="checkbox" checked={vals?.includes(v.id) ?? false} onChange={(e) => set(toggle(vals, v.id, (e.currentTarget as HTMLInputElement).checked))} />
          {v.label}
        </label>
      ))}
    </fieldset>
  );
  const clean = (s: PaletteSite) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as PaletteSite;
  const projects = useMemo(() => projectFeatures(index.records), [index]);
  const point = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: site.location ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [site.location.lon, site.location.lat] as [number, number] }, properties: { key: 'workspace/site', name: 'The site', url: '#site-heading', place: '' } }] : [],
    }),
    [site.location?.lat, site.location?.lon],
  );
  const [lat, setLat] = useState(site.location ? String(site.location.lat) : '');
  const [lon, setLon] = useState(site.location ? String(site.location.lon) : '');
  useEffect(() => {
    setLat(site.location ? String(site.location.lat) : '');
    setLon(site.location ? String(site.location.lon) : '');
  }, [site.location?.lat, site.location?.lon]);
  const [error, setError] = useState('');
  const locate = (la: number, lo: number) => {
    setError('');
    setSite({ ...site, location: roundPoint(la, lo) });
  };
  const submit = (e: Event) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return setError('Enter a latitude and a longitude in decimal degrees, such as 47.6062 and -122.3321.');
    locate(la, lo);
  };
  return (
    <>
      <p>Site conditions narrow the compatibility check and the plants that fit. Each condition may take several values, as a part-sun, part-shade site does.</p>
      <div class="ws-site">
        {checks('Sun', 'sun', site.sun, (v) => setSite(clean({ ...site, sun: v })))}
        {checks('Moisture', 'moisture', site.moisture, (v) => setSite(clean({ ...site, moisture: v })))}
        {checks('Soil drainage', 'soilDrainage', site.soil?.drainage, (v) => setSite(clean({ ...site, soil: v ? { drainage: v } : undefined })))}
        <label class="ws-field">
          <span>Hardiness zone</span>
          <select value={site.hardinessZone ?? ''} onChange={(e) => setSite(clean({ ...site, hardinessZone: (e.currentTarget as HTMLSelectElement).value || undefined }))}>
            <option value="">Not stated</option>
            {Array.from({ length: 13 }, (_, n) => [String(n + 1), HALF_ZONES[n * 2], HALF_ZONES[n * 2 + 1]]).flat().map((z) => (
              <option value={z}>Zone {z}</option>
            ))}
          </select>
        </label>
      </div>
      <h3>Location</h3>
      <p class="ws-hint">Click the map to place the site, or enter its coordinates. The location gives the state, for the native share, and the ecoregion.</p>
      {MapView ? (
        <MapView compact label="Map for placing the site; click to set its location" features={projects} palettes={point} layerList={false} onLocate={(lo, la) => locate(la, lo)} fit={site.location ? [site.location.lon, site.location.lat, site.location.lon, site.location.lat] : undefined} />
      ) : (
        <p class="ws-hint">Loading the map…</p>
      )}
      <form class="ws-row" onSubmit={submit}>
        <label class="ws-field">
          <span>Latitude</span>
          <input type="text" inputMode="decimal" value={lat} onInput={(e) => setLat((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="ws-field">
          <span>Longitude</span>
          <input type="text" inputMode="decimal" value={lon} onInput={(e) => setLon((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <button type="submit" class="ws-button">
          Set location
        </button>
        {site.location && (
          <button type="button" class="ws-button" onClick={() => setSite(clean({ ...site, location: undefined }))}>
            Clear location
          </button>
        )}
      </form>
      {error && <p class="ws-note" role="alert">{error}</p>}
      <p role="status" class="ws-status">
        {!site.location
          ? 'No location set.'
          : geoLoading
            ? 'Finding the state and ecoregion…'
            : geo.outside
              ? 'The location is outside Washington, Oregon, and California, so it gives no state or ecoregion.'
              : geo.state
                ? `In ${STATE_NAMES[geo.state] ?? geo.state}${geo.ecoregion ? `, ${geo.ecoregion} ecoregion` : ''}. The hardiness zone isn't derived from a location yet; choose it above.`
                : ''}
      </p>
    </>
  );
}

function Summary({ list, plants, state }: { list: WorkspaceList; plants: ReadonlyMap<string, PlantData>; state?: string }) {
  const s = listSummary(list.lines, plants, state);
  const rows: [string, string][] = [
    ['Taxa in the library', String(s.taxa)],
    ...(s.unsourced ? [['Names not in the library', String(s.unsourced)] as [string, string]] : []),
    ['Total quantity', `${number.format(s.quantity)}${s.unquantified ? ` (${s.unquantified} ${s.unquantified === 1 ? 'line has' : 'lines have'} no quantity and ${s.unquantified === 1 ? 'counts' : 'count'} as one)` : ''}`],
    [
      'Native share',
      !state
        ? 'Unknown: give the site a location in Washington, Oregon, or California.'
        : s.nativeShare === undefined
          ? 'Unknown: no plant on the list records a native range.'
          : `${percent(s.nativeShare)} of plants with a recorded range are native to ${STATE_NAMES[state] ?? state}`,
    ],
    ['Mix by form', mixText(s.byForm, 'form', 'Not in the library') || 'None'],
    ['Mix by life cycle', mixText(s.byLifeCycle, 'lifeCycle', 'Not recorded') || 'None'],
  ];
  return (
    <div class="table-scroll" role="region" aria-label="List summary" tabindex={0}>
      <table class="facts ws-facts">
        <tbody>
          {rows.map(([k, v]) => (
            <tr>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BloomCalendar({ list, plants }: { list: WorkspaceList; plants: ReadonlyMap<string, PlantData> }) {
  const s = listSummary(list.lines, plants);
  if (!s.taxa) return <p>No plant on the list is in the library yet.</p>;
  const months = vocabList('month');
  const anyBloom = s.bloom.some((b) => b.length);
  return (
    <>
      <p>
        {!anyBloom
          ? 'No plant on the list records its bloom months.'
          : s.bloomGaps.length
            ? `Nothing blooms in ${s.bloomGaps.map((m) => label('month', String(m))).join(', ')}: a gap in seasonal interest.`
            : 'Something is in bloom every month.'}
        {s.noBloom.length > 0 && anyBloom && ` ${s.noBloom.length} ${s.noBloom.length === 1 ? 'plant records' : 'plants record'} no bloom months.`}
      </p>
      {anyBloom && (
        <div class="table-scroll" role="region" aria-label="Bloom calendar" tabindex={0}>
          <table class="ws-bloom">
            <thead>
              <tr>
                <th scope="col">Month</th>
                {months.map((m) => (
                  <th scope="col">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Plants in bloom</th>
                {s.bloom.map((b) => (
                  <td class={b.length ? 'on' : 'gap'}>{b.length || 'None'}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Fit({ index, list, filters, onList }: { index: LibraryIndex; list: WorkspaceList; filters: Record<string, string[]>; onList: (l: WorkspaceList) => void }) {
  const all = useMemo(() => applyQuery(index.records, { ...emptyQuery(), filters }, null), [index, filters]);
  const shown = all.filter((r) => !hasPlant(list, r.key)).slice(0, FIT_SHOWN);
  const facetLabel = (k: string) => index.facets.find((f) => f.key === k);
  const terms = Object.entries(filters)
    .filter(([k]) => k !== 'type')
    .map(([k, vals]) => `${facetLabel(k)?.label ?? k}: ${vals.map((v) => facetLabel(k)?.values.find((x) => x.id === v)?.label ?? v).join(' or ')}`);
  return (
    <>
      <p>
        {terms.length
          ? `Plants in the library that accept ${terms.join('; ')}, from the site where it states a condition and otherwise from what the list's plants share.`
          : 'Add plants with recorded conditions, or give the site conditions, to narrow this to plants that fit.'}{' '}
        <a href={libraryUrl(filters)}>See all {all.length} in the Library</a>
      </p>
      {shown.length ? (
        <ul role="list" class="ws-fit">
          {shown.map((r) => (
            <li>
              <span>
                <a href={r.url}>
                  <PlantName parts={r.nameParts} fallback={r.name} />
                </a>
                {r.card.commonName ? <span class="muted"> {String(r.card.commonName)}</span> : null}
              </span>
              <button type="button" class="ws-button" aria-label={`Add ${r.name}`} onClick={() => onList(addPlant(list, r.key))}>
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Every plant that fits is on the list already.</p>
      )}
    </>
  );
}

/** Offer a file to save, made in the browser. */
function download(text: string, name: string, type: string) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Export the list (CSV schedule, palette file, print views) and import a CSV schedule as a new list. */
function Exports({ index, store, list, outside, onStore }: { index: LibraryIndex; store: WorkspaceStore; list: WorkspaceList; outside: boolean; onStore: (s: WorkspaceStore) => void }) {
  const [status, setStatus] = useState('');
  const byKey = useMemo(() => new Map(index.records.map((r) => [r.key, r])), [index]);
  const names = useMemo(() => recordNameIndex(index.records), [index]);
  const nameOf = (l: PlantListItem) => (typeof l.plant === 'string' ? l.plant : (byKey.get(l.plant.ref)?.name ?? l.plant.ref));
  const problems = paletteProblems(list, names, nameOf, outside);
  const csv = () => {
    const rows = scheduleRows(list.lines, (k) => {
      const r = byKey.get(k);
      return r?.type === 'plant' ? recordPlant(r) : undefined;
    });
    download(scheduleCsv(rows), fileName(list.name, 'csv'), 'text/csv;charset=utf-8');
  };
  const json = () => {
    const entry = paletteEntry(list, today(), names);
    download(JSON.stringify(entry, null, 2) + '\n', `${entry.id}.json`, 'application/json');
  };
  const importCsv = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const read = linesFromCsv(await file.text(), names);
    if (read.error) return setStatus(read.error);
    const fresh = { ...emptyList(file.name.replace(/\.csv$/i, '').trim() || 'Imported list'), lines: read.lines };
    onStore({ current: fresh.id, lists: [...store.lists, fresh] });
    setStatus(`Imported “${fresh.name}” as a new list, with ${read.lines.length} ${read.lines.length === 1 ? 'line' : 'lines'}${read.skipped ? `; ${read.skipped} ${read.skipped === 1 ? 'row has' : 'rows have'} no botanical name and ${read.skipped === 1 ? 'was' : 'were'} left out` : ''}.`);
  };
  const empty = list.lines.length === 0;
  return (
    <>
      <p>Save the list as a CSV plant schedule (botanical name, common name, quantity, size, spacing, note), or as a palette file that the library's validation accepts, ready to submit. A palette file is dated today, and its summary is a placeholder to rewrite.</p>
      <div class="ws-row">
        <button type="button" class="ws-button" disabled={empty} onClick={csv}>
          Schedule as CSV
        </button>
        <button type="button" class="ws-button" onClick={json}>
          Palette file (JSON)
        </button>
        {!empty && (
          <>
            <a class="workspace-link" href={printListUrl(list)}>
              Print schedule
            </a>
            <a class="workspace-link" href={printListUrl(list, true)}>
              Print cut sheets
            </a>
          </>
        )}
      </div>
      {problems.length > 0 && (
        <div class="ws-note">
          <p>The palette file won't pass validation until these are fixed:</p>
          <ul>
            {problems.map((p) => (
              <li>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <h3>Import</h3>
      <label class="ws-field">
        <span>Open a CSV plant schedule as a new list</span>
        <input type="file" accept=".csv,text/csv" onChange={importCsv} />
      </label>
      <p class="ws-hint">The file needs a “Botanical name” column; Quantity, Size, Spacing, and Note are read when present. Names the library holds become its plants.</p>
      <p role="status" class="ws-status">
        {status}
      </p>
    </>
  );
}

export default function Workspace() {
  const { index, error } = useIndex();
  const [store, setStore] = useState<WorkspaceStore>(() => readStore());
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState('');

  // A shared list in the URL opens as a new list, and the query is cleared so a reload doesn't add it again.
  useEffect(() => {
    const shared = sharedFromSearch(location.search);
    if (!shared) return;
    const list = decodeList(shared);
    history.replaceState(null, '', location.pathname + location.hash);
    if (!list) return setNotice("The shared link couldn't be read, so no list was opened from it.");
    const cur = readStore();
    commit({ current: list.id, lists: [...cur.lists.filter((l) => l.lines.length || l.name !== 'My list' || cur.lists.length > 1), list] });
    setNotice(`Opened “${list.name}” as a new list, with ${list.lines.length} ${list.lines.length === 1 ? 'line' : 'lines'}.`);
  }, []);

  // Another tab (or a card's "add to list") changed the lists.
  useEffect(() => {
    const onStorage = () => setStore(readStore());
    addEventListener('storage', onStorage);
    addEventListener('focus', onStorage);
    return () => {
      removeEventListener('storage', onStorage);
      removeEventListener('focus', onStorage);
    };
  }, []);

  useEffect(() => {
    const fallback = document.getElementById('workspace-fallback');
    if (fallback) fallback.hidden = true;
  }, []);

  function commit(next: WorkspaceStore) {
    setStore(next);
    setSaved(writeStore(next));
  }

  const list = currentList(store);
  const setList = (l: WorkspaceList) => commit(withCurrent(store, () => l));
  const keys = useMemo(() => [...new Set(list.lines.map(keyOf).filter((k): k is string => Boolean(k)))], [list]);
  const { plants, pending } = usePlants(keys);
  const { geo, loading: geoLoading } = useSiteGeo(list.site.location);
  const byKey = useMemo(() => new Map((index?.records ?? []).map((r) => [r.key, r])), [index]);
  const compat = useMemo(() => listCompatibility(list, plants), [list, plants]);
  const compatNames = useMemo(
    () => new Map<string, CompatPlant>(compat.plants.map((k) => [k, { name: byKey.get(k)?.name ?? k, parts: byKey.get(k)?.nameParts, url: byKey.get(k)?.url ?? url(`${k}/`) }])),
    [compat, byKey],
  );
  const filters = useMemo(() => fitFilters(compat, list.site), [compat, list.site]);

  if (error) return <p class="ws-note">{error}</p>;
  if (!index) return <p aria-live="polite">Loading the workspace…</p>;
  return (
    <div class="workspace">
      {notice && (
        <p class="ws-note" role="status">
          {notice}
        </p>
      )}
      <ListBar store={store} list={list} onStore={commit} saved={saved} />

      <section aria-labelledby="plants-heading">
        <h2 id="plants-heading">Plants</h2>
        <AddPlants index={index} list={list} onList={setList} />
        {list.lines.length ? (
          <Lines list={list} byKey={byKey} plants={plants} onList={setList} />
        ) : (
          <p>
            The list is empty. Find a plant above, or use “Add to list” on a card in the <a href={url()}>Library</a> or on a plant page; a project or palette page opens its own list here.
          </p>
        )}
        {pending > 0 && <p class="ws-hint">Loading plant details…</p>}
      </section>

      <section aria-labelledby="site-heading">
        <h2 id="site-heading">Site</h2>
        <Site index={index} list={list} onList={setList} geo={geo} geoLoading={geoLoading} />
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summary</h2>
        <Summary list={list} plants={plants} state={geo.state} />
      </section>

      <section aria-labelledby="bloom-heading">
        <h2 id="bloom-heading">Bloom calendar</h2>
        <BloomCalendar list={list} plants={plants} />
      </section>

      <section aria-labelledby="compat-heading">
        <h2 id="compat-heading">Compatibility</h2>
        <CompatPanel compat={compat} plants={compatNames} site={compatSite(list.site)} idPrefix="ws-compat" />
      </section>

      <section aria-labelledby="fit-heading">
        <h2 id="fit-heading">Plants that fit</h2>
        <Fit index={index} list={list} filters={filters} onList={setList} />
      </section>

      <section aria-labelledby="export-heading">
        <h2 id="export-heading">Export</h2>
        <Exports index={index} store={store} list={list} outside={Boolean(geo.outside)} onStore={commit} />
      </section>
    </div>
  );
}
