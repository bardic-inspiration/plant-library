---
depends: [repo]
---

# Data model

## Goal

Define what the library stores: plants, projects, and palettes, the links
between them, and what is computed rather than stored. The model has to carry
the project's real complexity, which is in the data, the geography, and the
analysis built on them (P2, P3, P5, P6).

## Design

### Envelope

Every entry is one JSON file at `content/<type>/<id>.json`; the path must
match its `type` and `id`. Every entry has:

| Key | Holds |
|---|---|
| `type`, `id` | The type and the slug; together they are the entry's key, `<type>/<id>` |
| `name` | The display name (derived for a plant, see below) |
| `summary` | One plain sentence for cards and search |
| `data` | The type's technical data, validated strictly by `schemas/<type>.schema.json`; unknown keys fail |
| `description` | Optional prose in the markdown subset, in our own words |
| `tags` | Optional open organization: a flat map, every key a filter |
| `meta` | `createdAt`, `revisedAt`, and how the entry was made (`import` or `manual`) |

Unknown top-level keys are rejected. IDs are lowercase ASCII slugs, unique
within a type, and never change after merge.

### Plant

A plant entry is one taxon as it is specified on a plant schedule: a species,
a subspecies or variety, a hybrid, or a cultivar. A cultivar is its own
entry, since its size and habit differ from the species'.

**Name.** The parts are stored and the display name is derived (P3, P7), so
italics and cultivar quoting are always right:

| Field | Example |
|---|---|
| `genus` | `Acer` |
| `species` | `circinatum` (omitted for a cultivar of hybrid origin) |
| `hybrid` | `true` puts × before the epithet |
| `infraRank`, `infraEpithet` | `var.`, `contorta` |
| `cultivar` | `Pacific Fire` |
| `tradeName` | A trademark name shown beside the cultivar |

The `id` is the slug of the full botanical name: `acer-circinatum`,
`pinus-contorta-var-contorta`, `acer-circinatum-pacific-fire`. A plant's
envelope `name` is omitted; the build derives it.

Also stored: `commonNames` (the first is primary), `synonyms` (botanical
names the plant has been sold or published under, used to match plant lists),
`family`, and `usdaSymbol` where one exists. Ranks above family come from a
`config/vocab.json` family table, not from each entry.

**Traits.** All optional except `form`, because sources rarely cover
everything; a missing trait simply never matches a filter. Enumerated values
live in `config/vocab.json` with their labels and order.

| Field | Shape | Notes |
|---|---|---|
| `form` | enum | `tree`, `shrub`, `subshrub`, `perennial`, `graminoid`, `fern`, `vine`, `bulb`. This is the brief's "plant category". |
| `foliage` | enum | `deciduous`, `evergreen`, `semi-evergreen` |
| `height`, `spread` | `{ min, max }` in feet | Mature size. A single figure is `min` = `max`. |
| `growthRate` | enum | `slow`, `moderate`, `fast` |
| `sun` | array of enum | `full-sun`, `part-shade`, `shade` |
| `moisture` | array of enum | `dry`, `moist`, `wet` |
| `soil.texture` | array of enum | `sand`, `loam`, `clay` |
| `soil.drainage` | array of enum | `well`, `moderate`, `poor` |
| `soil.ph` | `{ min, max }` | |
| `hardiness` | `{ min, max }` | USDA zones as `7` or `7b` |
| `waterUse` | enum | `very-low`, `low`, `moderate`, `high`; established plants |
| `tolerates` | array of enum | `drought`, `inundation`, `salt`, `compaction`, `wind`, `deer`, `urban-pollution` |
| `bloom.colors` | array of enum | A fixed color vocabulary, each with a swatch token |
| `bloom.months` | `{ start, end }` | 1 to 12; may wrap the year (`11` to `2`) |
| `fallColor`, `fruit` | arrays of enum, short text | |
| `wildlife` | array of enum | `pollinators`, `birds`, `larval-host`, `cover` |
| `uses` | array of enum | `street-tree`, `screen`, `groundcover`, `bioretention`, `restoration`, `slope`, `meadow`, `specimen` |
| `wetlandIndicator` | map | National Wetland Plant List rating per region the scope touches: `{ "WMVC": "FAC", "AW": "FACU" }` |
| `nativeRange` | object | See below |

