import { describe, expect, it } from 'vitest';
import MiniSearch from 'minisearch';
import { buildData } from '../lib/build-data';
import { applyQuery, emptyQuery, facetCounts, parseQuery, serializeQuery, sortOptions, sortRecords, toggleValue, clearFilters, matches } from '../lib/filter';
import { facetValues } from '../lib/facets';
import { TYPES } from '../lib/registry';
import type { FacetDef, IndexRecord, LibraryIndex } from '../lib/types';
import { BASE } from '../lib/site';
import { FIXTURES } from './helpers';

const data = buildData({ dataRoot: FIXTURES });
const index = data.index;
const keys = (rs: IndexRecord[]) => rs.map((r) => r.key);

function search(ix: LibraryIndex, q: string): string[] {
  const ms = new MiniSearch<IndexRecord>({
    idField: 'key',
    fields: [...ix.searchFields.boosted, ...ix.searchFields.fields],
    extractField: (doc, f) => (f === 'key' ? doc.key : doc.search[f] ?? ''),
    searchOptions: { boost: Object.fromEntries(ix.searchFields.boosted.map((f) => [f, 3])), prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  });
  ms.addAll(ix.records);
  return ms.search(q).map((r) => String(r.id));
}

describe('the index', () => {
  it('is byte-identical across two builds', () => {
    expect(JSON.stringify(buildData({ dataRoot: FIXTURES }).index)).toBe(JSON.stringify(index));
  });

  it('computes back-references from refs', () => {
    const fire = index.records.find((r) => r.key === 'plant/acer-circinatum-pacific-fire')!;
    expect(fire.refBy).toEqual(['plant/acer-circinatum']);
  });

  it('carries the pinned image as the thumbnail, and none when there is no image', () => {
    expect(index.records.find((r) => r.id === 'acer-circinatum')!.thumb!.src).toBe(`${BASE}assets/images/plant/acer-circinatum/1.jpg`);
    expect(index.records.find((r) => r.id === 'achillea-millefolium')!.thumb).toBeUndefined();
  });

  it('lists only facet values that occur, in vocabulary order', () => {
    const form = index.facets.find((f) => f.key === 'plant.form')!;
    expect(form.values.map((v) => v.id)).toEqual(['tree', 'shrub', 'subshrub', 'perennial', 'graminoid', 'fern', 'bulb']);
  });
});

describe('facet kinds', () => {
  const height: FacetDef = { id: 'height', label: 'Height', kind: 'range', path: 'data.height', buckets: [{ id: 'a', label: '', max: 3 }, { id: 'b', label: '', min: 3, max: 6 }, { id: 'c', label: '', min: 6 }] };
  it('a range is in each bucket it overlaps, not one it only touches', () => {
    expect(facetValues(height, { data: { height: { min: 3, max: 6 } } })).toEqual(['b']);
    expect(facetValues(height, { data: { height: { min: 2, max: 8 } } })).toEqual(['a', 'b', 'c']);
    expect(facetValues(height, { data: { height: { min: 6, max: 6 } } })).toEqual(['c']);
  });
  it('zones, months, and pairs', () => {
    expect(facetValues({ id: 'z', label: '', kind: 'zones', path: 'h' }, { h: { min: '8b', max: '9' } })).toEqual(['8b', '9a', '9b']);
    expect(facetValues({ id: 'm', label: '', kind: 'months', path: 'b' }, { b: { start: 12, end: 1 } })).toEqual(['12', '1']);
    expect(facetValues({ id: 'w', label: '', kind: 'pairs', path: 'w' }, { w: { WMVC: 'FAC' } })).toEqual(['WMVC:FAC']);
  });
  it('a missing value has no facet values', () => {
    expect(facetValues(height, { data: {} })).toEqual([]);
  });
});

describe('the query', () => {
  it('round-trips through the URL in canonical form', () => {
    const q = parseQuery('?plant.sun=shade&q=maple&plant.sun=part-shade&sort=height&zoom=7');
    expect(q.filters).toEqual({ 'plant.sun': ['shade', 'part-shade'] });
    expect(q.extra).toEqual({ zoom: '7' });
    expect(serializeQuery(q)).toBe('?q=maple&plant.sun=part-shade&plant.sun=shade&sort=height&zoom=7');
    expect(serializeQuery(parseQuery(serializeQuery(q)))).toBe(serializeQuery(q));
    expect(serializeQuery(emptyQuery())).toBe('');
  });

  it('toggles and clears values', () => {
    let q = toggleValue(emptyQuery(), 'plant.form', 'tree');
    q = toggleValue(q, 'plant.form', 'shrub');
    expect(q.filters['plant.form']).toEqual(['tree', 'shrub']);
    q = toggleValue(q, 'plant.form', 'tree');
    expect(q.filters['plant.form']).toEqual(['shrub']);
    expect(clearFilters(q).filters).toEqual({});
  });

  it('values in a facet are OR; facets are AND', () => {
    const or = applyQuery(index.records, parseQuery('?plant.form=fern&plant.form=bulb'), null);
    expect(keys(or).sort()).toEqual(['plant/camassia-quamash', 'plant/polystichum-munitum']);
    const and = applyQuery(index.records, parseQuery('?plant.form=shrub&plant.sun=shade'), null);
    expect(keys(and).sort()).toEqual(['plant/gaultheria-shallon', 'plant/mahonia-nervosa']);
  });

  it('an entry missing a value never matches a filter on it', () => {
    const r = index.records.find((x) => x.id === 'pinus-contorta-var-contorta')!;
    expect(r.facets['plant.bloomColor']).toBeUndefined();
    expect(matches(r, { 'plant.bloomColor': ['white', 'red', 'yellow'] })).toBe(false);
  });

  it('case: evergreen shrubs under 6 ft for part shade and moist soil, hardy in 8b, native to Washington', () => {
    const q = parseQuery('?plant.form=shrub&plant.foliage=evergreen&plant.height=0-1&plant.height=1-3&plant.height=3-6&plant.sun=part-shade&plant.moisture=moist&plant.hardiness=8b&plant.nativeTo=WA');
    // Size buckets match by overlap: Mahonia aquifolium (3–10 ft) can be kept under 6 ft, so it is in.
    expect(keys(applyQuery(index.records, q, null)).sort()).toEqual(['plant/gaultheria-shallon', 'plant/mahonia-aquifolium', 'plant/mahonia-nervosa']);
  });

  it('a wrapping bloom matches its winter months', () => {
    expect(keys(applyQuery(index.records, parseQuery('?plant.bloomMonth=1'), null))).toEqual(['plant/garrya-elliptica']);
  });

  it('counts each value given the other facets’ selections', () => {
    const q = parseQuery('?plant.form=shrub');
    const c = facetCounts(index.records, index.facets, q, null);
    expect(c['plant.form'].tree).toBe(4); // siblings keep their counts
    expect(c['plant.foliage'].evergreen).toBe(4); // shrubs only
  });

  it('sorts with missing values last', () => {
    const sorts = sortOptions(TYPES);
    const sorted = sortRecords(index.records, 'height', sorts, null);
    expect(sorted[0].id).toBe('arctostaphylos-uva-ursi');
    const byBloom = sortRecords(index.records.filter((r) => r.id === 'achillea-millefolium' || r.id === 'pinus-contorta-var-contorta'), 'common', sorts, null);
    expect(byBloom.map((r) => r.id)).toEqual(['achillea-millefolium', 'pinus-contorta-var-contorta']);
  });
});

describe('search', () => {
  it('"Oregon grape" and "Berberis" both find the Mahonias', () => {
    expect(search(index, 'Oregon grape').sort()).toEqual(['plant/mahonia-aquifolium', 'plant/mahonia-nervosa']);
    expect(search(index, 'Berberis').sort()).toEqual(['plant/mahonia-aquifolium', 'plant/mahonia-nervosa']);
  });

  it('finds a trade name and a family', () => {
    expect(search(index, 'Knock Out')).toEqual(['plant/rosa-radrazz']);
    expect(search(index, 'Cyperaceae')).toEqual(['plant/carex-obnupta']);
  });

  it('narrows filters and counts to the hits', () => {
    const hits = search(index, 'maple');
    const r = applyQuery(index.records, parseQuery('?plant.foliage=deciduous'), hits);
    expect(keys(r).sort()).toEqual(['plant/acer-circinatum', 'plant/acer-circinatum-pacific-fire']);
  });
});
