import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import {
  applyQuery,
  clearFilters,
  emptyQuery,
  facetCounts,
  parseQuery,
  pickedRegions,
  pickRegion,
  serializeQuery,
  toggleValue,
  viewUrl,
  withBbox,
  type Bounds,
  type Query,
} from '../lib/filter';
import { mapResults } from '../lib/map-data';
import { loadOverlays } from '../lib/overlays-load';
import { BASE } from '../lib/site';
import { FIXTURES } from './helpers';

/** Region filters from the map (spec/v1/map.md#region-filters, #31): picking and the box give the same URL state the tree does. */

const index = buildData({ dataRoot: FIXTURES }).index;
const records = index.records;
const facets = index.facets;
const overlays = Object.fromEntries(loadOverlays().map((o) => [o.id, o.facets ?? {}]));
const keys = (q: Query) => applyQuery(records, q, null).map((r) => r.key);
/** The query the page holds after following a link to it. */
const reload = (href: string) => parseQuery(href.slice(href.indexOf('?')));

const KING = '53033';
/** Seattle and Bellevue: two King County projects, and not Bothell's. */
const SEATTLE: Bounds = [-122.4, 47.5, -122.1, 47.7];

describe('picking a region', () => {
  it('sets the same filter value as checking it in the tree', () => {
    const q = emptyQuery();
    expect(pickRegion(q, overlays.counties, KING, facets)).toEqual(toggleValue(q, 'project.county', KING));
    expect(pickRegion(q, overlays.states, 'OR', facets)).toEqual(toggleValue(q, 'project.state', 'OR'));
    expect(pickRegion(q, overlays.ecoregions, '2', facets)).toEqual(toggleValue(q, 'project.ecoregion', '2'));
  });

  it('a county picked on the map shows checked in the tree after switching to the list', () => {
    const picked = pickRegion(emptyQuery(), overlays.counties, KING, facets);
    const href = viewUrl(picked, 'list');
    expect(href).toBe(`${BASE}?project.county=${KING}`);
    const list = reload(href);
    expect(list.filters['project.county']).toEqual([KING]);
    expect(serializeQuery(list)).toBe(serializeQuery(toggleValue(emptyQuery(), 'project.county', KING)));
  });

  it('several regions can be picked, and are ORed as tree values are', () => {
    let q = pickRegion(emptyQuery(), overlays.counties, KING, facets);
    q = pickRegion(q, overlays.counties, '53061', facets);
    expect(q.filters['project.county']!.sort()).toEqual([KING, '53061'].sort());
    expect(keys(q).filter((k) => k.startsWith('project/')).sort()).toEqual(['project/bellevue-grove-park', 'project/bothell-main-street', 'project/pine-street-trees']);
  });

  it('a second pick of a region unpicks it, whichever of its facets the tree set', () => {
    const picked = pickRegion(emptyQuery(), overlays.counties, KING, facets);
    expect(pickRegion(picked, overlays.counties, KING, facets)).toEqual(emptyQuery());
    const fromTree = toggleValue(emptyQuery(), 'plant.usedInCounty', KING);
    expect(pickRegion(fromTree, overlays.counties, KING, facets)).toEqual(emptyQuery());
  });

  it('applies to projects by location and to plants by where they are used (D39)', () => {
    const q = pickRegion(emptyQuery(), overlays.counties, '41059', facets);
    expect(keys(q).sort()).toEqual(['plant/achillea-millefolium', 'plant/camassia-quamash', 'project/umatilla-bank-restoration']);
  });

  it('a region no entry is in leaves the query as it is', () => {
    const q = toggleValue(emptyQuery(), 'plant.form', 'tree');
    expect(pickRegion(q, overlays.counties, '41001', facets)).toBe(q);
  });

  it('the map draws as picked the regions the filters hold, under any of the overlay’s facets', () => {
    const q = toggleValue(toggleValue(emptyQuery(), 'project.county', KING), 'plant.usedInCounty', '53061');
    expect(pickedRegions(q, overlays.counties).sort()).toEqual([KING, '53061']);
    expect(pickedRegions(q, overlays.states)).toEqual([]);
  });
});

describe('the box filter', () => {
  it('is held in the URL as bbox, rounded, beside the filters and the map position', () => {
    const q = withBbox({ ...emptyQuery(), filters: { type: ['project'] }, extra: { zoom: '8', center: '-122.3,47.6' } }, [-122.400001, 47.5, -122.1, 47.7]);
    expect(serializeQuery(q)).toBe('?type=project&bbox=-122.4%2C47.5%2C-122.1%2C47.7&center=-122.3%2C47.6&zoom=8');
    expect(reload(serializeQuery(q))).toEqual(q);
  });

  it('takes the corners in either order, as a drag gives them', () => {
    expect(withBbox(emptyQuery(), [-122.1, 47.7, -122.4, 47.5]).bbox).toEqual(SEATTLE);
  });

  it('ignores a malformed or empty box', () => {
    for (const v of ['1,2,3', 'a,b,c,d', '-122,47,-123,48', '-122,48,-121,47', '-200,40,-100,50', '']) expect(parseQuery(`?bbox=${v}`).bbox).toBeUndefined();
    expect(withBbox(emptyQuery(), [-122, 47, -122, 48]).bbox).toBeUndefined();
  });

  it('carries over to the list view, and clears with the filters', () => {
    const q = withBbox(emptyQuery(), SEATTLE);
    expect(reload(viewUrl(q, 'list')).bbox).toEqual(SEATTLE);
    expect(clearFilters(q).bbox).toBeUndefined();
    expect(withBbox(q, undefined)).toEqual(emptyQuery());
  });

  it('holds the projects inside it and the plants used on them', () => {
    const q = withBbox(emptyQuery(), SEATTLE);
    const got = keys(q);
    expect(got.filter((k) => k.startsWith('project/')).sort()).toEqual(['project/bellevue-grove-park', 'project/pine-street-trees']);
    expect(got).toContain('plant/pinus-contorta-var-contorta');
    expect(got).toContain('plant/thuja-plicata');
    expect(got).not.toContain('plant/achillea-millefolium');
  });

  it('a plant meets it through a project that also meets the project filters', () => {
    // Pinus is on Pine Street (in the box, King County) and Stateline (Walla Walla County, outside it).
    const county = toggleValue(emptyQuery(), 'project.county', '53071');
    expect(keys(county)).toContain('plant/pinus-contorta-var-contorta');
    expect(keys(withBbox(county, SEATTLE))).not.toContain('plant/pinus-contorta-var-contorta');
  });

  it('counts facet values within the box: each value counts what checking it would leave', () => {
    const q = withBbox(emptyQuery(), SEATTLE);
    const counts = facetCounts(records, facets, q, null);
    for (const county of [KING, '53061', '41059']) expect(counts['project.county'][county]).toBe(keys(toggleValue(q, 'project.county', county)).length);
    expect(counts['project.county'][KING]).toBeGreaterThan(0);
    expect(counts['project.county']['53061']).toBe(0);
    expect(counts.type.plant).toBe(keys(toggleValue(q, 'type', 'plant')).length);
  });

  it('draws only the projects inside it for the plants in the results', () => {
    const q = withBbox(toggleValue(emptyQuery(), 'type', 'plant'), SEATTLE);
    const results = applyQuery(records, q, null);
    const drawn = mapResults(results, records, q.filters, q.bbox);
    expect([...drawn.projects.keys()].sort()).toEqual(['project/bellevue-grove-park', 'project/pine-street-trees']);
    expect(drawn.plantProjects.get('plant/pinus-contorta-var-contorta')).toEqual(['project/pine-street-trees']);
  });
});
