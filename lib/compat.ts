/**
 * Compatibility of a plant list: whether its plants share growing conditions,
 * and how they fit a site. One pure function used by the build (projects and
 * palettes) and the workspace, so both always agree (P3). It makes no claim
 * about design, spacing, or competition.
 */
import vocabJson from '../config/vocab.json' with { type: 'json' };
import { expandZones, HALF_ZONES } from './zones';
import type { PlantData, PlantListItem, Vocab } from './types';

const defaultVocab = vocabJson as unknown as Vocab;

export type CompatAxis = 'sun' | 'moisture' | 'drainage' | 'hardiness' | 'waterUse';

interface AxisDef {
  axis: CompatAxis;
  /** The vocabulary list giving the axis's values in order; hardiness uses the half zones. */
  vocab?: string;
  /** The values a plant accepts, or undefined when the plant has no data on the axis. */
  accepts: (d: PlantData) => string[] | undefined;
  /** The site's values on the axis, or undefined when the site doesn't state it (a site has no water use). */
  site: (s: CompatSite) => string[] | undefined;
}

/** Site conditions, as a palette's `site` or the workspace gives them. */
export interface CompatSite {
  sun?: string | string[];
  moisture?: string | string[];
  soil?: { drainage?: string | string[] };
  /** A zone as entries write it (`8` or `8b`); a whole zone stands for both halves. */
  hardinessZone?: string;
}

const list = (v: string | string[] | undefined): string[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? (v.length ? v : undefined) : [v];

/** The axes, in the order the panel shows them. */
export const COMPAT_AXES: readonly AxisDef[] = [
  { axis: 'sun', vocab: 'sun', accepts: (d) => d.sun, site: (s) => list(s.sun) },
  { axis: 'moisture', vocab: 'moisture', accepts: (d) => d.moisture, site: (s) => list(s.moisture) },
  { axis: 'drainage', vocab: 'soilDrainage', accepts: (d) => d.soil?.drainage, site: (s) => list(s.soil?.drainage) },
  {
    axis: 'hardiness',
    accepts: (d) => (d.hardiness ? expandZones(d.hardiness) : undefined),
    site: (s) => (s.hardinessZone ? expandZones({ min: s.hardinessZone, max: s.hardinessZone }) : undefined),
  },
  // A plant has one water use; it accepts that level only, so a shared value
  // is one hydrozone (D53).
  { axis: 'waterUse', vocab: 'waterUse', accepts: (d) => (d.waterUse ? [d.waterUse] : undefined), site: () => undefined },
];

export type SiteFit = 'pass' | 'fail' | 'unknown';

/** One way to restore a shared value: remove these plants. */
export interface CompatConflict {
  /** The values every remaining plant then shares, in scale order. */
  restores: string[];
  /** The plants to remove, each with the values it accepts. */
  plants: { key: string; needs: string[] }[];
}

export interface CompatAxisResult {
  axis: CompatAxis;
  /** The axis's values in order: the grid's columns. */
  values: string[];
  /** Each plant once, in list order, with the values it accepts; `null` when it has no data. */
  plants: { key: string; accepts: string[] | null }[];
  /** Plants with no data on the axis, never counted in a conflict. */
  unknown: string[];
  /** The values every plant with data accepts; `null` when no plant has data. */
  shared: string[] | null;
  /**
   * When nothing is shared: the smallest sets of plants whose removal
   * restores a shared value. Ties are alternatives, one per distinct set.
   */
  conflicts: CompatConflict[];
  /** With a site: each plant passes, fails, or is unknown. Unknown for every plant when the site doesn't state the axis. */
  siteFit?: Record<string, SiteFit>;
}

export interface Compatibility {
  /** The plants considered: refs the library holds, distinct, in list order. Unsourced names are ignored. */
  plants: string[];
  axes: CompatAxisResult[];
}

/** The plant keys a list refs that the library holds, distinct, in list order. */
function listPlants(items: readonly PlantListItem[], plantsByKey: ReadonlyMap<string, PlantData>): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.plant === 'string') continue;
    if (plantsByKey.has(item.plant.ref)) seen.add(item.plant.ref);
  }
  return [...seen];
}

function sortBy(values: Iterable<string>, scale: readonly string[]): string[] {
  const set = new Set(values);
  return scale.filter((v) => set.has(v));
}

/**
 * Compatibility per axis for a plant list and optional site conditions
 * (spec: library.md, Compatibility). A plant with no data on an axis is
 * unknown there, never a conflict; unsourced list names are ignored.
 */
export function compatibility(
  items: readonly PlantListItem[],
  plantsByKey: ReadonlyMap<string, PlantData>,
  site?: CompatSite,
  vocab: Vocab = defaultVocab,
): Compatibility {
  const keys = listPlants(items, plantsByKey);
  const axes = COMPAT_AXES.map((def): CompatAxisResult => {
    const scale = def.vocab ? (vocab[def.vocab] as { id: string }[]).map((v) => v.id) : HALF_ZONES;
    const rows = keys.map((key) => {
      const a = def.accepts(plantsByKey.get(key)!);
      return { key, accepts: a && a.length ? sortBy(a, scale) : null };
    });
    const known = rows.filter((r): r is { key: string; accepts: string[] } => r.accepts !== null);
    const unknown = rows.filter((r) => r.accepts === null).map((r) => r.key);

    let shared: string[] | null = null;
    const conflicts: CompatConflict[] = [];
    if (known.length) {
      shared = scale.filter((v) => known.every((r) => r.accepts.includes(v)));
      if (!shared.length) {
        // For each value, the plants that don't accept it must go; the
        // fewest removals win, and values needing the same set are grouped.
        const byValue = scale
          .map((v) => ({ v, out: known.filter((r) => !r.accepts.includes(v)) }))
          .filter((c) => c.out.length < known.length);
        const fewest = Math.min(...byValue.map((c) => c.out.length));
        const groups = new Map<string, CompatConflict>();
        for (const c of byValue) {
          if (c.out.length !== fewest) continue;
          const id = c.out.map((r) => r.key).join('\n');
          const g = groups.get(id);
          if (g) g.restores.push(c.v);
          else groups.set(id, { restores: [c.v], plants: c.out.map((r) => ({ key: r.key, needs: r.accepts })) });
        }
        conflicts.push(...groups.values());
      }
    }

    const out: CompatAxisResult = { axis: def.axis, values: scale, plants: rows, unknown, shared, conflicts };
    if (site) {
      const want = def.site(site);
      out.siteFit = Object.fromEntries(
        rows.map((r): [string, SiteFit] => [
          r.key,
          !want || !r.accepts ? 'unknown' : want.every((v) => r.accepts!.includes(v)) ? 'pass' : 'fail',
        ]),
      );
    }
    return out;
  });
  return { plants: keys, axes };
}
