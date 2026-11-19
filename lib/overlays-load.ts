/**
 * Reading the overlay registry and preparing each overlay's data file for
 * the site. Node only. The data is the committed TopoJSON (geo/ for the
 * boundary overlays, D41), kept as TopoJSON so the browser fetches the
 * smaller file; a palette overlay's features gain a color index, chosen so
 * neighbors differ.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, GeometryObject, Topology } from 'topojson-specification';
import { readJson, repoRoot } from './config';
import type { MapTokens } from './map-style';
import { OVERLAY_DIR, overlayLayers, overlayLegend, PALETTE_PROP, type OverlayDef, type OverlayMeta } from './overlays';

export const OVERLAYS_FILE = join('config', 'overlays.json');
export { OVERLAY_DIR };

/** The registry, bottom to top. `file` is from the repo root (a test passes a fixture registry). */
export function loadOverlays(root = repoRoot(), file = OVERLAYS_FILE): OverlayDef[] {
  return readJson<{ overlays: OverlayDef[] }>(join(root, file)).overlays;
}

/** A TopoJSON file's single object, as a geometry collection. */
function collection(topology: Topology): GeometryCollection {
  const [name] = Object.keys(topology.objects);
  return topology.objects[name] as GeometryCollection;
}

/**
 * Greedy coloring over shared arcs (Welsh–Powell: most neighbors first, ties
 * by id), so no two neighboring features share a color. Fails if `colors`
 * isn't enough, rather than drawing two neighbors alike.
 */
export function colorFeatures(topology: Topology, colors: number): number[] {
  const geoms = collection(topology).geometries;
  const adj = neighbors(geoms as GeometryObject[]);
  const id = (i: number) => String((geoms[i].properties as Record<string, unknown> | undefined)?.id ?? i);
  const order = geoms.map((_, i) => i).sort((a, b) => adj[b].length - adj[a].length || id(a).localeCompare(id(b)));
  const out: number[] = new Array(geoms.length).fill(-1);
  for (const i of order) {
    const taken = new Set(adj[i].map((j) => out[j]));
    const c = [...Array(colors).keys()].find((k) => !taken.has(k));
    if (c === undefined) throw new Error(`feature ${id(i)} has neighbors in all ${colors} palette colors; add a color to the palette`);
    out[i] = c;
  }
  return out;
}

export interface PreparedOverlays {
  meta: OverlayMeta[];
  /** Data files to publish, by path under site/public. */
  files: Map<string, string>;
}

/**
 * Each overlay's layers, legend, and data file. A feature keeps only its `id`
 * and `name` (and its color index), which the map and the region filters read.
 */
export function prepareOverlays(root: string, defs: OverlayDef[], t: MapTokens, base: string): PreparedOverlays {
  const meta: OverlayMeta[] = [];
  const files = new Map<string, string>();
  for (const def of defs) {
    let url: string | null = null;
    let features: { name: string; pi?: number }[] = [];
    if (def.data !== 'library') {
      const topology = JSON.parse(readFileSync(join(root, def.data), 'utf8')) as Topology;
      const geoms = collection(topology).geometries;
      const colors = def.style?.palette ? colorFeatures(topology, def.style.palette.length) : null;
      geoms.forEach((g, i) => {
        const p = (g.properties ?? {}) as Record<string, unknown>;
        g.properties = { id: String(p.id), name: String(p.name), ...(colors ? { [PALETTE_PROP]: colors[i] } : {}) };
      });
      features = geoms.map((g) => g.properties as { name: string; pi?: number });
      const path = `${OVERLAY_DIR}/${def.id}.json`;
      files.set(path, JSON.stringify(topology));
      url = `${base}${path}`;
    }
    meta.push({
      id: def.id,
      label: def.label,
      kind: def.kind,
      url,
      layers: overlayLayers(t, def),
      legend: overlayLegend(t, def, features),
      alwaysOn: def.alwaysOn ?? false,
      selectable: def.selectable,
      facets: def.facets ?? {},
    });
  }
  return { meta, files };
}
