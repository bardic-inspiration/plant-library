import { describe, expect, it } from 'vitest';
import { plantDistribution, projectsIn, rankPlants, regionSummary, type AnalysisProject } from '../lib/analysis';
import { buildData } from '../lib/build-data';
import { companions, deriveGeo } from '../lib/derive';
import { loadGeo } from '../lib/geo-load';
import type { PlantData, PlantDerived, ProjectData } from '../lib/types';
import { FIXTURES, fixtureEntries } from './helpers';

/** Distribution analysis over the test library's fixture projects (spec/v1/map.md#distribution-analysis, #47). */

const layers = loadGeo();
const entries = fixtureEntries();
const plants = new Map(entries.filter((e) => e.entry.type === 'plant').map((e) => [`plant/${e.entry.id}`, e.entry.data as unknown as PlantData]));
const projects: AnalysisProject[] = entries
  .filter((e) => e.entry.type === 'project')
  .map((e) => {
    const data = e.entry.data as unknown as ProjectData;
    return { key: `project/${e.entry.id}`, data, geo: deriveGeo(data.location, layers) };
  });
const keys = (ps: AnalysisProject[]) => ps.map((p) => p.key).sort();

describe('per plant', () => {
  it('a plant used in two states and native to one: figures by region and year, and the state outside its range', () => {
    // garrya-elliptica is native to OR and CA, and listed in Los Angeles County and, north of its range, in Bothell.
    const d = plantDistribution('plant/garrya-elliptica', projects, plants.get('plant/garrya-elliptica'));
    expect(d).toMatchObject({ projects: 2, quantity: 18 });
    expect(d.byState).toEqual([{ id: 'CA', projects: 1, quantity: 6 }, { id: 'WA', projects: 1, quantity: 12 }]);
    expect(d.byCounty).toEqual([{ id: '06037', projects: 1, quantity: 6 }, { id: '53061', projects: 1, quantity: 12 }]);
    expect(d.byEcoregion).toEqual([{ id: '2', projects: 1, quantity: 12 }, { id: '85', projects: 1, quantity: 6 }]);
    expect(d.byYear).toEqual([{ id: '2021', projects: 1, quantity: 12 }, { id: '2023', projects: 1, quantity: 6 }]);
    expect(d.outsideNativeRange).toEqual(['WA']);
    expect(d.byZone).toEqual([]);
  });

  it('a plant at two sizes on one project counts the project once and both quantities', () => {
    const d = plantDistribution('plant/acer-circinatum', projects, plants.get('plant/acer-circinatum'));
    expect(d.byCounty).toEqual([{ id: '53033', projects: 1, quantity: 19 }]);
    expect(d.outsideNativeRange).toEqual([]);
  });

  it('a project with no completion date is undated, not a year', () => {
    const d = plantDistribution('plant/carex-obnupta', projects);
    expect(d.byYear).toEqual([]);
    expect(d.undated).toEqual({ projects: 1, quantity: 200 });
  });

  it('unsourced text never counts, and an unused plant has empty figures', () => {
    // pine-street-trees lists "Acer rubrum 'Armstrong'" as text; no plant takes it.
    expect(plantDistribution('plant/acer-circinatum-pacific-fire', projects)).toMatchObject({ projects: 0, quantity: 0, byState: [] });
    const rosa = plantDistribution('plant/rosa-radrazz', projects, plants.get('plant/rosa-radrazz'));
    expect(rosa).toMatchObject({ projects: 0, byState: [], outsideNativeRange: [] });
  });

  it('a plant with no known native range has no outside-range note', () => {
    const range = { ...plants.get('plant/garrya-elliptica')!, nativeRange: undefined };
    expect(plantDistribution('plant/garrya-elliptica', projects, range).outsideNativeRange).toEqual([]);
  });
});

