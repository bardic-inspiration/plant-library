import { describe, expect, it } from 'vitest';
import MiniSearch from 'minisearch';
import { buildData } from '../lib/build-data';
import { applyQuery, emptyQuery, facetCounts, libraryUrl, parseQuery } from '../lib/filter';
import { facetValues } from '../lib/facets';
import { BASE } from '../lib/site';
import type { FacetDef, IndexRecord, LibraryIndex, PlantDerived } from '../lib/types';
import { FIXTURES } from './helpers';

/** Project facets, the plant "Used in" facets, project search, and the links detail pages build from them (spec/v1/library.md, #26). */

const data = buildData({ dataRoot: FIXTURES });
const index = data.index;
const keys = (rs: IndexRecord[]) => rs.map((r) => r.key).sort();
const filter = (filters: Record<string, string[]>) => keys(applyQuery(index.records, { ...emptyQuery(), filters }, null));
/** Projects only: project filters also reach plants (D39). */
const projects = (filters: Record<string, string[]>) => filter({ type: ['project'], ...filters });
const facet = (key: string) => index.facets.find((f) => f.key === key);

function search(ix: LibraryIndex, q: string): string[] {
  const ms = new MiniSearch<IndexRecord>({
    idField: 'key',
    fields: [...ix.searchFields.boosted, ...ix.searchFields.fields],
    extractField: (doc, f) => (f === 'key' ? doc.key : doc.search[f] ?? ''),
    searchOptions: { prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  });
  ms.addAll(ix.records);
  return ms.search(q).map((r) => String(r.id)).sort();
}

describe('project facets', () => {
  it('offer every configured facet that has values, and none that has none', () => {
    const project = index.facets.filter((f) => f.type === 'project').map((f) => f.key);
    expect(project).toEqual([
      'project.projectType',
      'project.status',
      'project.completed',
      'project.size',
      'project.landscapeArchitect',
      'project.state',
      'project.county',
      'project.place',
      'project.ecoregion',
      'project.usesPlant',
    ]);
    // Blank in every fixture (client, budget, so cost per acre) or not derived yet (zone, D33).
    for (const k of ['project.client', 'project.budget', 'project.costPerAcre', 'project.zone']) expect(facet(k), k).toBeUndefined();
  });

  it('label geography from the boundary layers and plants by name', () => {
    expect(facet('project.county')!.values.find((v) => v.id === '53033')!.label).toBe('King County, WA');
    expect(facet('project.place')!.values.find((v) => v.id === '5363000')!.label).toBe('Seattle, WA');
    expect(facet('project.ecoregion')!.values.find((v) => v.id === '2')!.label).toBe('Puget Lowland');
    expect(facet('project.usesPlant')!.values.find((v) => v.id === 'plant/pinus-contorta-var-contorta')!.label).toBe('Pinus contorta var. contorta');
  });

  it('bucket the completion year, and leave a project with no date out', () => {
    expect(projects({ 'project.completed': ['2015-2019'] })).toEqual(['project/bellevue-grove-park', 'project/stateline-orchard-campus']);
    expect(index.records.find((r) => r.key === 'project/ridge-meadow-swale')!.facets['project.completed']).toBeUndefined();
  });

  it('put a single figure in the one bucket that holds it', () => {
    const size: FacetDef = { id: 'size', label: '', kind: 'range', path: 'data.sizeAcres', buckets: [{ id: 'a', label: '', max: 1 }, { id: 'b', label: '', min: 1, max: 5 }, { id: 'c', label: '', min: 5 }] };
    expect(facetValues(size, { data: { sizeAcres: 0.8 } })).toEqual(['a']);
    expect(facetValues(size, { data: { sizeAcres: 1 } })).toEqual(['b']);
    expect(facetValues(size, { data: { sizeAcres: 12 } })).toEqual(['c']);
    expect(facetValues(size, { data: {} })).toEqual([]);
  });

  it('filter by architect and by location', () => {
    expect(projects({ 'project.landscapeArchitect': ['Example Studio'] })).toEqual(['project/mirada-terraces', 'project/pine-street-trees']);
    expect(projects({ 'project.county': ['53033'] })).toEqual(['project/bellevue-grove-park', 'project/pine-street-trees']);
    expect(projects({ 'project.county': ['53033'], 'project.projectType': ['streetscape'] })).toEqual(['project/pine-street-trees']);
  });
});

describe('cross-type filters', () => {
  it('Uses plant narrows projects to those whose lists include the chosen plants', () => {
    expect(projects({ 'project.usesPlant': ['plant/thuja-plicata'] })).toEqual(['project/bothell-main-street', 'project/pine-street-trees']);
    // Values in a facet combine as OR.
    expect(projects({ 'project.usesPlant': ['plant/thuja-plicata', 'plant/carex-obnupta'] })).toEqual([
      'project/bothell-main-street',
      'project/pine-street-trees',
      'project/ridge-meadow-swale',
    ]);
  });

  it('Uses plant ignores unsourced text that names a plant', () => {
    // ridge-meadow-swale lists "Elymus glaucus" as text; no plant entry, so no value.
    expect(index.records.find((r) => r.key === 'project/ridge-meadow-swale')!.facets['project.usesPlant']).toEqual(['plant/carex-obnupta']);
  });

  it('the filter case: trees used on streetscape projects in King County', () => {
    const q = { type: ['plant'], 'plant.form': ['tree'], 'project.projectType': ['streetscape'], 'project.county': ['53033'] };
    // pine-street-trees is the one King County streetscape; acer-circinatum, a tree only on a King County park, stays out.
    expect(filter(q)).toEqual(['plant/pinus-contorta-var-contorta', 'plant/thuja-plicata']);
    // Checked per plant rather than per project, the park would let it in.
    expect(filter({ type: ['plant'], 'plant.form': ['tree'], 'plant.usedInCounty': ['53033'] })).toContain('plant/acer-circinatum');
  });

  it('project filters reach a plant only through one project meeting all of them', () => {
    // thuja-plicata is on a King County streetscape and a Snohomish one; the King County park lists neither tree.
    expect(filter({ type: ['plant'], 'project.projectType': ['park'], 'project.county': ['53061'] })).toEqual([]);
    expect(filter({ type: ['plant'], 'project.projectType': ['streetscape'], 'project.county': ['53061'] })).toEqual([
      'plant/gaultheria-shallon',
      'plant/polystichum-munitum',
      'plant/thuja-plicata',
    ]);
    // A plant on no project never meets a project filter.
    expect(filter({ 'project.status': ['constructed'] })).not.toContain('plant/rosa-radrazz');
  });

  it('without a type, a project filter shows the projects and the plants on them', () => {
    expect(filter({ 'project.place': ['5363000'] })).toEqual([
      'plant/mahonia-aquifolium',
      'plant/pinus-contorta-var-contorta',
      'plant/polystichum-munitum',
      'plant/thuja-plicata',
      'project/pine-street-trees',
    ]);
  });

  it('On a project narrows plants to those on the chosen projects', () => {
    expect(filter({ 'plant.usedOn': ['project/bothell-main-street'] })).toEqual(['plant/gaultheria-shallon', 'plant/polystichum-munitum', 'plant/thuja-plicata']);
    expect(facet('plant.usedOn')!.values.find((v) => v.id === 'project/pine-street-trees')!.label).toBe('Pine Street Trees');
  });

  it('counts a project value by the plants it would leave, given the other filters', () => {
    const q = { ...emptyQuery(), filters: { type: ['plant'], 'plant.form': ['tree'], 'project.county': ['53033'] } };
    const c = facetCounts(index.records, index.facets, q, null);
    // Trees on a King County streetscape: pinus and thuja; on the King County park: acer-circinatum.
    expect(c['project.projectType'].streetscape).toBe(2);
    expect(c['project.projectType'].streetscape).toBe(filter({ ...q.filters, 'project.projectType': ['streetscape'] }).length);
    expect(c['project.projectType'].park).toBe(filter({ ...q.filters, 'project.projectType': ['park'] }).length);
    // Projects are filtered out by type, so they count nowhere.
    expect(c['project.projectType'].restoration).toBe(0);
  });

  it('Used in narrows plants to those on a project in the region', () => {
    expect(filter({ type: ['plant'], 'plant.usedInCounty': ['53033'] })).toEqual([
      'plant/acer-circinatum',
      'plant/gaultheria-shallon',
      'plant/mahonia-aquifolium',
      'plant/mahonia-nervosa',
      'plant/pinus-contorta-var-contorta',
      'plant/polystichum-munitum',
      'plant/thuja-plicata',
    ]);
    expect(filter({ 'plant.usedInState': ['OR'] })).toEqual(['plant/achillea-millefolium', 'plant/camassia-quamash']);
    expect(filter({ 'plant.usedInEcoregion': ['85'] })).toEqual(['plant/arctostaphylos-uva-ursi', 'plant/garrya-elliptica']);
  });

  it("a plant's use is attached to its derived values", () => {
    const thuja = data.byKey.get('plant/thuja-plicata')!.derived as unknown as PlantDerived;
    expect(thuja.use).toMatchObject({ projects: ['project/bothell-main-street', 'project/pine-street-trees'], states: ['WA'], counties: ['53033', '53061'] });
    const unused = data.byKey.get('plant/rosa-radrazz')!.derived as unknown as PlantDerived;
    expect(unused.use!.projects).toEqual([]);
  });
});

describe('project search', () => {
  it('finds a project by name, architect, or place', () => {
    expect(search(index, 'Pine Street')).toContain('project/pine-street-trees');
    expect(search(index, 'Northfork')).toEqual(['project/bellevue-grove-park', 'project/umatilla-bank-restoration']);
    expect(search(index, 'Bothell')).toContain('project/bothell-main-street');
    expect(search(index, 'Snohomish')).toEqual(['project/bothell-main-street']);
  });

  it('searches the client field when there is one', () => {
    expect(data.library.config.types.project.search.boosted).toContain('data.client');
  });
});

describe('facet links', () => {
  it('libraryUrl builds the canonical filtered Library URL', () => {
    expect(libraryUrl({ 'project.landscapeArchitect': ['Fern & Field Landscape Architects'] })).toBe(`${BASE}?project.landscapeArchitect=Fern+%26+Field+Landscape+Architects`);
    expect(parseQuery(libraryUrl({ 'project.county': ['53033'] }).slice(BASE.length)).filters).toEqual({ 'project.county': ['53033'] });
  });

  it("every facet value on a project or plant record is a value the index offers, so a page's facet links resolve", () => {
    for (const r of index.records) {
      for (const [k, vals] of Object.entries(r.facets)) {
        const offered = new Set(facet(k)!.values.map((v) => v.id));
        for (const v of vals) expect(offered.has(v), `${r.key} ${k}=${v}`).toBe(true);
      }
    }
  });

  it('every project a plant is used on, and every plant a project uses, is an entry', () => {
    for (const r of index.records) {
      for (const k of [...(r.facets['project.usesPlant'] ?? [])]) expect(data.byKey.has(k), k).toBe(true);
      const use = (data.byKey.get(r.key)!.derived as unknown as PlantDerived).use;
      for (const k of use?.projects ?? []) expect(data.byKey.has(k), k).toBe(true);
    }
  });
});
