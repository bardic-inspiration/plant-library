# Content model

## Purpose

What an entry holds, what is derived from it, and what validation enforces
(P2, P3, P5). Plants are built; projects and palettes are still in
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

**Traits** (all optional but `form`): `form`, `foliage`, `height` and
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
  another source gives, or without a contributor; a non-professional
  citation without a URL;
- a missing image file, one over 2 MB, a pinned count other than one, a
  license not on the allowed list, a file outside the plant's folder;
- unresolved refs and ref tokens, ref tokens outside markdown fields, text
  outside the markdown subset, a field note on an unknown trait;
- with `fixturesOnly` on, an entry of a type with `fixtureRules` that isn't
  a fixture or fills a proprietary field.

It warns on near-duplicate primary common names, images over 500 KB, a plant
with no image, and a citation of a field the entry leaves empty.

## Where the rules live

`schemas/` (shapes), `config/vocab.json` (values and thresholds),
`lib/validate.ts` (cross-entry rules), `lib/derive.ts`, `lib/names.ts`,
`lib/zones.ts`. Each rule has a passing and a failing case in
`tests/validate.test.ts`.

## Extending

- **A new trait:** add it to `schemas/plant.schema.json`, to
  `CITED_TRAITS` in `lib/validate.ts` with the registry category that may
  cite it, to `site/src/lib/traits.ts` for its label, and, if it's a
  filter, a facet in `config/types.json`.
- **A new value** in an enumeration: a line in `config/vocab.json`.
- **A new type:** a schema, an entry in `config/types.json`, and its pages.
