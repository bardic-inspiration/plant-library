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
