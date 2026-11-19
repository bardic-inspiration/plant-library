import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import { loadEntries, type LoadedEntry } from '../lib/content';
import { deriveGeo } from '../lib/derive';
import { loadGeo } from '../lib/geo-load';
import { validateLibrary } from '../lib/validate';
import { FIXTURES, ROOT, setup } from './helpers';

/** The fictional projects in both libraries carry the data-model cases (spec/v1/sources.md#fixture-projects-and-palettes). */

const geo = loadGeo();
const { config, schemas } = setup();

interface ProjectData {
  location: { lat: number; lon: number };
  projectType: string;
  status: string;
  completed?: string;
  client?: string;
  constructionBudget?: number;
  plantList: { plant: { ref: string } | string; quantity: number; size?: string }[];
}

function load(root: string) {
  const entries = loadEntries(root).entries;
  const projects = entries.filter((e) => e.entry.type === 'project');
  const plants = new Map(entries.filter((e) => e.entry.type === 'plant').map((e) => [`plant/${e.entry.id}`, e.entry.data as { form: string }]));
  return { entries, projects, plants };
}
const data = (p: LoadedEntry) => p.entry.data as unknown as ProjectData;
const at = (p: LoadedEntry) => deriveGeo(data(p).location, geo);
const refs = (p: LoadedEntry) => data(p).plantList.flatMap((i) => (typeof i.plant === 'string' ? [] : [i.plant.ref]));
const texts = (p: LoadedEntry) => data(p).plantList.flatMap((i) => (typeof i.plant === 'string' ? [i.plant] : []));

for (const [label, root, min] of [['the library', ROOT, 12], ['the test fixture library', FIXTURES, 5]] as const) {
  describe(`fixture projects in ${label}`, () => {
    const { entries, projects, plants } = load(root);

    it(`holds at least ${min}, all passing validation with fixturesOnly on`, () => {
      expect(config.site.fixturesOnly).toBe(true);
      expect(projects.length).toBeGreaterThanOrEqual(min);
      const report = validateLibrary(config, schemas, entries, { dataRoot: root });
      expect(report.errors.filter((e) => e.file.startsWith('content/project/'))).toEqual([]);
    });

    it('are fictional: fixtures, with client and constructionBudget blank', () => {
      for (const p of projects) {
        expect(p.entry.meta.fixture, p.file).toBe(true);
        expect(data(p).client, p.file).toBeUndefined();
        expect(data(p).constructionBudget, p.file).toBeUndefined();
      }
    });

    it('include a list mixing refs and unsourced text names', () => {
      expect(projects.some((p) => refs(p).length > 0 && texts(p).length > 0)).toBe(true);
    });

    it('include points on either side of the WA–OR state line', () => {
      const states = new Set(projects.filter((p) => Math.abs(data(p).location.lat - 46.0) < 0.01).map((p) => at(p).state));
      expect(states).toEqual(new Set(['WA', 'OR']));
    });

    it('include an unincorporated point (a county, no place)', () => {
      expect(projects.some((p) => at(p).county && !at(p).place)).toBe(true);
    });

    it('include a proposed project with no completion date', () => {
      expect(projects.some((p) => data(p).status === 'proposed' && data(p).completed === undefined)).toBe(true);
    });

    it('include a streetscape in King County that uses trees, and streetscapes or tree lists that are not that', () => {
      const king = (p: LoadedEntry) => at(p).county === '53033';
      const street = (p: LoadedEntry) => data(p).projectType === 'streetscape';
      const trees = (p: LoadedEntry) => refs(p).some((r) => plants.get(r)?.form === 'tree');
      expect(projects.some((p) => king(p) && street(p) && trees(p))).toBe(true);
      expect(projects.some((p) => !(king(p) && street(p)) && trees(p))).toBe(true);
    });

    it('share plants across projects, so companions have data', () => {
      const uses = new Map<string, Set<string>>();
      for (const p of projects) for (const r of refs(p)) uses.set(r, (uses.get(r) ?? new Set()).add(p.entry.id));
      expect([...uses.values()].some((s) => s.size >= 2)).toBe(true);
      // A pair of plants together on at least two projects (the companions minimum).
      const pairs = new Map<string, number>();
      for (const p of projects) {
        const rs = [...new Set(refs(p))].sort();
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) pairs.set(`${rs[i]} ${rs[j]}`, (pairs.get(`${rs[i]} ${rs[j]}`) ?? 0) + 1);
      }
      expect([...pairs.values()].some((n) => n >= 2)).toBe(true);
    });
  });
}

describe('fixture projects in the library: spread', () => {
  const { projects } = load(ROOT);

  it('cover every project type and status, and all three states', () => {
    expect(new Set(projects.map((p) => data(p).projectType))).toEqual(new Set((config.vocab.projectType as { id: string }[]).map((v) => v.id)));
    expect(new Set(projects.map((p) => data(p).status))).toEqual(new Set((config.vocab.projectStatus as { id: string }[]).map((v) => v.id)));
    expect(new Set(projects.map((p) => at(p).state))).toEqual(new Set(['WA', 'OR', 'CA']));
  });

  it('include points on either side of the King–Snohomish county line', () => {
    const counties = new Set(projects.map((p) => at(p).county));
    expect(counties.has('53033') && counties.has('53061')).toBe(true);
  });
});

describe('the index', () => {
  it('lists the types the site builds pages for, projects with their card fields', () => {
    const { index } = buildData({ dataRoot: FIXTURES });
    expect(new Set(index.records.map((r) => r.type))).toEqual(new Set(['plant', 'project']));
    const card = index.records.find((r) => r.key === 'project/bothell-main-street')!.card;
    expect(card.place).toMatch(/^Bothell, WA$/);
    expect(Object.keys(card).sort()).toEqual(['completed', 'location', 'place', 'plantCount', 'projectType', 'sizeAcres', 'status']);
  });

  it('counts the plants on a project card as taxa plus unsourced names', () => {
    const { byKey, index } = buildData({ dataRoot: FIXTURES });
    for (const r of index.records.filter((x) => x.type === 'project')) {
      const p = (byKey.get(r.key)!.derived as { plants: { taxa: number; unsourced: number } }).plants;
      expect(r.card.plantCount).toBe(p.taxa + p.unsourced);
    }
  });

  it('names a project in a county, not a place, by its county', () => {
    const { index } = buildData({ dataRoot: FIXTURES });
    for (const r of index.records.filter((x) => x.type === 'project')) expect(r.card.place).toMatch(/, (WA|OR|CA)$/);
  });
});
