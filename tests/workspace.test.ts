import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import {
  addLines,
  addPlant,
  addText,
  cleanList,
  cleanStore,
  compatSite,
  decodeList,
  emptyList,
  encodeList,
  fitFilters,
  listCompatibility,
  listSummary,
  moveLine,
  removeLine,
  sharedFromSearch,
  shareUrl,
  updateLine,
  type WorkspaceList,
} from '../lib/workspace';
import { applyQuery, emptyQuery } from '../lib/filter';
import type { PaletteData, PlantData } from '../lib/types';
import { FIXTURES, messages, validateWith } from './helpers';

const data = buildData({ dataRoot: FIXTURES });
const plants = new Map(data.entries.filter((e) => e.entry.type === 'plant').map((e) => [e.key, e.entry.data as unknown as PlantData]));
const palette = (id: string) => data.byKey.get(`palette/${id}`)!.entry.data as unknown as PaletteData;

/** A fixture palette as a workspace list. */
function fromPalette(id: string): WorkspaceList {
  const d = palette(id);
  return { ...emptyList(data.byKey.get(`palette/${id}`)!.name, 'abc123'), site: d.site ?? {}, lines: d.plantList };
}

describe('workspace lists', () => {
  it('round-trip through local storage', () => {
    const list = fromPalette('bioswale-bottom');
    const store = { current: list.id, lists: [list, emptyList('Second', 'def456')] };
    expect(cleanStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
  });

  it('round-trip through a share URL, with the same lines and site', () => {
    const list = { ...fromPalette('bioswale-bottom'), grouped: true };
    const href = shareUrl(list);
    expect(href).toMatch(/\/workspace\/\?list=[A-Za-z0-9_-]+$/);
    const back = decodeList(sharedFromSearch(href.slice(href.indexOf('?')))!)!;
    expect(back.id).not.toBe(list.id);
    expect({ ...back, id: list.id }).toEqual(list);
  });

  it('keep non-Latin text in a share URL', () => {
    const list = addText(emptyList('Jardín', 'x1'), 'Ribes sanguineum ‘King Edward VII’');
    expect(decodeList(encodeList(list))!.lines).toEqual(list.lines);
  });

  it('refuse a share URL that is not a list, and drop invalid values from one that is', () => {
    expect(decodeList('not base64!')).toBeUndefined();
    expect(decodeList(btoa('{"lines": 3}'))).toBeUndefined();
    const raw = {
      name: 'x'.repeat(300),
      site: { sun: ['full-sun', 'blazing'], moisture: 'wet', hardinessZone: '14', location: { lat: 47.123456789, lon: -122.1 }, extra: 1 },
      lines: [{ plant: { ref: 'plant/thuja-plicata' }, quantity: 2.5, size: 'a\nb', bogus: true }, { plant: { ref: '../etc' } }, { plant: '' }, 'text'],
    };
    const list = cleanList(raw)!;
    expect(list.name).toHaveLength(200);
    expect(list.site).toEqual({ sun: ['full-sun'], location: { lat: 47.12346, lon: -122.1 } });
    expect(list.lines).toEqual([{ plant: { ref: 'plant/thuja-plicata' }, size: 'a b' }]);
  });

  it('start fresh when local storage holds nothing readable', () => {
    const s = cleanStore('garbage');
    expect(s.lists).toHaveLength(1);
    expect(s.current).toBe(s.lists[0].id);
    expect(cleanStore({ current: 'zzz', lists: [emptyList('A', 'a1'), emptyList('B', 'a1')] })).toEqual({ current: 'a1', lists: [emptyList('A', 'a1')] });
  });

  it('a list is a valid palette: its lines and site are a palette’s data', () => {
    const list = fromPalette('dry-shade-understory');
    const moved = moveLine(updateLine(addText(list, 'Ribes sanguineum'), 0, 'note', 'At the path'), 0, 1);
    const report = validateWith((es) => {
      es.push({
        file: 'content/palette/from-workspace.json',
        entry: {
          type: 'palette',
          id: 'from-workspace',
          name: moved.name,
          summary: 'A list from the workspace.',
          data: { site: moved.site, plantList: moved.lines },
          meta: { createdAt: '2026-11-19', revisedAt: '2026-11-19', method: 'manual', fixture: true },
        },
      });
    });
    expect(messages(report)).toEqual([]);
  });
});

describe('editing a list', () => {
  const base = emptyList('T', 't1');

  it('adds a plant once, and a name not in the library once', () => {
    const a = addPlant(addPlant(base, 'plant/thuja-plicata'), 'plant/thuja-plicata');
    expect(a.lines).toEqual([{ plant: { ref: 'plant/thuja-plicata' } }]);
    expect(addText(addText(a, ' Ribes sanguineum '), 'ribes SANGUINEUM').lines).toHaveLength(2);
    expect(addPlant(base, 'project/x')).toBe(base);
  });

  it('appends a project’s or palette’s lines as they are written', () => {
    const lines = palette('bioswale-bottom').plantList;
    expect(addLines(base, lines).lines).toEqual(lines);
  });

  it('moves, updates, clears, and removes lines', () => {
    const l = addText(addPlant(addPlant(base, 'plant/thuja-plicata'), 'plant/carex-obnupta'), 'Other');
    expect(moveLine(l, 2, -1).lines.map((x) => x.plant)).toEqual([{ ref: 'plant/thuja-plicata' }, 'Other', { ref: 'plant/carex-obnupta' }]);
    expect(moveLine(l, 0, -1)).toBe(l);
    const q = updateLine(l, 0, 'quantity', '12');
    expect(q.lines[0]).toEqual({ plant: { ref: 'plant/thuja-plicata' }, quantity: 12 });
    expect(updateLine(q, 0, 'quantity', '').lines[0]).toEqual({ plant: { ref: 'plant/thuja-plicata' } });
    expect(updateLine(q, 0, 'quantity', '0').lines[0].quantity).toBeUndefined();
    expect(updateLine(l, 1, 'spacing', '  3 ft o.c. ').lines[1].spacing).toBe('3 ft o.c.');
    expect(removeLine(l, 1).lines).toHaveLength(2);
  });
});

describe('feedback', () => {
  it('summarises a list as a project does, a line with no quantity counting as one', () => {
    const list = addText(addPlant(fromPalette('bioswale-bottom'), 'plant/acer-circinatum'), 'Ribes sanguineum');
    const s = listSummary(list.lines, plants, 'WA');
    expect(s.taxa).toBe(5);
    expect(s.unsourced).toBe(1);
    expect(s.unquantified).toBe(2);
    expect(s.quantity).toBe(200 + 300 + 3 + 40 + 1 + 1);
    expect(s.byForm.unknown).toBe(1);
    expect(s.nativeShare).toBeGreaterThan(0);
    expect(listSummary(list.lines, plants).nativeShare).toBeUndefined();
  });

  it('finds gaps in the bloom calendar', () => {
    const withBloom = (start: number, end: number): PlantData => ({ ...plants.get('plant/thuja-plicata')!, bloom: { months: { start, end } } });
    const own = new Map([
      ['plant/a', withBloom(11, 2)],
      ['plant/b', withBloom(4, 6)],
      ['plant/c', { ...plants.get('plant/thuja-plicata')!, bloom: undefined }],
    ]);
    const l = ['plant/a', 'plant/b', 'plant/c'].map((k) => ({ plant: { ref: k } }));
    const s = listSummary(l, own);
    expect(s.bloomGaps).toEqual([3, 7, 8, 9, 10]);
    expect(s.bloom[0]).toEqual(['plant/a']);
    expect(s.noBloom).toEqual(['plant/c']);
    expect(listSummary([{ plant: { ref: 'plant/c' } }], own).bloomGaps).toEqual([]);
  });

  it('checks compatibility with the site, a location alone stating no condition', () => {
    const list = fromPalette('bioswale-bottom');
    const c = listCompatibility(list, plants);
    expect(c.axes.find((a) => a.axis === 'moisture')!.siteFit).toBeDefined();
    expect(compatSite({ location: { lat: 47, lon: -122 } })).toBeUndefined();
  });

  it('suggests plants that fit: the site where it states a condition, else what the list shares', () => {
    const list = fromPalette('bioswale-bottom');
    const f = fitFilters(listCompatibility(list, plants), list.site);
    expect(f.type).toEqual(['plant']);
    expect(f['plant.moisture']).toEqual(['wet']);
    expect(f['plant.drainage']).toEqual(['poor']);
    const shady = fitFilters(listCompatibility({ ...list, site: {}, lines: [{ plant: { ref: 'plant/gaultheria-shallon' } }, { plant: { ref: 'plant/polystichum-munitum' } }] }, plants), {});
    const fits = applyQuery(data.index.records, { ...emptyQuery(), filters: shady }, null).map((r) => r.key);
    expect(fits).toContain('plant/gaultheria-shallon');
    // Every suggestion accepts one of the shared sun values; as in the Library, a plant with no data on a filtered axis is left out.
    for (const k of fits) expect(plants.get(k)!.sun!.some((v) => shady['plant.sun']!.includes(v))).toBe(true);
    expect(fitFilters(listCompatibility(emptyList(), plants), { hardinessZone: '8' })['plant.hardiness']).toEqual(['8a', '8b']);
  });
});
