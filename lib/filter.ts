/**
 * The Library's query: search, filters, and sort, held in the URL so any
 * view can be bookmarked and the list (`/`) and the map (`/map/`) share it;
 * the page is the view. Pure functions over the index, used by the island
 * and the tests.
 */
import { url } from './site';
import type { IndexFacet, IndexRecord, TypeRegistry } from './types';

export interface Query {
  q: string;
  /** facet key → selected values. Values within a facet are OR; facets are AND. */
  filters: Record<string, string[]>;
  sort: string;
  /** Parameters the list doesn't use (the map's center, zoom, bbox), kept as they are. */
  extra: Record<string, string>;
}

/** `view` named the view before the map had its own page; it is dropped. */
const RESERVED = new Set(['q', 'sort', 'view']);

export const DEFAULT_SORT = 'name';

export function emptyQuery(): Query {
  return { q: '', filters: {}, sort: DEFAULT_SORT, extra: {} };
}

/** A filter key is a facet key: `type`, `<type>.<facet>`, or `tag.<key>`. */
export function isFilterKey(key: string): boolean {
  return key === 'type' || /^[a-z]+\.[A-Za-z0-9-]+$/.test(key);
}

export function parseQuery(search: string | URLSearchParams): Query {
  const p = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out = emptyQuery();
  for (const [k, v] of p) {
    if (k === 'q') out.q = v;
    else if (k === 'sort') out.sort = v || DEFAULT_SORT;
    else if (k === 'view') continue;
    else if (isFilterKey(k)) {
      if (!v) continue;
      const list = (out.filters[k] ??= []);
      if (!list.includes(v)) list.push(v);
    } else out.extra[k] = v;
  }
  return out;
}

/** The canonical query string: keys and values sorted, defaults omitted. */
export function serializeQuery(query: Query): string {
  const p = new URLSearchParams();
  if (query.q.trim()) p.set('q', query.q.trim());
  for (const k of Object.keys(query.filters).sort()) {
    for (const v of [...query.filters[k]].sort()) p.append(k, v);
  }
  if (query.sort && query.sort !== DEFAULT_SORT) p.set('sort', query.sort);
  for (const k of Object.keys(query.extra).sort()) if (!RESERVED.has(k)) p.set(k, query.extra[k]);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The Library filtered by these values: `libraryUrl({ 'project.county': ['53033'] })`. Detail pages link facet values this way. */
export function libraryUrl(filters: Record<string, string[]>): string {
  return url() + serializeQuery({ ...emptyQuery(), filters });
}

/** The map's center ([lon, lat]) and zoom, held in the URL as `center=lon,lat` and `zoom`. */
export interface MapPosition {
  center: [number, number];
  zoom: number;
}

/** The map position the query holds, if it holds a valid one. */
export function mapPosition(query: Query): MapPosition | undefined {
  const c = query.extra.center?.split(',').map(Number);
  const zoom = Number(query.extra.zoom);
  if (!c || c.length !== 2 || !c.every(Number.isFinite) || query.extra.zoom === undefined || !Number.isFinite(zoom)) return undefined;
  const [lon, lat] = c;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90 || zoom < 0 || zoom > 24) return undefined;
  return { center: [lon, lat], zoom };
}

/** The query with the map at this position, rounded to what a URL needs (about 10 m, a hundredth of a zoom level). */
export function withMapPosition(query: Query, pos: MapPosition): Query {
  const r = (n: number, d: number) => String(Number(n.toFixed(d)));
  return { ...query, extra: { ...query.extra, center: `${r(pos.center[0], 4)},${r(pos.center[1], 4)}`, zoom: r(pos.zoom, 2) } };
}

/** The same query on another view's page: `/` for the list, `/map/` for the map. The map position travels in the query string either way. */
export function viewUrl(query: Query, view: 'list' | 'map'): string {
  return url(view === 'map' ? 'map/' : '') + serializeQuery(query);
}

