import type { Compatibility } from './compat';

/** Shapes shared by scripts and the site. The JSON schemas are the authority; these mirror them. */

export interface Range { min: number; max: number }
export interface ZoneRange { min: string; max: string }
export interface Person { name: string; role: string }
export interface Ref { ref: string }

export interface FieldNote {
  topic: string;
  note: string;
  author: Person;
  date: string;
  region?: string;
  project?: Ref;
  trait?: string;
  submission?: string;
}

export interface Meta {
  createdAt: string;
  revisedAt: string;
  method: 'import' | 'manual' | 'submission';
  submissions?: string[];
  fixture?: boolean;
}

export interface Entry<D = Record<string, unknown>> {
  type: string;
  id: string;
  name?: string;
  summary: string;
  data: D;
  description?: string;
  tags?: Record<string, string | string[]>;
  fieldNotes?: FieldNote[];
  meta: Meta;
}

export interface PlantImage {
  file: string;
  alt: string;
  shows: string;
  credit: string;
  license: string;
  sourceUrl?: string;
  pinned?: boolean;
}

export interface Citation {
  source: string;
  url?: string;
  accessed: string;
  fields: string[];
  contributor?: Person;
  note?: string;
}

export interface NameParts {
  genus: string;
  species?: string;
  hybrid?: boolean;
  infraRank?: string;
  infraEpithet?: string;
  cultivar?: string;
  tradeName?: string;
}

export interface PlantData extends NameParts {
  commonNames: string[];
  synonyms?: string[];
  family: string;
  usdaSymbol?: string;
  form: string;
  lifeCycle?: string;
  foliage?: string;
  height?: Range;
  spread?: Range;
  growthRate?: string;
  sun?: string[];
  moisture?: string[];
  soil?: { texture?: string[]; drainage?: string[]; ph?: Range };
  hardiness?: ZoneRange;
  waterUse?: string;
  tolerates?: string[];
  bloom?: { colors?: string[]; months?: { start: number; end: number } };
  fallColor?: string[];
  fruit?: string;
  wildlife?: string[];
  uses?: string[];
  wetlandIndicator?: Record<string, string>;
  nativeRange?: { states: string[]; ecoregions: string[] };
  images?: PlantImage[];
  sources: Citation[];
  furtherReading?: { title: string; url: string }[];
}

export type PlantEntry = Entry<PlantData>;

export interface VocabValue { id: string; label: string; [k: string]: unknown }

export interface Vocab {
  [list: string]: unknown;
  sizeClassRules: Record<string, { class: string; maxHeight: number | null }[]>;
  seasonMonths: Record<string, number[]>;
  families: Record<string, { label?: string; order?: string }>;
}

export interface Bucket { id: string; label: string; min?: number; max?: number }

export interface FacetDef {
  id: string;
  label: string;
  kind: 'value' | 'range' | 'zones' | 'months' | 'pairs';
  path: string;
  vocab?: string;
  keyVocab?: string;
  unit?: string;
  buckets?: Bucket[];
  /** Where a value's label comes from when it isn't in a vocabulary: a boundary layer (by code) or the entry a key names. */
  labels?: FacetLabels;
}

export type FacetLabels = 'counties' | 'places' | 'ecoregions' | 'entries';

export interface FacetGroupDef { group: string; label: string; facets: FacetDef[] }

export interface SortDef { id: string; label: string; path: string; descending?: boolean }

export interface TypeDef {
  label: string;
  plural: string;
  schema: string;
  namedBy?: 'derived' | 'entry';
  fixtureRules?: { proprietary: string[] };
  facets: (FacetDef | FacetGroupDef)[];
  /** Another type's filters reach this type through the entry keys at a path (D39). */
  crossFilters?: Record<string, string>;
  sorts: SortDef[];
  search: { boosted: string[]; fields: string[] };
}

export type TypeRegistry = Record<string, TypeDef>;

export interface SourceDef {
  name: string;
  publisher: string;
  kind: string;
  url?: string;
  hosts?: string[];
  provides: string[];
  license: string;
  restriction?: 'non-commercial';
  termsUrl?: string;
  termsChecked: string;
  termsSummary?: string;
  citation: string;
}

export interface SiteConfig {
  title: string;
  description: string;
  base: string;
  fixturesOnly: boolean;
  store: 'browser' | 'folder';
  submissions: { maxBytes: Record<'image' | 'plant-list' | 'supporting', number> };
  basemap: { file: string; maxZoom: number };
}

