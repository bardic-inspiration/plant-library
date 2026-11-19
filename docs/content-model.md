# Content model

## Purpose

What an entry holds, what is derived from it, and what validation enforces
(P2, P3, P5). Plants and the project schema are built; project derived
values and palettes are still in
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

### Derived values

`lib/derive.ts`, never stored:

| Derived | From |
|---|---|
| `name`, `sortName` | The name parts |
| `nativeStatus` | `native` when `nativeRange.states` isn't empty, `adapted` when it is; absent when `nativeRange` is |
| `bloomMonthList`, `bloomSeasons` | `bloom.months`, with seasons from `seasonMonths` in the vocabulary |
| `sizeClass` | `form` and `height.max`, by `sizeClassRules` in the vocabulary |
| `hardinessZones`, `hardinessMin` | `hardiness`, as half zones |

The build also computes each entry's `refs` and `refBy` (back-references).

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
  outside the markdown subset, a field note on an unknown trait;
- with `fixturesOnly` on, an entry of a type with `fixtureRules` that isn't
  a fixture or fills a proprietary field;
- a project `location` outside WA, OR, and CA (by `deriveGeo` over the
  boundary layers), or with more than 5 decimal places in `lat` or `lon`;
  `completed` missing when `status` is `constructed`;
- in a plant list: a ref to something other than a plant; the same plant
  twice with the same `size` (no size counts as one size; text names are
  compared normalized); an unsourced name that matches a plant's name,
  synonym, or name with trade name.

It warns on near-duplicate primary common names, images over 500 KB, a plant
with no image, a citation of a field the entry leaves empty, and each
unsourced plant in a plant list.

## Where the rules live

`schemas/` (shapes), `config/vocab.json` (values and thresholds),
`lib/validate.ts` (cross-entry rules), `lib/derive.ts`, `lib/names.ts`,
`lib/zones.ts`. Each rule has a passing and a failing case in
`tests/validate.test.ts` (plants) and `tests/project.test.ts` (projects and
plant lists).

## Extending

- **A new trait:** add it to `schemas/plant.schema.json`, to
  `CITED_TRAITS` in `lib/validate.ts` with the registry category that may
  cite it, to `site/src/lib/traits.ts` for its label, and, if it's a
  filter, a facet in `config/types.json`.
- **A new value** in an enumeration: a line in `config/vocab.json`.
- **A new type:** a schema, an entry in `config/types.json`, and its pages.
