import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import { loadEntries, type LoadedEntry } from '../lib/content';
import { deriveGeo, derivePalette } from '../lib/derive';
import { loadGeo } from '../lib/geo-load';
import { validateLibrary } from '../lib/validate';
import type { CompatAxis } from '../lib/compat';
import type { PaletteData, PaletteDerived, PlantData } from '../lib/types';
import { FIXTURES, ROOT, messages, setup, validateWith } from './helpers';

/** A made-up palette, valid against every rule; tests change one thing at a time. */
function palette(): LoadedEntry {
  return {
    file: 'content/palette/test-palette.json',
    entry: {
      type: 'palette',
      id: 'test-palette',
      name: 'Test palette',
      summary: 'A made-up palette for the validation tests.',
      data: {
        site: { sun: ['part-shade', 'shade'], moisture: ['dry'], soil: { drainage: ['well'] }, hardinessZone: '8b', location: { lat: 47.60621, lon: -122.33207 } },
        plantList: [
          { plant: { ref: 'plant/gaultheria-shallon' } },
          { plant: { ref: 'plant/polystichum-munitum' }, quantity: 40, size: '#1 container' },
          { plant: 'Ribes sanguineum', note: 'At the edge' },
        ],
      },
      meta: { createdAt: '2026-11-19', revisedAt: '2026-11-19', method: 'manual', fixture: true },
    },
  };
}

type Data = Record<string, unknown> & { plantList: Record<string, unknown>[]; site: Record<string, unknown> & { location: { lat: number; lon: number } } };
const loose = (d: Data) => d as Record<string, unknown>;
const withPalette = (change: (d: Data, e: LoadedEntry) => void = () => {}, opts?: Parameters<typeof validateWith>[1]) =>
  validateWith((es) => {
    const p = palette();
    change(p.entry.data as Data, p);
    es.push(p);
  }, opts);
const errors = (r: ReturnType<typeof validateWith>) => messages(r).filter((m) => m.startsWith('content/palette/test-palette'));
const expectError = (r: ReturnType<typeof validateWith>, pattern: RegExp) =>
  expect(errors(r).some((m) => pattern.test(m)), errors(r).join('\n') || '(no errors)').toBe(true);

describe('palette schema', () => {
  it('a valid palette passes, warning only on its unsourced name', () => {
    const r = withPalette();
    expect(errors(r)).toEqual([]);
    expect(r.warnings.filter((w) => w.file === 'content/palette/test-palette.json').map((w) => w.message)).toEqual([
      'data.plantList[2].plant: "Ribes sanguineum" is not in the library (unsourced)',
    ]);
  });

  it('requires a name and a plant list; the site is optional', () => {
    expectError(withPalette((_d, e) => delete e.entry.name), /name is required/);
    expectError(withPalette((d) => delete loose(d).plantList), /must have required property 'plantList'/);
    expect(errors(withPalette((d) => delete loose(d).site))).toEqual([]);
  });

  it('quantity is optional, and a positive integer when given', () => {
    expect(errors(withPalette((d) => d.plantList.forEach((i) => delete i.quantity)))).toEqual([]);
    expectError(withPalette((d) => (d.plantList[1].quantity = 0)), /quantity/);
    expectError(withPalette((d) => (d.plantList[1].quantity = 2.5)), /quantity/);
  });

  it('a site states only sun, moisture, soil drainage, a zone, and a location', () => {
    expectError(withPalette((d) => (d.site.waterUse = 'low')), /unknown key "waterUse"/);
    expectError(withPalette((d) => (d.site.soil = { texture: ['clay'] })), /soil/);
    expectError(withPalette((d) => (loose(d).site = {})), /site/);
  });

  it('site values come from the vocabulary, and the zone is a USDA zone', () => {
    expectError(withPalette((d) => (d.site.sun = ['dappled'])), /site\/sun\/0: must be one of/);
    expectError(withPalette((d) => (d.site.moisture = [])), /site\/moisture/);
    expectError(withPalette((d) => (d.site.soil = { drainage: ['soggy'] })), /site\/soil\/drainage\/0: must be one of/);
    for (const z of ['8', '8b', '13a']) expect(errors(withPalette((d) => (d.site.hardinessZone = z)))).toEqual([]);
    expectError(withPalette((d) => (d.site.hardinessZone = '14')), /site\/hardinessZone/);
  });

  it('a site location falls inside WA, OR, or CA, to at most 5 decimal places', () => {
    expect(errors(withPalette((d) => (d.site.location = { lat: 34.05223, lon: -118.24368 })))).toEqual([]); // Los Angeles
    expectError(withPalette((d) => (d.site.location = { lat: 43.615, lon: -116.20231 })), /data\.site\.location: .* is outside WA, OR, CA/); // Boise
    expectError(withPalette((d) => (d.site.location = { lat: 47.606213, lon: -122.33207 })), /data\.site\.location: give lat and lon to at most 5/);
  });
});

