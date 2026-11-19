import { describe, expect, it } from 'vitest';
import { buildData } from '../lib/build-data';
import { applyQuery, emptyQuery, mapPosition, mapUrl, parseQuery, serializeQuery, viewUrl, withMapPosition, type Query } from '../lib/filter';
import { detailFeatures, featureBounds, inView, mapResults, projectFeatures, regionUse, unplaced, type Bounds } from '../lib/map-data';
import { BASE } from '../lib/site';
import type { IndexRecord } from '../lib/types';
import { FIXTURES } from './helpers';

/** The map view's reading of the results (spec/v1/map.md, #30): what is drawn, how big, and what is in view. */

const index = buildData({ dataRoot: FIXTURES }).index;
const records = index.records;
const run = (filters: Record<string, string[]>, q = ''): { query: Query; results: IndexRecord[] } => {
  const query = { ...emptyQuery(), q, filters };
  return { query, results: applyQuery(records, query, null) };
};
const drawnFor = (filters: Record<string, string[]>) => {
  const { results } = run(filters);
  return { results, drawn: mapResults(results, records, filters) };
};
const WORLD: Bounds = [-180, -90, 180, 90];
/** Around the Washington–Oregon line at Walla Walla, where two fixture projects sit 120 m apart. */
const STATELINE: Bounds = [-118.5, 45.9, -118.3, 46.1];

describe('project cards', () => {
  it('carry the quantity of each plant the list refs, summed over its lines', () => {
    const p = records.find((r) => r.key === 'project/umatilla-bank-restoration')!;
    expect(p.card.quantities).toEqual({ 'plant/achillea-millefolium': 400, 'plant/camassia-quamash': 800 });
  });
});

describe('mapResults', () => {
  it('draws every located project in the results, unsized', () => {
    const { drawn } = drawnFor({ type: ['project'] });
    expect(drawn.projects.size).toBe(records.filter((r) => r.type === 'project').length);
    expect([...drawn.projects.values()].every((v) => v.quantity === undefined)).toBe(true);
    expect(drawn.nativeStates).toBeUndefined();
  });

  it('draws the projects listing a plant in the results, with the matching quantity', () => {
    const { drawn } = drawnFor({ type: ['plant'], 'plant.genus': ['Achillea'] });
    expect(Object.fromEntries(drawn.projects)).toEqual({
      'project/stateline-orchard-campus': { quantity: 250 },
      'project/umatilla-bank-restoration': { quantity: 400 },
    });
  });

  it('sums the quantity of every matching plant a project lists', () => {
    const filters = { type: ['plant'], 'plant.usedOn': ['project/umatilla-bank-restoration'] };
    const { drawn } = drawnFor(filters);
    expect(drawn.projects.get('project/umatilla-bank-restoration')).toEqual({ quantity: 1200 });
    expect(drawn.projects.get('project/stateline-orchard-campus')).toEqual({ quantity: 650 });
  });

  it('draws only the projects that meet the project filters, through which a plant met them (D39)', () => {
    const filters = { type: ['plant'], 'plant.genus': ['Achillea'], 'project.state': ['OR'] };
    const { results, drawn } = drawnFor(filters);
    expect(results.map((r) => r.key)).toContain('plant/achillea-millefolium');
    expect([...drawn.projects.keys()]).toEqual(['project/umatilla-bank-restoration']);
  });

  it('gives a single plant’s native states, and none for several plants', () => {
    expect(drawnFor({ type: ['plant'], 'plant.genus': ['Garrya'] }).drawn.nativeStates).toEqual(['OR', 'CA']);
    expect(drawnFor({ type: ['plant'] }).drawn.nativeStates).toBeUndefined();
  });

  it('gives an empty native range for a single plant with none recorded', () => {
    const none = records.find((r) => r.type === 'plant' && !r.facets['plant.nativeTo']);
    if (!none) return;
    const results = [none];
    expect(mapResults(results, records, {}).nativeStates).toEqual([]);
  });
});

