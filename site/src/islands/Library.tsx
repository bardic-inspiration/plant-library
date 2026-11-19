/**
 * The Library: one island that loads the index once and filters in memory.
 * Search, filters, and sort live in the query string. The list view (`/`)
 * lists the results; the map view (`/map/`) draws them, with a panel of the
 * results in view. Both share the query string, so switching keeps it.
 */
import type { ComponentType } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import MiniSearch from 'minisearch';
import { TYPES } from '../../../lib/registry';
import { applyQuery, clearFilters, facetCounts, mapPosition, parseQuery, pickRegion, regionKeys, serializeQuery, sortOptions, sortRecords, toggleValue, viewUrl, withBbox, withMapPosition, type MapPosition, type Query } from '../../../lib/filter';
import { inView, mapResults, paletteFeatures, projectFeatures, unplaced, type Bounds } from '../../../lib/map-data';
import type { IndexFacet, IndexRecord, LibraryIndex } from '../../../lib/types';
import type { OverlayMeta } from '../../../lib/overlays';
import type { MapViewProps } from './MapView';
import { webglAvailable } from '../lib/webgl';
import { url } from '../../../lib/site';
import { Card } from '../components/ui/PlantCard';
import { Icon } from '../components/ui/Icon';
import './library.css';

const types = TYPES;
const SORTS = sortOptions(types);

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

function buildSearch(index: LibraryIndex): MiniSearch<IndexRecord> {
  const fields = [...index.searchFields.boosted, ...index.searchFields.fields];
  const ms = new MiniSearch<IndexRecord>({
    idField: 'key',
    fields,
    extractField: (doc, field) => (field === 'key' ? doc.key : doc.search[field] ?? ''),
    searchOptions: {
      boost: Object.fromEntries(index.searchFields.boosted.map((f) => [f, 3])),
      prefix: true,
      fuzzy: 0.15,
      combineWith: 'AND',
    },
  });
  ms.addAll(index.records);
  return ms;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 plants, 2 projects" for a set of records. */
function countText(records: IndexRecord[], none = 'No entries'): string {
  const typeCounts = new Map<string, number>();
  for (const r of records) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  return [...typeCounts.entries()].map(([t, n]) => plural(n, (types[t]?.label ?? t).toLowerCase(), (types[t]?.plural ?? t).toLowerCase())).join(', ') || none;
}

type View = 'list' | 'map';

/** List and Map: links to the same query on the other view's page. */
function ViewSwitch({ view, query }: { view: View; query: Query }) {
  return (
    <nav class="view-switch" aria-label="View">
      {(['list', 'map'] as const).map((v) => (
        <a href={viewUrl(query, v)} aria-current={v === view ? 'page' : undefined}>
          {v === 'list' ? 'List' : 'Map'}
        </a>
      ))}
    </nav>
  );
}

function CardList({ records }: { records: IndexRecord[] }) {
  return (
    <ul role="list" class="card-grid">
      {records.map((r) => (
        <li key={r.key}>
          <Card record={r} />
        </li>
      ))}
    </ul>
  );
}

/** MapView, imported only on the map view, so the list view never loads the map component. */
function useMapView(enabled: boolean): ComponentType<MapViewProps> | undefined {
  const [C, setC] = useState<ComponentType<MapViewProps> | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    void import('./MapView').then((m) => setC(() => m.default));
  }, [enabled]);
  return C;
}

/**
 * The map view's results: the map, drawing the projects in the results and
 * those that list a plant in them, and a panel of the results in view that
 * follows the map. On narrow screens the panel is a sheet over the map.
 */
