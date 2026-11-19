/**
 * Values computed at build and never stored (P3). Pure functions, shared by
 * the index build, the detail pages, and the tests.
 */
import vocabJson from '../config/vocab.json' with { type: 'json' };
import { featureAt, type GeoLayers } from './geo';
import { botanicalName, sortName } from './names';
import { expandZones, zoneIndex } from './zones';
import { compatibility, type CompatSite } from './compat';
import type { Companion, GeoDerived, LatLon, PaletteData, PaletteDerived, PlantData, PlantDerived, PlantUse, ProjectData, ProjectDerived, Vocab } from './types';

const defaultVocab = vocabJson as unknown as Vocab;

/** The months a bloom period covers, in calendar order of the period (wrapping the year). */
export function monthsBetween(start: number, end: number): number[] {
  const out: number[] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === end) break;
    m = (m % 12) + 1;
  }
  return out;
}

export function seasonsFor(months: number[], vocab: Vocab = defaultVocab): string[] {
  const set = new Set(months);
  const order = (vocab.season as { id: string }[]).map((s) => s.id);
  return order.filter((s) => (vocab.seasonMonths[s] ?? []).some((m) => set.has(m)));
}

export function sizeClassFor(form: string, heightMax: number | undefined, vocab: Vocab = defaultVocab): string | undefined {
  if (heightMax === undefined) return undefined;
  const rules = vocab.sizeClassRules[form];
  if (!rules) return undefined;
  for (const r of rules) {
    if (r.maxHeight === null || heightMax <= r.maxHeight) return r.class;
  }
  return undefined;
}

export function derivePlant(d: PlantData, vocab: Vocab = defaultVocab): PlantDerived {
  const out: PlantDerived = {
    name: botanicalName(d),
    sortName: sortName(d),
  };
  if (d.nativeRange) out.nativeStatus = d.nativeRange.states.length > 0 ? 'native' : 'adapted';
  if (d.bloom?.months) {
    out.bloomMonthList = monthsBetween(d.bloom.months.start, d.bloom.months.end);
    out.bloomSeasons = seasonsFor(out.bloomMonthList, vocab);
  }
  const sc = sizeClassFor(d.form, d.height?.max, vocab);
  if (sc) out.sizeClass = sc;
  if (d.hardiness) {
    out.hardinessZones = expandZones(d.hardiness);
    out.hardinessMin = zoneIndex(d.hardiness.min, 'min');
  }
  return out;
}

/**
 * A point's geography from the boundary layers in geo/ (P6): `state` (postal
 * code, as in the `state` vocabulary), `county` (5-digit FIPS), `place` (7-digit
 * Census place code, absent outside any incorporated place or CDP), and
 * `ecoregion` (EPA Level III code). Every value is absent for a point outside
 * the three states. The state is the county's, so the two always agree. Pass
 * `loadGeo()` from lib/geo-load.ts. `hardinessZone` waits on the zone data's terms
 * (spec/v1/map.md#open-questions).
 */
export function deriveGeo(location: LatLon, layers: GeoLayers): GeoDerived {
  const { lat, lon } = location;
  const county = featureAt(layers.counties, lon, lat);
  if (!county) return {};
  const out: GeoDerived = { state: county.props.state, county: county.id };
  const place = featureAt(layers.places, lon, lat);
  if (place) out.place = place.id;
  const eco = featureAt(layers.ecoregions, lon, lat);
  if (eco) out.ecoregion = eco.id;
  return out;
}

/**
 * A project's values from its plant list and the plants it refs. `plantsByKey`
 * maps `plant/<id>` to the plant's data. Unsourced names (plain text, or a ref
 * the library can't resolve) count as unknown: they add to `quantity` and
 * `byForm.unknown`, never to `taxa` or `nativeShare`. `geo` is passed in
 * (from `deriveGeo`). `compatibility` is the list's, with no site.
 */
