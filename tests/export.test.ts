import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import {
  linesFromCsv,
  paletteEntry,
  paletteProblems,
  parseCsv,
  plantNameIndex,
  printListUrl,
  printPlantsUrl,
  printResultsUrl,
  recordNameIndex,
  recordPlant,
  regionCsv,
  REGION_CSV_COLUMNS,
  scheduleCsv,
  schedulePlant,
  scheduleRows,
  fileName,
} from '../lib/export';
import { cutSheet, MAX_SHEETS } from '../lib/cutsheet';
import { addText, cleanStore, decodeList, emptyList, sharedFromSearch, shareUrl, updateLine, type WorkspaceList } from '../lib/workspace';
import type { PaletteData, PlantData, PlantListItem } from '../lib/types';
import { FIXTURES, messages, validateWith } from './helpers';

const data = buildData({ dataRoot: FIXTURES });
const plantEntries = data.entries.filter((e) => e.entry.type === 'plant');
const plants = new Map(plantEntries.map((e) => [e.key, e.entry.data as unknown as PlantData]));
const names = plantNameIndex(plants);
const plant = (k: string) => (plants.has(k) ? schedulePlant(plants.get(k)!) : undefined);
const records = new Map(data.index.records.map((r) => [r.key, r]));

function fromPalette(id: string): WorkspaceList {
  const d = data.byKey.get(`palette/${id}`)!.entry.data as unknown as PaletteData;
  return { ...emptyList(data.byKey.get(`palette/${id}`)!.name, 'abc123'), site: d.site ?? {}, lines: d.plantList };
}

/** Validate the fixture library with one more palette entry. */
function validatePalette(entry: object) {
  return validateWith((es) => {
    es.push({ file: `content/palette/${(entry as { id: string }).id}.json`, entry: entry as never });
  });
}

describe('the CSV plant schedule', () => {
  it('writes a header and one row per line, in list order, with unsourced names as written', () => {
    const lines: PlantListItem[] = [
      { plant: { ref: 'plant/rosa-radrazz' }, quantity: 12, size: '#2 container', spacing: '3 ft o.c.' },
      { plant: 'Festuca roemeri', quantity: 400, note: 'Plugs, "seed-grown"' },
    ];
    const csv = scheduleCsv(scheduleRows(lines, plant));
    expect(csv.split('\r\n')).toEqual([
      'Botanical name,Common name,Quantity,Size,Spacing,Note',
      "Rosa 'Radrazz',Knock Out rose,12,#2 container,3 ft o.c.,",
      'Festuca roemeri,,400,,,"Plugs, ""seed-grown"""',
      '',
    ]);
  });

  it('round-trips every fixture palette and project list: refs come back as refs, text as text', () => {
    for (const b of data.entries.filter((e) => e.entry.type === 'palette' || e.entry.type === 'project')) {
      const list = (b.entry.data as unknown as PaletteData).plantList;
      const back = linesFromCsv(scheduleCsv(scheduleRows(list, plant)), names);
      expect(back.error).toBeUndefined();
      expect(back.lines, b.key).toEqual(list);
    }
  });

  it('names a plant the same way from its index record as from its entry', () => {
    for (const [k, p] of plants) expect(recordPlant(records.get(k)!), k).toEqual(schedulePlant(p));
    expect(recordNameIndex(data.index.records)).toEqual(names);
  });

  it('guards text a spreadsheet would run as a formula, and reads it back unchanged', () => {
    const lines: PlantListItem[] = [{ plant: '=HYPERLINK("x")', note: '-2 in mulch', size: '@ grade' }];
    const csv = scheduleCsv(scheduleRows(lines, plant));
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'-2 in mulch");
    expect(linesFromCsv(csv, names).lines).toEqual(lines);
  });

  it('reads columns in any order and case, quoted line breaks, a byte order mark, and blank lines', () => {
    const text = '﻿note,QUANTITY,botanical name\n"two\nlines",3,mahonia aquifolium\n\n,x,Unknown sedge\n,,\n';
    expect(parseCsv(text)).toEqual([
      ['note', 'QUANTITY', 'botanical name'],
      ['two\nlines', '3', 'mahonia aquifolium'],
      ['', 'x', 'Unknown sedge'],
    ]);
    const back = linesFromCsv(text, names);
    expect(back.lines).toEqual([
      { plant: { ref: 'plant/mahonia-aquifolium' }, quantity: 3, note: 'two lines' },
      { plant: 'Unknown sedge' },
    ]);
  });

  it('skips rows with no name and refuses a file with no botanical name column', () => {
    expect(linesFromCsv('Botanical name,Quantity\n,4\nCarex obnupta,2\n', names)).toEqual({ lines: [{ plant: { ref: 'plant/carex-obnupta' }, quantity: 2 }], skipped: 1 });
    expect(linesFromCsv('Name,Quantity\nCarex obnupta,2\n', names).error).toMatch(/Botanical name/);
    expect(linesFromCsv('', names).error).toMatch(/empty/);
  });
});

describe('the per-region view as CSV', () => {
  it('writes the ranked table with each plant’s projects and quantity, cells escaped as the schedule’s', () => {
    const csv = regionCsv([
      { botanicalName: 'Polystichum munitum', commonName: 'western sword fern', form: 'Fern', projects: 3, quantity: 270 },
      { botanicalName: '=Odd, name', projects: 1, quantity: 0 },
    ]);
    expect(csv).toBe('Rank,Botanical name,Common name,Form,Projects,Quantity\r\n1,Polystichum munitum,western sword fern,Fern,3,270\r\n2,"\'=Odd, name",,,1,0\r\n');
    expect(parseCsv(csv)[0]).toEqual([...REGION_CSV_COLUMNS]);
  });
});