describe('per region', () => {
  it('selects the projects in any of the chosen regions', () => {
    expect(keys(projectsIn(projects, { county: ['06037'], ecoregion: ['10'] }))).toEqual([
      'project/mirada-terraces',
      'project/stateline-orchard-campus',
      'project/umatilla-bank-restoration',
    ]);
    expect(projectsIn(projects, {})).toEqual([]);
    expect(projectsIn(projects, { hardinessZone: ['8b'] })).toEqual([]);
  });

  it('a region with one project: its figures with a sample size of one, and no companions', () => {
    const here = projectsIn(projects, { county: ['06037'] });
    const s = regionSummary(here, plants);
    expect(s).toEqual({
      projects: 1,
      quantity: 236,
      plants: [
        { plant: 'plant/arctostaphylos-uva-ursi', projects: 1, quantity: 150 },
        { plant: 'plant/garrya-elliptica', projects: 1, quantity: 6 },
      ],
      taxa: { count: 2, projects: 1 },
      unsourced: { count: 1, projects: 1 },
      nativeShare: { share: 1, quantity: 156, projects: 1 },
      byForm: {
        shrub: { projects: 1, quantity: 6 },
        subshrub: { projects: 1, quantity: 150 },
        unknown: { projects: 1, quantity: 80 },
      },
    });
    for (const p of s.plants) expect(companions(p.plant, here)).toEqual([]);
  });

  it('ranks plants by projects, then quantity; or by quantity', () => {
    const wa = regionSummary(projectsIn(projects, { state: ['WA'] }), plants);
    expect(wa.projects).toBe(4);
    expect(wa.plants.slice(0, 4)).toEqual([
      { plant: 'plant/polystichum-munitum', projects: 3, quantity: 270 },
      { plant: 'plant/gaultheria-shallon', projects: 2, quantity: 180 },
      { plant: 'plant/pinus-contorta-var-contorta', projects: 2, quantity: 30 },
      { plant: 'plant/thuja-plicata', projects: 2, quantity: 13 },
    ]);
    expect(rankPlants(wa.plants, 'quantity').slice(0, 3).map((p) => p.plant)).toEqual([
      'plant/camassia-quamash',
      'plant/polystichum-munitum',
      'plant/achillea-millefolium',
    ]);
  });

  it("native share counts each plant against its own project's state", () => {
    // The 12 garrya-elliptica in Bothell are the only plants outside their range in WA.
    const wa = regionSummary(projectsIn(projects, { state: ['WA'] }), plants);
    expect(wa.nativeShare).toEqual({ share: 1342 / 1354, quantity: 1354, projects: 4 });
    // Across states, garrya-elliptica in CA is native there.
    const all = regionSummary(projects, plants);
    expect(all.nativeShare!.quantity - all.nativeShare!.share * all.nativeShare!.quantity).toBeCloseTo(12);
  });

  it('a region whose plants have no known range has no native share', () => {
    const p = projects.find((x) => x.key === 'project/ridge-meadow-swale')!;
    const unknownRange = new Map([...plants].map(([k, v]) => [k, { ...v, nativeRange: undefined }]));
    expect(regionSummary([p], unknownRange).nativeShare).toBeUndefined();
    expect(regionSummary([], plants)).toMatchObject({ projects: 0, quantity: 0, plants: [], taxa: { count: 0, projects: 0 } });
  });

  it('the mix by form counts the projects behind each form', () => {
    const s = regionSummary(projectsIn(projects, { ecoregion: ['10'] }), plants);
    expect(s.byForm).toEqual({
      bulb: { projects: 2, quantity: 1200 },
      forb: { projects: 2, quantity: 650 },
      tree: { projects: 1, quantity: 20 },
      unknown: { projects: 2, quantity: 1040 },
    });
    expect(s.taxa).toEqual({ count: 3, projects: 2 });
    expect(s.unsourced).toEqual({ count: 2, projects: 2 });
  });
});

describe('companions', () => {
  it('ranks the plants sharing at least two project lists, most first', () => {
    // polystichum-munitum is on three WA projects; gaultheria-shallon and thuja-plicata each share two of them.
    expect(companions('plant/polystichum-munitum', projects)).toEqual([
      { plant: 'plant/gaultheria-shallon', projects: 2 },
      { plant: 'plant/thuja-plicata', projects: 2 },
    ]);
    expect(companions('plant/achillea-millefolium', projects)).toEqual([{ plant: 'plant/camassia-quamash', projects: 2 }]);
  });

  it('a single shared project is not enough, unless the minimum is lowered', () => {
    expect(companions('plant/garrya-elliptica', projects)).toEqual([]);
    expect(companions('plant/garrya-elliptica', projects, 1).map((c) => c.plant)).toEqual([
      'plant/arctostaphylos-uva-ursi',
      'plant/gaultheria-shallon',
      'plant/polystichum-munitum',
      'plant/thuja-plicata',
    ]);
  });

  it('a plant at two sizes counts its project once, and never pairs with itself', () => {
    expect(companions('plant/acer-circinatum', projects, 1)).toEqual([
      { plant: 'plant/gaultheria-shallon', projects: 1 },
      { plant: 'plant/mahonia-nervosa', projects: 1 },
      { plant: 'plant/polystichum-munitum', projects: 1 },
    ]);
  });

  it('are attached to each plant by the build', () => {
    const { byKey } = buildData({ dataRoot: FIXTURES });
    const poly = byKey.get('plant/polystichum-munitum')!.derived as unknown as PlantDerived;
    expect(poly.companions).toEqual(companions('plant/polystichum-munitum', projects));
    expect((byKey.get('plant/rosa-radrazz')!.derived as unknown as PlantDerived).companions).toEqual([]);
  });
});
