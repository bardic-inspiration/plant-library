/**
 * Facets: how an entry's fields become filter values. Every facet is defined
 * in config/types.json (P4); this file only knows the kinds.
 */
import { expandZones } from './zones';
import { monthsBetween } from './derive';
import type { FacetDef, FacetGroupDef, FacetLabels, IndexFacet, TypeRegistry, Vocab, VocabValue, Range } from './types';

/** A label for a value from a facet's `labels` source; undefined when it has none. */
export type Labeller = (source: FacetLabels, id: string) => string | undefined;

export function isGroup(f: FacetDef | FacetGroupDef): f is FacetGroupDef {
  return 'group' in f;
}

/** Every facet of a type, groups flattened, with its global key `<type>.<id>`. */
export function flatFacets(types: TypeRegistry, type: string): (FacetDef & { key: string; group?: string; groupLabel?: string })[] {
  const out: (FacetDef & { key: string; group?: string; groupLabel?: string })[] = [];
  for (const f of types[type].facets) {
    if (isGroup(f)) {
      for (const g of f.facets) out.push({ ...g, key: `${type}.${g.id}`, group: f.group, groupLabel: f.label });
    } else {
      out.push({ ...f, key: `${type}.${f.id}` });
    }
  }
  return out;
}

/** Read a dotted path; numeric parts index arrays. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function vocabList(vocab: Vocab, name: string | undefined): VocabValue[] | undefined {
  if (!name) return undefined;
  const list = vocab[name];
  if (!Array.isArray(list)) throw new Error(`Unknown vocabulary list: ${name}`);
  return list as VocabValue[];
}

function overlaps(r: Range, b: { min?: number; max?: number }): boolean {
  const lo = b.min ?? -Infinity;
  const hi = b.max ?? Infinity;
  // A range is in every bucket it shares more than an endpoint with, so a
  // 3–6 ft shrub is in "3 to 6" only. A single figure is in the half-open
  // bucket [min, max) that holds it.
  if (r.min === r.max) return r.min >= lo && r.min < hi;
  return r.min < hi && r.max > lo;
}

/** The facet values an entry has. `subject` is the entry with `derived` attached. */
export function facetValues(def: FacetDef, subject: unknown): string[] {
  const v = getPath(subject, def.path);
  if (v === undefined || v === null) return [];
  switch (def.kind) {
    case 'value':
      return (Array.isArray(v) ? v : [v]).map(String);
    case 'range': {
      // A single figure (a project's acreage) is a range of one value.
      const r = typeof v === 'number' ? { min: v, max: v } : (v as Range);
      return (def.buckets ?? []).filter((b) => overlaps(r, b)).map((b) => b.id);
    }
    case 'zones':
      return expandZones(v as { min: string; max: string });
    case 'months': {
      const m = v as { start: number; end: number };
      return monthsBetween(m.start, m.end).map(String);
    }
    case 'pairs':
      return Object.entries(v as Record<string, string>).map(([k, r]) => `${k}:${r}`);
  }
}

/** The values a facet offers, in display order, labelled. */
export function facetOptions(def: FacetDef, vocab: Vocab, present: Set<string>, labeller?: Labeller): { id: string; label: string }[] {
  if (def.kind === 'range') return (def.buckets ?? []).filter((b) => present.has(b.id)).map((b) => ({ id: b.id, label: b.label }));
  if (def.kind === 'pairs') {
    const keys = vocabList(vocab, def.keyVocab) ?? [];
    const vals = vocabList(vocab, def.vocab) ?? [];
    const out: { id: string; label: string }[] = [];
    for (const k of keys) for (const r of vals) {
      const id = `${k.id}:${r.id}`;
      if (present.has(id)) out.push({ id, label: `${k.id}: ${r.label}` });
    }
    return out;
  }
  const list = vocabList(vocab, def.vocab);
  if (list) return list.filter((x) => present.has(x.id)).map((x) => ({ id: x.id, label: x.label }));
  if (def.labels) {
    const src = def.labels;
    return [...present].map((id) => ({ id, label: labeller?.(src, id) ?? id })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }
  return [...present].sort((a, b) => a.localeCompare(b)).map((id) => ({ id, label: id }));
}

/** The client's facet list: every facet of every type, plus one per tag key. */
export function indexFacets(
  types: TypeRegistry,
  vocab: Vocab,
  subjects: { type: string; subject: unknown; tags: Record<string, string[]> }[],
  labeller?: Labeller,
): IndexFacet[] {
  const out: IndexFacet[] = [];
  const typeIds = Object.keys(types).filter((t) => subjects.some((s) => s.type === t));
  out.push({
    key: 'type',
    type: '*',
    label: 'Type',
    values: typeIds.map((t) => ({ id: t, label: types[t].plural })),
  });
  for (const t of typeIds) {
    const mine = subjects.filter((s) => s.type === t);
    for (const def of flatFacets(types, t)) {
      const present = new Set(mine.flatMap((s) => facetValues(def, s.subject)));
      if (present.size === 0) continue;
      out.push({ key: def.key, type: t, label: def.label, group: def.group, groupLabel: def.groupLabel, values: facetOptions(def, vocab, present, labeller) });
    }
  }
  const tagKeys = [...new Set(subjects.flatMap((s) => Object.keys(s.tags)))].sort();
  for (const k of tagKeys) {
    const present = [...new Set(subjects.flatMap((s) => s.tags[k] ?? []))].sort((a, b) => a.localeCompare(b));
    out.push({ key: `tag.${k}`, type: '*', label: k, group: 'tags', groupLabel: 'Tags', values: present.map((id) => ({ id, label: id })) });
  }
  return out;
}
