import { describe, expect, it } from 'vitest';
import { deriveGeo } from '../lib/derive';
import { contains, decodeLayer, featureAt, type GeoFeature } from '../lib/geo';
import { loadGeo } from '../lib/geo-load';
import type { Topology } from 'topojson-specification';

const geo = loadGeo();
const at = (lat: number, lon: number) => deriveGeo({ lat, lon }, geo);

describe('boundary layers', () => {
  it('hold the three states, their counties, places, and ecoregions', () => {
    expect(geo.states.map((s) => s.id).sort()).toEqual(['CA', 'OR', 'WA']);
    expect(geo.states.find((s) => s.id === 'WA')?.name).toBe('Washington');
    expect(geo.counties).toHaveLength(58 + 36 + 39);
    expect(new Set(geo.counties.map((c) => c.props.state))).toEqual(new Set(['CA', 'OR', 'WA']));
    expect(geo.places.length).toBeGreaterThan(2000);
    expect(new Set(geo.places.map((p) => p.props.kind))).toEqual(new Set(['incorporated', 'cdp']));
    expect(geo.ecoregions.find((e) => e.id === '2')?.name).toBe('Puget Lowland');
    for (const e of geo.ecoregions) expect(e.id).toMatch(/^[0-9]{1,3}$/);
  });
});

describe('point in polygon', () => {
  // A 4×4 square with a 2×2 hole.
  const topo: Topology = {
    type: 'Topology',
    arcs: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]],
    ],
    objects: { t: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0], [1]], properties: { id: 'x', name: 'Square', kind: 'test' } }] } },
  };
  const [sq] = decodeLayer(topo) as [GeoFeature];

  it('decodes ids, names, other properties, and a bounding box', () => {
    expect(sq.id).toBe('x');
    expect(sq.name).toBe('Square');
    expect(sq.props).toEqual({ kind: 'test' });
    expect(sq.bbox).toEqual([0, 0, 4, 4]);
  });

  it('counts the shell and excludes holes', () => {
    expect(contains(sq, 0.5, 0.5)).toBe(true);
    expect(contains(sq, 2, 2)).toBe(false);
    expect(contains(sq, 5, 2)).toBe(false);
    expect(featureAt([sq], 3.5, 3.5)?.id).toBe('x');
  });
});

describe('geography derivation', () => {
  it('a city point gets every layer', () => {
    // Downtown Seattle.
    expect(at(47.6062, -122.3321)).toEqual({ state: 'WA', county: '53033', place: '5363000', ecoregion: '2' });
  });

  it('an unincorporated point has no place', () => {
    // The summit of Mount Rainier.
    expect(at(46.85287, -121.76044)).toEqual({ state: 'WA', county: '53053', ecoregion: '4' });
  });

  it('a point outside the three states derives nothing', () => {
    expect(at(39.5296, -119.8138)).toEqual({}); // Reno, Nevada
    expect(at(45.5, -126.5)).toEqual({}); // the Pacific, beyond state waters
    expect(at(49.2827, -123.1207)).toEqual({}); // Vancouver, British Columbia
  });

  // Pairs of points about 60 m (200 ft) either side of a boundary, placed and
  // checked against the unsimplified Census and EPA lines (D30). The layers are
  // simplified to 20 m, so these must hold.
  const borders: [string, number, number, Partial<Record<'state' | 'county' | 'place' | 'ecoregion', string>>][] = [
    ['WA–OR state line on land: Walla Walla side', 46.00129, -118.39968, { state: 'WA', county: '53071' }],
    ['WA–OR state line on land: Umatilla side', 46.00022, -118.39968, { state: 'OR', county: '41059' }],
    ['OR–CA state line: Del Norte side', 41.99961, -123.60009, { state: 'CA', county: '06015' }],
    ['OR–CA state line: Josephine side', 42.00069, -123.60012, { state: 'OR', county: '41033' }],
    ['King–Snohomish line: Snohomish side', 47.77699, -122.19964, { state: 'WA', county: '53061' }],
    ['King–Snohomish line: King side', 47.77591, -122.19965, { state: 'WA', county: '53033' }],
    ['Los Angeles–Orange line: Orange side', 33.8729, -118.01141, { state: 'CA', county: '06059' }],
    ['Los Angeles–Orange line: Los Angeles side', 33.87398, -118.01141, { state: 'CA', county: '06037' }],
    ['Multnomah–Washington line: Washington side', 45.51899, -122.75273, { state: 'OR', county: '41067' }],
    ['Multnomah–Washington line: Multnomah side', 45.52007, -122.75273, { state: 'OR', county: '41051' }],
    ['Seattle–Shoreline line: Shoreline side', 47.73456, -122.31945, { place: '5363960' }],
    ['Seattle–Shoreline line: Seattle side', 47.73348, -122.31947, { place: '5363000' }],
    ['Puget Lowland–Cascades line: Cascades side', 47.41753, -121.90177, { ecoregion: '4' }],
    ['Puget Lowland–Cascades line: Puget Lowland side', 47.41656, -121.90109, { ecoregion: '2' }],
  ];
  for (const [label, lat, lon, expected] of borders) {
    it(`near a border: ${label}`, () => {
      expect(at(lat, lon)).toMatchObject(expected);
    });
  }

  it("a point's county is always in its state", () => {
    for (const c of geo.counties) {
      const state = geo.states.find((s) => s.id === c.props.state)!;
      const [x0, y0, x1, y1] = c.bbox;
      const lon = (x0 + x1) / 2;
      const lat = (y0 + y1) / 2;
      if (contains(c, lon, lat)) expect(contains(state, lon, lat)).toBe(true);
    }
  });
});