Units are US customary because that is what West Coast plant schedules use.
The template may also show metric; the stored value doesn't change.

**Native range** is a stub in v1, shaped so it can deepen without a
migration:

```json
"nativeRange": { "states": ["WA", "OR", "CA"], "ecoregions": [] }
```

`states` lists the scope states the plant is native to; an empty list means
it is native to none of them, which makes it a climate-adapted introduction.
`ecoregions` takes EPA Level III codes and stays empty until range data is
sourced. Polygons and county-level range are out of scope for v1.

**Images.** `images` is an ordered list:

```json
{ "file": "assets/images/plant/acer-circinatum/1.jpg",
  "alt": "Vine maple in fall color beside a path",
  "shows": "habit",
  "credit": "…", "license": "CC-BY-4.0", "sourceUrl": "…",
  "pinned": true }
```

Exactly one image is `pinned` when the list isn't empty; it is the thumbnail
on cards and map popups. `shows` is one of `habit`, `foliage`, `flower`,
`fruit`, `bark`, `in-landscape`. Every image carries its credit and a license
from the allowed list ([sources.md](sources.md#licensing-rules)). Size limits
are TL's: warn above 500 KB, fail above 2 MB.

**Sources** (P5). `sources` lists where the entry's facts came from:

```json
{ "source": "usda-plants",
  "url": "https://plants.usda.gov/plant-profile/ACCI",
  "accessed": "2026-11-17",
  "fields": ["family", "height", "bloom", "nativeRange"] }
```

`source` must be in the registry ([sources.md](sources.md#source-registry)).
Every populated trait, plus `family`, must appear in the `fields` of at least
one source. When sources disagree, the entry records one value and the PR
says which source won and why.

### Project

| Field | Shape | Notes |
|---|---|---|
| `name` | envelope | |
| `landscapeArchitect` | string | The landscape architect of record (firm) |
| `client` | string | |
| `location` | `{ lat, lon }` | WGS 84, decimal degrees, at most 5 decimal places. Must fall inside WA, OR, or CA. |
| `projectType` | enum | `park`, `campus`, `streetscape`, `commercial`, `civic`, `stormwater`, `restoration`, `residential` |
| `sizeAcres` | number | |
| `constructionBudget` | integer | Landscape construction, US dollars, not adjusted for inflation |
| `status` | enum | `proposed`, `constructed` |
| `completed` | `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` | Required when `constructed`; an expected date when `proposed` |
| `plantList` | array | See below |

All of these but `plantList` are required. Project data is the
organization's property; the repo and site are private
([repo.md](repo.md#hosting)), so real clients, budgets, and locations are
stored as they are.

No state, county, or town is stored; they are derived from `location` (P6).

A `plantList` item:

```json
{ "plant": { "ref": "plant/acer-circinatum" }, "quantity": 24,
  "size": "#5 container", "spacing": "As shown", "note": "Multi-stem" }
```

`quantity` is a positive integer and is required. `size`, `spacing`, and
`note` are optional short text, as written on the schedule. A plant appears
once per distinct `size`.

### Palette

A palette is a saved plant list that isn't a built project: a design mock-up,
a firm standard, or a list for a planting condition ("dry shade under
conifers").

| Field | Shape | Notes |
|---|---|---|
| `name` | envelope | |
| `site` | optional object | The conditions the palette is for: any of `sun`, `moisture`, `soil.drainage`, `hardinessZone`, and `location` (`{ lat, lon }`, from which the zone is derived when not given) |
| `plantList` | array | The same item shape as a project's; `quantity` is optional |

Palettes are made in the site's workspace and become entries only by
downloading the JSON and committing it
([library.md](library.md#palette-workspace)).

### References

- **A ref object**, `{ "ref": "<type>/<id>" }`, is valid at fields the schema
  declares as `RefOrText`. In v1 that is `plantList[].plant`.
- **A text token**, `{ref:<type>/<id>}`, is valid in any markdown-subset
  field and renders as the target's current name, linked.
- **Unsourced plants.** A `plantList` item may name a plant as plain text
  instead, exactly as the schedule wrote it:
  `{ "plant": "Cornus sericea 'Kelseyi'", "quantity": 120 }`. This lets a
  real plant list be entered whole before every plant is in the library.
  Validation warns on each one, and fails if the text matches the name or a
  synonym of a plant the library holds (it must be a ref then).
  `npm run coverage` lists them, most used first.
- Every ref must resolve. Deleting an entry others reference fails CI.
- The build computes back-references: a plant's `refBy` lists the projects
  and palettes whose lists include it.

### Derived values

Computed at build by `lib/derive.ts` and never stored (P3). Each is a facet
or a detail-page line.

| On | Derived | From |
|---|---|---|
| Plant | `name`, `sortName`, formatted name parts | The name fields |
| Plant | `nativeStatus` | `native` when `nativeRange.states` isn't empty, else `adapted` |
| Plant | `bloom.seasons` | `bloom.months` |
| Plant | `sizeClass` | `form` and `height.max`, by thresholds in `config/vocab.json` (small, medium, large tree and so on) |
| Plant | `use.projects`, `use.quantity` | Back-references from projects |
| Plant | `use.states`, `use.counties`, `use.ecoregions`, `use.zones` | The geography of the projects that use it |
| Plant | `companions` | The plants it most often shares a project list with ([map.md](map.md#distribution-analysis)) |
| Project | `geo.state`, `geo.county`, `geo.place`, `geo.ecoregion`, `geo.hardinessZone` | `location` tested against the boundary data in `geo/` ([map.md](map.md#boundary-data)) |
| Project | `plants.taxa`, `plants.quantity`, `plants.nativeShare`, `plants.byForm` | `plantList` and the plants it refs; `nativeShare` counts natives of the project's own state |
| Project | `costPerAcre` | `constructionBudget` and `sizeAcres` |
| Palette | `compatibility` | [library.md](library.md#compatibility) |
| Palette | `geo.*` | `site.location`, when given |

`geo.place` is the incorporated place or census-designated place containing
the point, or absent.

### Validation

`npm run validate` checks, and fails closed on:

- the envelope and the type's schema, unknown keys included;
- path, `type`, and `id` agreeing; the plant `id` equal to the slug of its
  name parts;
- `min` ≤ `max` in every range; months 1 to 12; hardiness zones in `1a` to
  `13b`;
- unique botanical names and synonyms across plants (a synonym may not be
  another plant's name);
- provenance: registered sources, and every populated trait covered;
- images: file exists, size limits, exactly one pinned, credit and an allowed
  license present;
- a project's `location` inside the scope states, and `completed` present
  when `constructed`;
- every ref resolving, and `{ref:…}` tokens only in markdown-subset fields;
- text fields within the markdown subset.

It warns on: unsourced plants in a plant list, near-duplicate common names,
images above 500 KB, and a plant with no image.

## Cases

The fixtures the build must handle; each becomes a test.

- A species: Acer circinatum.
- A variety: Pinus contorta var. contorta.
- A cultivar of a species: Acer circinatum 'Pacific Fire'.
- A hybrid cultivar with no species epithet and a trade name.
- A plant sold under a synonym: Mahonia aquifolium, also Berberis aquifolium.
- A plant with bloom months that wrap the year.
- A plant native to none of the three states.
- A plant with one trait covered by two sources that disagree.
- A project whose list mixes refs and unsourced text names.
- A project on a state line, and one in an unincorporated area (no place).
- A proposed project with no completion date.
- A palette with site conditions and no location.

## Done when

- Schemas exist for the envelope and the three types, and every rule under
  Validation has a passing and a failing fixture.
- `lib/derive.ts` has a test for each derived value, including each case
  above.
- The index build writes derived values and back-references, byte-identical
  across two builds of the same content.

## Open questions

- **Project boundaries.** A point is enough for v1. Whether a project should
  also carry a site polygon is left to the map pilot.

## Out of scope

Nursery availability and container sizes as structured data, maintenance
requirements, pest and disease data, Sunset climate zones (proprietary),
plant range polygons, and per-plant planting density.
