# Content model

## Purpose

What an entry holds, what is derived from it, and what validation enforces
(P2, P3, P5). Plants, projects, and palettes are built; the derived value
still to add (a project's hardiness zone) is in
[`spec/v1/data-model.md`](../spec/v1/data-model.md).

## Behavior

### Envelope

Every entry is one JSON file at `content/<type>/<id>.json`, and the path
must match its `type` and `id`.

| Key | Holds |
|---|---|
| `type`, `id` | The type and a lowercase ASCII slug; together the key `<type>/<id>`. IDs never change after merge. |
| `name` | The display name. Omitted for plants, whose name is derived. |
| `summary` | One plain sentence for cards and search |
| `data` | The type's data, validated by `schemas/<type>.schema.json`; unknown keys fail |
| `description` | Optional prose in the markdown subset |
| `tags` | Optional open map; each key becomes a filter |
| `fieldNotes` | Optional attributed observations: `topic`, `note`, `author` (name, role), `date`, and optionally `region`, `project`, and `trait` |
| `meta` | `createdAt`, `revisedAt`, `method` (`import`, `manual`, `submission`), optional `submissions` and `fixture` |

Unknown top-level keys fail.

### Plant

One taxon as a plant schedule specifies it: a species, an infraspecific
taxon, a hybrid, or a cultivar (its own entry).

**Name parts:** `genus`, `species` (absent for a cultivar of hybrid
origin), `hybrid`, `infraRank` and `infraEpithet`, `cultivar`, `tradeName`.
The id is the slug of the botanical name (`acer-circinatum-pacific-fire`,
`pinus-contorta-var-contorta`, `acer-x-freemanii`, `rosa-radrazz`).
`lib/names.ts` derives every display form: epithets italic, the rank and ×
upright, cultivars upright in single quotes, the trade name in small caps
beside the cultivar and outside the botanical name.

Also: `commonNames` (first is primary), `synonyms`, `family` (must be in the
`config/vocab.json` family table, which holds the order), `usdaSymbol`.

**Habit and life cycle** are separate traits that never compete (D27).
`form` is the habit, required: `tree`, `shrub`, `subshrub`, `forb` (a
herbaceous plant that isn't grasslike), `graminoid`, `fern`, `vine`,
`bulb`. `lifeCycle` is optional: `perennial`, `biennial`, `annual`. An
annual grass is `graminoid` and `annual`; a woody plant's life cycle is
left empty unless a source gives it. Each has its own filter.

**Traits** (all optional but `form`): `form`, `lifeCycle`, `foliage`, `height` and
`spread` (`{min, max}` feet), `growthRate`, `sun`, `moisture`,
`soil.texture`, `soil.drainage`, `soil.ph`, `hardiness` (USDA zones `7` or
`7b`), `waterUse`, `tolerates`, `bloom.colors`, `bloom.months` (`{start,
end}`, may wrap the year), `fallColor`, `fruit`, `wildlife`, `uses`,
`wetlandIndicator` (rating per NWPL region), `nativeRange` (`states`;
`ecoregions` stays empty until sourced). Enumerations are lists in
`config/vocab.json`; schemas name a list with `x-vocab` and the loader turns
it into an enum.

**Images** (`data.images`): `file`, `alt`, `shows`, `credit`, `license`
(from the vocabulary's allowed list), optional `sourceUrl`, and `pinned` on
exactly one.

**Sources** (`data.sources`): each citation names a registered `source`,
the `url` read, the `accessed` date, and the `fields` it supports. A parent
key (`soil`, `bloom`) covers its parts. `data.furtherReading` links pages
that aren't registered sources; nothing is cited to them.

### Project

A built or proposed landscape and its plant list (`schemas/project.schema.json`).
The entry states its `name`.

| Field | Shape | Notes |
|---|---|---|
| `landscapeArchitect` | short text | The landscape architect of record (firm) |
| `client` | short text | Optional; proprietary |
| `location` | `{ lat, lon }` | WGS 84, decimal degrees, at most 5 decimal places; must fall inside WA, OR, or CA |
| `projectType` | `projectType` vocabulary | `park`, `campus`, `streetscape`, `commercial`, `civic`, `stormwater`, `restoration`, `residential` |
| `sizeAcres` | number | Greater than 0 |
| `constructionBudget` | integer | Optional; proprietary. Landscape construction, US dollars, not adjusted for inflation |
| `status` | `projectStatus` vocabulary | `proposed`, `constructed` |
| `completed` | `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` | Required when `constructed`; an expected date, or absent, when `proposed` |
| `plantList` | array | See below |

`client` and `constructionBudget` are the type's `fixtureRules.proprietary`
fields in `config/types.json`: with `fixturesOnly` on they must be blank, and
every project must carry `meta.fixture: true`
([workflow.md](workflow.md#the-prototype-and-the-company-copy)). The other
fields are required. No state, county, or town is stored; they are derived
from `location` (P6, [geography.md](geography.md)).

A `plantList` item (`plantListItem` in `schemas/common.schema.json`):

```json
{ "plant": { "ref": "plant/acer-circinatum" }, "quantity": 24,
  "size": "#5 container", "spacing": "As shown", "note": "Multi-stem" }
```

`quantity` is a positive integer and required; `size`, `spacing`, and `note`
are optional short text, as written on the schedule. `plant` is `RefOrText`
(below): a ref to a plant, or the name as the schedule wrote it when the
library doesn't hold the plant yet. A plant appears once per distinct `size`.

### Palette

A saved plant list that isn't a built project: a design mock-up, a firm
standard, or a list for a planting condition ("dry shade under conifers")
(`schemas/palette.schema.json`). The entry states its `name`.

| Field | Shape | Notes |
|---|---|---|
| `site` | optional object | The conditions the palette is for; at least one of the keys below |
| `site.sun`, `site.moisture`, `site.soil.drainage` | lists from the `sun`, `moisture`, `soilDrainage` vocabularies | Each may state several values (a part-sun, part-shade site) |
| `site.hardinessZone` | a USDA zone, `8` or `8b` | A whole zone stands for both halves |
| `site.location` | `{ lat, lon }` | As a project's `location`: at most 5 decimal places, inside WA, OR, or CA |
| `plantList` | array | `paletteListItem` in `schemas/common.schema.json`: a project's item shape with `quantity` optional |

The type has `fixtureRules` with no proprietary fields, so with
`fixturesOnly` on every palette must be a fixture. The plant-list rules and
`RefOrText` apply to its list as to a project's. Palettes are made in the
site's workspace and become entries by being submitted and merged; both are
still in [`spec/v1/library.md`](../spec/v1/library.md) and
[`spec/v1/submissions.md`](../spec/v1/submissions.md). Palettes have pages
and are in the index ([site.md](site.md#palette-page)), with a site
conditions facet (sun, moisture, drainage).

### Derived values

`lib/derive.ts`, never stored:

| Derived | From |
|---|---|
| `name`, `sortName` | The name parts |
| `nativeStatus` | `native` when `nativeRange.states` isn't empty, `adapted` when it is; absent when `nativeRange` is |
| `bloomMonthList`, `bloomSeasons` | `bloom.months`, with seasons from `seasonMonths` in the vocabulary |
| `sizeClass` | `form` and `height.max`, by `sizeClassRules` in the vocabulary |
| `hardinessZones`, `hardinessMin` | `hardiness`, as half zones |

A project's, from `deriveProject` (its plant list, the plants it refs, and
`deriveGeo(location)`):

| Derived | From |
|---|---|
| `plants.taxa` | Distinct plants the library holds; a plant at several sizes counts once |
| `plants.unsourced` | Distinct unsourced names: unknown, never in `taxa` |
| `plants.quantity` | Total quantity on the list, unsourced lines included |
| `plants.byForm` | Quantity by plant form; unsourced lines under `unknown` |
| `plants.nativeShare` | Quantity of plants native to the project's own state, over the quantity of plants with a known `nativeRange`; absent with no state or none known |
| `costPerAcre` | `constructionBudget` over `sizeAcres`, rounded to the dollar; absent without a budget |
| `completedYear` | The year of `completed`; absent without a date |
| `usesPlant` | The `plant/<id>` keys the list refs that the library holds, sorted and distinct; the *Uses plant* facet |
| `compatibility` | `compatibility` over the list, with no site, so no axis has a `siteFit` ([Compatibility](#compatibility)) |

The build adds `placeName` ("Portland, OR") and `locationNames` (the place
and county names, searched) from the boundary layers.

A plant's use, from `derivePlantUse` over the projects whose lists ref it
(unsourced text never counts, even when it names the plant): `use.projects`,
`use.quantity`, and the distinct `use.states`, `use.counties`,
`use.ecoregions`, and `use.zones` of those projects. `use.zones` stays empty
until `geo.hardinessZone` exists (D33). `lib/build-data.ts` attaches it to
each plant as `derived.use`, which the *Used in* facets and the plant page's
"Used on" read.

A plant's companions, from `companions` over the same projects: the other
plants its lists share, by ref, on at least two projects
(`COMPANION_MIN`), each with the number of shared projects, most first and
ties by key. A plant at several sizes counts its project once. Passing a
region's projects gives its companions there, so a region with one project
has none. The build attaches them as `derived.companions`, and copies them
to the plant's index record as `companions` when there are any, for the
workspace's suggestions.

### Distribution analysis

`lib/analysis.ts` holds the figures the M8 pages and overlays read, as pure
functions over projects (key, data, and `deriveGeo` of the location). Each
figure carries `projects`, the number of projects behind it, so a page can
show its sample size; as for a plant's use, only refs count, never
unsourced text.

| Function | Gives |
|---|---|
| `plantDistribution(plant, projects, data?)` | The plant's projects and quantity in total, `byState`, `byCounty`, `byEcoregion`, `byZone` (empty until D33), and `byYear` by completion year, with projects with no date `undated`; `outsideNativeRange`, the states it is used in that its `nativeRange` leaves out (empty when the range is unknown) |
| `projectsIn(projects, regions)` | The projects in any of the selected states, counties, ecoregions, or zones: a union, as values within a region facet are ORed |
| `regionSummary(projects, plants)` | For those projects: `plants`, ranked by projects, then quantity, then key; `taxa` and `unsourced` counts with the projects listing any; `nativeShare`, quantity native to each plant's own project's state over the quantity with a known range, with that quantity and its projects; `byForm`, quantity and projects per form, unsourced lines under `unknown` |
| `rankPlants(plants, by)` | The same table ranked by quantity instead, projects breaking ties |

Comparison (`lib/compare.ts`) sets two of these side by side for the
compare page ([site.md](site.md#compare-page)), never computing a figure
of its own beyond pairing and overlap:

| Function | Gives |
|---|---|
| `comparePlants(a, b, projects, plants)` | Each plant's `plantDistribution`; `byState`, `byCounty`, `byEcoregion`, `byZone`, and `byYear` paired (`pair`: one row per id either side has, sorted by id, a zero figure where a side has none); and `both`, the projects whose lists ref both |
| `compareRegions(a, b, projects, plants)` | Each region's `regionSummary` over `projectsIn` for it alone; `byForm` paired; `shared`, the plants listed in both with each side's figure, by the fewer projects of the two sides, then their sum, then key; and `overlap`, the projects in both (a county inside a state) |

A region is a level and an id (`state:WA`, `county:53033`, `ecoregion:10`).

`build:index` also writes `site/public/analysis.json` (`analysisFile` in
`lib/analysis-data.ts`): each project's region ids, plant list (plant
and quantity only), and completion year, each plant's form and native states, and the region
levels the selectable overlays filter by, with the facet keys that select
each (`selectedRegions` reads a query's filters with them). The map view's
per-region view runs `projectsIn` and `regionSummary` on it, which take any
project with a list and geography (`RegionProject`), and the compare page
runs `plantDistribution` on it too, which takes one with a completion date
or year as well (`DistributionProject`), so the browser and the build give
the same figures (P3).

Counts follow `deriveProject`: a line with no quantity adds nothing to a
quantity but still counts its project, and a plant at several sizes counts
its project once.

A palette's, from `derivePalette` (its list, the plants it refs, and
`deriveGeo(site.location)` when it has one), attached by the build as its
`derived`:

| Derived | From |
|---|---|
| `compatibility` | `compatibility` over the list and the site's `sun`, `moisture`, `soil.drainage`, and zone ([Compatibility](#compatibility)); with no `site`, no axis has a `siteFit` |
| `geo` | `deriveGeo(site.location)`; absent without a location |

The site's zone is `site.hardinessZone`, or else the location's
`geo.hardinessZone`, which waits on the zone layer (D33), so for now a
palette with only a location has an unknown hardiness fit.

The build adds `placeName` from the location's geography, as for a project.

The build also computes each entry's `refs` and `refBy` (back-references);
a plant's `refBy` lists the projects and palettes whose lists include it.

### Compatibility

`compatibility` in `lib/compat.ts` says whether a plant list's plants share
growing conditions, and how they fit a site. It is one pure function, so the
build (for projects and palettes) and the workspace always agree (P3); the
compatibility panel on project and palette pages shows it
([site.md](site.md#compatibility-panel)).
It is about growing conditions only and makes no claim about design,
spacing, or competition.

It takes a plant list, the plants by key, and optional site conditions
(`sun`, `moisture`, `soil.drainage`, each one value or several, and
`hardinessZone`). It considers each plant the list refs and the library
holds, once, in list order; unsourced names are ignored. For each axis, in
the order sun, moisture, soil drainage, hardiness zone, water use, it
returns:

| Field | Holds |
|---|---|
| `values` | The axis's values in order, the grid's columns: the vocabulary list, or the half zones 1a–13b |
| `plants` | Each plant with the values it accepts, or `null` when it has no data on the axis |
| `unknown` | The plants with no data; never part of a conflict |
| `shared` | The values every plant with data accepts; `null` when none has data |
| `conflicts` | When nothing is shared: the smallest sets of plants whose removal restores a shared value, each plant with the values it accepts (`needs`) and each set with the values it `restores`. Tied sets are alternatives, one per distinct set |
| `siteFit` | With a site: each plant `pass`, `fail`, or `unknown` |

- Hardiness compares half zones, as `derived.hardinessZones` does: a plant
  rated `7`–`9` accepts 7a to 9b.
- A plant has one `waterUse`, so it accepts that level only, and a shared
  value is a single hydrozone (D53).
- A site passes a plant when the plant accepts every value the site states
  on the axis; a whole site zone (`8`) needs both halves. A plant with no
  data, or an axis the site doesn't state, is `unknown`. A site has no
  water use, so that axis is always `unknown`.

The site's zone is given, not derived: a site location's zone waits on the
zone layer (D33).

### References

- A ref object `{ "ref": "<type>/<id>" }` must resolve.
- **`RefOrText`** (`refOrText` in `schemas/common.schema.json`): a ref object
  or plain short text. In v1 that is `plantList[].plant`, where a ref must
  name a plant. Plain text is an **unsourced plant**: validation warns on
  it, and fails if the text matches a plant's botanical name, a synonym, or
  its name with the trade name (compared as `normalizeName` does: case,
  quotes, and marks ignored), since it must be a ref then. `npm run
  coverage` lists unsourced names, most used first.
- A `{ref:<type>/<id>}` token is allowed only in markdown-subset fields
  (`description`, field note `note`) and renders as the target's current
  name, linked.
- The markdown subset: paragraphs, emphasis, strong, https links, line
  breaks, and lists. No HTML, headings, images, code, tables, or quotes.

### Validation

`npm run validate` fails on:

- config files against their schemas, and facets naming unknown vocabulary;
- the envelope and the type schema, unknown keys included;
- path, type, and id disagreeing; a plant id that isn't the slug of its
  name; a stored plant name; `revisedAt` before `createdAt`;
- `min` > `max` in any range; months outside 1–12; zones outside 1a–13b or
  reversed;
- duplicate botanical names; a synonym that is another plant's name, the
  plant's own name, or another plant's synonym; a family not in the table;
- citing an unregistered source; a populated trait no source cites; citing
  a source for what it doesn't `provide`; a staff observation for a trait
  another source gives, or without a contributor; a citation without a URL,
  except from a `professional` or `placeholder` source; a placeholder for a
  field other than `family` or `form`, or for one another source gives;
- a missing image file, one over 2 MB, a pinned count other than one, a
  license not on the allowed list, a file outside the plant's folder;
- unresolved refs and ref tokens, ref tokens outside markdown fields, text
  outside the markdown subset, a field note on an unknown trait, a trait on
  a project's or palette's field note, a field note's `project` that isn't
  a project, a field note's `submission` missing from `meta.submissions`;
- with `fixturesOnly` on, an entry of a type with `fixtureRules` that isn't
  a fixture or fills a proprietary field;
- a project `location` or palette `site.location` outside WA, OR, and CA
  (by `deriveGeo` over the boundary layers), or with more than 5 decimal
  places in `lat` or `lon`;
  `completed` missing when `status` is `constructed`;
- in a plant list (a project's or a palette's): a ref to something other than a plant; the same plant
  twice with the same `size` (no size counts as one size; text names are
  compared normalized); an unsourced name that matches a plant's name,
  synonym, or name with trade name.

It warns on near-duplicate primary common names, images over 500 KB, a plant
with no image, a citation of a field the entry leaves empty, and each
unsourced plant in a plant list.

## Where the rules live

`schemas/` (shapes), `config/vocab.json` (values and thresholds),
`lib/validate.ts` (cross-entry rules), `lib/derive.ts`, `lib/names.ts`,
`lib/zones.ts`, `lib/compat.ts`, `lib/analysis.ts`. Each rule has a passing and a failing case in
`tests/validate.test.ts` (plants), `tests/project.test.ts` (projects and
plant lists), and `tests/palette.test.ts` (palettes, their derived values,
and the fixture palettes); compatibility is tested in `tests/compat.test.ts`, and the distribution
analysis and companions in `tests/analysis.test.ts`.

## Extending

- **A new trait:** add it to `schemas/plant.schema.json`, to
  `CITED_TRAITS` in `lib/validate.ts` with the registry category that may
  cite it, to `site/src/lib/traits.ts` for its label, and, if it's a
  filter, a facet in `config/types.json`.
- **A new value** in an enumeration: a line in `config/vocab.json`.
- **A new compatibility axis:** an entry in `COMPAT_AXES` in
  `lib/compat.ts`, naming its vocabulary list and where a plant and a site
  hold it.
- **A new type:** a schema, an entry in `config/types.json`, and its pages.