export function toggleValue(query: Query, key: string, value: string): Query {
  const cur = query.filters[key] ?? [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  const filters = { ...query.filters };
  if (next.length) filters[key] = next;
  else delete filters[key];
  return { ...query, filters };
}

export function clearFilters(query: Query, key?: string): Query {
  if (!key) return { ...query, filters: {} };
  const filters = { ...query.filters };
  delete filters[key];
  return { ...query, filters };
}

/** The values a record has for a facet key. */
export function recordValues(r: IndexRecord, key: string): string[] {
  if (key === 'type') return [r.type];
  if (key.startsWith('tag.')) return r.tags[key.slice(4)] ?? [];
  return r.facets[key] ?? [];
}

/** The type a filter key belongs to: `plant.form` → `plant`; none for `type` and tags. */
function keyType(key: string): string | undefined {
  if (key === 'type' || key.startsWith('tag.')) return undefined;
  const dot = key.indexOf('.');
  return dot > 0 ? key.slice(0, dot) : undefined;
}

type Wanted = [string, string[]][];

function meetsAll(r: IndexRecord, list: Wanted): boolean {
  // An entry missing a value never matches a filter on it.
  return list.every(([key, wanted]) => {
    const have = recordValues(r, key);
    return wanted.some((w) => have.includes(w));
  });
}

/** The entries of type `t` that `r` reaches that type's filters through (`crossFilters`, D39). */
function linked(r: IndexRecord, t: string, byKey: ReadonlyMap<string, IndexRecord>): IndexRecord[] {
  return (r.links?.[t] ?? []).flatMap((k) => byKey.get(k) ?? []);
}

/**
 * Split a record's filters into its own and, per linked type, the filters it
 * meets through the entries it links to (a plant meets project filters when
 * one project listing it meets all of them).
 */
function split(r: IndexRecord, filters: Record<string, string[]>, except: string | undefined, byKey: ReadonlyMap<string, IndexRecord> | undefined) {
  const own: Wanted = [];
  const cross = new Map<string, Wanted>();
  for (const [key, wanted] of Object.entries(filters)) {
    if (key === except || wanted.length === 0) continue;
    const t = keyType(key);
    if (byKey && t && t !== r.type && r.links?.[t]) {
      let list = cross.get(t);
      if (!list) cross.set(t, (list = []));
      list.push([key, wanted]);
    } else own.push([key, wanted]);
  }
  return { own, cross };
}

/**
 * Whether a record meets the filters. Pass `byKey` (every record by key) for
 * cross-type filters: without it a record must hold every filtered value itself.
 */
export function matches(r: IndexRecord, filters: Record<string, string[]>, except?: string, byKey?: ReadonlyMap<string, IndexRecord>): boolean {
  const { own, cross } = split(r, filters, except, byKey);
  if (!meetsAll(r, own)) return false;
  for (const [t, list] of cross) if (!linked(r, t, byKey!).some((p) => meetsAll(p, list))) return false;
  return true;
}

const keyMaps = new WeakMap<IndexRecord[], Map<string, IndexRecord>>();
function byKeyOf(records: IndexRecord[]): Map<string, IndexRecord> {
  let m = keyMaps.get(records);
  if (!m) keyMaps.set(records, (m = new Map(records.map((r) => [r.key, r]))));
  return m;
}

/**
 * Apply the query. `searchHits` is the set of keys the text search matched,
 * in rank order, or null when there is no search text. Cross-type filters
 * look linked entries up in all of `records`, whatever the search matched.
 */
export function applyQuery(records: IndexRecord[], query: Query, searchHits: string[] | null): IndexRecord[] {
  const byKey = byKeyOf(records);
  let pool = records;
  if (searchHits) {
    const set = new Set(searchHits);
    pool = pool.filter((r) => set.has(r.key));
  }
  return pool.filter((r) => matches(r, query.filters, undefined, byKey));
}

/**
 * Counts per facet value: how many results there would be with that value
 * checked, given every other facet's selection (so siblings in a facet keep
 * their counts as you tick them). A record reaching a facet's type through
 * linked entries counts once for each value one of those entries has while
 * meeting that type's other filters.
 */
export function facetCounts(
  records: IndexRecord[],
  facets: IndexFacet[],
  query: Query,
  searchHits: string[] | null,
): Record<string, Record<string, number>> {
  const byKey = byKeyOf(records);
  const set = searchHits ? new Set(searchHits) : null;
  const pool = set ? records.filter((r) => set.has(r.key)) : records;
  const out: Record<string, Record<string, number>> = {};
  for (const f of facets) {
    const counts: Record<string, number> = {};
    for (const v of f.values) counts[v.id] = 0;
    const t = keyType(f.key);
    for (const r of pool) {
      if (t && t !== r.type && r.links?.[t]) {
        // Every filter not on type t, then the linked entries that meet t's other filters.
        const rest = Object.fromEntries(Object.entries(query.filters).filter(([k]) => keyType(k) !== t));
        if (!matches(r, rest, undefined, byKey)) continue;
        const others: Wanted = Object.entries(query.filters).filter(([k, w]) => keyType(k) === t && k !== f.key && w.length > 0);
        const vals = new Set(linked(r, t, byKey).filter((p) => meetsAll(p, others)).flatMap((p) => recordValues(p, f.key)));
        for (const v of vals) if (v in counts) counts[v]++;
        continue;
      }
      if (!matches(r, query.filters, f.key, byKey)) continue;
      for (const v of recordValues(r, f.key)) if (v in counts) counts[v]++;
    }
    out[f.key] = counts;
  }
  return out;
}

export interface SortOption { id: string; label: string; descending?: boolean }

/** The sorts offered: every type's sorts, merged by id, in registry order. */
export function sortOptions(types: TypeRegistry): SortOption[] {
  const seen = new Map<string, SortOption>();
  for (const t of Object.values(types)) for (const s of t.sorts) if (!seen.has(s.id)) seen.set(s.id, { id: s.id, label: s.label, descending: s.descending });
  return [...seen.values()];
}

/** Sort a result list. Entries missing the sort value go last; ties fall back to name. */
export function sortRecords(records: IndexRecord[], sortId: string, options: SortOption[], searchHits: string[] | null): IndexRecord[] {
  const opt = options.find((o) => o.id === sortId);
  if (sortId === 'relevance' && searchHits) {
    const rank = new Map(searchHits.map((k, i) => [k, i]));
    return [...records].sort((a, b) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9));
  }
  const dir = opt?.descending ? -1 : 1;
  const key = opt ? sortId : DEFAULT_SORT;
  return [...records].sort((a, b) => {
    const av = a.sort[key];
    const bv = b.sort[key];
    const am = av === null || av === undefined;
    const bm = bv === null || bv === undefined;
    if (am !== bm) return am ? 1 : -1;
    if (!am && !bm && av !== bv) {
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      if (c !== 0) return c * dir;
    }
    return String(a.sort.name ?? a.name).localeCompare(String(b.sort.name ?? b.name));
  });
}