function MapResultsView({ index, query, results, onMove, onPick, onBox }: { index: LibraryIndex; query: Query; results: IndexRecord[]; onMove: (pos: MapPosition) => void; onPick: (overlay: OverlayMeta, id: string) => void; onBox: (box: Bounds | undefined) => void }) {
  const MapView = useMapView(true);
  const [bounds, setBounds] = useState<Bounds | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const opened = useRef(false);
  const [position] = useState(() => mapPosition(query));
  const drawn = useMemo(() => mapResults(results, index.records, query.filters, query.bbox), [results, index, query.filters, query.bbox]);
  const features = useMemo(() => projectFeatures(index.records, drawn), [index, drawn]);
  const palettes = useMemo(() => paletteFeatures(index.records, drawn), [index, drawn]);
  const visible = useMemo(() => (bounds ? inView(results, index.records, drawn, bounds) : []), [results, index, drawn, bounds]);
  const away = useMemo(() => unplaced(results, drawn), [results, drawn]);
  const single = drawn.nativeStates !== undefined ? results.find((r) => r.type === 'plant') : undefined;

  return (
    <div class="map-results-view">
      <div class="map-stage">
        {MapView ? (
          <MapView
            label="Map of the results"
            index={index}
            features={features}
            palettes={palettes}
            nativeStates={drawn.nativeStates}
            position={position}
            filters={query.filters}
            onPick={onPick}
            regionLabel={(o, id) => regionKeys(o.facets).map((k) => index.facets.find((f) => f.key === k)?.values.find((v) => v.id === id)?.label).find(Boolean)}
            box={query.bbox}
            onBox={onBox}
            onMove={(pos, b) => {
              setBounds(b);
              // The first report is the opening view; only a move the reader makes goes into the URL.
              if (opened.current) onMove(pos);
              opened.current = true;
            }}
          />
        ) : (
          <p class="library-message" aria-live="polite">
            Loading the map…
          </p>
        )}
        {single && drawn.nativeStates?.length === 0 && <p class="map-results-note">No native range is recorded for {single.name}.</p>}
      </div>
      <section class={sheetOpen ? 'map-results open' : 'map-results'} aria-labelledby="in-view-heading">
        <button type="button" class="sheet-toggle" aria-expanded={sheetOpen} aria-controls="in-view-list" onClick={() => setSheetOpen((o) => !o)}>
          {sheetOpen ? 'Hide results' : 'Show results'} in view ({visible.length})
        </button>
        <div id="in-view-list" class="map-results-body">
          <h2 id="in-view-heading" class="label">
            In view: {countText(visible, 'nothing')}
          </h2>
          {away.length > 0 && (
            <p class="map-results-note">
              {countText(away)} in the results {away.length === 1 ? 'has' : 'have'} no place on the map: a plant shows through the projects that list it.{' '}
              <a href={viewUrl(query, 'list')}>The list view</a> shows every result.
            </p>
          )}
          {results.length === 0 ? (
            <p class="map-results-note">Nothing matches. Remove a filter or change the search.</p>
          ) : visible.length > 0 ? (
            <CardList records={visible} />
          ) : (
            <p class="map-results-note">Nothing in the results is in view. Zoom out or move the map.</p>
          )}
        </div>
      </section>
    </div>
  );
}

interface FacetNode {
  facet?: IndexFacet;
  group?: { id: string; label: string; facets: IndexFacet[] };
}

/** Facets of one type in registry order, grouped as the registry groups them. */
function treeFor(facets: IndexFacet[], type: string): FacetNode[] {
  const out: FacetNode[] = [];
  const groups = new Map<string, FacetNode>();
  for (const f of facets.filter((x) => x.type === type)) {
    if (f.group) {
      let g = groups.get(f.group);
      if (!g) {
        g = { group: { id: f.group, label: f.groupLabel ?? f.group, facets: [] } };
        groups.set(f.group, g);
        out.push(g);
      }
      g.group!.facets.push(f);
    } else out.push({ facet: f });
  }
  return out;
}

