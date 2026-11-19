/**
 * Comparison (spec M8, distribution analysis): two plants, or two regions,
 * side by side on the same measures, each figure with the projects behind
 * it. Built on `plantDistribution` and `regionSummary`, so a compared figure
 * is the one the plant page or the per-region view shows (P3). Pure and
 * client-safe: the compare page runs it on site/public/analysis.json.
 */
import {
  plantDistribution,
  projectsIn,
  REGION_LEVELS,
  regionSummary,
  type DistributionProject,
  type PlantDistribution,
  type RegionLevel,
  type RegionPlantData,
  type RegionSummary,
  type UseBy,
  type UseFigure,
} from './analysis';
import { url } from './site';

/** The query parameters: `plants=plant/a,plant/b` or `regions=state:WA,county:53033`. */
export const COMPARE_PLANTS = 'plants';
export const COMPARE_REGIONS = 'regions';

/** One region: its level and its id (a state code, county FIPS, ecoregion code, or zone). */
export interface RegionRef {
  level: RegionLevel;
  id: string;
}

/** What is compared; a side may be unchosen yet. */
export type Comparison = { kind: 'plants'; sides: [string | undefined, string | undefined] } | { kind: 'regions'; sides: [RegionRef | undefined, RegionRef | undefined] };

const PLANT_KEY = /^plant\/[a-z0-9]+(-[a-z0-9]+)*$/;
const REGION_ID = /^[A-Za-z0-9.]+$/;

const two = <T>(xs: (T | undefined)[]): [T | undefined, T | undefined] => [xs[0], xs[1]];

/** A region as the query string writes it: `county:53033`. */
export const regionParam = (r: RegionRef) => `${r.level}:${r.id}`;

/** `county:53033` as a region, or undefined when it isn't one. */
export function parseRegion(s: string): RegionRef | undefined {
  const i = s.indexOf(':');
  const level = s.slice(0, i);
  const id = s.slice(i + 1);
  if (i < 0 || !(REGION_LEVELS as readonly string[]).includes(level) || !REGION_ID.test(id)) return undefined;
  return { level: level as RegionLevel, id };
}

/**
 * What a query string asks to compare: regions when it names `regions`,
 * else plants (the default, with no side chosen). Values that aren't a plant
 * key or a region leave their side unchosen.
 */
export function readComparison(search: string): Comparison {
  const p = new URLSearchParams(search);
  const regions = p.get(COMPARE_REGIONS);
  if (regions !== null) return { kind: 'regions', sides: two(regions.split(',').slice(0, 2).map(parseRegion)) };
  const plants = (p.get(COMPARE_PLANTS) ?? '').split(',').slice(0, 2);
  return { kind: 'plants', sides: two(plants.map((k) => (PLANT_KEY.test(k) ? k : undefined))) };
}

/**
 * The query string for a comparison, `readComparison`'s inverse; an unchosen
 * side is left empty. Plant keys and region ids need no escaping.
 */
export function comparisonSearch(c: Comparison): string {
  const sides = c.kind === 'plants' ? c.sides.map((s) => s ?? '') : c.sides.map((s) => (s ? regionParam(s) : ''));
  return `?${c.kind === 'plants' ? COMPARE_PLANTS : COMPARE_REGIONS}=${sides[1] ? sides.join(',') : sides[0]}`;
}

/** The compare page's URL for a comparison. */
export function compareUrl(c: Comparison): string {
  return url('compare/') + comparisonSearch(c);
}

/** One row of a side-by-side breakdown: the same id on each side, zero where a side has none. */
export interface Paired {
  id: string;
  a: UseFigure;
  b: UseFigure;
}

const ZERO: UseFigure = { projects: 0, quantity: 0 };

/** Two breakdowns as rows over the ids either has, sorted by id. */
export function pair(a: readonly UseBy[], b: readonly UseBy[]): Paired[] {
  const ids = [...new Set([...a, ...b].map((x) => x.id))].sort((x, y) => x.localeCompare(y));
  const get = (xs: readonly UseBy[], id: string): UseFigure => {
    const f = xs.find((x) => x.id === id);
    return f ? { projects: f.projects, quantity: f.quantity } : ZERO;
  };
  return ids.map((id) => ({ id, a: get(a, id), b: get(b, id) }));
}

const asBy = (r: Record<string, UseFigure>): UseBy[] => Object.entries(r).map(([id, f]) => ({ id, ...f }));

/** Two plants on the same measures. */
export interface PlantComparison {
  a: PlantDistribution;
  b: PlantDistribution;
  byState: Paired[];
  byCounty: Paired[];
  byEcoregion: Paired[];
  /** Empty until projects have a zone (D33). */
  byZone: Paired[];
  byYear: Paired[];
  /** The projects whose lists ref both plants. */
  both: number;
}

const refs = (p: DistributionProject, key: string) => p.data.plantList.some((i) => typeof i.plant !== 'string' && i.plant.ref === key);

/** Each plant's distribution (`plantDistribution`), paired by region and year, and the projects listing both. */
export function comparePlants(a: string, b: string, projects: readonly DistributionProject[], plants: ReadonlyMap<string, Pick<RegionPlantData, 'nativeRange'>>): PlantComparison {
  const da = plantDistribution(a, projects, plants.get(a));
  const db = plantDistribution(b, projects, plants.get(b));
  return {
    a: da,
    b: db,
    byState: pair(da.byState, db.byState),
    byCounty: pair(da.byCounty, db.byCounty),
    byEcoregion: pair(da.byEcoregion, db.byEcoregion),
    byZone: pair(da.byZone, db.byZone),
    byYear: pair(da.byYear, db.byYear),
    both: projects.filter((p) => refs(p, a) && refs(p, b)).length,
  };
}

/** A plant listed in both regions, with its figures in each. */
export interface SharedPlant {
  plant: string;
  a: UseFigure;
  b: UseFigure;
}

/** Two regions on the same measures. */
export interface RegionComparison {
  a: RegionSummary;
  b: RegionSummary;
  /** The mix by form, paired; `unknown` holds unsourced lines. */
  byForm: Paired[];
  /** The plants listed in both, by the fewer projects of the two sides, then the total, then key. */
  shared: SharedPlant[];
  /** The projects in both regions (a county inside a state, or an ecoregion crossing a county). */
  overlap: number;
}

/** Each region's summary (`regionSummary` over `projectsIn`), the mix by form paired, and the plants in both. */
export function compareRegions(a: RegionRef, b: RegionRef, projects: readonly DistributionProject[], plants: ReadonlyMap<string, RegionPlantData>): RegionComparison {
  const pa = projectsIn(projects, { [a.level]: [a.id] });
  const pb = projectsIn(projects, { [b.level]: [b.id] });
  const sa = regionSummary(pa, plants);
  const sb = regionSummary(pb, plants);
  const inB = new Map(sb.plants.map((p) => [p.plant, p]));
  const shared = sa.plants
    .filter((p) => inB.has(p.plant))
    .map((p) => {
      const q = inB.get(p.plant)!;
      return { plant: p.plant, a: { projects: p.projects, quantity: p.quantity }, b: { projects: q.projects, quantity: q.quantity } };
    })
    .sort((x, y) => Math.min(y.a.projects, y.b.projects) - Math.min(x.a.projects, x.b.projects) || y.a.projects + y.b.projects - (x.a.projects + x.b.projects) || x.plant.localeCompare(y.plant));
  const keysB = new Set(pb.map((p) => p.key));
  return { a: sa, b: sb, byForm: pair(asBy(sa.byForm), asBy(sb.byForm)), shared, overlap: pa.filter((p) => keysB.has(p.key)).length };
}
