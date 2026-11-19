/**
 * The palette workspace's list model: a named plant list with site
 * conditions, kept in the browser (spec: library.md, Palette workspace).
 * Pure functions, shared by the workspace island, the "add to list"
 * controls, the detail pages' "Open in workspace" links, and the tests.
 * Client-safe: no Node imports.
 *
 * A list's lines are plant list items exactly as a palette stores them, and
 * its site is a palette's `site`, so `compatibility` takes them as they are
 * and a list becomes a palette entry without translation.
 */
import vocabJson from '../config/vocab.json' with { type: 'json' };
import { compatibility, type Compatibility, type CompatSite } from './compat';
import { monthsBetween } from './derive';
import { expandZones, isZone } from './zones';
import { url } from './site';
import type { IndexRecord, PaletteSite, PlantData, PlantListItem, Vocab } from './types';

const defaultVocab = vocabJson as unknown as Vocab;

export interface WorkspaceList {
  /** Stable within the browser: names the list in local storage. */
  id: string;
  name: string;
  site: PaletteSite;
  lines: PlantListItem[];
  /** Show the lines grouped by form (display only; list order is kept). */
  grouped?: boolean;
}

export interface WorkspaceStore {
  /** The list being worked on, by id. */
  current: string;
  lists: WorkspaceList[];
}

/** The local storage key the workspace and the "add to list" controls share. */
export const STORE_KEY = 'plant-library:workspace';
/** The query parameter a share URL carries the list in. */
export const SHARE_PARAM = 'list';
/** The longest text a line or a name may hold, as the schema's `shortText`. */
const SHORT = 200;
/** A shared list longer than this is refused rather than stored. */
const MAX_LINES = 500;

const KEY = /^plant\/[a-z0-9]+(-[a-z0-9]+)*$/;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyList(name = 'My list', id = newId()): WorkspaceList {
  return { id, name, site: {}, lines: [] };
}

export function emptyStore(): WorkspaceStore {
  const list = emptyList();
  return { current: list.id, lists: [list] };
}

/** One line of text as the schema allows it: trimmed, no line breaks, at most 200 characters; empty is undefined. */
export function shortText(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\r\n]+/g, ' ').trim().slice(0, SHORT);
  return t || undefined;
}

function vocabIds(list: string, vocab: Vocab): Set<string> {
  return new Set(((vocab[list] as { id: string }[]) ?? []).map((v) => v.id));
}

function cleanValues(v: unknown, allowed: Set<string>): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.has(x)))];
  return out.length ? out : undefined;
}

/** A line read from storage or a share URL, kept only if it is a valid palette list item. */
export function cleanLine(raw: unknown): PlantListItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const p = r.plant;
  let plant: PlantListItem['plant'] | undefined;
  if (typeof p === 'string') plant = shortText(p);
  else if (p && typeof p === 'object' && typeof (p as { ref?: unknown }).ref === 'string' && KEY.test((p as { ref: string }).ref)) plant = { ref: (p as { ref: string }).ref };
  if (!plant) return undefined;
  const line: PlantListItem = { plant };
  const q = typeof r.quantity === 'number' ? r.quantity : typeof r.quantity === 'string' ? Number(r.quantity) : NaN;
  if (Number.isInteger(q) && q >= 1) line.quantity = q;
  for (const k of ['size', 'spacing', 'note'] as const) {
    const t = shortText(r[k]);
    if (t) line[k] = t;
  }
  return line;
}

/** Site conditions read from storage or a share URL: only vocabulary values, a valid zone, and a point. */
export function cleanSite(raw: unknown, vocab: Vocab = defaultVocab): PaletteSite {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const site: PaletteSite = {};
  const sun = cleanValues(r.sun, vocabIds('sun', vocab));
  if (sun) site.sun = sun;
  const moisture = cleanValues(r.moisture, vocabIds('moisture', vocab));
  if (moisture) site.moisture = moisture;
  const drainage = cleanValues((r.soil as { drainage?: unknown } | undefined)?.drainage, vocabIds('soilDrainage', vocab));
  if (drainage) site.soil = { drainage };
  if (typeof r.hardinessZone === 'string' && isZone(r.hardinessZone)) site.hardinessZone = r.hardinessZone;
  const loc = r.location as { lat?: unknown; lon?: unknown } | undefined;
  if (loc && typeof loc.lat === 'number' && typeof loc.lon === 'number' && Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180) site.location = roundPoint(loc.lat, loc.lon);
  return site;
}