function FacetValues({ facet, query, counts, onToggle }: { facet: IndexFacet; query: Query; counts: Record<string, number>; onToggle: (key: string, value: string) => void }) {
  const selected = query.filters[facet.key] ?? [];
  const active = selected.length > 0;
  // Open state is the reader's: seeded once from the query, never re-derived from it.
  const [initiallyOpen] = useState(active);
  return (
    <details class="facet" open={initiallyOpen}>
      <summary>
        {facet.label}
        {active && <span class="facet-active"> ({selected.length} selected)</span>}
      </summary>
      <ul role="list" class="facet-values">
        {facet.values.map((v) => {
          const checked = selected.includes(v.id);
          const n = counts[v.id] ?? 0;
          const id = `f-${facet.key}-${v.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
          return (
            <li class={n === 0 && !checked ? 'empty' : undefined}>
              <input type="checkbox" id={id} checked={checked} onChange={() => onToggle(facet.key, v.id)} />
              <label for={id}>
                {v.label} <span class="count">{n}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function FacetGroup({ group, query, counts, onToggle }: { group: NonNullable<FacetNode['group']>; query: Query; counts: Record<string, Record<string, number>>; onToggle: (k: string, v: string) => void }) {
  const [initiallyOpen] = useState(() => group.facets.some((f) => query.filters[f.key]?.length));
  return (
    <details class="facet-group" open={initiallyOpen}>
      <summary>{group.label}</summary>
      {group.facets.map((f) => (
        <FacetValues facet={f} query={query} counts={counts[f.key]} onToggle={onToggle} />
      ))}
    </details>
  );
}

/** The box filter's corners, for reading: "47.1°N 122.5°W to 47.8°N 121.9°W". */
function boxText([w, s, e, n]: [number, number, number, number]): string {
  const lat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'S' : 'N'}`;
  const lon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'W' : 'E'}`;
  return `${lat(s)} ${lon(w)} to ${lat(n)} ${lon(e)}`;
}

/** The box filter in the tree: what it holds, and a way to clear it. The map draws it; the list keeps it. */
function BoxFilter({ query, onClear }: { query: Query; onClear: () => void }) {
  if (!query.bbox) return null;
  return (
    <div class="facet box-filter">
      <p class="box-filter-title">Map area</p>
      <p class="box-filter-text">
        Projects inside the box drawn on the map, and plants used on them: {boxText(query.bbox)}.
      </p>
      <button type="button" class="link-button" onClick={onClear}>
        Clear the box
      </button>
    </div>
  );
}

function FilterTree({ index, query, counts, onToggle, onClearBox }: { index: LibraryIndex; query: Query; counts: Record<string, Record<string, number>>; onToggle: (k: string, v: string) => void; onClearBox: () => void }) {
  const typeFacet = index.facets.find((f) => f.key === 'type');
  const typeIds = typeFacet?.values.map((v) => v.id) ?? [];
  const tagFacets = index.facets.filter((f) => f.key.startsWith('tag.'));
  return (
    <div class="filter-tree">
      <BoxFilter query={query} onClear={onClearBox} />
      {typeFacet && typeIds.length > 1 && <FacetValues facet={typeFacet} query={query} counts={counts.type} onToggle={onToggle} />}
      {typeIds.map((t) => (
        <details class="facet-type" open>
          <summary>{types[t]?.plural ?? t}</summary>
          {treeFor(index.facets, t).map((n) =>
            n.facet ? (
              <FacetValues facet={n.facet} query={query} counts={counts[n.facet.key]} onToggle={onToggle} />
            ) : (
              <FacetGroup group={n.group!} query={query} counts={counts} onToggle={onToggle} />
            ),
          )}
        </details>
      ))}
      {tagFacets.length > 0 && (
        <details class="facet-type">
          <summary>Tags</summary>
          {tagFacets.map((f) => (
            <FacetValues facet={f} query={query} counts={counts[f.key]} onToggle={onToggle} />
          ))}
        </details>
      )}
    </div>
  );
}

function ActiveFilters({ index, query, onToggle, onClear, onClearBox }: { index: LibraryIndex; query: Query; onToggle: (k: string, v: string) => void; onClear: () => void; onClearBox: () => void }) {
  const multiType = (index.facets.find((x) => x.key === 'type')?.values.length ?? 0) > 1;
  const chips = Object.entries(query.filters).flatMap(([key, vals]) => {
    const f = index.facets.find((x) => x.key === key);
    // With several types, a type's facet names its type, since project filters also narrow plants (D39): "Project type: Streetscape".
    const typed = f && f.type !== '*' && multiType ? `${types[f.type]?.label ?? f.type} ${f.label.toLowerCase()}` : f?.label ?? key;
    return vals.map((v) => ({ key, v, text: `${typed}: ${f?.values.find((x) => x.id === v)?.label ?? v}` }));
  });
  if (!chips.length && !query.bbox) return null;
  return (
    <div class="active-filters">
      <ul role="list" aria-label="Active filters">
        {chips.map((c) => (
          <li>
            <button type="button" class="chip" onClick={() => onToggle(c.key, c.v)} aria-label={`Remove filter ${c.text}`}>
              {c.text} <Icon name="close" />
            </button>
          </li>
        ))}
        {query.bbox && (
          <li>
            <button type="button" class="chip" onClick={onClearBox} aria-label="Remove filter Map area: the box drawn on the map">
              Map area: box <Icon name="close" />
            </button>
          </li>
        )}
      </ul>
      <button type="button" class="link-button" onClick={onClear}>
        Clear all filters
      </button>
    </div>
  );
}

export default function Library({ view: page = 'list' }: { view?: View }) {
  const { index, error } = useIndex();
  // Without WebGL the map page is the list view, with a note.
  const [view] = useState<View>(() => (page === 'map' && !webglAvailable() ? 'list' : page));
  const [query, setQuery] = useState<Query>(() => parseQuery(typeof location === 'undefined' ? '' : location.search));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pushNext = useRef(false);

  useEffect(() => {
    const fallback = document.getElementById('library-fallback');
    if (fallback && index) fallback.hidden = true;
  }, [index]);

  useEffect(() => {
    const onPop = () => setQuery(parseQuery(location.search));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const next = `${location.pathname}${serializeQuery(query)}${location.hash}`;
    if (next === `${location.pathname}${location.search}${location.hash}`) return;
    if (pushNext.current) history.pushState(null, '', next);
    else history.replaceState(null, '', next);
    pushNext.current = false;
  }, [query]);

  const search = useMemo(() => (index ? buildSearch(index) : undefined), [index]);
  const hits = useMemo(() => {
    if (!search || !query.q.trim()) return null;
    return search.search(query.q.trim()).map((r) => String(r.id));
  }, [search, query.q]);

  // Moving the map changes only `extra`; results and counts don't depend on it.
  const results = useMemo(() => {
    if (!index) return [];
    const sortId = query.sort === 'relevance' && !hits ? 'name' : query.sort;
    return sortRecords(applyQuery(index.records, query, hits), sortId, SORTS, hits);
  }, [index, query.filters, query.bbox, query.sort, hits]);

  const counts = useMemo(() => (index ? facetCounts(index.records, index.facets, query, hits) : {}), [index, query.filters, query.bbox, hits]);

  const toggle = (key: string, value: string) => {
    pushNext.current = true;
    setQuery((q) => toggleValue(q, key, value));
  };
  const clear = () => {
    pushNext.current = true;
    setQuery((q) => clearFilters(q));
  };
  const setBox = (box: [number, number, number, number] | undefined) => {
    pushNext.current = true;
    setQuery((q) => withBbox(q, box));
  };
  // A region picked on the map is a filter value, as the tree sets it (lib/filter.ts pickRegion).
  const pick = (overlay: OverlayMeta, id: string) => {
    pushNext.current = true;
    setQuery((q) => pickRegion(q, overlay.facets, id, index?.facets ?? []));
  };

  if (error) return <p class="library-message">{error} The list below still shows every entry.</p>;
  if (!index) return <p class="library-message" aria-live="polite">Loading the library…</p>;

  const nFilters = Object.values(query.filters).reduce((a, v) => a + v.length, 0) + (query.bbox ? 1 : 0);

  return (
    <div class={view === 'map' ? 'library library-map' : 'library'}>
      {page === 'map' && view === 'list' && <p class="library-message">This browser can't draw the map (it needs WebGL), so the results are listed instead.</p>}
      <div class="library-search" role="search">
        <label for="library-q" class="label">
          Search
        </label>
        <div class="search-box">
          <Icon name="search" />
          <input
            id="library-q"
            type="search"
            value={query.q}
            placeholder="Botanical or common name, family…"
            autocomplete="off"
            onInput={(e) => setQuery((q) => ({ ...q, q: (e.target as HTMLInputElement).value }))}
          />
        </div>
      </div>
      <div class="library-body">
        <aside class={filtersOpen ? 'library-filters open' : 'library-filters'} aria-label="Filters">
          <button type="button" class="filters-toggle" aria-expanded={filtersOpen} aria-controls="filter-panel" onClick={() => setFiltersOpen((o) => !o)}>
            <Icon name="filter" /> Filters{nFilters ? ` (${nFilters})` : ''}
          </button>
          <div id="filter-panel" class="filter-panel">
            <h2 class="label filter-heading">Filters</h2>
            <FilterTree index={index} query={query} counts={counts} onToggle={toggle} onClearBox={() => setBox(undefined)} />
          </div>
        </aside>
        <section class="library-results" aria-labelledby="results-heading">
          <div class="results-head">
            <h2 id="results-heading" class="results-count" aria-live="polite">
              {countText(results)}
            </h2>
            <ViewSwitch view={page} query={query} />
            <label class="sort">
              <span class="label">Sort</span>
              <select
                value={query.sort}
                onChange={(e) => {
                  pushNext.current = true;
                  setQuery((q) => ({ ...q, sort: (e.target as HTMLSelectElement).value }));
                }}
              >
                {hits && <option value="relevance">Relevance</option>}
                {SORTS.map((s) => (
                  <option value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>
          <ActiveFilters index={index} query={query} onToggle={toggle} onClear={clear} onClearBox={() => setBox(undefined)} />
          {view === 'map' ? (
            // The map stays with no results, so a region or box picked on it can be unpicked there.
            <MapResultsView
              index={index}
              query={query}
              results={results}
              onMove={(pos) => setQuery((q) => withMapPosition(q, pos))}
              onPick={pick}
              onBox={setBox}
            />
          ) : results.length === 0 ? (
            <p class="library-message">Nothing matches. Remove a filter or change the search.</p>
          ) : (
            <CardList records={results} />
          )}
        </section>
      </div>
    </div>
  );
}
