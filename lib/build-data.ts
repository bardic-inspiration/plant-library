/**
 * Everything the site and the index need, computed once from the content:
 * derived values, back-references, facets, and index records. Node only.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadLibrary, type Library } from './library';
import { derivePalette, derivePlant, derivePlantUse, deriveGeo, deriveProject } from './derive';
import { loadGeo } from './geo-load';
import { nameSegments, fullName } from './names';
import { facetValues, flatFacets, getPath, indexFacets, type Labeller } from './facets';
import { plainText } from './markdown';
import { entryUrl, url } from './site';
import type { GeoLayers } from './geo';
import type { Entry, FacetLabels, IndexRecord, LibraryIndex, PaletteData, PaletteDerived, PlantData, PlantListItem, PlantDerived, ProjectData, ProjectDerived } from './types';

export interface BuiltEntry {
  key: string;
  file: string;
  entry: Entry;
  name: string;
  derived: Record<string, unknown>;
  refs: string[];
  refBy: string[];
}

export interface BuildData {
  library: Library;
  entries: BuiltEntry[];
  byKey: Map<string, BuiltEntry>;
  index: LibraryIndex;
}

function refsOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((c) => refsOf(c, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.ref === 'string' && Object.keys(o).length === 1) out.add(o.ref);
    else Object.values(o).forEach((c) => refsOf(c, out));
  } else if (typeof v === 'string') for (const m of v.matchAll(/\{ref:([a-z]+\/[a-z0-9-]+)\}/g)) out.add(m[1]);
  return out;
}

function tagArrays(tags: Entry['tags']): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(tags ?? {}).sort(([a], [b]) => a.localeCompare(b))) out[k] = Array.isArray(v) ? v : [v];
  return out;
}

/** "King County": a county's name as the boundary layer gives it, with "County" added unless it has it. */
function countyName(name: string): string {
  return /county$/i.test(name) ? name : `${name} County`;
}

/** "Portland, OR": the place, else the county, with the state; names come from the boundary layers (P6). */
export function placeLabel(geo: ProjectDerived['geo'], layers = loadGeo()): string {
  const named = (layer: 'places' | 'counties', id?: string) => (id ? layers[layer].find((f) => f.id === id)?.name : undefined);
  const county = named('counties', geo.county);
  const where = named('places', geo.place) ?? (county ? countyName(county) : undefined);
  return [where, geo.state].filter(Boolean).join(', ');
}

/** The names a project's place goes by, for search: the place and the county (P6). */
function locationNames(geo: ProjectDerived['geo'], layers: GeoLayers): string[] {
  const place = geo.place ? layers.places.find((f) => f.id === geo.place)?.name : undefined;
  const county = geo.county ? layers.counties.find((f) => f.id === geo.county)?.name : undefined;
  return [place, county && countyName(county)].filter((x): x is string => Boolean(x));
}

/**
 * Labels for facet values outside any vocabulary: a county or place code gets
 * its name and state ("King County, WA", "Portland, OR"), an ecoregion code its
 * name, and an entry key the entry's name.
 */
export function makeLabeller(layers: GeoLayers, names: ReadonlyMap<string, string>): Labeller {
  // A place's state from its FIPS prefix, through the counties, which carry the postal code.
  const stateByFips = new Map(layers.counties.map((f) => [f.id.slice(0, 2), f.props.state]));
  const maps: Record<Exclude<FacetLabels, 'entries'>, Map<string, string>> = {
    counties: new Map(layers.counties.map((f) => [f.id, `${countyName(f.name)}, ${f.props.state}`])),
    places: new Map(layers.places.map((f) => [f.id, [f.name, stateByFips.get(f.id.slice(0, 2))].filter(Boolean).join(', ')])),
    ecoregions: new Map(layers.ecoregions.map((f) => [f.id, f.name])),
  };
  return (source, id) => (source === 'entries' ? names.get(id) : maps[source].get(id));
}

function deriveFor(entry: Entry, plants: ReadonlyMap<string, PlantData>): { name: string; derived: Record<string, unknown> } {
  if (entry.type === 'plant') {
    const d = derivePlant(entry.data as unknown as PlantData);
    return { name: d.name, derived: d as unknown as Record<string, unknown> };
  }
  if (entry.type === 'project') {
    const d = entry.data as unknown as ProjectData;
    const name = entry.name ?? entry.id;
    const layers = loadGeo();
    const dp = deriveProject(d, plants, deriveGeo(d.location, layers));
    return { name, derived: { name, sortName: name.toLowerCase(), ...dp, placeName: placeLabel(dp.geo, layers), locationNames: locationNames(dp.geo, layers) } };
  }
  const name = entry.name ?? entry.id;
  if (entry.type === 'palette') {
    const d = entry.data as unknown as PaletteData;
    const location = d.site?.location;
    const layers = loadGeo();
    const dp = derivePalette(d, plants, location ? deriveGeo(location, layers) : undefined);
    const placed = dp.geo ? { placeName: placeLabel(dp.geo, layers) } : {};
    return { name, derived: { name, sortName: name.toLowerCase(), ...dp, ...placed } };
  }
  return { name, derived: { name, sortName: name.toLowerCase() } };
}

