/**
 * The compatibility panel's reading of a `compatibility` result
 * (lib/compat.ts): which columns each axis's grid shows, and the sentences
 * that name what is shared, what conflicts, and what doesn't fit the site, so
 * color is never the only signal (spec: library.md, Compatibility panel).
 * Pure and client-safe: the pages and the workspace share it.
 */
import { COMPAT_AXES, type CompatAxis, type CompatAxisResult, type CompatSite } from './compat';

export const AXIS_LABELS: Record<CompatAxis, string> = {
  sun: 'Sun',
  moisture: 'Moisture',
  drainage: 'Soil drainage',
  hardiness: 'Hardiness zone',
  waterUse: 'Water use',
};

/** The vocabulary list naming each axis's values; hardiness values are zone codes and name themselves. */
export const AXIS_VOCAB: Record<CompatAxis, string | undefined> = {
  sun: 'sun',
  moisture: 'moisture',
  drainage: 'soilDrainage',
  hardiness: undefined,
  waterUse: 'waterUse',
};

/** A value's label: `label(list, id)` from the vocabulary, or the id itself. */
export type ValueLabel = (axis: CompatAxis, value: string) => string;

/** The site's values on an axis, or undefined when it doesn't state any. */
export function siteValues(axis: CompatAxis, site?: CompatSite): string[] | undefined {
  if (!site) return undefined;
  return COMPAT_AXES.find((a) => a.axis === axis)!.site(site);
}

/**
 * The grid's columns: the axis's whole scale, except hardiness, whose 26 half
 * zones are trimmed to the span the plants and the site reach, so the grid
 * stays readable. Order is the scale's.
 */
export function gridColumns(r: CompatAxisResult, site?: CompatSite): string[] {
  if (r.axis !== 'hardiness') return r.values;
  const used = new Set([...r.plants.flatMap((p) => p.accepts ?? []), ...(siteValues(r.axis, site) ?? [])]);
  const idx = r.values.map((v, i) => (used.has(v) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  return r.values.slice(Math.min(...idx), Math.max(...idx) + 1);
}

/** "A", "A and B", "A, B, and C". */
export function andList(items: string[], joiner = 'and'): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${joiner} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${joiner} ${items.at(-1)}`;
}

/** Runs of consecutive values read as ranges ("6a to 9b"); other axes list their values. */
function valuesText(axis: CompatAxis, values: string[], scale: string[], label: ValueLabel, joiner = 'and'): string {
  if (axis !== 'hardiness') return andList(values.map((v) => label(axis, v).toLowerCase()), joiner);
  const runs: string[][] = [];
  for (const v of values) {
    const last = runs.at(-1);
    if (last && scale.indexOf(v) === scale.indexOf(last.at(-1)!) + 1) last.push(v);
    else runs.push([v]);
  }
  return andList(runs.map((r) => (r.length === 1 ? r[0] : `${r[0]} to ${r.at(-1)}`)), joiner);
}

/**
 * The sentences for one axis, in reading order: what is shared, or each way
 * to restore a shared value (ties named as alternatives); the plants with no
 * data; and, with a site, the plants that don't fit it.
 */
export function describeAxis(r: CompatAxisResult, nameOf: (key: string) => string, label: ValueLabel, site?: CompatSite): string[] {
  const axis = AXIS_LABELS[r.axis].toLowerCase();
  const values = (vs: string[], joiner?: string) => valuesText(r.axis, vs, r.values, label, joiner);
  const out: string[] = [];
  const known = r.plants.length - r.unknown.length;
  if (r.shared === null) {
    out.push(r.plants.length ? `No plant on the list has ${axis} data.` : 'No plant on the list is in the library.');
  } else if (r.shared.length) {
    out.push(known === 1 ? `Only one plant has ${axis} data: ${values(r.shared)}.` : `Every plant with ${axis} data shares ${values(r.shared)}.`);
  } else {
    const ways = r.conflicts.map((c) => {
      const who = andList(c.plants.map((p) => `${nameOf(p.key)} (${values(p.needs, 'or')})`));
      return `remove ${who}, and the rest share ${values(c.restores)}`;
    });
    const lead = `The plants share no ${axis} value.`;
    if (ways.length === 1) out.push(`${lead} To fix it, ${ways[0]}.`);
    else out.push(`${lead} Any one of these fixes it: ${ways.map((w, i) => `${i + 1}. ${w.charAt(0).toUpperCase()}${w.slice(1)}.`).join(' ')}`);
  }
  if (r.unknown.length && r.shared !== null) out.push(`No ${axis} data: ${andList(r.unknown.map(nameOf))}.`);
  if (r.siteFit) {
    const want = siteValues(r.axis, site);
    const failing = r.plants.filter((p) => r.siteFit![p.key] === 'fail').map((p) => nameOf(p.key));
    if (want && failing.length) out.push(`Not suited to the site's ${values(want)}: ${andList(failing)}.`);
    else if (want && known) out.push(`Every plant with ${axis} data suits the site's ${values(want)}.`);
  }
  return out;
}

/** The plants a conflict on this axis names, in any of its alternatives. */
export function conflictPlants(r: CompatAxisResult): Set<string> {
  return new Set(r.conflicts.flatMap((c) => c.plants.map((p) => p.key)));
}