/** A point at the 5 decimal places entries allow (about a meter). */
export function roundPoint(lat: number, lon: number): { lat: number; lon: number } {
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return { lat: r(lat), lon: r(lon) };
}

/** A list read from storage or a share URL; undefined when it isn't one. Unknown keys and invalid values are dropped. */
export function cleanList(raw: unknown, vocab: Vocab = defaultVocab): WorkspaceList | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.lines) || r.lines.length > MAX_LINES) return undefined;
  const list: WorkspaceList = {
    id: typeof r.id === 'string' && /^[a-z0-9]{1,16}$/.test(r.id) ? r.id : newId(),
    name: shortText(r.name) ?? 'Shared list',
    site: cleanSite(r.site, vocab),
    lines: r.lines.map(cleanLine).filter((l): l is PlantListItem => l !== undefined),
  };
  if (r.grouped === true) list.grouped = true;
  return list;
}

/** The store read from local storage; a fresh one when it is missing or unreadable. */
export function cleanStore(raw: unknown, vocab: Vocab = defaultVocab): WorkspaceStore {
  if (!raw || typeof raw !== 'object') return emptyStore();
  const r = raw as Record<string, unknown>;
  const lists = (Array.isArray(r.lists) ? r.lists : []).map((l) => cleanList(l, vocab)).filter((l): l is WorkspaceList => l !== undefined);
  const seen = new Set<string>();
  const unique = lists.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  if (!unique.length) return emptyStore();
  const current = typeof r.current === 'string' && unique.some((l) => l.id === r.current) ? r.current : unique[0].id;
  return { current, lists: unique };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** A list as share text: its name, site, lines, and grouping, as URL-safe base64 of JSON. The id stays behind. */
export function encodeList(list: Pick<WorkspaceList, 'name' | 'site' | 'lines' | 'grouped'>): string {
  const body: Record<string, unknown> = { name: list.name, site: list.site, lines: list.lines };
  if (list.grouped) body.grouped = true;
  return toBase64Url(JSON.stringify(body));
}

/** A list from share text; undefined when it can't be read. It gets a fresh id. */
export function decodeList(s: string, vocab: Vocab = defaultVocab): WorkspaceList | undefined {
  try {
    const list = cleanList(JSON.parse(fromBase64Url(s)), vocab);
    return list && { ...list, id: newId() };
  } catch {
    return undefined;
  }
}

/** The workspace URL (under the base path) that opens a copy of the list: `/workspace/?list=…`. */
export function shareUrl(list: Pick<WorkspaceList, 'name' | 'site' | 'lines' | 'grouped'>): string {
  return `${url('workspace/')}?${SHARE_PARAM}=${encodeList(list)}`;
}

/** The share text in a URL's query string, if any: `?list=…`. */
export function sharedFromSearch(search: string): string | undefined {
  return new URLSearchParams(search).get(SHARE_PARAM) ?? undefined;
}

const plantKey = (l: PlantListItem) => (typeof l.plant === 'string' ? undefined : l.plant.ref);

/** Whether a list refs a plant on any line. */
export function hasPlant(list: WorkspaceList, key: string): boolean {
  return list.lines.some((l) => plantKey(l) === key);
}

/** The list with a line for the plant added at the end; unchanged when the plant is already on it. */
export function addPlant(list: WorkspaceList, key: string): WorkspaceList {
  if (!KEY.test(key) || hasPlant(list, key)) return list;
  return { ...list, lines: [...list.lines, { plant: { ref: key } }] };
}

/** The list with a name the library doesn't hold added as plain text, unless a line already has it. */
export function addText(list: WorkspaceList, text: string): WorkspaceList {
  const t = shortText(text);
  if (!t) return list;
  const norm = t.toLowerCase();
  if (list.lines.some((l) => typeof l.plant === 'string' && l.plant.toLowerCase() === norm)) return list;
  return { ...list, lines: [...list.lines, { plant: t }] };
}

/** The list with another list's lines appended (a project's or palette's), each line kept as it is written. */
export function addLines(list: WorkspaceList, items: readonly unknown[]): WorkspaceList {
  const lines = items.map(cleanLine).filter((l): l is PlantListItem => l !== undefined);
  return lines.length ? { ...list, lines: [...list.lines, ...lines] } : list;
}

/** The list with line `i` moved by `delta` places (clamped to the list). */
export function moveLine(list: WorkspaceList, i: number, delta: number): WorkspaceList {
  const j = Math.max(0, Math.min(list.lines.length - 1, i + delta));
  if (i < 0 || i >= list.lines.length || i === j) return list;
  const lines = [...list.lines];
  const [line] = lines.splice(i, 1);
  lines.splice(j, 0, line);
  return { ...list, lines };
}

export function removeLine(list: WorkspaceList, i: number): WorkspaceList {
  return { ...list, lines: list.lines.filter((_, k) => k !== i) };
}

/** The list with line `i`'s quantity, size, spacing, or note set; an empty or invalid value clears it. */
export function updateLine(list: WorkspaceList, i: number, field: 'quantity' | 'size' | 'spacing' | 'note', value: string): WorkspaceList {
  const line = list.lines[i];
  if (!line) return list;
  const next = cleanLine({ ...line, [field]: value }) ?? line;
  if (field === 'quantity' && next.quantity === undefined) delete next.quantity;
  return { ...list, lines: list.lines.map((l, k) => (k === i ? next : l)) };
}

/** A palette `site` as `compatibility` takes it; undefined when it states no condition (a location alone states none). */
export function compatSite(site: PaletteSite): CompatSite | undefined {
  const { sun, moisture, soil, hardinessZone } = site;
  if (!sun && !moisture && !soil && !hardinessZone) return undefined;
  return { sun, moisture, soil, hardinessZone };
}

/** The list's compatibility over the plants loaded so far, with the site's fit. */
export function listCompatibility(list: WorkspaceList, plants: ReadonlyMap<string, PlantData>): Compatibility {
  return compatibility(list.lines, plants, compatSite(list.site));
}

export interface ListSummary {
  /** Distinct plants the library holds. */
  taxa: number;
  /** Distinct names the library doesn't hold (or whose entry hasn't loaded). */
  unsourced: number;
  /** Lines with no quantity. */
  unquantified: number;
  /** Total quantity, a line with no quantity counting as one. */
  quantity: number;
  /** Share of the quantity, over plants with a known native range, native to `state`; absent without a state or a known range. */
  nativeShare?: number;
  /** Quantity by form; unsourced lines under `unknown`. */
  byForm: Record<string, number>;
  /** Quantity by life cycle; plants that record none, and unsourced lines, under `unknown`. */
  byLifeCycle: Record<string, number>;
  /** Per month (index 0 is January), the distinct plants in bloom, by key. */
  bloom: string[][];
  /** Months (1–12) no plant with bloom data blooms in; empty when none has bloom data. */
  bloomGaps: number[];
  /** Plants with no bloom months recorded. */
  noBloom: string[];
}

/**
 * The feedback figures for a list. A line with no quantity counts as one
 * plant in the total, the native share, and the mixes, so a list being
 * sketched without quantities still reads sensibly; the count of such lines
 * is reported beside it (D56). Unsourced lines are unknown, as on a project
 * (D36).
 */
export function listSummary(items: readonly PlantListItem[], plants: ReadonlyMap<string, PlantData>, state?: string): ListSummary {
  const taxa = new Set<string>();
  const unsourced = new Set<string>();
  const byForm: Record<string, number> = {};
  const byLifeCycle: Record<string, number> = {};
  const add = (rec: Record<string, number>, k: string, q: number) => (rec[k] = (rec[k] ?? 0) + q);
  let quantity = 0;
  let unquantified = 0;
  let known = 0;
  let native = 0;
  for (const item of items) {
    if (item.quantity === undefined) unquantified++;
    const q = item.quantity ?? 1;
    quantity += q;
    const key = plantKey(item);
    const plant = key ? plants.get(key) : undefined;
    if (!key || !plant) {
      unsourced.add(typeof item.plant === 'string' ? item.plant.trim().toLowerCase() : String(key));
      add(byForm, 'unknown', q);
      add(byLifeCycle, 'unknown', q);
      continue;
    }
    taxa.add(key);
    add(byForm, plant.form, q);
    add(byLifeCycle, plant.lifeCycle ?? 'unknown', q);
    if (plant.nativeRange) {
      known += q;
      if (state && plant.nativeRange.states.includes(state)) native += q;
    }
  }
  const bloom: string[][] = Array.from({ length: 12 }, () => []);
  const noBloom: string[] = [];
  for (const key of taxa) {
    const m = plants.get(key)!.bloom?.months;
    if (!m) {
      noBloom.push(key);
      continue;
    }
    for (const month of monthsBetween(m.start, m.end)) bloom[month - 1].push(key);
  }
  const anyBloom = bloom.some((b) => b.length);
  const out: ListSummary = {
    taxa: taxa.size,
    unsourced: unsourced.size,
    unquantified,
    quantity,
    byForm,
    byLifeCycle,
    bloom,
    bloomGaps: anyBloom ? bloom.flatMap((b, i) => (b.length ? [] : [i + 1])) : [],
    noBloom,
  };
  if (state && known > 0) out.nativeShare = native / known;
  return out;
}

/**
 * "Plants that fit": Library filters for plants that keep the list's shared
 * conditions and suit the site. On each axis the site's values are used
 * where it states them, else the values the list's plants share; values in
 * a facet combine as OR, so a plant accepting any one shared value keeps
 * that value shared. An axis with neither gives no filter. Water use has no
 * facet value to share and no site value, so it isn't used.
 */
export function fitFilters(compat: Compatibility, site: PaletteSite): Record<string, string[]> {
  const shared = (axis: string) => compat.axes.find((a) => a.axis === axis)?.shared ?? undefined;
  const pick = (siteValues: string[] | undefined, axis: string) => (siteValues?.length ? siteValues : shared(axis)?.length ? shared(axis) : undefined);
  const filters: Record<string, string[]> = { type: ['plant'] };
  const sun = pick(site.sun, 'sun');
  if (sun) filters['plant.sun'] = sun;
  const moisture = pick(site.moisture, 'moisture');
  if (moisture) filters['plant.moisture'] = moisture;
  const drainage = pick(site.soil?.drainage, 'drainage');
  if (drainage) filters['plant.drainage'] = drainage;
  const zones = pick(site.hardinessZone ? expandZones({ min: site.hardinessZone, max: site.hardinessZone }) : undefined, 'hardiness');
  if (zones) filters['plant.hardiness'] = zones;
  return filters;
}

/**
 * How often each plant is planted with the list's plants: for every plant
 * the list doesn't hold, the shared projects summed over the list's plants'
 * companions (`IndexRecord.companions`, minimum two each).
 */
export function companionScores(list: WorkspaceList, byKey: ReadonlyMap<string, Pick<IndexRecord, 'companions'>>): Map<string, number> {
  const scores = new Map<string, number>();
  const chosen = new Set(list.lines.map((l) => (typeof l.plant === 'string' ? undefined : l.plant.ref)).filter((k): k is string => Boolean(k)));
  for (const k of chosen) {
    for (const c of byKey.get(k)?.companions ?? []) {
      if (chosen.has(c.plant)) continue;
      scores.set(c.plant, (scores.get(c.plant) ?? 0) + c.projects);
    }
  }
  return scores;
}

/**
 * "Plants that fit" with the companions of the list's plants first, most
 * shared projects first, the rest in their given order.
 */
export function companionsFirst<T extends { key: string }>(records: readonly T[], scores: ReadonlyMap<string, number>): T[] {
  const at = new Map(records.map((r, i) => [r.key, i]));
  return [...records].sort((a, b) => (scores.get(b.key) ?? 0) - (scores.get(a.key) ?? 0) || at.get(a.key)! - at.get(b.key)!);
}