/** Quantity listed per plant the project refs, by plant key: the map sizes a project by the matching plants' quantity. */
function plantQuantities(d: { plantList: ProjectData['plantList'] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of d.plantList) {
    if (typeof i.plant === 'string') continue;
    out[i.plant.ref] = (out[i.plant.ref] ?? 0) + (i.quantity ?? 0);
  }
  return out;
}

function cardFor(b: BuiltEntry): Record<string, unknown> {
  if (b.entry.type === 'plant') {
    const d = b.entry.data as unknown as PlantData;
    const dv = b.derived as unknown as PlantDerived;
    return {
      commonName: d.commonNames[0],
      form: d.form,
      height: d.height,
      spread: d.spread,
      sun: d.sun,
      moisture: d.moisture,
      hardiness: d.hardiness,
      bloomMonths: dv.bloomMonthList,
      bloomColors: d.bloom?.colors,
      nativeStatus: dv.nativeStatus,
    };
  }
  if (b.entry.type === 'project') {
    const d = b.entry.data as unknown as ProjectData;
    const dv = b.derived as unknown as ProjectDerived & { placeName: string };
    return {
      place: dv.placeName,
      location: [d.location.lon, d.location.lat],
      projectType: d.projectType,
      status: d.status,
      completed: d.completed,
      sizeAcres: d.sizeAcres,
      plantCount: dv.plants.taxa + dv.plants.unsourced,
      quantities: plantQuantities(d),
    };
  }
  if (b.entry.type === 'palette') {
    const d = b.entry.data as unknown as PaletteData;
    const dv = b.derived as unknown as PaletteDerived & { placeName?: string };
    const site = d.site;
    const card: Record<string, unknown> = { plantCount: paletteCount(d), quantities: plantQuantities(d) };
    if (site?.sun) card.sun = site.sun;
    if (site?.moisture) card.moisture = site.moisture;
    if (site?.soil?.drainage) card.drainage = site.soil.drainage;
    if (site?.hardinessZone) card.hardinessZone = site.hardinessZone;
    if (site?.location) {
      card.location = [site.location.lon, site.location.lat];
      if (dv.placeName) card.place = dv.placeName;
    }
    return card;
  }
  return {};
}

/** A palette's plant count as a project card counts it: distinct refs plus distinct unsourced names (D37). */
function paletteCount(d: PaletteData): number {
  const seen = new Set<string>();
  for (const i of d.plantList) seen.add(typeof i.plant === 'string' ? `text:${i.plant.trim().toLowerCase()}` : i.plant.ref);
  return seen.size;
}

function searchText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(searchText).join(' ');
  if (typeof v === 'object') return Object.entries(v).map(([k, c]) => `${k} ${searchText(c)}`).join(' ');
  return String(v);
}

/** A list line with the plant it refs, when the library holds it, and that plant's name parts and page. */
export interface ScheduleLine {
  item: PlantListItem;
  plant?: PlantData;
  parts?: [string, 'i' | 'r' | 't'][];
  url?: string;
  /** The unsourced name, or the ref. */
  text: string;
}

/** A plant list's lines with the plants they ref, for a schedule (site/src/components/ui/Schedule.tsx). */
export function scheduleLines(items: readonly PlantListItem[], byKey: ReadonlyMap<string, BuiltEntry>): ScheduleLine[] {
  return items.map((item) => {
    const k = typeof item.plant === 'string' ? undefined : item.plant.ref;
    const target = k ? byKey.get(k) : undefined;
    const plant = target?.entry.type === 'plant' ? (target.entry.data as unknown as PlantData) : undefined;
    const text = typeof item.plant === 'string' ? item.plant : k ?? '';
    return plant ? { item, plant, parts: nameSegments(plant), url: url(`${k}/`), text } : { item, text };
  });
}

/** The plants a compatibility result names, with their names and pages, for the panel. */
export function compatPlants(keys: readonly string[], byKey: ReadonlyMap<string, BuiltEntry>) {
  return new Map(
    keys.map((k) => {
      const d = byKey.get(k)!.entry.data as unknown as PlantData;
      return [k, { name: fullName(d), parts: nameSegments(d), url: url(`${k}/`) }] as const;
    }),
  );
}

let cache: BuildData | undefined;

