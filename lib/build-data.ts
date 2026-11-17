/**
 * Everything the site and the index need, computed once from the content:
 * derived values, back-references, facets, and index records. Node only.
 */
import { loadLibrary, type Library } from './library';
import { derivePlant } from './derive';
import { nameSegments, fullName } from './names';
import { facetValues, flatFacets, getPath, indexFacets } from './facets';
import { plainText } from './markdown';
import { entryUrl, url } from './site';
import type { Entry, IndexRecord, LibraryIndex, PlantData, PlantDerived } from './types';

export interface BuiltEntry {
  key: string;
  file: string;
  entry: Entry;
  name: string;
  derived: Record<string, unknown>;
  refs: string[];
  refBy: string[];
}

export interface BuildData {
  library: Library;
  entries: BuiltEntry[];
  byKey: Map<string, BuiltEntry>;
  index: LibraryIndex;
}

function refsOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((c) => refsOf(c, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.ref === 'string' && Object.keys(o).length === 1) out.add(o.ref);
    else Object.values(o).forEach((c) => refsOf(c, out));
  } else if (typeof v === 'string') for (const m of v.matchAll(/\{ref:([a-z]+\/[a-z0-9-]+)\}/g)) out.add(m[1]);
  return out;
}

function tagArrays(tags: Entry['tags']): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(tags ?? {}).sort(([a], [b]) => a.localeCompare(b))) out[k] = Array.isArray(v) ? v : [v];
  return out;
}

function deriveFor(entry: Entry): { name: string; derived: Record<string, unknown> } {
  if (entry.type === 'plant') {
    const d = derivePlant(entry.data as unknown as PlantData);
    return { name: d.name, derived: d as unknown as Record<string, unknown> };
  }
  const name = entry.name ?? entry.id;
  return { name, derived: { name, sortName: name.toLowerCase() } };
}

function cardFor(b: BuiltEntry): Record<string, unknown> {
  if (b.entry.type === 'plant') {
    const d = b.entry.data as unknown as PlantData;
    const dv = b.derived as unknown as PlantDerived;
    return {
      commonName: d.commonNames[0],
      form: d.form,
      height: d.height,
      spread: d.spread,
      sun: d.sun,
      moisture: d.moisture,
      hardiness: d.hardiness,
      bloomMonths: dv.bloomMonthList,
      bloomColors: d.bloom?.colors,
      nativeStatus: dv.nativeStatus,
    };
  }
  return {};
}

function searchText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(searchText).join(' ');
  if (typeof v === 'object') return Object.entries(v).map(([k, c]) => `${k} ${searchText(c)}`).join(' ');
  return String(v);
}

let cache: BuildData | undefined;

/**
 * Build once per process. Pass `dataRoot` (tests do) to build from another
 * library folder; that result is not cached.
 */
export function buildData(opts: { dataRoot?: string } = {}): BuildData {
  if (cache && !opts.dataRoot) return cache;
  const library = opts.dataRoot ? loadLibrary(undefined, opts.dataRoot) : loadLibrary();
  const { config } = library;
  const entries: BuiltEntry[] = library.entries
    .map(({ file, entry }) => {
      const { name, derived } = deriveFor(entry);
      return { key: `${entry.type}/${entry.id}`, file, entry, name, derived, refs: [...refsOf(entry)].sort(), refBy: [] as string[] };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const e of entries) for (const r of e.refs) byKey.get(r)?.refBy.push(e.key);
  for (const e of entries) e.refBy.sort();

  const subjects = entries.map((b) => ({
    b,
    type: b.entry.type,
    tags: tagArrays(b.entry.tags),
    subject: { ...b.entry, name: b.name, derived: b.derived, description: b.entry.description ? plainText(b.entry.description) : undefined },
  }));
  const facets = indexFacets(config.types, config.vocab, subjects);
  const records: IndexRecord[] = subjects.map(({ b, type, tags, subject }) => {
    const def = config.types[type];
    const fv: Record<string, string[]> = {};
    for (const f of flatFacets(config.types, type)) {
      const vals = facetValues(f, subject);
      if (vals.length) fv[f.key] = vals;
    }
    const sort: Record<string, string | number | null> = { name: String(b.derived.sortName ?? b.name.toLowerCase()) };
    for (const s of def.sorts) {
      const v = getPath(subject, s.path);
      sort[s.id] = v === undefined || v === null ? null : typeof v === 'number' ? v : String(v).toLowerCase();
    }
    const search: Record<string, string> = {};
    for (const p of [...def.search.boosted, ...def.search.fields]) {
      const t = searchText(getPath({ ...subject, tags }, p));
      if (t) search[p] = t;
    }
    const rec: IndexRecord = {
      key: b.key,
      type,
      id: b.entry.id,
      name: type === 'plant' ? fullName(b.entry.data as unknown as PlantData) : b.name,
      summary: b.entry.summary,
      url: entryUrl(b.key),
      facets: fv,
      tags,
      refs: b.refs,
      refBy: b.refBy,
      sort,
      search,
      card: cardFor(b),
      createdAt: b.entry.meta.createdAt,
    };
    if (type === 'plant') rec.nameParts = nameSegments(b.entry.data as unknown as PlantData);
    const pinned = ((b.entry.data as { images?: { file: string; alt: string; pinned?: boolean }[] }).images ?? []).find((i) => i.pinned);
    if (pinned) rec.thumb = { src: url(pinned.file), alt: pinned.alt };
    return rec;
  });
  const searchFields = {
    boosted: [...new Set(Object.values(config.types).flatMap((t) => t.search.boosted))],
    fields: [...new Set(Object.values(config.types).flatMap((t) => t.search.fields))],
  };
  const result = { library, entries, byKey, index: { facets, records, searchFields } };
  if (!opts.dataRoot) cache = result;
  return result;
}
