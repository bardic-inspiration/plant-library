/**
 * The Library's query: search, filters, sort, and view, held in the URL so
 * any view can be bookmarked and the list and map share it. Pure functions
 * over the index, used by the island and the tests.
 */
import type { IndexFacet, IndexRecord, TypeRegistry } from './types';

export interface Query {
  q: string;
  /** facet key → selected values. Values within a facet are OR; facets are AND. */
  filters: Record<string, string[]>;
  sort: string;
  view: 'list' | 'map';
  /** Parameters the list doesn't use (the map's center, zoom, bbox), kept as they are. */
  extra: Record<string, string>;
}

const RESERVED = new Set(['q', 'sort', 'view']);

export const DEFAULT_SORT = 'name';

export function emptyQuery(): Query {
  return { q: '', filters: {}, sort: DEFAULT_SORT, view: 'list', extra: {} };
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
    else if (k === 'view') out.view = v === 'map' ? 'map' : 'list';
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
  if (query.view !== 'list') p.set('view', query.view);
  for (const k of Object.keys(query.extra).sort()) if (!RESERVED.has(k)) p.set(k, query.extra[k]);
  const s = p.toString();
  return s ? `?${s}` : '';
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

export function matches(r: IndexRecord, filters: Record<string, string[]>, except?: string): boolean {
  for (const [key, wanted] of Object.entries(filters)) {
    if (key === except || wanted.length === 0) continue;
    const have = recordValues(r, key);
    // An entry missing a value never matches a filter on it.
    if (!wanted.some((w) => have.includes(w))) return false;
  }
  return true;
}

/**
 * Apply the query. `searchHits` is the set of keys the text search matched,
 * in rank order, or null when there is no search text.
 */
export function applyQuery(records: IndexRecord[], query: Query, searchHits: string[] | null): IndexRecord[] {
  let pool = records;
  if (searchHits) {
    const set = new Set(searchHits);
    pool = pool.filter((r) => set.has(r.key));
  }
  return pool.filter((r) => matches(r, query.filters));
}

/**
 * Counts per facet value: how many results there would be with that value
 * checked, given every other facet's selection (so siblings in a facet keep
 * their counts as you tick them).
 */
export function facetCounts(
  records: IndexRecord[],
  facets: IndexFacet[],
  query: Query,
  searchHits: string[] | null,
): Record<string, Record<string, number>> {
  const set = searchHits ? new Set(searchHits) : null;
  const pool = set ? records.filter((r) => set.has(r.key)) : records;
  const out: Record<string, Record<string, number>> = {};
  for (const f of facets) {
    const counts: Record<string, number> = {};
    for (const v of f.values) counts[v.id] = 0;
    for (const r of pool) {
      if (!matches(r, query.filters, f.key)) continue;
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