describe('fixtures only, on palettes', () => {
  it('a palette must be a fixture', () => {
    expectError(withPalette((_d, e) => (e.entry.meta.fixture = false)), /every palette must be a fixture/);
    const off = { config: (c: { site: { fixturesOnly: boolean } }) => (c.site.fixturesOnly = false) };
    expect(errors(withPalette((_d, e) => (e.entry.meta.fixture = false), off))).toEqual([]);
  });
});

describe('palette plant lists follow the project rules', () => {
  it('a plant appears once per distinct size', () => {
    expectError(withPalette((d) => d.plantList.push({ plant: { ref: 'plant/gaultheria-shallon' } })), /plantList\[3\]: the same plant and size as data\.plantList\[0\]/);
    expect(errors(withPalette((d) => d.plantList.push({ plant: { ref: 'plant/gaultheria-shallon' }, size: '#5' })))).toEqual([]);
  });

  it('an unsourced name that is a plant’s name must be a ref', () => {
    expectError(withPalette((d) => (d.plantList[2].plant = 'Berberis aquifolium')), /is plant\/mahonia-aquifolium/);
  });

  it('a ref must resolve, and name a plant', () => {
    expectError(withPalette((d) => (d.plantList[0].plant = { ref: 'plant/acer-nonexistens' })), /ref plant\/acer-nonexistens does not resolve/);
    expectError(withPalette((d) => (d.plantList[0].plant = { ref: 'project/bellevue-grove-park' })), /is not a plant/);
  });
});

const geo = loadGeo();
const base: PlantData = { genus: 'Testus', commonNames: ['Test'], family: 'Aceraceae', form: 'shrub', sources: [] };
const plants = new Map<string, PlantData>([
  ['plant/dry', { ...base, species: 'dry', sun: ['part-shade', 'shade'], moisture: ['dry'], hardiness: { min: '6', max: '9' } }],
  ['plant/wet', { ...base, species: 'wet', sun: ['full-sun'], moisture: ['wet'], hardiness: { min: '5', max: '8' } }],
  ['plant/sedge', { ...base, species: 'sedge', sun: ['full-sun', 'part-shade'], moisture: ['moist', 'wet'] }],
]);
const list = (...keys: string[]): PaletteData['plantList'] => keys.map((k) => ({ plant: { ref: `plant/${k}` } }));
const axis = (d: PaletteDerived, a: CompatAxis) => d.compatibility.axes.find((x) => x.axis === a)!;

