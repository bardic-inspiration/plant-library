import { describe, expect, it } from 'vitest';
import { derivePlant, derivePlantUse, deriveProject, monthsBetween, seasonsFor, sizeClassFor } from '../lib/derive';
import { expandZones, formatZoneRange, zoneIndex } from '../lib/zones';
import type { PlantData, ProjectData } from '../lib/types';

const base: PlantData = { genus: 'Acer', species: 'circinatum', commonNames: ['Vine maple'], family: 'Aceraceae', form: 'tree', sources: [] };

describe('derived plant values', () => {
  it('name and sort name come from the parts', () => {
    const d = derivePlant({ ...base, cultivar: 'Pacific Fire' });
    expect(d.name).toBe("Acer circinatum 'Pacific Fire'");
    expect(d.sortName).toBe('acer circinatum pacific fire');
  });

  it('native status: native, adapted, or unknown', () => {
    expect(derivePlant({ ...base, nativeRange: { states: ['WA'], ecoregions: [] } }).nativeStatus).toBe('native');
    expect(derivePlant({ ...base, nativeRange: { states: [], ecoregions: [] } }).nativeStatus).toBe('adapted');
    expect(derivePlant(base).nativeStatus).toBeUndefined();
  });

  it('bloom months wrap the year, and give seasons', () => {
    expect(monthsBetween(11, 2)).toEqual([11, 12, 1, 2]);
    expect(monthsBetween(4, 4)).toEqual([4]);
    expect(seasonsFor([11, 12, 1, 2])).toEqual(['fall', 'winter']);
    const d = derivePlant({ ...base, bloom: { months: { start: 12, end: 2 } } });
    expect(d.bloomMonthList).toEqual([12, 1, 2]);
    expect(d.bloomSeasons).toEqual(['winter']);
  });

  it('size class by form and height', () => {
    expect(sizeClassFor('tree', 20)).toBe('small-tree');
    expect(sizeClassFor('tree', 25)).toBe('small-tree');
    expect(sizeClassFor('tree', 26)).toBe('medium-tree');
    expect(sizeClassFor('tree', 150)).toBe('large-tree');
    expect(sizeClassFor('shrub', 6)).toBe('medium-shrub');
    expect(sizeClassFor('forb', 0.5)).toBe('low');
    expect(sizeClassFor('vine', 30)).toBeUndefined();
    expect(sizeClassFor('tree', undefined)).toBeUndefined();
  });

  it('hardiness zones expand to half zones', () => {
    expect(expandZones({ min: '7', max: '8' })).toEqual(['7a', '7b', '8a', '8b']);
    expect(expandZones({ min: '7b', max: '8a' })).toEqual(['7b', '8a']);
    expect(zoneIndex('1a', 'min')).toBe(0);
    expect(zoneIndex('13', 'max')).toBe(25);
    expect(formatZoneRange({ min: '5', max: '9' })).toBe('Zones 5–9');
    expect(derivePlant({ ...base, hardiness: { min: '8b', max: '9' } }).hardinessZones).toEqual(['8b', '9a', '9b']);
  });
});

const plants = new Map<string, PlantData>([
  ['plant/acer-circinatum', { ...base, nativeRange: { states: ['WA', 'OR'], ecoregions: [] } }],
  ['plant/acer-palmatum', { ...base, species: 'palmatum', nativeRange: { states: [], ecoregions: [] } }],
  ['plant/festuca-roemeri', { ...base, genus: 'Festuca', species: 'roemeri', form: 'graminoid', nativeRange: { states: ['OR'], ecoregions: [] } }],
  ['plant/no-range', { ...base, species: 'norange' }],
]);
const proj = (over: Partial<ProjectData> = {}): ProjectData => ({
  landscapeArchitect: 'Example Studio',
  location: { lat: 47.6, lon: -122.3 },
  projectType: 'park',
  sizeAcres: 4,
  status: 'constructed',
  plantList: [
    { plant: { ref: 'plant/acer-circinatum' }, quantity: 12, size: '#5' },
    { plant: { ref: 'plant/acer-circinatum' }, quantity: 3, size: '8 ft' },
    { plant: { ref: 'plant/acer-palmatum' }, quantity: 5 },
    { plant: { ref: 'plant/festuca-roemeri' }, quantity: 80 },
    { plant: 'Elymus glaucus', quantity: 100 },
  ],
  ...over,
});

