/**
 * Exports of a plant list (spec: library.md, Exports): the CSV plant
 * schedule, read back as well as written, and a workspace list as a palette
 * entry. Pure functions, shared by the build (each project's and palette's
 * schedule file), the workspace, and the tests. Client-safe: no Node
 * imports.
 */
import site from '../config/site.json' with { type: 'json' };
import { botanicalName, fullName, normalizeName, slugify, type NameSegment } from './names';
import { cleanLine, encodeList, SHARE_PARAM, type WorkspaceList } from './workspace';
import { url } from './site';
import type { IndexRecord, NameParts, PaletteSite, PlantListItem } from './types';

/** The schedule's columns, in order, as the CSV header names them. */
export const CSV_COLUMNS = ['Botanical name', 'Common name', 'Quantity', 'Size', 'Spacing', 'Note'] as const;

export interface ScheduleRow {
  botanicalName: string;
  commonName?: string;
  quantity?: number;
  size?: string;
  spacing?: string;
  note?: string;
}

/** What a schedule needs of a plant the library holds. */
export interface SchedulePlant {
  botanicalName: string;
  commonName?: string;
}

/** A plant entry's data as a schedule names it: the botanical name without a trade name, and the first common name. */
export function schedulePlant(p: NameParts & { commonNames?: string[] }): SchedulePlant {
  return { botanicalName: botanicalName(p), commonName: p.commonNames?.[0] };
}

/** An index record's plant as a schedule names it, from its name parts (a trade name is dropped). */
export function recordPlant(r: Pick<IndexRecord, 'name' | 'nameParts' | 'card'>): SchedulePlant {
  const parts = r.nameParts as NameSegment[] | undefined;
  const name = parts ? parts.filter(([, s]) => s !== 't').map(([t]) => t.replace(/[‘’]/g, "'")).join(' ') : r.name;
  const common = r.card?.commonName;
  return { botanicalName: name, commonName: typeof common === 'string' ? common : undefined };
}

/**
 * A plant list's lines as schedule rows, in list order. A line whose plant
 * the library holds takes its botanical and common names from `plant`; an
 * unsourced line is its text, with no common name. A ref `plant` can't
 * resolve is written as the ref.
 */
export function scheduleRows(items: readonly PlantListItem[], plant: (key: string) => SchedulePlant | undefined): ScheduleRow[] {
  return items.map((item) => {
    const named = typeof item.plant === 'string' ? { botanicalName: item.plant } : plant(item.plant.ref) ?? { botanicalName: item.plant.ref };
    const row: ScheduleRow = { botanicalName: named.botanicalName };
    if (named.commonName) row.commonName = named.commonName;
    if (item.quantity !== undefined) row.quantity = item.quantity;
    for (const k of ['size', 'spacing', 'note'] as const) if (item[k]) row[k] = item[k];
    return row;
  });
}

/**
 * A cell as CSV writes it. Text a spreadsheet would run as a formula (it
 * starts with =, +, -, @, a tab, or a return) gets a leading apostrophe,
 * which `parseCsv`'s reader takes off again; a cell with a comma, quote, or
 * line break is quoted.
 */