describe('projectFeatures', () => {
  it('sizes drawn projects by the square root of quantity, the largest at 1', () => {
    const { drawn } = drawnFor({ type: ['plant'], 'plant.genus': ['Achillea'] });
    const fs = projectFeatures(records, drawn).features;
    expect(fs.map((f) => f.properties.key).sort()).toEqual(['project/stateline-orchard-campus', 'project/umatilla-bank-restoration']);
    const size = Object.fromEntries(fs.map((f) => [f.properties.key, f.properties.size]));
    expect(size['project/umatilla-bank-restoration']).toBe(1);
    expect(size['project/stateline-orchard-campus']).toBeCloseTo(Math.sqrt(250 / 400));
  });

  it('draws every project, unsized, without a result set', () => {
    const fs = projectFeatures(records).features;
    expect(fs.length).toBe(records.filter((r) => r.type === 'project').length);
    expect(fs.every((f) => f.properties.size === undefined)).toBe(true);
  });
});

describe('the results in view', () => {
  it('holds projects inside the bounds and plants with a drawn project inside them', () => {
    const { results, drawn } = drawnFor({});
    const keys = inView(results, records, drawn, STATELINE).map((r) => r.key);
    expect(keys).toContain('project/umatilla-bank-restoration');
    expect(keys).toContain('plant/achillea-millefolium');
    expect(keys).not.toContain('project/mirada-terraces');
    expect(keys).not.toContain('plant/garrya-elliptica');
  });

  it('keeps the results’ order', () => {
    const { results, drawn } = drawnFor({});
    const seen = inView(results, records, drawn, WORLD);
    const order = results.filter((r) => seen.includes(r));
    expect(seen).toEqual(order);
  });

  it('a plant on no drawn project is unplaced', () => {
    const { results, drawn } = drawnFor({ type: ['plant'] });
    const away = unplaced(results, drawn).map((r) => r.key);
    const listed = new Set(records.filter((r) => r.type === 'project').flatMap((p) => Object.keys(p.card.quantities as object)));
    expect(away.length).toBeGreaterThan(0);
    for (const k of away) expect(listed.has(k)).toBe(false);
    expect(inView(results, records, drawn, WORLD).length + away.length).toBe(results.length);
  });
});

describe('map position in the URL', () => {
  it('reads center and zoom', () => {
    expect(mapPosition(parseQuery('center=-122.5,45.5&zoom=7'))).toEqual({ center: [-122.5, 45.5], zoom: 7 });
  });

  it('ignores a missing or malformed position', () => {
    for (const q of ['', 'zoom=7', 'center=-122.5,45.5', 'center=abc&zoom=7', 'center=-122.5&zoom=7', 'center=-200,45&zoom=7', 'center=-122,45&zoom=x']) {
      expect(mapPosition(parseQuery(q)), q).toBeUndefined();
    }
  });

  it('writes a rounded position beside the filters, which keep their place', () => {
    const q = withMapPosition(parseQuery('plant.form=tree'), { center: [-122.123456789, 45.987654321], zoom: 7.33333 });
    expect(serializeQuery(q)).toBe('?plant.form=tree&center=-122.1235%2C45.9877&zoom=7.33');
    expect(mapPosition(parseQuery(serializeQuery(q)))).toEqual({ center: [-122.1235, 45.9877], zoom: 7.33 });
  });

  it('the view switch keeps the whole query string', () => {
    const q = parseQuery('q=maple&plant.form=tree&center=-122,45&zoom=6&sort=height');
    expect(viewUrl(q, 'map')).toBe(`${BASE}map/${serializeQuery(q)}`);
    expect(viewUrl(q, 'list')).toBe(`${BASE}${serializeQuery(q)}`);
    expect(parseQuery(viewUrl(q, 'map').split('?')[1])).toEqual(q);
  });

  it('drops the old `view` parameter: the page is the view', () => {
    expect(serializeQuery(parseQuery('view=map&plant.form=tree'))).toBe('?plant.form=tree');
  });
});