export function deriveProject(
  d: ProjectData,
  plantsByKey: ReadonlyMap<string, PlantData>,
  geo: GeoDerived,
): ProjectDerived {
  const taxa = new Set<string>();
  const unsourced = new Set<string>();
  const byForm: Record<string, number> = {};
  let quantity = 0;
  let known = 0;
  let native = 0;
  for (const item of d.plantList) {
    const q = item.quantity ?? 0;
    quantity += q;
    const key = typeof item.plant === 'string' ? undefined : item.plant.ref;
    const plant = key ? plantsByKey.get(key) : undefined;
    if (!key || !plant) {
      unsourced.add(typeof item.plant === 'string' ? item.plant.trim().toLowerCase() : String(key));
      byForm.unknown = (byForm.unknown ?? 0) + q;
      continue;
    }
    taxa.add(key);
    byForm[plant.form] = (byForm[plant.form] ?? 0) + q;
    if (plant.nativeRange) {
      known += q;
      if (geo.state && plant.nativeRange.states.includes(geo.state)) native += q;
    }
  }
  const plants: ProjectDerived['plants'] = { taxa: taxa.size, unsourced: unsourced.size, quantity, byForm };
  if (geo.state && known > 0) plants.nativeShare = native / known;
  // A project has no site conditions of its own: its compatibility is the list's shared ranges, with no site fit.
  const out: ProjectDerived = { geo, plants, usesPlant: [...taxa].sort(), compatibility: compatibility(d.plantList, plantsByKey) };
  if (d.constructionBudget !== undefined && d.sizeAcres > 0) out.costPerAcre = Math.round(d.constructionBudget / d.sizeAcres);
  if (d.completed) out.completedYear = Number(d.completed.slice(0, 4));
  return out;
}

/**
 * A palette's values: `compatibility` over its list and its site's
 * conditions, and `geo` from `site.location` (pass `deriveGeo` of it, or
 * undefined without one). The site's zone is the one it states, or else the
 * location's, which waits on the zone layer (D33). Without a `site` there is
 * no site fit.
 */
export function derivePalette(
  d: PaletteData,
  plantsByKey: ReadonlyMap<string, PlantData>,
  geo?: GeoDerived,
  vocab: Vocab = defaultVocab,
): PaletteDerived {
  let site: CompatSite | undefined;
  if (d.site) {
    const { sun, moisture, soil } = d.site;
    const hardinessZone = d.site.hardinessZone ?? geo?.hardinessZone;
    site = { sun, moisture, soil, hardinessZone };
  }
  const out: PaletteDerived = { compatibility: compatibility(d.plantList, plantsByKey, site, vocab) };
  if (geo) out.geo = geo;
  return out;
}

/**
 * A plant's use across projects. `projects` are the entries (key, data, and
 * derived geography) whose lists include it by ref; unsourced text never
 * counts, even when it names the plant. Values are sorted and distinct.
 */
export function derivePlantUse(
  plantKey: string,
  projects: readonly { key: string; data: ProjectData; geo: GeoDerived }[],
): PlantUse {
  const keys: string[] = [];
  const sets = { states: new Set<string>(), counties: new Set<string>(), ecoregions: new Set<string>(), zones: new Set<string>() };
  let quantity = 0;
  for (const p of projects) {
    const lines = p.data.plantList.filter((i) => typeof i.plant !== 'string' && i.plant.ref === plantKey);
    if (lines.length === 0) continue;
    keys.push(p.key);
    for (const l of lines) quantity += l.quantity ?? 0;
    if (p.geo.state) sets.states.add(p.geo.state);
    if (p.geo.county) sets.counties.add(p.geo.county);
    if (p.geo.ecoregion) sets.ecoregions.add(p.geo.ecoregion);
    if (p.geo.hardinessZone) sets.zones.add(p.geo.hardinessZone);
  }
  const sorted = (s: Set<string>) => [...s].sort();
  return {
    projects: keys.sort(),
    quantity,
    states: sorted(sets.states),
    counties: sorted(sets.counties),
    ecoregions: sorted(sets.ecoregions),
    zones: sorted(sets.zones),
  };
}

/** The fewest projects two plants must share to be companions, so a single project doesn't decide it. */
export const COMPANION_MIN = 2;

/**
 * A plant's companions: the other plants that share its project lists, by
 * ref (unsourced text never counts), on at least `min` projects. Ranked by
 * the number of shared projects, most first, ties by key. Pass a region's
 * projects to get its companions there; a region with one project has none.
 */
export function companions(
  plantKey: string,
  projects: readonly { key: string; data: ProjectData }[],
  min: number = COMPANION_MIN,
): Companion[] {
  const shared = new Map<string, number>();
  for (const p of projects) {
    const keys = new Set<string>();
    for (const i of p.data.plantList) if (typeof i.plant !== 'string') keys.add(i.plant.ref);
    if (!keys.has(plantKey)) continue;
    keys.delete(plantKey);
    for (const k of keys) shared.set(k, (shared.get(k) ?? 0) + 1);
  }
  return [...shared]
    .filter(([, n]) => n >= min)
    .map(([plant, n]) => ({ plant, projects: n }))
    .sort((a, b) => b.projects - a.projects || a.plant.localeCompare(b.plant));
}