describe('a workspace list as a palette file', () => {
  it('passes validation, with text the library holds turned into refs and the fixture mark from fixturesOnly', () => {
    const list = updateLine(addText(fromPalette('bioswale-bottom'), 'Thuja plicata'), 0, 'note', 'Wettest cell');
    const entry = paletteEntry({ ...list, name: 'Bioswale, from the workspace!' }, '2026-11-19', names, true);
    expect(entry.id).toBe('bioswale-from-the-workspace');
    expect(entry.meta).toEqual({ createdAt: '2026-11-19', revisedAt: '2026-11-19', method: 'manual', fixture: true });
    expect(entry.data.plantList.at(-1)).toEqual({ plant: { ref: 'plant/thuja-plicata' } });
    expect(messages(validatePalette(entry))).toEqual([]);
    expect(paletteEntry(list, '2026-11-19', names, false).meta.fixture).toBeUndefined();
  });

  it('leaves out an empty site, and an empty list is still a palette', () => {
    const entry = paletteEntry(emptyList('Nothing yet'), '2026-11-19', names, true);
    expect(entry.data).toEqual({ plantList: [] });
    expect(messages(validatePalette(entry))).toEqual([]);
  });

  it('names what would fail validation: a plant twice at one size, and a location outside the states', () => {
    const list = { ...emptyList('Dupes'), site: { location: { lat: 40, lon: -100 } }, lines: [{ plant: { ref: 'plant/carex-obnupta' } }, { plant: 'carex  obnupta' }, { plant: { ref: 'plant/carex-obnupta' }, size: 'Plug' }] } as WorkspaceList;
    const problems = paletteProblems(list, names, () => 'Carex obnupta', true);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^Lines 1 and 2 are both Carex obnupta with no size/);
    expect(problems[1]).toMatch(/outside/);
    expect(paletteProblems(fromPalette('bioswale-bottom'), names, () => '')).toEqual([]);
  });
});

describe('the round trip (spec: library.md, Done when)', () => {
  it('local storage, the share URL, CSV, and a palette file that passes validation', () => {
    const start = fromPalette('dry-shade-understory');
    const stored = cleanStore(JSON.parse(JSON.stringify({ current: start.id, lists: [start] })));
    const shared = decodeList(sharedFromSearch(new URL(shareUrl(stored.lists[0]), 'https://example.org').search)!)!;
    expect(shared.lines).toEqual(start.lines);
    const csvLines = linesFromCsv(scheduleCsv(scheduleRows(shared.lines, plant)), names).lines;
    expect(csvLines).toEqual(start.lines);
    const entry = paletteEntry({ name: `${shared.name} (revised)`, site: shared.site, lines: csvLines }, '2026-11-19', names, true);
    expect(entry.data).toEqual({ site: start.site, plantList: start.lines });
    expect(messages(validatePalette(entry))).toEqual([]);
  });
});

describe('print links', () => {
  it('opens a list, named plants, or the Library results in the print view', () => {
    const list = fromPalette('bioswale-bottom');
    expect(printListUrl(list)).toMatch(/^\/plant-library\/print\/\?list=/);
    expect(printListUrl(list, true)).toMatch(/^\/plant-library\/print\/\?sheets=1&list=/);
    expect(decodeList(sharedFromSearch(printListUrl(list).split('?')[1])!)!.lines).toEqual(list.lines);
    expect(printPlantsUrl(['plant/carex-obnupta'])).toBe('/plant-library/print/?plants=plant%2Fcarex-obnupta');
    expect(printResultsUrl('?plant.form=shrub&q=a')).toBe('/plant-library/print/?sheets=1&plant.form=shrub&q=a');
    expect(printResultsUrl('')).toBe('/plant-library/print/?sheets=1');
  });

  it('names a download after the list', () => {
    expect(fileName('Rain garden: cell 2', 'csv')).toBe('rain-garden-cell-2.csv');
    expect(fileName('***', 'json')).toBe('plant-list.json');
  });
});

describe('cut sheets', () => {
  it('give the pinned image, traits as text in the plant page’s groups, and every citation', () => {
    const b = data.byKey.get('plant/mahonia-aquifolium')!;
    const s = cutSheet(b.key, { summary: b.entry.summary, data: b.entry.data as unknown as PlantData });
    expect(s.name).toBe('Mahonia aquifolium');
    expect(s.image?.src).toBe('/plant-library/assets/images/plant/mahonia-aquifolium/1.jpg');
    expect(s.image?.credit).toMatch(/^Generated test image, /);
    expect(s.groups.map((g) => g.title)[0]).toBe('Size and habit');
    expect(s.groups[0].rows[0]).toEqual({ label: 'Form', text: 'Shrub' });
    expect(s.groups.every((g) => g.rows.length && g.rows.every((r) => r.text))).toBe(true);
    const d = b.entry.data as unknown as PlantData;
    expect(s.sources).toHaveLength(d.sources.length);
    expect(s.sources[0].fields).toEqual(d.sources[0].fields);
  });

  it('show a non-native plant as not native, and leave out empty traits', () => {
    for (const b of plantEntries) {
      const d = b.entry.data as unknown as PlantData;
      const s = cutSheet(b.key, { data: d });
      const native = s.groups.flatMap((g) => g.rows).find((r) => r.label === 'Native status');
      if (!d.nativeRange) expect(native, b.key).toBeUndefined();
      else if (!d.nativeRange.states.length) expect(native?.text, b.key).toMatch(/^Not native/);
      else expect(native?.text, b.key).toMatch(/^Native to /);
    }
    expect(MAX_SHEETS).toBeGreaterThan(0);
  });
});