/**
 * Build once per process. Pass `dataRoot` (tests do) to build from another
 * library folder; that result is not cached.
 */
/**
 * Whether the site builds pages for a type: it has `site/src/pages/<type>/[id].astro`.
 * Only those types are in the index, so the list view never links an
 * unbuilt page (D35, as the top bar lists only built sections, D10).
 */
export function hasPages(root: string, type: string): boolean {
  return existsSync(join(root, 'site', 'src', 'pages', type, '[id].astro'));
}

export function buildData(opts: { dataRoot?: string } = {}): BuildData {
  if (cache && !opts.dataRoot) return cache;
  const library = opts.dataRoot ? loadLibrary(undefined, opts.dataRoot) : loadLibrary();
  const { config } = library;
  const plants = new Map(
    library.entries.filter((e) => e.entry.type === 'plant').map((e) => [`plant/${e.entry.id}`, e.entry.data as unknown as PlantData] as const),
  );
  const entries: BuiltEntry[] = library.entries
    .map(({ file, entry }) => {
      const { name, derived } = deriveFor(entry, plants);
      return { key: `${entry.type}/${entry.id}`, file, entry, name, derived, refs: [...refsOf(entry)].sort(), refBy: [] as string[] };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const e of entries) for (const r of e.refs) byKey.get(r)?.refBy.push(e.key);
  for (const e of entries) e.refBy.sort();
  // A plant's use comes from the projects that list it, once their geography is derived.
  const projects = entries
    .filter((e) => e.entry.type === 'project')
    .map((e) => ({ key: e.key, data: e.entry.data as unknown as ProjectData, geo: (e.derived as unknown as ProjectDerived).geo }));
  for (const e of entries) if (e.entry.type === 'plant') e.derived.use = derivePlantUse(e.key, projects);

  const listed = new Set(Object.keys(config.types).filter((t) => hasPages(config.root, t)));
  const subjects = entries.filter((b) => listed.has(b.entry.type)).map((b) => ({
    b,
    type: b.entry.type,
    tags: tagArrays(b.entry.tags),
    subject: { ...b.entry, name: b.name, derived: b.derived, description: b.entry.description ? plainText(b.entry.description) : undefined },
  }));
  const labeller = makeLabeller(loadGeo(), new Map(entries.map((e) => [e.key, e.entry.type === 'plant' ? fullName(e.entry.data as unknown as PlantData) : e.name])));
  const facets = indexFacets(config.types, config.vocab, subjects, labeller);
  const records: IndexRecord[] = subjects.map(({ b, type, tags, subject }) => {
    const def = config.types[type];
    const fv: Record<string, string[]> = {};
    for (const f of flatFacets(config.types, type)) {
      const vals = facetValues(f, subject);
      if (vals.length) fv[f.key] = vals;
    }
    const sort: Record<string, string | number | null> = { name: String(b.derived.sortName ?? b.name.toLowerCase()) };
    for (const s of def.sorts) {
      const v = getPath(subject, s.path);
      sort[s.id] = v === undefined || v === null ? null : typeof v === 'number' ? v : String(v).toLowerCase();
    }
    const search: Record<string, string> = {};
    for (const p of [...def.search.boosted, ...def.search.fields]) {
      const t = searchText(getPath({ ...subject, tags }, p));
      if (t) search[p] = t;
    }
    const rec: IndexRecord = {
      key: b.key,
      type,
      id: b.entry.id,
      name: type === 'plant' ? fullName(b.entry.data as unknown as PlantData) : b.name,
      summary: b.entry.summary,
      url: entryUrl(b.key),
      facets: fv,
      tags,
      refs: b.refs,
      refBy: b.refBy,
      sort,
      search,
      card: cardFor(b),
      createdAt: b.entry.meta.createdAt,
    };
    for (const [other, path] of Object.entries(def.crossFilters ?? {})) {
      const v = getPath(subject, path);
      (rec.links ??= {})[other] = Array.isArray(v) ? [...new Set(v.map(String))].sort() : [];
    }
    if (type === 'plant') rec.nameParts = nameSegments(b.entry.data as unknown as PlantData);
    const pinned = ((b.entry.data as { images?: { file: string; alt: string; pinned?: boolean }[] }).images ?? []).find((i) => i.pinned);
    if (pinned) rec.thumb = { src: url(pinned.file), alt: pinned.alt };
    return rec;
  });
  const searchFields = {
    boosted: [...new Set(Object.values(config.types).flatMap((t) => t.search.boosted))],
    fields: [...new Set(Object.values(config.types).flatMap((t) => t.search.fields))],
  };
  const result = { library, entries, byKey, index: { facets, records, searchFields } };
  if (!opts.dataRoot) cache = result;
  return result;
}
