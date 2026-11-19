/**
 * Boundary layers in geo/ and point-in-polygon lookup against them (P6).
 * The layers are TopoJSON written by `npm run geo` (scripts/geo.ts); see
 * geo/README.md for their sources and processing. Client-safe: lib/geo-load.ts
 * reads the files.
 */
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

/**
 * Douglas–Peucker tolerance, in meters, used when the layers are simplified:
 * no simplified line is farther than this from the Census or EPA line. Set by
 * the border tests in tests/geo.test.ts (D30).
 */
export const GEO_TOLERANCE_METERS = 20;
/** TopoJSON quantization: a grid step under 2 m across the three states' extent. */
export const GEO_QUANTIZATION = 1e6;

export const GEO_LAYERS = ['states', 'counties', 'places', 'ecoregions'] as const;
export type GeoLayerId = (typeof GEO_LAYERS)[number];

export interface GeoFeature {
  id: string;
  name: string;
  /** Other properties the layer carries: a county's `state`, a place's `kind`. */
  props: Record<string, string>;
  bbox: [number, number, number, number];
  /** Polygons, each a list of rings ([lon, lat] pairs); the first ring is the shell. */
  polygons: number[][][][];
}

export type GeoLayer = GeoFeature[];
export type GeoLayers = Record<GeoLayerId, GeoLayer>;

type Ring = number[][];

function bboxOf(polygons: Ring[][]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polygons)
    for (const [x, y] of p[0]) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
}

/** Decode one TopoJSON layer into features with bounding boxes. */
export function decodeLayer(topology: Topology): GeoLayer {
  const [name] = Object.keys(topology.objects);
  const fc = feature(topology, topology.objects[name] as GeometryCollection);
  return fc.features.map((f) => {
    const g = f.geometry;
    const polygons = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as Ring[][];
    const { id, name: nm, ...rest } = (f.properties ?? {}) as Record<string, string>;
    return { id: String(id), name: String(nm), props: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)])), bbox: bboxOf(polygons), polygons };
  });
}

/** Even-odd ray casting over a ring. */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function contains(f: GeoFeature, lon: number, lat: number): boolean {
  const [x0, y0, x1, y1] = f.bbox;
  if (lon < x0 || lon > x1 || lat < y0 || lat > y1) return false;
  return f.polygons.some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((hole) => inRing(lon, lat, hole)));
}

/** The feature of a layer containing a point, or undefined. Layers don't overlap, so the first match is the only one. */
export function featureAt(layer: GeoLayer, lon: number, lat: number): GeoFeature | undefined {
  return layer.find((f) => contains(f, lon, lat));
}
