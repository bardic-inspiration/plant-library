import { describe, expect, it } from 'vitest';
import { compatibility, type CompatAxis, type Compatibility } from '../lib/compat';
import { andList, conflictPlants, describeAxis, gridColumns, type ValueLabel } from '../lib/compat-text';
import { buildData } from '../lib/build-data';
import { mapResults, paletteFeatures, inView, unplaced } from '../lib/map-data';
import type { PlantData, PlantListItem, ProjectDerived } from '../lib/types';
import { FIXTURES } from './helpers';

const base: PlantData = { genus: 'Testus', commonNames: ['Test'], family: 'Aceraceae', form: 'shrub', sources: [] };
const p = (species: string, over: Partial<PlantData> = {}): [string, PlantData] => [`plant/${species}`, { ...base, species, ...over }];
const refs = (...keys: string[]): PlantListItem[] => keys.map((k) => ({ plant: { ref: `plant/${k}` } }));
const axis = (c: Compatibility, a: CompatAxis) => c.axes.find((x) => x.axis === a)!;
const nameOf = (k: string) => k.replace('plant/', '');
// Prose lowercases labels, so a label shows through as its lowercase form.
const label: ValueLabel = (_a, v) => v.toUpperCase();

describe('the compatibility panel’s words', () => {
  it('names one conflict: the plant to remove, what it needs, and what the rest then share', () => {
    const plants = new Map([p('wet', { moisture: ['wet'] }), ...['a', 'b', 'c', 'd'].map((s) => p(s, { moisture: ['dry'] }))]);
    const c = compatibility(refs('wet', 'a', 'b', 'c', 'd'), plants);
    expect(describeAxis(axis(c, 'moisture'), nameOf, label)).toEqual(['The plants share no moisture value. To fix it, remove wet (wet), and the rest share dry.']);
    expect([...conflictPlants(axis(c, 'moisture'))]).toEqual(['plant/wet']);
  });

  it('names each tied alternative', () => {
    const plants = new Map([p('dry', { moisture: ['dry'] }), p('wet', { moisture: ['wet'] })]);
    const [text] = describeAxis(axis(compatibility(refs('dry', 'wet'), plants), 'moisture'), nameOf, label);
    expect(text).toBe('The plants share no moisture value. Any one of these fixes it: 1. Remove wet (wet), and the rest share dry. 2. Remove dry (dry), and the rest share wet.');
  });

  it('writes out what is shared, the plants with no data, and the plants that don’t suit the site', () => {
    const plants = new Map([p('a', { sun: ['full-sun', 'part-shade'] }), p('b', { sun: ['full-sun'] }), p('n')]);
    const c = compatibility(refs('a', 'b', 'n'), plants, { sun: ['part-shade'] });
    expect(describeAxis(axis(c, 'sun'), nameOf, label, { sun: ['part-shade'] })).toEqual([
      'Every plant with sun data shares full-sun.',
      'No sun data: n.',
      "Not suited to the site's part-shade: b.",
    ]);
    expect(describeAxis(axis(c, 'moisture'), nameOf, label)).toEqual(['No plant on the list has moisture data.']);
  });

  it('reads hardiness as zone ranges, and trims its grid to the zones in play', () => {
    const plants = new Map([p('a', { hardiness: { min: '6', max: '9' } }), p('b', { hardiness: { min: '7b', max: '8' } })]);
    const r = axis(compatibility(refs('a', 'b'), plants), 'hardiness');
    expect(describeAxis(r, nameOf, (_a, v) => v)).toEqual(['Every plant with hardiness zone data shares 7b to 8b.']);
    expect(gridColumns(r)).toEqual(['6a', '6b', '7a', '7b', '8a', '8b', '9a', '9b']);
    expect(gridColumns(r, { hardinessZone: '10' }).at(-1)).toBe('10b');
    expect(gridColumns(axis(compatibility(refs('a'), plants), 'sun'))).toEqual(axis(compatibility(refs('a'), plants), 'sun').values);
  });

  it('lists in prose', () => {
    expect(andList(['a'])).toBe('a');
    expect(andList(['a', 'b'], 'or')).toBe('a or b');
    expect(andList(['a', 'b', 'c'])).toBe('a, b, and c');
  });
});

describe('palettes in the index and on the map', () => {
  const built = buildData({ dataRoot: FIXTURES });
  const records = built.index.records;
  const rec = (k: string) => records.find((r) => r.key === k)!;

  it('indexes palettes with their card: plant count, site conditions, and a location when the site has one', () => {
    expect(rec('palette/bioswale-bottom').card).toMatchObject({ plantCount: 4, moisture: ['wet'], drainage: ['poor'], place: expect.stringMatching(/, WA$/) });
    expect(rec('palette/bioswale-bottom').card.location).toEqual([-122.2015, 47.6101]);
    // Three refs and one unsourced name.
    expect(rec('palette/dry-shade-understory').card).toMatchObject({ plantCount: 4, sun: ['shade'], moisture: ['dry'], hardinessZone: '8' });
    expect(rec('palette/dry-shade-understory').card.location).toBeUndefined();
    expect(Object.keys(rec('palette/sunny-street-standard').card).sort()).toEqual(['plantCount', 'quantities']);
  });

  it('offers the site-conditions facet, from the palettes that state them', () => {
    const facet = (k: string) => built.index.facets.find((f) => f.key === k);
    expect(facet('palette.moisture')?.values.map((v) => v.id)).toEqual(['dry', 'wet']);
    expect(facet('palette.sun')?.values.map((v) => v.id)).toEqual(['shade']);
    expect(facet('palette.drainage')?.values.map((v) => v.id)).toEqual(['poor']);
    expect(rec('palette/bioswale-bottom').facets['palette.moisture']).toEqual(['wet']);
  });

  it('draws a palette with a location as a point of its own, and counts the others as unplaced', () => {
    const palettes = records.filter((r) => r.type === 'palette');
    const drawn = mapResults(palettes, records, {});
    expect([...drawn.palettes]).toEqual(['palette/bioswale-bottom']);
    expect(drawn.projects.size).toBe(0);
    const fc = paletteFeatures(records, drawn);
    expect(fc.features.map((f) => f.properties.key)).toEqual(['palette/bioswale-bottom']);
    expect(fc.features[0].geometry.coordinates).toEqual([-122.2015, 47.6101]);
    expect(unplaced(palettes, drawn).map((r) => r.key).sort()).toEqual(['palette/dry-shade-understory', 'palette/sunny-street-standard']);
    expect(inView(palettes, records, drawn, [-123, 47, -122, 48]).map((r) => r.key)).toEqual(['palette/bioswale-bottom']);
    expect(inView(palettes, records, drawn, [-120, 47, -119, 48])).toEqual([]);
    // Without a result set, every located palette.
    expect(paletteFeatures(records).features).toHaveLength(1);
  });

  it('gives projects their list’s compatibility, with no site fit', () => {
    for (const b of built.entries.filter((e) => e.entry.type === 'project')) {
      const c = (b.derived as unknown as ProjectDerived).compatibility;
      expect(c.axes.map((a) => a.axis)).toEqual(['sun', 'moisture', 'drainage', 'hardiness', 'waterUse']);
      for (const a of c.axes) expect(a.siteFit).toBeUndefined();
    }
  });
});
