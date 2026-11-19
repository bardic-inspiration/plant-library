import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, GeometryObject, Topology } from 'topojson-specification';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import site from '../config/site.json' with { type: 'json' };
import { contrast } from '../lib/contrast';
import { OVERLAY_BEFORE } from '../lib/map-style';
import { loadTokens, mapBuildFor, mapStyleFor, mapTokens } from '../lib/map-style-load';
import { activeRegion, beforeLayer, choroplethLayers, choroplethPaint, choroplethSteps, layerList, overlaySource, PALETTE_PROP, pickedFilter, pickedLayers, pickLayer, stepFor, type OverlayMeta } from '../lib/overlays';
import { colorFeatures, loadOverlays } from '../lib/overlays-load';
import { overlayProblems } from '../lib/validate';
import { clone, ROOT, setup } from './helpers';

const opts = { base: site.base, basemap: site.basemap.file };
const FIXTURE_REGISTRY = 'tests/fixtures/overlays/overlays.json';
const t = mapTokens(loadTokens(ROOT));

/** The style with every overlay switched on, as the map component would add them. */
function allOn(style: StyleSpecification): StyleSpecification {
  const s = structuredClone(style);
  for (const o of layerList(s)) {
    if (!o.url && o.kind !== 'choropleth') continue;
    // A choropleth draws over its regions' sources, added above it.
    if (o.url) s.sources[overlaySource(o.id)] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    const at = s.layers.findIndex((l) => l.id === OVERLAY_BEFORE);
    s.layers.splice(at, 0, ...o.layers);
  }
  return s;
}

describe('the overlay registry', () => {
  const { config, schemas } = setup();

  it('validates', () => {
    expect(overlayProblems(config, schemas)).toEqual([]);
  });

  it('lists projects (always on), ecoregions, counties, states, and the plant-use choropleth, bottom to top', () => {
    expect(config.overlays.map((o) => o.id)).toEqual(['projects', 'ecoregions', 'counties', 'states', 'plant-use']);
    expect(config.overlays.find((o) => o.id === 'projects')?.alwaysOn).toBe(true);
  });

  it('draws the boundary overlays from the same geo/ files as derivation (P3)', () => {
    for (const o of config.overlays.filter((x) => x.data !== 'library' && x.data !== 'analysis')) expect(o.data).toBe(`geo/${o.id}.topojson`);
  });

  const problems = (change: (c: typeof config) => void) => {
    const c = clone(config);
    change(c);
    return overlayProblems(c, schemas).map((e) => e.message);
  };

  it('fails a selection facet the type does not have', () => {
    expect(problems((c) => (c.overlays[3].facets = { project: 'nope' }))).toEqual(['states: project has no facet "nope"']);
    expect(problems((c) => (c.overlays[3].facets = { tree: 'state' }))).toEqual(['states: unknown type "tree" in facets']);
  });

  it('fails a missing data file, a duplicate id, and a second projects overlay', () => {
    expect(problems((c) => (c.overlays[2].data = 'geo/nowhere.topojson'))).toEqual(['counties: no data file geo/nowhere.topojson']);
    expect(problems((c) => (c.overlays[2].id = 'states'))).toContain('duplicate overlay states');
    expect(problems((c) => c.overlays.push({ ...c.overlays[0], id: 'more-projects' }))).toEqual(['exactly one overlay draws the library\'s projects (data "library")']);
  });

  it('fails closed: an unknown key, a kind without its style, a literal color, a selectable overlay with no facet', () => {
    expect(problems((c) => Object.assign(c.overlays[3], { opacity: 1 })).join()).toContain('unknown key "opacity"');
    expect(problems((c) => delete c.overlays[3].style!.width).join()).toContain("must have required property 'width'");
    expect(problems((c) => (c.overlays[3].style!.color = '#ff0000')).join()).toContain('must match pattern');
    expect(problems((c) => delete c.overlays[3].facets).join()).toContain("must have required property 'facets'");
    expect(problems((c) => delete c.overlays[1].style!.palette).length).toBeGreaterThan(0);
  });

  it('a choropleth draws by region overlays below it that draw regions from a file, and is nothing else', () => {
    const use = (c: typeof config) => c.overlays.find((o) => o.id === 'plant-use')!;
    expect(problems((c) => (use(c).regions = ['nowhere']))).toEqual(['plant-use: unknown region overlay "nowhere"']);
    expect(problems((c) => (use(c).regions = ['projects']))).toEqual(['plant-use: region overlay "projects" draws no regions from a file']);
    expect(problems((c) => c.overlays.unshift(c.overlays.pop()!))).toContain('plant-use: region overlay "counties" must come before it in the registry, so the choropleth draws over it');
    expect(problems((c) => delete use(c).regions).join()).toContain("must have required property 'regions'");
    expect(problems((c) => delete use(c).style!.ramp).join()).toContain("must have required property 'ramp'");
    expect(problems((c) => (use(c).data = 'geo/states.topojson')).join()).toContain('must be equal to constant');
    expect(problems((c) => (c.overlays[3].kind = 'choropleth')).length).toBeGreaterThan(0);
    expect(problems((c) => (c.overlays[3].regions = ['counties'])).length).toBeGreaterThan(0);
  });
});