describe('derived project values', () => {
  const wa = { state: 'WA', county: '53033' };
  it('counts taxa once per plant, and unsourced names apart', () => {
    const p = deriveProject(proj(), plants, wa).plants;
    expect(p.taxa).toBe(3);
    expect(p.unsourced).toBe(1);
    expect(p.quantity).toBe(200);
  });
  it('quantity by form puts unsourced lines under unknown', () => {
    expect(deriveProject(proj(), plants, wa).plants.byForm).toEqual({ tree: 20, graminoid: 80, unknown: 100 });
  });
  it("native share counts natives of the project's own state, among plants with a known range", () => {
    // WA: 15 native (vine maple) of 100 known (15 + 5 + 80)
    expect(deriveProject(proj(), plants, wa).plants.nativeShare).toBeCloseTo(0.15);
    // The same list in Oregon: vine maple and fescue are native
    expect(deriveProject(proj(), plants, { state: 'OR' }).plants.nativeShare).toBeCloseTo(0.95);
  });
  it('native share is absent with no state or no known range', () => {
    expect(deriveProject(proj(), plants, {}).plants.nativeShare).toBeUndefined();
    const onlyUnknown = proj({ plantList: [{ plant: { ref: 'plant/no-range' }, quantity: 4 }, { plant: 'Text', quantity: 2 }] });
    expect(deriveProject(onlyUnknown, plants, wa).plants.nativeShare).toBeUndefined();
  });
  it('unsourced text never counts toward a plant, even a ref the library lacks', () => {
    const p = deriveProject(proj({ plantList: [{ plant: { ref: 'plant/missing' }, quantity: 1 }] }), plants, wa).plants;
    expect(p.taxa).toBe(0);
    expect(p.byForm).toEqual({ unknown: 1 });
  });
  it('cost per acre needs a budget', () => {
    expect(deriveProject(proj({ constructionBudget: 1_000_000 }), plants, wa).costPerAcre).toBe(250000);
    expect(deriveProject(proj({ constructionBudget: 1_000_000, sizeAcres: 3 }), plants, wa).costPerAcre).toBe(333333);
    expect('costPerAcre' in deriveProject(proj(), plants, wa)).toBe(false);
  });
  it('a proposed project with no completion date and a state-line project derive the same way', () => {
    const d = deriveProject(proj({ status: 'proposed' }), plants, { state: 'OR', county: '41067' });
    expect(d.geo.state).toBe('OR');
    expect(d.plants.taxa).toBe(3);
  });
});

describe('derived plant use', () => {
  const a = { key: 'project/a', data: proj(), geo: { state: 'WA', county: '53033', ecoregion: '2' } };
  const b = { key: 'project/b', data: proj({ plantList: [{ plant: { ref: 'plant/acer-circinatum' }, quantity: 7 }] }), geo: { state: 'OR', county: '41051', ecoregion: '2' } };
  const c = { key: 'project/c', data: proj({ plantList: [{ plant: 'Acer circinatum', quantity: 50 }] }), geo: { state: 'CA', county: '06001' } };
  it('lists projects, totals quantity, and gathers their geography', () => {
    const u = derivePlantUse('plant/acer-circinatum', [b, a, c]);
    expect(u.projects).toEqual(['project/a', 'project/b']);
    expect(u.quantity).toBe(22);
    expect(u.states).toEqual(['OR', 'WA']);
    expect(u.counties).toEqual(['41051', '53033']);
    expect(u.ecoregions).toEqual(['2']);
    expect(u.zones).toEqual([]);
  });
  it('unsourced text is never a plant’s use', () => {
    expect(derivePlantUse('plant/acer-circinatum', [c])).toEqual({ projects: [], quantity: 0, states: [], counties: [], ecoregions: [], zones: [] });
  });
  it('collects hardiness zones once the geography carries them', () => {
    expect(derivePlantUse('plant/acer-circinatum', [{ ...a, geo: { ...a.geo, hardinessZone: '8b' } }]).zones).toEqual(['8b']);
  });
});
