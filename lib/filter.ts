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
  /** The box-select filter, [west, south, east, north], held in the URL as `bbox`. */
  bbox?: Bounds;
  /** Parameters the list doesn't use (the map's center and zoom), kept as they are. */
  extra: Record<string, string>;
}

/** [west, south, east, north], in degrees. */
export type Bounds = [number, number, number, number];

/** `view` named the view before the map had its own page; it is dropped. */
const RESERVED = new Set(['q', 'sort', 'view', 'bbox']);

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
    else if (k === 'bbox') out.bbox = parseBbox(v);
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
  if (query.bbox) p.set('bbox', bboxText(query.bbox));
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

/** A `bbox` value, `west,south,east,north`, if it is a valid box: in range, with west < east and south < north. */
export function parseBbox(v: string): Bounds | undefined {
  const n = v.split(',').map((x) => (x.trim() === '' ? NaN : Number(x)));
  if (n.length !== 4 || !n.every(Number.isFinite)) return undefined;
  const [w, s, e, nn] = n;
  if (w < -180 || e > 180 || s < -90 || nn > 90 || w >= e || s >= nn) return undefined;
  return [w, s, e, nn];
}

/** A box as the URL holds it, rounded to about 10 m. */
function bboxText(b: Bounds): string {
  return b.map((x) => String(Number(x.toFixed(4)))).join(',');
}

/**
 * The query filtered to a box (the map's box-select tool), or with no box.
 * The corners may come in any order, as a drag gives them; the box is
 * rounded as the URL holds it, so the state is the same before and after a
 * reload.
 */
export function withBbox(query: Query, box: Bounds | undefined): Query {
  const next = { ...query };
  if (!box) {
    delete next.bbox;
    return next;
  }
  const [x1, y1, x2, y2] = box;
  const parsed = parseBbox(bboxText([Math.max(-180, Math.min(x1, x2)), Math.max(-90, Math.min(y1, y2)), Math.min(180, Math.max(x1, x2)), Math.min(90, Math.max(y1, y2))]));
  if (parsed) next.bbox = parsed;
  else delete next.bbox;
  return next;
}

/** Whether a point ([lon, lat]) is inside a box, edges included. */
export function inBox(loc: [number, number], [w, s, e, n]: Bounds): boolean {
  return loc[0] >= w && loc[0] <= e && loc[1] >= s && loc[1] <= n;
}

/** Whether a record's own location (a project's point, D40) is inside the box; false for a record with none. */
export function locatedIn(r: IndexRecord, box: Bounds): boolean {
  const loc = r.card.location as [number, number] | undefined;
  return Boolean(loc && inBox(loc, box));
}

/**
 * What picking a region on the map does: the facets a selectable overlay
 * sets (`facets` in config/overlays.json, by type) and the feature's id.
 * A region already selected under any of those facets is unpicked; otherwise
 * the first facet listed that offers the value is toggled, exactly as
 * checking that value in the tree. A region no facet offers (no entry is
 * there) leaves the query as it is.
 */
export function pickRegion(query: Query, overlayFacets: Record<string, string>, id: string, facets: IndexFacet[]): Query {
  const keys = regionKeys(overlayFacets);
  const on = keys.filter((k) => query.filters[k]?.includes(id));
  if (on.length) return on.reduce((q, k) => toggleValue(q, k, id), query);
  const key = regionFacet(overlayFacets, id, facets);
  return key ? toggleValue(query, key, id) : query;
}

/** The facet keys a selectable overlay sets, in its order: `{ project: 'county' }` → `project.county`. */
export function regionKeys(overlayFacets: Record<string, string>): string[] {
  return Object.entries(overlayFacets).map(([t, f]) => `${t}.${f}`);
}

/** The facet a pick of this region would set: the first of the overlay's facets that offers the value; none when none does. */
export function regionFacet(overlayFacets: Record<string, string>, id: string, facets: IndexFacet[]): string | undefined {
  return regionKeys(overlayFacets).find((k) => facets.find((f) => f.key === k)?.values.some((v) => v.id === id));
}

/** The regions of an overlay the query has selected, under any of its facets: what the map highlights. */
export function pickedRegions(query: Pick<Query, 'filters'>, overlayFacets: Record<string, string>): string[] {
  return [...new Set(regionKeys(overlayFacets).flatMap((k) => query.filters[k] ?? []))];
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

/** Clear every filter (the box too), or one facet's values. */
export function clearFilters(query: Query, key?: string): Query {
  if (!key) return withBbox({ ...query, filters: {} }, undefined);
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
export function matches(r: IndexRecord, filters: Record<string, string[]>, except?: string, byKey?: ReadonlyMap<string, IndexRecord>, box?: Bounds): boolean {
  const { own, cross } = split(r, filters, except, byKey);
  if (!meetsAll(r, own)) return false;
  for (const [t, list] of cross) if (!linked(r, t, byKey!).some((p) => meetsAll(p, list))) return false;
  if (box && !locatedIn(r, box)) {
    // A record with no place of its own (a plant) is in the box where an
    // entry it links to is, one that also meets that type's filters (D39).
    if (!byKey || !r.links) return false;
    const reached = Object.keys(r.links).some((t) => linked(r, t, byKey).some((p) => locatedIn(p, box) && meetsAll(p, cross.get(t) ?? [])));
    if (!reached) return false;
  }
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
  return pool.filter((r) => matches(r, query.filters, undefined, byKey, query.bbox));
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
        // The box is met through the same linked entries.
        const rest = Object.fromEntries(Object.entries(query.filters).filter(([k]) => keyType(k) !== t));
        if (!matches(r, rest, undefined, byKey)) continue;
        const others: Wanted = Object.entries(query.filters).filter(([k, w]) => keyType(k) === t && k !== f.key && w.length > 0);
        const box = query.bbox;
        const vals = new Set(linked(r, t, byKey).filter((p) => meetsAll(p, others) && (!box || locatedIn(p, box))).flatMap((p) => recordValues(p, f.key)));
        for (const v of vals) if (v in counts) counts[v]++;
        continue;
      }
      if (!matches(r, query.filters, f.key, byKey, query.bbox)) continue;
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
