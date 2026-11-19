import { describe, expect, it } from 'vitest';
import { Color, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import Supercluster from 'supercluster';
import site from '../config/site.json' with { type: 'json' };
import vocab from '../config/vocab.json' with { type: 'json' };
import { buildData } from '../lib/build-data';
import { contrast } from '../lib/contrast';
import { deriveGeo } from '../lib/derive';
import { loadGeo, statesBbox } from '../lib/geo-load';
import { glyphRanges, loadGlyphFont } from '../lib/glyph-fonts';
import { decodeRange, GLYPH_BUFFER } from '../lib/glyphs';
import { projectFeatures } from '../lib/map-data';
import { BOX_SOURCE, CLUSTER, NATIVE_SOURCE, PALETTE_SOURCE, PROJECT_SOURCE } from '../lib/map-style';
import { loadTokens, mapFonts, mapStyleFor, mapTokens, projectTypeTokens } from '../lib/map-style-load';
import { FIXTURES, ROOT } from './helpers';

const opts = { base: site.base, basemap: site.basemap.file };
const tokens = loadTokens(ROOT);
const t = mapTokens(tokens);

/** Every string in the style a CSS color parser accepts, with where it is. */
function literalColors(v: unknown, path = ''): string[] {
  if (typeof v === 'string') return Color.parse(v) ? [`${path}: ${v}`] : [];
  if (Array.isArray(v)) return v.flatMap((x, i) => literalColors(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => literalColors(x, path ? `${path}.${k}` : k));
  return [];
}

/** Every value under a paint `*-color` key, flattened out of expressions. */
function colorSlots(style: ReturnType<typeof mapStyleFor>): unknown[] {
  const out: unknown[] = [];
  const leaves = (v: unknown): unknown[] => (Array.isArray(v) ? v.flatMap(leaves) : [v]);
  for (const l of style.layers) for (const [k, v] of Object.entries((l as { paint?: Record<string, unknown> }).paint ?? {})) if (k.endsWith('-color')) out.push(...leaves(v));
  return out;
}

describe('the map style', () => {
  // The token reader hands back sentinels, so any color the builder didn't take from a token stands out.
  const sentinel = { color: (n: string) => `token(${n})`, num: t.num };
  const traced = mapStyleFor(ROOT, { ...opts, tokens: sentinel });

  it('is a valid MapLibre style, with and without the basemap', () => {
    expect(validateStyleMin(mapStyleFor(ROOT, opts))).toEqual([]);
    expect(validateStyleMin(mapStyleFor(ROOT, { ...opts, publicDir: '/nonexistent' }))).toEqual([]);
  });

  it('takes every color from a token', () => {
    expect(literalColors(traced)).toEqual([]);
    const slots = colorSlots(traced).filter((v) => typeof v === 'string' && v.startsWith('token('));
    expect(slots.length).toBeGreaterThan(10);
  });

  it('the check catches a literal color', () => {
    const bad = structuredClone(traced);
    (bad.layers[0] as { paint: Record<string, unknown> }).paint['background-color'] = '#ff0000';
    (bad.layers.at(-1) as { paint: Record<string, unknown> }).paint['circle-stroke-color'] = ['match', ['get', 'projectType'], 'park', 'green', 'token(--p-black)'];
    expect(literalColors(bad)).toHaveLength(2);
  });

  it('resolves to the token files’ values', () => {
    const style = mapStyleFor(ROOT, opts);
    expect((style.layers[0] as { paint: Record<string, unknown> }).paint['background-color']).toBe(t.color('--map-land'));
    const values = new Set([...tokens.keys()].map((k) => { try { return t.color(k); } catch { return ''; } }));
    for (const c of colorSlots(style).filter((v) => typeof v === 'string' && Color.parse(v))) expect(values.has(c as string), String(c)).toBe(true);
  });

  it('colors every project type by its accent token', () => {
    const types = projectTypeTokens(ROOT);
    expect(types.map((x) => x.id).sort()).toEqual(vocab.projectType.map((x) => x.id).sort());
    const points = JSON.stringify(traced.layers.find((l) => l.id === 'project-points'));
    for (const x of types) expect(points).toContain(`token(${x.token})`);
  });

  it('includes the basemap only when the extract is published', () => {
    expect(Object.keys(mapStyleFor(ROOT, opts).sources)).toContain('basemap');
    const bare = mapStyleFor(ROOT, { ...opts, publicDir: '/nonexistent' });
    const own = [BOX_SOURCE, NATIVE_SOURCE, PALETTE_SOURCE, PROJECT_SOURCE];
    expect(Object.keys(bare.sources).sort()).toEqual(own.sort());
    expect(bare.layers.every((l) => !('source' in l) || own.includes(l.source))).toBe(true);
  });

  it('credits OpenStreetMap on the basemap source', () => {
    expect(JSON.stringify(mapStyleFor(ROOT, opts).sources.basemap)).toContain('OpenStreetMap');
  });

  it('labels are readable: text on land and water, and cluster counts, at 4.5:1', () => {
    for (const [fg, bg] of [['--map-label', '--map-land'], ['--map-label', '--map-water'], ['--map-label-strong', '--map-water'], ['--map-cluster-text', '--map-cluster']]) {
      expect(contrast(t.color(fg), t.color(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('names font stacks that build:map writes glyphs for', () => {
    const f = mapFonts(tokens);
    expect([f.regular, f.strong]).toEqual(['Montserrat Regular', 'Montserrat SemiBold']);
    const used = new Set(JSON.stringify(traced).match(/Montserrat [A-Za-z]+/g));
    expect([...used].sort()).toEqual([f.regular, f.strong].sort());
  });
});

describe('glyphs', () => {
  const font = loadGlyphFont('Montserrat', '400');
  const ranges = glyphRanges('Montserrat Regular', font);

  it('cover Latin text in 256-codepoint ranges', () => {
    expect([...ranges.keys()]).toContain('0-255');
    expect([...ranges.keys()]).toContain('256-511');
    const basic = decodeRange(ranges.get('0-255')!);
    expect(basic.name).toBe('Montserrat Regular');
    expect(basic.range).toBe('0-255');
    for (let cp = 0x20; cp < 0x7f; cp++) expect(basic.glyphs.some((g) => g.id === cp), String.fromCharCode(cp)).toBe(true);
    expect(decodeRange(ranges.get('0-255')!).glyphs.find((g) => g.id === 0xf1), 'ñ').toBeDefined();
  });

  it('are signed distance fields in MapLibre’s layout', () => {
    const glyphs = decodeRange(ranges.get('0-255')!).glyphs;
    const A = glyphs.find((g) => g.id === 65)!;
    expect(A.bitmap.length).toBe((A.width + 2 * GLYPH_BUFFER) * (A.height + 2 * GLYPH_BUFFER));
    expect(A.height).toBeGreaterThanOrEqual(16);
    expect(A.height).toBeLessThanOrEqual(18);
    expect(A.top).toBeLessThan(0);
    // The buffer is outside the outline, and the outline has pixels past the edge value.
    const w = A.width + 2 * GLYPH_BUFFER;
    expect(Math.max(...A.bitmap.subarray(0, w))).toBeLessThan(192);
    expect(Math.max(...A.bitmap)).toBeGreaterThan(192);
    const space = glyphs.find((g) => g.id === 32)!;
    expect(space.bitmap.length).toBe(0);
    expect(space.advance).toBeGreaterThan(0);
  });

  it('encode the same bytes twice', () => {
    expect(Buffer.from(glyphRanges('Montserrat Regular', font).get('0-255')!).equals(Buffer.from(ranges.get('0-255')!))).toBe(true);
  });
});

describe('the basemap extract', () => {
  it('covers the three states', () => {
    const [w, s, e, n] = statesBbox(ROOT);
    for (const st of loadGeo(ROOT).states) {
      const [x0, y0, x1, y1] = st.bbox;
      expect(x0 > w && y0 > s && x1 < e && y1 < n, st.id).toBe(true);
    }
  });
});

describe('projects on the map', () => {
  it('every fixture project is a point with its type and status', () => {
    const { index } = buildData({ dataRoot: FIXTURES });
    const fc = projectFeatures(index.records);
    const projects = index.records.filter((r) => r.type === 'project');
    expect(fc.features).toHaveLength(projects.length);
    for (const f of fc.features) {
      expect(f.properties.projectType).not.toBe('');
      expect(['proposed', 'constructed']).toContain(f.properties.status);
      const [lon, lat] = f.geometry.coordinates;
      expect(deriveGeo({ lat, lon }, loadGeo(ROOT)).state).toBeDefined();
    }
  });

  // The pilot's case: fifty projects at statewide zoom cluster without marks overlapping.
  it('fifty generated projects cluster without overlapping marks at statewide zooms', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const centers = [[47.6, -122.33, 0.4], [45.52, -122.68, 0.4], [37.77, -122.42, 0.5], [34.05, -118.25, 0.6], [44.5, -120.5, 2.5], [38.5, -121.5, 2.5]] as const;
    const layers = loadGeo(ROOT);
    const points: GeoJSON.Feature<GeoJSON.Point, Record<string, never>>[] = [];
    while (points.length < 50) {
      const [lat0, lon0, spread] = centers[points.length % centers.length];
      const lat = lat0 + (rand() - 0.5) * spread;
      const lon = lon0 + (rand() - 0.5) * spread;
      if (deriveGeo({ lat, lon }, layers).state) points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} });
    }
    // MapLibre runs supercluster with an 8192 extent and the radius scaled to it.
    const index = new Supercluster({ radius: CLUSTER.radius * 16, extent: 8192, maxZoom: CLUSTER.maxZoom }).load(points);
    const markRadius = t.num('--map-mark-radius') + t.num('--map-line-mark');
    const clusterRadius = (n: number) => (n >= CLUSTER.largeAt ? t.num('--map-cluster-radius-large') : t.num('--map-cluster-radius')) + t.num('--map-line-coast');
    for (const z of [4, 5, 6, 7]) {
      const size = 512 * 2 ** z;
      const marks = index.getClusters([-180, -85, 180, 85], z).map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * size;
        const n = (f.properties as { point_count?: number }).point_count;
        return { x: ((lon + 180) / 360) * size, y, r: n ? clusterRadius(n) : markRadius };
      });
      if (z <= 5) expect(marks.length, `zoom ${z} clusters`).toBeLessThan(50);
      for (let i = 0; i < marks.length; i++)
        for (let j = i + 1; j < marks.length; j++) {
          const d = Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y);
          expect(d, `zoom ${z}: marks ${i} and ${j}`).toBeGreaterThanOrEqual(marks[i].r + marks[j].r);
        }
    }
  });
});