describe('overlays in the style', () => {
  const style = mapStyleFor(ROOT, opts);
  const list = layerList(style);

  it('ride in the metadata, and the style stays valid with every overlay on, with and without a basemap', () => {
    expect(list.map((o) => o.id)).toEqual(['projects', 'ecoregions', 'counties', 'states', 'plant-use']);
    expect(validateStyleMin(allOn(style))).toEqual([]);
    const bare = mapStyleFor(ROOT, { ...opts, publicDir: '/nonexistent' });
    expect(validateStyleMin(allOn({ ...bare, layers: [...bare.layers.slice(0, 1), { id: OVERLAY_BEFORE, type: 'background' }, ...bare.layers.slice(1)] }))).toEqual([]);
  });

  it('draw no source until switched on: the style names none of their sources', () => {
    for (const o of list) expect(Object.keys(style.sources)).not.toContain(overlaySource(o.id));
    expect(list.find((o) => o.id === 'projects')!.layers).toEqual([]);
  });

  it('take every color from a token, legends included', () => {
    const sentinel = { color: (n: string) => `token(${n})`, num: t.num };
    const traced = layerList(mapStyleFor(ROOT, { ...opts, tokens: sentinel }));
    const eco = traced.find((o) => o.id === 'ecoregions')!;
    expect(JSON.stringify(eco.layers)).toContain('token(--map-overlay-7)');
    for (const o of traced) for (const item of o.legend) expect(item.color).toMatch(/^token\(--map-/);
  });

  it('selectable overlays get the region filter’s layers: picked regions over them, and an unseen fill to pick by, colored from tokens', () => {
    const sentinel = { color: (n: string) => `token(${n})`, num: t.num };
    const traced = layerList(mapStyleFor(ROOT, { ...opts, tokens: sentinel }));
    for (const o of traced.filter((x) => x.selectable)) {
      const ids = o.layers.map((l) => l.id);
      expect(ids).toEqual(expect.arrayContaining([...pickedLayers(o.id), pickLayer(o.id)]));
      expect(ids.at(-1)).toBe(pickLayer(o.id));
      const hit = o.layers.find((l) => l.id === pickLayer(o.id))!;
      expect(hit).toMatchObject({ type: 'fill', paint: { 'fill-color': 'token(--map-selection)', 'fill-opacity': 0 } });
      for (const id of pickedLayers(o.id)) expect(o.layers.find((l) => l.id === id)).toMatchObject({ filter: pickedFilter([]) });
      for (const m of JSON.stringify(o.layers).matchAll(/"(?:fill|line)-color":"([^"]*)"/g)) expect(m[1]).toMatch(/^token\(--map-/);
    }
    expect(traced.find((o) => o.id === 'projects')!.layers).toEqual([]);
  });

  it('the ecoregion and state overlays each have a legend; ecoregions list every region by name', () => {
    const eco = list.find((o) => o.id === 'ecoregions')!;
    expect(eco.legend).toHaveLength(20);
    expect(eco.legend.map((l) => l.label)).toContain('Willamette Valley');
    expect(list.find((o) => o.id === 'states')!.legend).toEqual([{ label: 'States', color: t.color('--map-overlay-state'), mark: 'line' }]);
  });

  it('the choropleth has a fill and an edge over each of its regions’ sources, drawing nothing until the map sets its regions', () => {
    const use = list.find((o) => o.id === 'plant-use')!;
    expect(use).toMatchObject({ kind: 'choropleth', url: null, regions: ['counties', 'ecoregions', 'states'], legend: [], selectable: false });
    expect(use.ramp).toEqual([1, 2, 3].map((n) => t.color(`--map-choropleth-${n}`)));
    expect(use.layers.map((l) => l.id)).toEqual(['counties', 'ecoregions', 'states'].flatMap((r) => choroplethLayers('plant-use', r)));
    for (const l of use.layers) expect(l).toMatchObject({ source: overlaySource(l.id.split('-')[3]), filter: pickedFilter([]) });
  });

  it('labels stay readable on every overlay fill and choropleth step', () => {
    for (const n of [1, 2, 3]) {
      for (const fg of ['--map-label', '--map-label-strong']) expect(contrast(t.color(fg), t.color(`--map-choropleth-${n}`)), `${fg} on --map-choropleth-${n}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      for (const fg of ['--map-label', '--map-label-strong']) expect(contrast(t.color(fg), t.color(`--map-overlay-${n}`)), `${fg} on --map-overlay-${n}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('publishes each overlay’s data as TopoJSON keeping only id, name, and the color index', () => {
    const { files } = mapBuildFor(ROOT, opts);
    expect([...files.keys()].sort()).toEqual(['map/overlays/counties.json', 'map/overlays/ecoregions.json', 'map/overlays/states.json']);
    const counties = JSON.parse(files.get('map/overlays/counties.json')!) as Topology;
    const props = (Object.values(counties.objects)[0] as GeometryCollection).geometries.map((g) => g.properties as Record<string, unknown>);
    expect(props).toHaveLength(133);
    expect(Object.keys(props[0]).sort()).toEqual(['id', 'name']);
    expect(list.find((o) => o.id === 'counties')!.url).toBe(`${site.base}map/overlays/counties.json`);
  });
});

describe('palette overlays', () => {
  it('give no two neighboring ecoregions the same color', () => {
    const topology = JSON.parse(readFileSync(join(ROOT, 'geo', 'ecoregions.topojson'), 'utf8')) as Topology;
    const colors = colorFeatures(topology, 7);
    const geoms = (Object.values(topology.objects)[0] as GeometryCollection).geometries;
    const adj = neighbors(geoms as GeometryObject[]);
    expect(adj.some((n) => n.length > 0)).toBe(true);
    adj.forEach((ns, i) => ns.forEach((j) => expect(colors[i], `${i} and ${j}`).not.toBe(colors[j])));
  });

  it('fail rather than draw two neighbors alike when the palette is too short', () => {
    const topology = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/overlays/parks.topojson'), 'utf8')) as Topology;
    expect(() => colorFeatures(topology, 1)).toThrow(/add a color/);
    expect(colorFeatures(topology, 2).sort()).toEqual([0, 1]);
  });
});

// Spec: adding a fixture overlay file and registry entry puts it in the layer list with no code change.
describe('a new overlay is a data file and a registry entry (P4)', () => {
  const { config, schemas } = setup();
  const { style, files } = mapBuildFor(ROOT, { ...opts, overlays: FIXTURE_REGISTRY });
  const list = layerList(style);
  const parks = list.find((o) => o.id === 'park-districts');

  it('the fixture registry validates', () => {
    expect(overlayProblems({ ...config, overlays: loadOverlays(ROOT, FIXTURE_REGISTRY) }, schemas, FIXTURE_REGISTRY)).toEqual([]);
  });

  it('appears in the layer list, in registry order, with its layers and legend', () => {
    expect(list.map((o) => o.id)).toEqual(['projects', 'park-districts', 'states']);
    expect(parks).toMatchObject({ label: 'Park districts', kind: 'fill', url: `${site.base}map/overlays/park-districts.json`, alwaysOn: false, selectable: false });
    expect(parks!.layers.map((l) => l.id)).toEqual(['overlay-park-districts-fill', 'overlay-park-districts-line']);
    expect(parks!.legend.map((l) => l.label)).toEqual(['East Park District', 'West Park District']);
    expect(new Set(parks!.legend.map((l) => l.color)).size).toBe(2);
    expect(validateStyleMin(allOn(style))).toEqual([]);
  });

  it('has its data published beside the style', () => {
    const topo = JSON.parse(files.get('map/overlays/park-districts.json')!) as Topology;
    const props = (topo.objects.parks as GeometryCollection).geometries.map((g) => g.properties);
    expect(props).toEqual([{ id: 'west', name: 'West Park District', [PALETTE_PROP]: expect.any(Number) }, { id: 'east', name: 'East Park District', [PALETTE_PROP]: expect.any(Number) }]);
  });
});

describe('overlay order on the map', () => {
  const meta = (id: string): OverlayMeta => ({ id, label: id, kind: 'fill', url: `/${id}.json`, layers: [{ id: `overlay-${id}-fill`, type: 'fill', source: `overlay-${id}` }], legend: [], alwaysOn: false, selectable: false, facets: {} });
  const list = ['a', 'b', 'c'].map(meta);

  it('keeps registry order whatever order overlays are switched on in', () => {
    expect(beforeLayer(list, 'a', () => false, 'water')).toBe('water');
    expect(beforeLayer(list, 'a', (id) => id === 'overlay-c-fill', 'water')).toBe('overlay-c-fill');
    expect(beforeLayer(list, 'b', (id) => id !== 'overlay-b-fill', 'water')).toBe('overlay-c-fill');
    expect(beforeLayer(list, 'c', () => true, 'water')).toBe('water');
  });
});

describe('the use choropleth', () => {
  const ramp = ['c1', 'c2', 'c3', 'c4', 'c5'];

  it('gives each count a step of its own while they fit, the darkest to the highest', () => {
    expect(choroplethSteps(0, ramp)).toEqual([]);
    expect(choroplethSteps(1, ramp)).toEqual([{ min: 1, max: 1, color: 'c5' }]);
    expect(choroplethSteps(3, ramp)).toEqual([
      { min: 1, max: 1, color: 'c3' },
      { min: 2, max: 2, color: 'c4' },
      { min: 3, max: 3, color: 'c5' },
    ]);
  });

  it('groups counts in whole-number steps past the ramp', () => {
    const steps = choroplethSteps(12, ramp);
    expect(steps.map((s) => [s.min, s.max])).toEqual([[1, 3], [4, 6], [7, 9], [10, 12]]);
    expect(steps.map((s) => s.color)).toEqual(['c2', 'c3', 'c4', 'c5']);
    expect(stepFor(steps, 5)?.color).toBe('c3');
    expect(choroplethSteps(11, ramp).at(-1)).toEqual({ min: 10, max: 11, color: 'c5' });
  });

  it('draws only regions with a count, each in its step', () => {
    const steps = choroplethSteps(2, ramp);
    const { filter, color } = choroplethPaint([{ id: 'WA', value: 2 }, { id: 'OR', value: 1 }, { id: 'CA', value: 0 }], steps);
    expect(filter).toEqual(pickedFilter(['WA', 'OR']));
    expect(color).toEqual(['match', ['get', 'id'], 'WA', 'c5', 'OR', 'c4', 'c4']);
    expect(choroplethPaint([], []).filter).toEqual(pickedFilter([]));
  });

  it('draws by the first of its regions that is on, else the last', () => {
    const def = { regions: ['counties', 'ecoregions', 'states'] };
    expect(activeRegion(def, [])).toBe('states');
    expect(activeRegion(def, ['states', 'ecoregions'])).toBe('ecoregions');
    expect(activeRegion(def, ['ecoregions', 'counties'])).toBe('counties');
  });
});