function cell(v: string | number | undefined): string {
  if (v === undefined) return '';
  let t = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Rows as a CSV plant schedule: a header, then one line per row, CRLF line ends (RFC 4180). */
export function scheduleCsv(rows: readonly ScheduleRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) lines.push([r.botanicalName, r.commonName, r.quantity, r.size, r.spacing, r.note].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** The per-region view's CSV columns, in order. */
export const REGION_CSV_COLUMNS = ['Rank', 'Botanical name', 'Common name', 'Form', 'Projects', 'Quantity'] as const;

/** A line of the per-region view's table, as the CSV writes it. */
export interface RegionCsvRow {
  botanicalName: string;
  commonName?: string;
  form?: string;
  projects: number;
  quantity: number;
}

/**
 * What gets planted in the selected regions as CSV: the ranked plant table,
 * one line per plant in its order, each with the projects behind it (its
 * sample size) and its quantity; CRLF line ends, as the schedule's.
 */
export function regionCsv(rows: readonly RegionCsvRow[]): string {
  const lines = [REGION_CSV_COLUMNS.join(',')];
  rows.forEach((r, i) => lines.push([i + 1, r.botanicalName, r.commonName, r.form, r.projects, r.quantity].map(cell).join(',')));
  return lines.join('\r\n') + '\r\n';
}

/** CSV text as rows of cells (RFC 4180: quoted cells may hold commas, quotes, and line breaks). Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endRow = () => {
    row.push(cur);
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
    cur = '';
  };
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur === '') quoted = true;
    else if (c === ',') row.push(cur), (cur = '');
    else if (c === '\r' && text[i + 1] === '\n') endRow(), i++;
    else if (c === '\n' || c === '\r') endRow();
    else cur += c;
  }
  if (cur !== '' || row.length) endRow();
  return rows;
}

/** A cell as read back: the apostrophe `scheduleCsv` puts before formula-like text is taken off. */
function uncell(t: string | undefined): string {
  const s = (t ?? '').trim();
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

/**
 * Plant names to the plants that hold them, normalized as validation
 * compares them (`normalizeName`): each plant's botanical name and its name
 * with the trade name. Built from the index's plant records in the browser,
 * or from plant entries at build.
 */
export type NameIndex = ReadonlyMap<string, string>;

export function nameIndex(plants: Iterable<{ key: string; botanicalName: string; fullName?: string }>): NameIndex {
  const out = new Map<string, string>();
  for (const p of plants) {
    out.set(normalizeName(p.botanicalName), p.key);
    if (p.fullName) out.set(normalizeName(p.fullName), p.key);
  }
  return out;
}

/** The name index of the plant records in the Library's index. */
export function recordNameIndex(records: readonly IndexRecord[]): NameIndex {
  return nameIndex(records.filter((r) => r.type === 'plant').map((r) => ({ key: r.key, botanicalName: recordPlant(r).botanicalName, fullName: r.name })));
}

/** The name index of plant entries' data, by key. */
export function plantNameIndex(plants: Iterable<[string, NameParts]>): NameIndex {
  return nameIndex([...plants].map(([key, p]) => ({ key, botanicalName: botanicalName(p), fullName: fullName(p) })));
}

/** A line with plain text the library holds as a plant turned into a ref to it, as validation requires. */
export function resolveLine(line: PlantListItem, names: NameIndex): PlantListItem {
  if (typeof line.plant !== 'string') return line;
  const key = names.get(normalizeName(line.plant));
  return key ? { ...line, plant: { ref: key } } : line;
}

export interface CsvImport {
  lines: PlantListItem[];
  /** Data rows with no botanical name, left out. */
  skipped: number;
  /** Why nothing could be read; absent when the file is a schedule. */
  error?: string;
}

/**
 * A CSV plant schedule read back as list lines. The header row names the
 * columns, in any order and case; only "Botanical name" is required. A name
 * the library holds becomes a ref to it, any other name stays text; a
 * quantity that isn't a whole number of at least one is dropped, and text
 * is cut to what a palette allows.
 */
export function linesFromCsv(text: string, names: NameIndex): CsvImport {
  const rows = parseCsv(text);
  if (!rows.length) return { lines: [], skipped: 0, error: 'The file is empty.' };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const at = { name: col('Botanical name'), quantity: col('Quantity'), size: col('Size'), spacing: col('Spacing'), note: col('Note') };
  if (at.name < 0) return { lines: [], skipped: 0, error: 'The file has no "Botanical name" column, so it isn\'t a plant schedule.' };
  const lines: PlantListItem[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (i: number) => (i < 0 ? undefined : uncell(r[i]) || undefined);
    const line = cleanLine({ plant: get(at.name), quantity: get(at.quantity), size: get(at.size), spacing: get(at.spacing), note: get(at.note) });
    if (line) lines.push(resolveLine(line, names));
    else skipped++;
  }
  return { lines, skipped };
}

/** What a list to export as a palette holds. */
export interface PaletteSource {
  name: string;
  site: PaletteSite;
  lines: readonly PlantListItem[];
}

/** A palette entry's envelope with its data, as `content/palette/<id>.json` stores it. */
export interface PaletteEntryFile {
  type: 'palette';
  id: string;
  name: string;
  summary: string;
  data: { site?: PaletteSite; plantList: PlantListItem[] };
  meta: { createdAt: string; revisedAt: string; method: 'manual'; fixture?: true };
}

/**
 * A workspace list as a palette entry that passes validation: its id is the
 * slug of its name, text the library holds as a plant becomes a ref, an
 * empty site is left out, and it is dated `date` (YYYY-MM-DD). With the
 * site's `fixturesOnly` on, as in this prototype, it is marked a fixture
 * (docs/workflow.md). The summary is a placeholder to rewrite before the
 * file is submitted.
 */
export function paletteEntry(list: PaletteSource, date: string, names: NameIndex, fixturesOnly: boolean = site.fixturesOnly): PaletteEntryFile {
  const name = list.name.trim() || 'Untitled palette';
  const n = list.lines.length;
  const data: PaletteEntryFile['data'] = { plantList: list.lines.map((l) => resolveLine(l, names)) };
  if (Object.keys(list.site).length) data.site = list.site;
  const entry: PaletteEntryFile = {
    type: 'palette',
    id: slugify(name).slice(0, 120).replace(/-+$/, '') || 'palette',
    name,
    summary: `A plant list of ${n} ${n === 1 ? 'line' : 'lines'} made in the workspace.`,
    data: data.site ? { site: data.site, plantList: data.plantList } : data,
    meta: { createdAt: date, revisedAt: date, method: 'manual' },
  };
  if (fixturesOnly) entry.meta.fixture = true;
  return entry;
}

/**
 * Why a list's palette file would fail validation, as sentences for the
 * workspace to show beside the download: the same plant twice at the same
 * size (no size counts as one size), and a site location outside the three
 * states (`outside`, which the workspace knows from its state lookup).
 */
export function paletteProblems(list: PaletteSource, names: NameIndex, label: (line: PlantListItem) => string, outside = false): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  list.lines.forEach((raw, i) => {
    const line = resolveLine(raw, names);
    const plant = typeof line.plant === 'string' ? `text:${normalizeName(line.plant)}` : line.plant.ref;
    const k = `${plant}\u0000${normalizeName(line.size ?? '')}`;
    const prev = seen.get(k);
    if (prev === undefined) seen.set(k, i);
    else out.push(`Lines ${prev + 1} and ${i + 1} are both ${label(line)}${line.size ? ` at ${line.size}` : ' with no size'}; a palette lists a plant once per size.`);
  });
  if (outside && list.site.location) out.push('The site location is outside Washington, Oregon, and California; a palette’s location must be inside them.');
  return out;
}

/** A file name for a download of the list: its name as a slug, with the extension. */
export function fileName(name: string, ext: string): string {
  return `${slugify(name).slice(0, 80).replace(/-+$/, '') || 'plant-list'}.${ext}`;
}

/** Today in local time as YYYY-MM-DD, the date format entries use. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The print view's query parameters: `sheets` asks for cut sheets, `plants` names plants by key. */
export const PRINT_SHEETS = 'sheets';
export const PRINT_PLANTS = 'plants';

/** The print view of a list: its schedule, or with `sheets` the cut sheets of the plants on it. */
export function printListUrl(list: Pick<WorkspaceList, 'name' | 'site' | 'lines' | 'grouped'>, sheets = false): string {
  return `${url('print/')}?${sheets ? `${PRINT_SHEETS}=1&` : ''}${SHARE_PARAM}=${encodeList(list)}`;
}

/** The print view of the cut sheets of these plants, by key. */
export function printPlantsUrl(keys: readonly string[]): string {
  return `${url('print/')}?${new URLSearchParams({ [PRINT_PLANTS]: keys.join(',') })}`;
}

/** The print view of the cut sheets of the Library's results: its query string (`?…` or empty) with `sheets` added. */
export function printResultsUrl(search: string): string {
  const q = search.replace(/^\?/, '');
  return `${url('print/')}?${PRINT_SHEETS}=1${q ? `&${q}` : ''}`;
}
