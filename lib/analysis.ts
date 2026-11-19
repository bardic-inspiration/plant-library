/**
 * Distribution analysis (spec M8): figures over projects' plant lists and
 * their derived geography, computed at build and never stored (P3). Pure
 * functions, shared by the build, the pages, and the tests. Every figure
 * carries the number of projects behind it, so a page can show its sample
 * size; a plant counts only where a list refs it, never by unsourced text.
 */
import type { GeoDerived, PlantData, ProjectData } from './types';

/** A project as the analysis reads it: its key, its data, and `deriveGeo` of its location. */
export interface AnalysisProject {
  key: string;
  data: ProjectData;
  geo: GeoDerived;
}

/** A count and the number of projects behind it. */
export interface UseFigure {
  projects: number;
  quantity: number;
}

/** A figure for one region (a state code, county FIPS, ecoregion code, or zone) or one completion year. */
export interface UseBy extends UseFigure {
  id: string;
}

/** The region levels a project's geography holds. */
export type RegionLevel = 'state' | 'county' | 'ecoregion' | 'hardinessZone';

export const REGION_LEVELS: readonly RegionLevel[] = ['state', 'county', 'ecoregion', 'hardinessZone'];

/** Per plant: where and when it was planted. */
export interface PlantDistribution extends UseFigure {
  byState: UseBy[];
  byCounty: UseBy[];
  byEcoregion: UseBy[];
  /** Empty until projects have `geo.hardinessZone` (D33). */
  byZone: UseBy[];
  /** By completion year, oldest first; projects with no `completed` date are `undated`. */
  byYear: UseBy[];
  undated: UseFigure;
  /** States it is used in that its `nativeRange` doesn't include; empty when the range is unknown. */
  outsideNativeRange: string[];
}

/** One plant's line in a region's ranked table. */
export interface RegionPlant extends UseFigure {
  plant: string;
}

/** Per region: what gets planted in a set of projects. */
export interface RegionSummary {
  /** The projects in the region: the sample size. */
  projects: number;
  /** Total quantity, unsourced lines included. */
  quantity: number;
  /** The plants the library holds, ranked by projects, then quantity, then key (`rankPlants`). */
  plants: RegionPlant[];
  /** Distinct plants the library holds, and the projects that list any. */
  taxa: { count: number; projects: number };
  /** Distinct unsourced names, and the projects that list any. */
  unsourced: { count: number; projects: number };
  /**
   * Quantity of plants native to their own project's state over the quantity
   * with a known native range, and the projects that have such plants and a
   * state; absent when there are none.
   */
  nativeShare?: { share: number; quantity: number; projects: number };
  /** Quantity and projects by plant form; unsourced lines under `unknown`. */
  byForm: Record<string, UseFigure>;
}

const yearOf = (d: ProjectData) => (d.completed ? d.completed.slice(0, 4) : undefined);

function linesFor(d: ProjectData, plantKey: string) {
  return d.plantList.filter((i) => typeof i.plant !== 'string' && i.plant.ref === plantKey);
}

function tally(map: Map<string, UseFigure>, id: string | undefined, quantity: number) {
  if (id === undefined) return;
  const f = map.get(id) ?? { projects: 0, quantity: 0 };
  f.projects += 1;
  f.quantity += quantity;
  map.set(id, f);
}

const listed = (map: Map<string, UseFigure>): UseBy[] =>
  [...map].map(([id, f]) => ({ id, ...f })).sort((a, b) => a.id.localeCompare(b.id));

/**
 * A plant's projects and quantity, in total, by state, county, ecoregion,
 * and zone, and by completion year. `plant` is its data, for the native-range
 * note; without it `outsideNativeRange` is empty.
 */
