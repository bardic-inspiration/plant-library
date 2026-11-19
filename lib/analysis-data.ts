/**
 * The per-region view's data: site/public/analysis.json, written by
 * build:index and fetched by the map page only when regions are selected
 * (P10). It holds what `projectsIn` and `regionSummary` read and nothing
 * more: each project's geography and plant list (plant and quantity), each
 * plant's form and native states, and the region levels the selectable
 * overlays filter by. The figures themselves are computed in the browser by
 * the same functions the build uses (P3). Client-safe.
 */
import { REGION_LEVELS, type AnalysisProject, type RegionLevel, type RegionPlantData, type RegionProject } from './analysis';
import type { OverlayDef } from './overlays';
import type { PlantData } from './types';

/** A region level the per-region view reads, and the facet keys whose values select it. */
export interface AnalysisRegion {
  level: RegionLevel;
  /** The overlay whose regions these are. */
  overlay: string;
  label: string;
  /** Facet keys (`project.state`, `plant.usedInState`) whose values are this level's region ids. */
  keys: string[];
}

export interface AnalysisFile {
  regions: AnalysisRegion[];
  projects: RegionProject[];
  plants: Record<string, RegionPlantData>;
}

export const ANALYSIS_FILE = 'analysis.json';

const isLevel = (v: string): v is RegionLevel => (REGION_LEVELS as readonly string[]).includes(v);

/**
 * The region levels, from the selectable overlays (config/overlays.json): an
 * overlay's project facet names the level (`state`, `county`, `ecoregion`),
 * and each of its facets selects it. An overlay whose project facet isn't a
 * region level is left out.
 */
export function analysisRegions(overlays: readonly OverlayDef[]): AnalysisRegion[] {
  const out: AnalysisRegion[] = [];
  for (const o of overlays) {
    const level = o.facets?.project;
    if (!o.selectable || !level || !isLevel(level)) continue;
    out.push({ level, overlay: o.id, label: o.label, keys: Object.entries(o.facets!).map(([t, f]) => `${t}.${f}`) });
  }
  return out;
}

/** The file's contents, from the build's projects and plants, sorted by key so two builds match. */
export function analysisFile(projects: readonly AnalysisProject[], plants: ReadonlyMap<string, PlantData>, overlays: readonly OverlayDef[]): AnalysisFile {
  const geoOf = (p: AnalysisProject) => Object.fromEntries(REGION_LEVELS.flatMap((l) => (p.geo[l] ? [[l, p.geo[l]]] : [])));
  return {
    regions: analysisRegions(overlays),
    projects: [...projects]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((p) => ({
        key: p.key,
        geo: geoOf(p),
        data: { plantList: p.data.plantList.map((i) => (i.quantity === undefined ? { plant: i.plant } : { plant: i.plant, quantity: i.quantity })) },
      })),
    plants: Object.fromEntries(
      [...plants]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, d]) => [k, d.nativeRange ? { form: d.form, nativeRange: { states: d.nativeRange.states } } : { form: d.form }]),
    ),
  };
}

/** The regions a query's filters select, by level: what `projectsIn` takes. Empty when none is selected. */
export function selectedRegions(regions: readonly AnalysisRegion[], filters: Record<string, string[]>): Partial<Record<RegionLevel, string[]>> {
  const out: Partial<Record<RegionLevel, string[]>> = {};
  for (const r of regions) {
    const ids = [...new Set(r.keys.flatMap((k) => filters[k] ?? []))];
    if (ids.length) out[r.level] = [...new Set([...(out[r.level] ?? []), ...ids])];
  }
  return out;
}

/** The facet keys that select regions, from the overlays: the per-region view shows when any of them holds a value. */
export function regionFilterKeys(overlays: readonly OverlayDef[]): string[] {
  return analysisRegions(overlays).flatMap((r) => r.keys);
}
