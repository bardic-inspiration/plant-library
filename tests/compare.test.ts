import { describe, expect, it } from 'vitest';
import { plantDistribution, projectsIn, regionSummary, type AnalysisProject } from '../lib/analysis';
import { analysisFile, type AnalysisFile } from '../lib/analysis-data';
import { compareUrl, comparePlants, compareRegions, comparisonSearch, pair, parseRegion, readComparison } from '../lib/compare';
import { deriveGeo } from '../lib/derive';
import { loadGeo } from '../lib/geo-load';
import type { PlantData, ProjectData } from '../lib/types';
import { fixtureEntries, setup } from './helpers';

/** Comparison over the test library's fixture projects (docs/site.md#compare-page, #50). */

const layers = loadGeo();
const entries = fixtureEntries();
const plants = new Map(entries.filter((e) => e.entry.type === 'plant').map((e) => [`plant/${e.entry.id}`, e.entry.data as unknown as PlantData]));
const projects: AnalysisProject[] = entries
  .filter((e) => e.entry.type === 'project')
  .map((e) => {
    const data = e.entry.data as unknown as ProjectData;
    return { key: `project/${e.entry.id}`, data, geo: deriveGeo(data.location, layers) };
  });
const fig = (projects: number, quantity: number) => ({ projects, quantity });
const NONE = fig(0, 0);

describe('the query string', () => {
  it('reads two plants or two regions, and writes them back', () => {
    for (const s of ['?plants=plant/garrya-elliptica,plant/polystichum-munitum', '?regions=state:WA,county:53033', '?plants=plant/garrya-elliptica', '?regions=ecoregion:10']) {
      expect(comparisonSearch(readComparison(s))).toBe(s);
    }
    expect(readComparison('?regions=state:WA,county:53033')).toEqual({ kind: 'regions', sides: [{ level: 'state', id: 'WA' }, { level: 'county', id: '53033' }] });
    expect(compareUrl({ kind: 'plants', sides: ['plant/garrya-elliptica', undefined] })).toMatch(/compare\/\?plants=plant\/garrya-elliptica$/);
  });

  it('defaults to plants, and leaves a side unchosen when its value is no plant or region', () => {
    expect(readComparison('')).toEqual({ kind: 'plants', sides: [undefined, undefined] });
    expect(readComparison('?plants=project/x,plant/a').sides).toEqual([undefined, 'plant/a']);
    expect(readComparison('?regions=planet:Mars,state:<b>').sides).toEqual([undefined, undefined]);
    expect(parseRegion('WA')).toBeUndefined();
    expect(parseRegion('hardinessZone:8b')).toEqual({ level: 'hardinessZone', id: '8b' });
  });
});

describe('pairing', () => {
  it('lines two breakdowns up over the ids either has, zero where a side has none', () => {
    expect(pair([{ id: 'WA', ...fig(1, 5) }], [{ id: 'CA', ...fig(2, 3) }, { id: 'WA', ...fig(1, 1) }])).toEqual([
      { id: 'CA', a: NONE, b: fig(2, 3) },
      { id: 'WA', a: fig(1, 5), b: fig(1, 1) },
    ]);
  });
});

