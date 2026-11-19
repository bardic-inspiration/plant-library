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

/** What the map view draws for a result set. */
export interface MapResults {
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
  for (const r of results) if (r.type === 'project' && r.card.location) projects.set(r.key, {});
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
  const out: MapResults = { projects, plantProjects };
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

export type { Bounds };

/**
 * The results in view, in their order: projects drawn inside the bounds,
 * and plants with at least one drawn project inside them.
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
    return false;
  });
}

/** Results the map can't place: plants no drawn project lists, and projects without a location. */
export function unplaced(results: IndexRecord[], drawn: MapResults): IndexRecord[] {
  return results.filter((r) => (r.type === 'plant' ? !(drawn.plantProjects.get(r.key) ?? []).length : r.type === 'project' ? !drawn.projects.has(r.key) : true));
}
