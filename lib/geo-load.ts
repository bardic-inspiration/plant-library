/** Reads the committed boundary layers in geo/ (Node only; lib/geo.ts is the client-safe part). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Topology } from 'topojson-specification';
import { repoRoot } from './config';
import { decodeLayer, GEO_LAYERS, type GeoLayerId, type GeoLayers } from './geo';

const cache = new Map<string, GeoLayers>();

/** The boundary layers, read once per root. */
export function loadGeo(root = repoRoot()): GeoLayers {
  let layers = cache.get(root);
  if (!layers) {
    const read = (id: GeoLayerId) => decodeLayer(JSON.parse(readFileSync(join(root, 'geo', `${id}.topojson`), 'utf8')) as Topology);
    layers = Object.fromEntries(GEO_LAYERS.map((id) => [id, read(id)])) as GeoLayers;
    cache.set(root, layers);
  }
  return layers;
}

/** The three states' bounding box, with a margin in degrees, from the states layer (P3: not stored twice). */
export function statesBbox(root = repoRoot(), margin = 0.5): [number, number, number, number] {
  const b = loadGeo(root).states.map((s) => s.bbox);
  const r = (n: number) => Math.round(n * 100) / 100;
  return [r(Math.min(...b.map((x) => x[0])) - margin), r(Math.min(...b.map((x) => x[1])) - margin), r(Math.max(...b.map((x) => x[2])) + margin), r(Math.max(...b.map((x) => x[3])) + margin)];
}