describe('two plants', () => {
  // garrya-elliptica: Bothell (WA, 2021, 12) and Mirada (CA, 2023, 6). polystichum-munitum: three WA projects, Bothell among them.
  const c = comparePlants('plant/garrya-elliptica', 'plant/polystichum-munitum', projects, plants);

  it('each side is the plant page’s own distribution', () => {
    expect(c.a).toEqual(plantDistribution('plant/garrya-elliptica', projects, plants.get('plant/garrya-elliptica')));
    expect(c.b).toEqual(plantDistribution('plant/polystichum-munitum', projects, plants.get('plant/polystichum-munitum')));
    expect(c.a.outsideNativeRange).toEqual(['WA']);
  });

  it('pairs the same measures, each with its projects', () => {
    expect(c.byState).toEqual([
      { id: 'CA', a: fig(1, 6), b: NONE },
      { id: 'WA', a: fig(1, 12), b: fig(3, 270) },
    ]);
    expect(c.byYear).toEqual([
      { id: '2019', a: NONE, b: fig(1, 140) },
      { id: '2021', a: fig(1, 12), b: fig(1, 40) },
      { id: '2022', a: NONE, b: fig(1, 90) },
      { id: '2023', a: fig(1, 6), b: NONE },
    ]);
    expect(c.byZone).toEqual([]);
  });

  it('counts the projects listing both', () => {
    expect(c.both).toBe(1);
    expect(comparePlants('plant/garrya-elliptica', 'plant/camassia-quamash', projects, plants).both).toBe(0);
  });

  it('a plant on no project compares as zero on every measure', () => {
    const z = comparePlants('plant/rosa-radrazz', 'plant/garrya-elliptica', projects, plants);
    expect(z.a).toMatchObject({ projects: 0, quantity: 0, byState: [] });
    expect(z.byState.every((r) => r.a.projects === 0)).toBe(true);
  });
});

describe('two regions', () => {
  it('a state and a county inside it: each side is the per-region view’s summary, with the overlap', () => {
    const c = compareRegions({ level: 'state', id: 'WA' }, { level: 'county', id: '53033' }, projects, plants);
    expect(c.a).toEqual(regionSummary(projectsIn(projects, { state: ['WA'] }), plants));
    expect(c.b).toEqual(regionSummary(projectsIn(projects, { county: ['53033'] }), plants));
    expect([c.a.projects, c.b.projects, c.overlap]).toEqual([4, 2, 2]);
    expect(c.byForm.find((f) => f.id === 'bulb')).toEqual({ id: 'bulb', a: fig(1, 400), b: NONE });
    expect(c.byForm.find((f) => f.id === 'unknown')).toEqual({ id: 'unknown', a: fig(2, 46), b: fig(1, 6) });
  });

  it('plants in both come first by the fewer projects of the two sides', () => {
    const c = compareRegions({ level: 'state', id: 'WA' }, { level: 'county', id: '53033' }, projects, plants);
    expect(c.shared[0]).toEqual({ plant: 'plant/polystichum-munitum', a: fig(3, 270), b: fig(2, 230) });
    expect(c.shared.map((s) => s.plant)).toContain('plant/mahonia-nervosa');
    expect(c.shared.map((s) => s.plant)).not.toContain('plant/camassia-quamash');
  });

  it('two regions with one project each: their figures with the sample size, nothing in both', () => {
    // Los Angeles County holds Mirada, Lake County the swale.
    const c = compareRegions({ level: 'county', id: '06037' }, { level: 'county', id: '06033' }, projects, plants);
    expect([c.a.projects, c.b.projects, c.overlap]).toEqual([1, 1, 0]);
    expect(c.shared).toEqual([]);
    expect(c.b.unsourced).toEqual({ count: 2, projects: 1 });
  });

  it('a region with no project compares as empty', () => {
    const c = compareRegions({ level: 'state', id: 'OR' }, { level: 'county', id: '41051' }, projects, plants);
    expect(c.b.projects).toBe(0);
    expect(c.shared).toEqual([]);
  });
});

describe('in the browser', () => {
  const { config } = setup();
  const file: AnalysisFile = JSON.parse(JSON.stringify(analysisFile(projects, plants, config.overlays)));
  const filePlants = new Map(Object.entries(file.plants));

  it('analysis.json gives the same comparisons as the build (P3)', () => {
    expect(comparePlants('plant/garrya-elliptica', 'plant/polystichum-munitum', file.projects, filePlants)).toEqual(comparePlants('plant/garrya-elliptica', 'plant/polystichum-munitum', projects, plants));
    expect(compareRegions({ level: 'state', id: 'WA' }, { level: 'ecoregion', id: '10' }, file.projects, filePlants)).toEqual(compareRegions({ level: 'state', id: 'WA' }, { level: 'ecoregion', id: '10' }, projects, plants));
  });
});