describe('derivePalette', () => {
  it('a palette with site conditions and no location: compatibility with a site fit, and no geography', () => {
    const d = derivePalette({ site: { sun: ['shade'], moisture: ['dry'], hardinessZone: '8' }, plantList: list('dry', 'sedge') }, plants);
    expect(d.geo).toBeUndefined();
    expect(d.compatibility.plants).toEqual(['plant/dry', 'plant/sedge']);
    expect(axis(d, 'sun').siteFit).toEqual({ 'plant/dry': 'pass', 'plant/sedge': 'fail' });
    expect(axis(d, 'moisture').siteFit).toEqual({ 'plant/dry': 'pass', 'plant/sedge': 'fail' });
    expect(axis(d, 'hardiness').siteFit).toEqual({ 'plant/dry': 'pass', 'plant/sedge': 'unknown' });
    expect(axis(d, 'drainage').siteFit).toEqual({ 'plant/dry': 'unknown', 'plant/sedge': 'unknown' });
  });

  it('a palette with a location: geography from it, as a project’s', () => {
    const location = { lat: 45.5122, lon: -122.6587 };
    const d = derivePalette({ site: { location }, plantList: list('dry') }, plants, deriveGeo(location, geo));
    expect(d.geo).toEqual(deriveGeo(location, geo));
    expect(d.geo?.state).toBe('OR');
  });

  it('the wet-soil conflict: the dry-ground plant shares no moisture with the rest, and fails the wet site', () => {
    const d = derivePalette({ site: { moisture: ['wet'] }, plantList: list('wet', 'sedge', 'dry') }, plants);
    const m = axis(d, 'moisture');
    expect(m.shared).toEqual([]);
    expect(m.conflicts).toEqual([{ restores: ['wet'], plants: [{ key: 'plant/dry', needs: ['dry'] }] }]);
    expect(m.siteFit).toEqual({ 'plant/wet': 'pass', 'plant/sedge': 'pass', 'plant/dry': 'fail' });
  });

  it('without a site, compatibility has no site fit', () => {
    const d = derivePalette({ plantList: list('dry', 'wet') }, plants);
    for (const a of d.compatibility.axes) expect(a.siteFit).toBeUndefined();
    expect(axis(d, 'hardiness').shared).toEqual(['6a', '6b', '7a', '7b', '8a', '8b']);
  });

  it('the stated zone wins; without one, the location’s zone is used once it exists (D33)', () => {
    const zoneOf = (d: PaletteDerived) => axis(d, 'hardiness').siteFit;
    expect(zoneOf(derivePalette({ site: { hardinessZone: '9b' }, plantList: list('dry', 'wet') }, plants, { state: 'OR', hardinessZone: '5a' })))
      .toEqual({ 'plant/dry': 'pass', 'plant/wet': 'fail' });
    expect(zoneOf(derivePalette({ site: { location: { lat: 45.5, lon: -122.6 } }, plantList: list('dry', 'wet') }, plants, { state: 'OR', hardinessZone: '5a' })))
      .toEqual({ 'plant/dry': 'fail', 'plant/wet': 'pass' });
  });
});

/** The fictional palettes in both libraries carry the palette cases (spec/v1/sources.md#fixture-palettes). */
const { config, schemas } = setup();
for (const [label, root] of [['the library', ROOT], ['the test fixture library', FIXTURES]] as const) {
  describe(`fixture palettes in ${label}`, () => {
    const entries = loadEntries(root).entries;
    const palettes = entries.filter((e) => e.entry.type === 'palette');
    const data = (p: LoadedEntry) => p.entry.data as unknown as PaletteData;
    const built = buildData({ dataRoot: root });
    const derived = (p: LoadedEntry) => built.byKey.get(`palette/${p.entry.id}`)!.derived as unknown as PaletteDerived;

    it('holds a few, all fixtures, passing validation with fixturesOnly on', () => {
      expect(config.site.fixturesOnly).toBe(true);
      expect(palettes.length).toBeGreaterThanOrEqual(3);
      for (const p of palettes) expect(p.entry.meta.fixture, p.file).toBe(true);
      const report = validateLibrary(config, schemas, entries, { dataRoot: root });
      expect(report.errors.filter((e) => e.file.startsWith('content/palette/'))).toEqual([]);
    });

    it('include a palette with site conditions and no location', () => {
      const p = palettes.find((x) => data(x).site && !data(x).site!.location);
      expect(p).toBeDefined();
      expect(derived(p!).geo).toBeUndefined();
      expect(derived(p!).compatibility.axes.some((a) => a.siteFit && Object.values(a.siteFit).includes('pass'))).toBe(true);
    });

    it('include one with a location, whose geography is derived', () => {
      const p = palettes.find((x) => data(x).site?.location);
      expect(p).toBeDefined();
      expect(derived(p!).geo?.state).toMatch(/^(WA|OR|CA)$/);
    });

    it('include the wet-soil conflict: a wet site, a moisture conflict, and a plant failing the site', () => {
      const p = palettes.find((x) => data(x).site?.moisture?.includes('wet') && axis(derived(x), 'moisture').conflicts.length > 0);
      expect(p).toBeDefined();
      const m = axis(derived(p!), 'moisture');
      expect(m.conflicts[0].restores).toContain('wet');
      expect(Object.values(m.siteFit!)).toContain('fail');
    });

    it('a plant’s refBy lists the palettes whose lists include it', () => {
      for (const p of palettes) {
        for (const item of data(p).plantList) {
          if (typeof item.plant === 'string') continue;
          expect(built.byKey.get(item.plant.ref)!.refBy, `${p.file} → ${item.plant.ref}`).toContain(`palette/${p.entry.id}`);
        }
      }
    });
  });
}