describe('small maps on detail pages (#32)', () => {
  it('a project page draws its own point, unsized, and opens on it', () => {
    const p = records.find((r) => r.key === 'project/umatilla-bank-restoration')!;
    const fc = detailFeatures(p.key, records);
    expect(fc.features.map((f) => f.properties.key)).toEqual([p.key]);
    expect(fc.features[0].properties.quantity).toBeUndefined();
    const [lon, lat] = p.card.location as [number, number];
    expect(featureBounds(fc)).toEqual([lon, lat, lon, lat]);
  });

  it('a plant page draws the projects listing it, sized by the quantity of it each lists, as the map view draws it alone', () => {
    const plant = records.find((r) => r.key === 'plant/camassia-quamash')!;
    const fc = detailFeatures(plant.key, records);
    expect(fc).toEqual(projectFeatures(records, mapResults([plant], records, {})));
    expect(fc.features.map((f) => f.properties.key).sort()).toEqual([...(plant.links?.project ?? [])].sort());
    expect(fc.features.find((f) => f.properties.key === 'project/umatilla-bank-restoration')!.properties.quantity).toBe(800);
    expect(Math.max(...fc.features.map((f) => f.properties.size ?? 0))).toBe(1);
  });

  it('opens on the box around the points drawn, and on nothing without any', () => {
    const fc = detailFeatures('plant/camassia-quamash', records);
    const [w, s, e, n] = featureBounds(fc)!;
    for (const f of fc.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon >= w && lon <= e && lat >= s && lat <= n).toBe(true);
    }
    const unused = records.find((r) => r.type === 'plant' && !(r.links?.project ?? []).length)!;
    expect(detailFeatures(unused.key, records).features).toEqual([]);
    expect(featureBounds(detailFeatures(unused.key, records))).toBeUndefined();
  });

  it('a region name links to the map view with the same filter as its Library link', () => {
    const filters = { 'project.county': ['41059'] };
    expect(mapUrl(filters)).toBe(viewUrl(parseQuery(serializeQuery({ ...emptyQuery(), filters })), 'map'));
    expect(mapUrl(filters)).toBe(`${BASE}map/?project.county=41059`);
  });
});

describe('regionUse (the use choropleth)', () => {
  it('counts the drawn projects listing a matching plant by region, with their quantity and the projects behind them', () => {
    const one = mapResults(records.filter((r) => r.key === 'plant/garrya-elliptica'), records, {});
    expect(regionUse(one, records, 'project.state')).toEqual({
      regions: [
        { id: 'CA', projects: 1, quantity: 6 },
        { id: 'WA', projects: 1, quantity: 12 },
      ],
      projects: 2,
    });
    expect(regionUse(one, records, 'project.county').regions.map((r) => r.id)).toEqual(['06037', '53061']);
    // Every shrub at once: a region's count is its projects, once each, whatever the number of matching plants on them.
    const { drawn } = drawnFor({ 'plant.form': ['shrub'] });
    const all = regionUse(drawn, records, 'project.state');
    expect(all.projects).toBeGreaterThan(2);
    expect(all.regions.reduce((n, r) => n + r.projects, 0)).toBe(all.projects);
  });

  it('has nothing to show without plants in the results', () => {
    const { drawn } = drawnFor({ type: ['project'] });
    expect(regionUse(drawn, records, 'project.state')).toEqual({ regions: [], projects: 0 });
  });

  it('a box narrows it to the projects inside', () => {
    const plant = records.filter((r) => r.key === 'plant/garrya-elliptica');
    const ca: Bounds = [-119, 33.5, -117.5, 34.5];
    expect(regionUse(mapResults(plant, records, {}, ca), records, 'project.state')).toEqual({ regions: [{ id: 'CA', projects: 1, quantity: 6 }], projects: 1 });
  });
});