/** A point: WGS 84, decimal degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Geography derived from a point (lib/derive.ts `deriveGeo`). Never stored (P6). */
export interface GeoDerived {
  state?: string;
  county?: string;
  place?: string;
  ecoregion?: string;
  /** Waits on the zone data's terms (D33); collected into `use.zones` once present. */
  hardinessZone?: string;
}

export interface PlantListItem {
  plant: Ref | string;
  quantity?: number;
  size?: string;
  spacing?: string;
  note?: string;
}

export interface ProjectData {
  landscapeArchitect: string;
  client?: string;
  location: LatLon;
  projectType: string;
  sizeAcres: number;
  constructionBudget?: number;
  status: string;
  completed?: string;
  plantList: PlantListItem[];
}

/** Derived project values (lib/derive.ts). Never stored. */
export interface ProjectDerived {
  geo: GeoDerived;
  plants: {
    /** Distinct plants the library holds (a plant listed at several sizes counts once). */
    taxa: number;
    /** Distinct unsourced names: unknown, never counted in `taxa`. */
    unsourced: number;
    /** Total quantity on the list, unsourced lines included. */
    quantity: number;
    /** Share of the quantity of plants with a known native range that are native to the project's state; absent when none is known or the project has no state. */
    nativeShare?: number;
    /** Quantity by plant form; unsourced lines under `unknown`. */
    byForm: Record<string, number>;
  };
  /** Dollars per acre, rounded; absent without a budget. */
  costPerAcre?: number;
  /** The year of `completed`, for the Completed facet; absent without a date. */
  completedYear?: number;
  /** The plants the list names that the library holds, as `plant/<id>` keys, sorted and distinct. */
  usesPlant: string[];
  /** `compatibility` over the list, with no site (lib/compat.ts). */
  compatibility: Compatibility;
}

/** The conditions a palette is for. Each condition may state several values. */
export interface PaletteSite {
  sun?: string[];
  moisture?: string[];
  soil?: { drainage: string[] };
  /** A zone as entries write it (`8` or `8b`). */
  hardinessZone?: string;
  location?: LatLon;
}

export interface PaletteData {
  site?: PaletteSite;
  plantList: PlantListItem[];
}

/** Derived palette values (lib/derive.ts `derivePalette`). Never stored. */
export interface PaletteDerived {
  /** `compatibility` over the list and the site's conditions (lib/compat.ts). */
  compatibility: Compatibility;
  /** From `site.location`; absent without one. */
  geo?: GeoDerived;
}

/** A plant's use across projects (lib/derive.ts `derivePlantUse`). Never stored. */
export interface PlantUse {
  projects: string[];
  quantity: number;
  states: string[];
  counties: string[];
  ecoregions: string[];
  zones: string[];
}

/** Derived plant values (lib/derive.ts). Never stored. */
export interface PlantDerived {
  name: string;
  sortName: string;
  nativeStatus?: 'native' | 'adapted';
  bloomSeasons?: string[];
  bloomMonthList?: number[];
  sizeClass?: string;
  hardinessZones?: string[];
  hardinessMin?: number;
  /** Its use across projects (`derivePlantUse`), attached by the build. */
  use?: PlantUse;
}

/** One lean record per entry in site/public/library.json. */
export interface IndexRecord {
  key: string;
  type: string;
  id: string;
  name: string;
  /** Name as styled runs: italic, roman, or trade name (lib/names.ts). */
  nameParts?: [string, 'i' | 'r' | 't'][];
  summary: string;
  url: string;
  thumb?: { src: string; alt: string };
  facets: Record<string, string[]>;
  tags: Record<string, string[]>;
  refs: string[];
  refBy: string[];
  /** For each type whose filters reach this entry (`crossFilters`), the entries of that type it reaches them through. */
  links?: Record<string, string[]>;
  sort: Record<string, string | number | null>;
  search: Record<string, string>;
  card: Record<string, unknown>;
  createdAt: string;
}

export interface LibraryIndex {
  facets: IndexFacet[];
  records: IndexRecord[];
  /** The search fields across types; boosted ones weigh more. */
  searchFields: { boosted: string[]; fields: string[] };
}

/** A facet as the client sees it: flattened, with its values in display order. */
export interface IndexFacet {
  key: string;
  type: string;
  label: string;
  group?: string;
  groupLabel?: string;
  values: { id: string; label: string }[];
}
