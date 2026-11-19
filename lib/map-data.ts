/** What the map draws, from the index records. Client-safe. */
import { inBox, locatedIn, matches, type Bounds } from './filter';
import type { IndexRecord } from './types';

export interface ProjectFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    key: string;
    name: string;
    url: string;
    projectType: string;
    status: string;
    place: string;
    /** Quantity of the matching plants on the project's list, when plants in the results put it on the map. */
    quantity?: number;
    /** That quantity on a 0–1 scale (square root, over the largest drawn), which the style turns into the mark's size. */
    size?: number;
  };
}

/** A palette with a site location: a point of its own kind (spec: map.md). */
export interface PaletteFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { key: string; name: string; url: string; place: string };
}

/** What the map view draws for a result set. */
export interface MapResults {
  /** Palettes in the results that have a site location, by key. */
  palettes: Set<string>;
  /** Projects to draw, by key: those in the results, and those listing a plant in the results, with the matching plants' quantity. */
  projects: Map<string, { quantity?: number }>;
  /** For each plant in the results, the drawn projects that list it. */
  plantProjects: Map<string, string[]>;
  /** With exactly one plant in the results, the states it is native to (v1 draws native range by state). */
  nativeStates?: string[];
}

/** Plant keys a project lists, with quantities, from its card (lib/build-data.ts). */
function quantities(r: IndexRecord): Record<string, number> {
  return (r.card.quantities as Record<string, number> | undefined) ?? {};
}

/**
 * The map's reading of a result set. Projects in the results are drawn as
 * they are. A plant has no location of its own: the projects listing it are
 * drawn, each sized by the quantity of every matching plant it lists, but
 * only projects that meet the query's project filters (a plant meets them
 * through such a project, D39, so the map shows that one, not every project
 * that lists the plant). With a box, only the projects inside it, for the
 * same reason.
 */
export function mapResults(results: IndexRecord[], records: IndexRecord[], filters: Record<string, string[]>, box?: Bounds): MapResults {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const projectFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => k.startsWith('project.')));
  const projects = new Map<string, { quantity?: number }>();
  const plantProjects = new Map<string, string[]>();
  const palettes = new Set<string>();
  for (const r of results) {
    if (r.type === 'project' && r.card.location) projects.set(r.key, {});
    if (r.type === 'palette' && r.card.location) palettes.add(r.key);
  }
  const plants = results.filter((r) => r.type === 'plant');
  for (const plant of plants) {
    const on: string[] = [];
    for (const k of plant.links?.project ?? []) {
      const p = byKey.get(k);
      if (!p?.card.location || !matches(p, projectFilters) || (box && !locatedIn(p, box))) continue;
      const q = quantities(p)[plant.key] ?? 0;
      const cur = projects.get(k) ?? {};
      projects.set(k, { quantity: (cur.quantity ?? 0) + q });
      on.push(k);
    }
    plantProjects.set(plant.key, on);
  }
  const out: MapResults = { projects, plantProjects, palettes };
  if (plants.length === 1) out.nativeStates = plants[0].facets['plant.nativeTo'] ?? [];
  return out;
}

/**
 * Projects as points (D40: a project is a point), with what the style and
 * the popup read. With `drawn`, only those projects, sized by quantity.
 */
export function projectFeatures(records: IndexRecord[], drawn?: MapResults): { type: 'FeatureCollection'; features: ProjectFeature[] } {
  const features: ProjectFeature[] = [];
  let max = 0;
  if (drawn) for (const v of drawn.projects.values()) max = Math.max(max, v.quantity ?? 0);
  for (const r of records) {
    const loc = r.card.location as [number, number] | undefined;
    if (r.type !== 'project' || !loc) continue;
    if (drawn && !drawn.projects.has(r.key)) continue;
    const properties: ProjectFeature['properties'] = { key: r.key, name: r.name, url: r.url, projectType: String(r.card.projectType ?? ''), status: String(r.card.status ?? ''), place: String(r.card.place ?? '') };
    const q = drawn?.projects.get(r.key)?.quantity;
    if (q !== undefined) {
      properties.quantity = q;
      properties.size = max > 0 ? Math.sqrt(q) / Math.sqrt(max) : 0;
    }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: loc }, properties });
  }
  return { type: 'FeatureCollection', features };
}

/** Palettes with a site location as points; with `drawn`, only those in it. */
export function paletteFeatures(records: IndexRecord[], drawn?: MapResults): { type: 'FeatureCollection'; features: PaletteFeature[] } {
  const features: PaletteFeature[] = [];
  for (const r of records) {
    const loc = r.card.location as [number, number] | undefined;
    if (r.type !== 'palette' || !loc) continue;
    if (drawn && !drawn.palettes.has(r.key)) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: loc }, properties: { key: r.key, name: r.name, url: r.url, place: String(r.card.place ?? '') } });
  }
  return { type: 'FeatureCollection', features };
}

export type { Bounds };

/**
 * What the small map on a detail page draws: a project's own point, or the
 * projects that list a plant, sized by the quantity of it each lists, as
 * the map view draws that plant alone. Anything else draws nothing.
 */
export function detailFeatures(key: string, records: IndexRecord[]): ReturnType<typeof projectFeatures> {
  // A palette's own point is drawn by `paletteFeatures`.
  const rec = records.find((r) => r.key === key);
  if (rec?.type === 'project') return projectFeatures([rec]);
  if (rec?.type === 'plant') return projectFeatures(records, mapResults([rec], records, {}));
  return { type: 'FeatureCollection', features: [] };
}

/** The box around the features' points, for a small map to open on; undefined with none. A single point is a box of no size. */
export function featureBounds(fc: { features: { geometry: { coordinates: [number, number] } }[] }): Bounds | undefined {
  if (!fc.features.length) return undefined;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fc.features) {
    const [lon, lat] = f.geometry.coordinates;
    w = Math.min(w, lon);
    s = Math.min(s, lat);
    e = Math.max(e, lon);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

/**
 * The results in view, in their order: projects and palettes drawn inside
 * the bounds, and plants with at least one drawn project inside them.
 */
export function inView(results: IndexRecord[], records: IndexRecord[], drawn: MapResults, bounds: Bounds): IndexRecord[] {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const seen = (k: string) => {
    const loc = byKey.get(k)?.card.location as [number, number] | undefined;
    return Boolean(loc && inBox(loc, bounds));
  };
  return results.filter((r) => {
    if (r.type === 'project') return drawn.projects.has(r.key) && seen(r.key);
    if (r.type === 'plant') return (drawn.plantProjects.get(r.key) ?? []).some(seen);
    if (r.type === 'palette') return drawn.palettes.has(r.key) && seen(r.key);
    return false;
  });
}

/** Results the map can't place: plants no drawn project lists, and projects and palettes without a location. */
export function unplaced(results: IndexRecord[], drawn: MapResults): IndexRecord[] {
  return results.filter((r) =>
    r.type === 'plant' ? !(drawn.plantProjects.get(r.key) ?? []).length : r.type === 'project' ? !drawn.projects.has(r.key) : r.type === 'palette' ? !drawn.palettes.has(r.key) : true,
  );
}
