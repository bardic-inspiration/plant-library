/**
 * The Library list view: one island that loads the index once and filters
 * in memory. Search, filters, and sort live in the query string.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import MiniSearch from 'minisearch';
import { TYPES } from '../../../lib/registry';
import { applyQuery, clearFilters, facetCounts, parseQuery, serializeQuery, sortOptions, sortRecords, toggleValue, type Query } from '../../../lib/filter';
import type { IndexFacet, IndexRecord, LibraryIndex } from '../../../lib/types';
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

function FilterTree({ index, query, counts, onToggle }: { index: LibraryIndex; query: Query; counts: Record<string, Record<string, number>>; onToggle: (k: string, v: string) => void }) {
  const typeFacet = index.facets.find((f) => f.key === 'type');
  const typeIds = typeFacet?.values.map((v) => v.id) ?? [];
  const tagFacets = index.facets.filter((f) => f.key.startsWith('tag.'));
  return (
    <div class="filter-tree">
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

function ActiveFilters({ index, query, onToggle, onClear }: { index: LibraryIndex; query: Query; onToggle: (k: string, v: string) => void; onClear: () => void }) {
  const multiType = (index.facets.find((x) => x.key === 'type')?.values.length ?? 0) > 1;
  const chips = Object.entries(query.filters).flatMap(([key, vals]) => {
    const f = index.facets.find((x) => x.key === key);
    // With several types, a type's facet names its type, since project filters also narrow plants (D39): "Project type: Streetscape".
    const typed = f && f.type !== '*' && multiType ? `${types[f.type]?.label ?? f.type} ${f.label.toLowerCase()}` : f?.label ?? key;
    return vals.map((v) => ({ key, v, text: `${typed}: ${f?.values.find((x) => x.id === v)?.label ?? v}` }));
  });
  if (!chips.length) return null;
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
      </ul>
      <button type="button" class="link-button" onClick={onClear}>
        Clear all filters
      </button>
    </div>
  );
}

export default function Library() {
  const { index, error } = useIndex();
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

  const results = useMemo(() => {
    if (!index) return [];
    const sortId = query.sort === 'relevance' && !hits ? 'name' : query.sort;
    return sortRecords(applyQuery(index.records, query, hits), sortId, SORTS, hits);
  }, [index, query, hits]);

  const counts = useMemo(() => (index ? facetCounts(index.records, index.facets, query, hits) : {}), [index, query, hits]);

  const toggle = (key: string, value: string) => {
    pushNext.current = true;
    setQuery((q) => toggleValue(q, key, value));
  };
  const clear = () => {
    pushNext.current = true;
    setQuery((q) => clearFilters(q));
  };

  if (error) return <p class="library-message">{error} The list below still shows every entry.</p>;
  if (!index) return <p class="library-message" aria-live="polite">Loading the library…</p>;

  const nFilters = Object.values(query.filters).reduce((a, v) => a + v.length, 0);
  const typeCounts = new Map<string, number>();
  for (const r of results) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  const countText =
    [...typeCounts.entries()].map(([t, n]) => plural(n, (types[t]?.label ?? t).toLowerCase(), (types[t]?.plural ?? t).toLowerCase())).join(', ') || 'No entries';

  return (
    <div class="library">
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
            <FilterTree index={index} query={query} counts={counts} onToggle={toggle} />
          </div>
        </aside>
        <section class="library-results" aria-labelledby="results-heading">
          <div class="results-head">
            <h2 id="results-heading" class="results-count" aria-live="polite">
              {countText}
            </h2>
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
          <ActiveFilters index={index} query={query} onToggle={toggle} onClear={clear} />
          {results.length === 0 ? (
            <p class="library-message">Nothing matches. Remove a filter or change the search.</p>
          ) : (
            <ul role="list" class="card-grid">
              {results.map((r) => (
                <li key={r.key}>
                  <Card record={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