export function plantDistribution(plantKey: string, projects: readonly AnalysisProject[], plant?: PlantData): PlantDistribution {
  const by = { state: new Map<string, UseFigure>(), county: new Map<string, UseFigure>(), ecoregion: new Map<string, UseFigure>(), hardinessZone: new Map<string, UseFigure>() };
  const years = new Map<string, UseFigure>();
  const undated: UseFigure = { projects: 0, quantity: 0 };
  const total: UseFigure = { projects: 0, quantity: 0 };
  for (const p of projects) {
    const lines = linesFor(p.data, plantKey);
    if (lines.length === 0) continue;
    const q = lines.reduce((n, l) => n + (l.quantity ?? 0), 0);
    total.projects += 1;
    total.quantity += q;
    for (const level of REGION_LEVELS) tally(by[level], p.geo[level], q);
    const year = yearOf(p.data);
    if (year) tally(years, year, q);
    else {
      undated.projects += 1;
      undated.quantity += q;
    }
  }
  const byState = listed(by.state);
  const native = plant?.nativeRange?.states;
  return {
    ...total,
    byState,
    byCounty: listed(by.county),
    byEcoregion: listed(by.ecoregion),
    byZone: listed(by.hardinessZone),
    byYear: listed(years),
    undated,
    outsideNativeRange: native ? byState.map((s) => s.id).filter((s) => !native.includes(s)) : [],
  };
}

/**
 * The projects in any of the selected regions (a union, as values within a
 * region facet are ORed), in their given order.
 */
export function projectsIn(
  projects: readonly AnalysisProject[],
  regions: Partial<Record<RegionLevel, readonly string[]>>,
): AnalysisProject[] {
  return projects.filter((p) => REGION_LEVELS.some((level) => {
    const v = p.geo[level];
    return v !== undefined && (regions[level] ?? []).includes(v);
  }));
}

/** Plants ranked by projects (the default) or by quantity, the other measure breaking ties, then key. */
export function rankPlants(plants: readonly RegionPlant[], by: 'projects' | 'quantity' = 'projects'): RegionPlant[] {
  const other = by === 'projects' ? 'quantity' : 'projects';
  return [...plants].sort((a, b) => b[by] - a[by] || b[other] - a[other] || a.plant.localeCompare(b.plant));
}

/**
 * What gets planted in a set of projects (from `projectsIn`): the ranked
 * plant table, taxa, native share, and the mix by form, each with its
 * sample size. Counts follow `deriveProject`: unsourced lines and refs the
 * library can't resolve add to `quantity` and `byForm.unknown` only.
 */
export function regionSummary(projects: readonly AnalysisProject[], plantsByKey: ReadonlyMap<string, PlantData>): RegionSummary {
  const plants = new Map<string, UseFigure>();
  const forms = new Map<string, UseFigure>();
  const unsourced = new Set<string>();
  let quantity = 0;
  let withTaxa = 0;
  let withUnsourced = 0;
  let known = 0;
  let native = 0;
  let nativeProjects = 0;
  for (const p of projects) {
    const here = new Map<string, number>();
    const formsHere = new Map<string, number>();
    let unsourcedHere = false;
    let knownHere = false;
    for (const item of p.data.plantList) {
      const q = item.quantity ?? 0;
      quantity += q;
      const key = typeof item.plant === 'string' ? undefined : item.plant.ref;
      const plant = key ? plantsByKey.get(key) : undefined;
      if (!key || !plant) {
        unsourced.add(typeof item.plant === 'string' ? item.plant.trim().toLowerCase() : String(key));
        unsourcedHere = true;
        formsHere.set('unknown', (formsHere.get('unknown') ?? 0) + q);
        continue;
      }
      here.set(key, (here.get(key) ?? 0) + q);
      formsHere.set(plant.form, (formsHere.get(plant.form) ?? 0) + q);
      if (plant.nativeRange && p.geo.state) {
        knownHere = true;
        known += q;
        if (plant.nativeRange.states.includes(p.geo.state)) native += q;
      }
    }
    for (const [k, q] of here) tally(plants, k, q);
    for (const [f, q] of formsHere) tally(forms, f, q);
    if (here.size > 0) withTaxa += 1;
    if (unsourcedHere) withUnsourced += 1;
    if (knownHere) nativeProjects += 1;
  }
  const out: RegionSummary = {
    projects: projects.length,
    quantity,
    plants: rankPlants([...plants].map(([plant, f]) => ({ plant, ...f }))),
    taxa: { count: plants.size, projects: withTaxa },
    unsourced: { count: unsourced.size, projects: withUnsourced },
    byForm: Object.fromEntries([...forms].sort(([a], [b]) => a.localeCompare(b))),
  };
  if (known > 0) out.nativeShare = { share: native / known, quantity: known, projects: nativeProjects };
  return out;
}
