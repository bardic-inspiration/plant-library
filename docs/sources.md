# Sources

## Purpose

Every technical value on a plant is traceable to a source whose terms allow
this use (P5). Facts are recorded in our own schema and words; a source's
text is never copied.

## Behavior

### Registry

`config/sources.json`, validated by `schemas/sources.schema.json`. Each
source has a `name`, `publisher`, `kind` (`federal`, `state`, `local`,
`university`, `botanical-institution`, `nonprofit`, `professional`), `url`,
`hosts` (for classifying submitted URLs), `provides` (`names`, `traits`,
`range`, `wetland`, `images`, `boundaries`), `license`, an optional
`restriction` (`non-commercial`), `termsUrl`, `termsChecked` (the date
someone read the terms; required), `termsSummary`, and a `citation`
template with `{year}`, `{accessed}`, and `{contributor}`.

Registered now:

| Source | Why |
|---|---|
| `usda-plants` | USDA PLANTS. Terms read while the spec was written: plant information is free for any use, with citation. |
| `wikidata` | Wikidata, read through the taxonomy box on Wikimedia Commons category pages. Its data is CC0. Prototype only: cited for `family` (D20). |
| `king-county-native-plant-guide` | King County's *Native Plant Guide for Western Washington Yards* (2017). It states no terms, so it is cited for facts only (D18): common names, leaf habit, sun, moisture, mature height. |
| `staff-observation` | The organization's own observation, kind `professional`. Cited only for a trait no other source gives, and only with a `contributor`. It has no URL. |
| `portland-plant-list` | The City of Portland's *Portland Plant List* (June 2016 update). It states no terms, so it is cited for facts only (D23): common names, form, foliage, height, spread, growth rate, sun, moisture, bloom. |
| `placeholder` | Not a source: kind `placeholder`, no URL. It stands in for a required field (`family` or `form`) that no reference gives, only where no other citation covers that field (D24). `npm run coverage` lists every use. |

### Data stages

The repo is in the prototype stage. Production data is a later stage,
not yet specified ([spec/v1/sources.md](../spec/v1/sources.md#production-dataset)).

| | Prototype (now) | Production (later) |
|---|---|---|
| Purpose | Fixtures for building and testing the site | The library the company copy serves |
| Plants | Marked `meta.fixture: true`; values may be approximate | Not fixtures; each value checked against the page it cites |
| Sources | Any public source a session can read; one that states no terms is registered for facts only | Registered only after its terms are read and allow reuse in an open repository |
| Names and families | As the source gives them | USDA PLANTS' accepted names and families (D7) |
| Citations | Required by validation; each names the page the value came from | The same, at a page actually read, with disagreements resolved in the PR |
| Never, in either | Invented citations, a cited page nobody opened, copied prose, images without an allowed license | |

Validation is the same in both stages. A build that holds any fixture
plant shows the fixture banner ([site.md](site.md#the-fixture-library)).

### The prototype fixture set

`content/plant/` holds 473 fixture plants (`meta.fixture: true`), from the
two reference documents in `docs/`, under the names they use:

- **King County** (49 plants): every plant in *Native Plant Guide for
  Western Washington Yards* (2017). Each cites
  `king-county-native-plant-guide` for `commonNames`, `foliage`, `sun`,
  `moisture`, `height` (its single mature height, stored as min and max),
  and `form`, read from the list a plant is in: trees are `tree`, ferns
  `fern`, other shrubs `shrub`, and every groundcover and perennial
  `forb`; and `wikidata` for `family`, from the Commons category page
  of the species, or of the genus where the species page has no taxonomy
  box. The guide lists two roses under one name, so both carry the common
  name "Rosa species".
- **Portland** (424 more plants, and a citation on 44 of the King County
  ones): every plant in the native lists of the *Portland Plant List*
  (sections 3.3 to 3.16), read by the `pdf-plant-list` skill from
  `.claude/skills/pdf-plant-list/lists/portland-2016.json`. Each cites
  `portland-plant-list` at the copy in `docs/`, with the PDF pages in its
  note, for:
  - `form` from the list a plant is in: the tree list `tree`; the
    arborescent shrub and shrub lists `shrub`; grasses, sedges and rushes
    `graminoid`; ferns `fern`; forbs and other herbaceous plants `forb`;
    and the four the ground-cover list calls vines `vine`.
  - `lifeCycle` from the tables' life-cycle column, apart from `form`:
    perennial (or evergreen perennial), biennial, or annual. 202 plants
    have one, 20 of them annual or biennial; where the column is blank,
    and for trees and shrubs, it stays empty.
  - `height` (the tables' range, in feet), `sun` (full sun, part sun, full
    shade), `moisture` (seasonally wet, perennially wet and submerged are
    `wet`), `bloom` (colors, and the first to last month marked), and
    `foliage` `evergreen` for an evergreen perennial; for trees and shrubs
    with a description page, `height`, `spread`, `growthRate` (medium is
    `moderate`, very slow and very fast are `slow` and `fast`), `sun` and
    `moisture` from its conditions line, and `foliage` from the evergreen
    or deciduous tree section.
  - The list gives no family, so each of the 424 has the placeholder
    family `Placeholderaceae`, cited to `placeholder`.
  - Where a King County plant is on the list, under its name or another
    (8, such as *Berberis aquifolium* for *Mahonia aquifolium*), the entry
    gains the Portland common name, the Portland name as a synonym, and
    only the traits King County leaves empty; King County's values stand
    where both give one.
  - Obvious misspellings in the list's names were corrected (such as
    *Allium acuminitum*, *Carex hedersonii*). The list's wetland indicators
    use an older scheme (with + and − modifiers), not the NWPL regional
    ratings `wetlandIndicator` holds, so they aren't recorded.

Neither document gives hardiness, soil, or native range. The plants have no
images yet.

### Licensing rules

- In production, a source is registered only when its terms allow reuse in
  an open repository. A source that forbids redistributing its data may still be
  linked under a plant's `furtherReading`.
- Non-commercial sources and images are allowed in the prototype and
  flagged: the registry marks the source, an image is recognized by its
  license (`nonCommercial` in the vocabulary's license list), and
  `npm run coverage` lists them.
- Image licenses: public domain, CC0, CC BY, CC BY-SA, and their NC forms.
  No ND licenses.

### Attribution

`lib/attribution.ts` builds the list of cited sources (with the citation,
using the latest access date), every image's credit and license, and every
contributor. `npm run attribution` writes it to `ATTRIBUTION.md`; the About
page renders the same data. A test fails when `ATTRIBUTION.md` is stale, and
CI runs `npm run attribution -- --check` on every PR that validates.
`LICENSE-CONTENT` states the compilation's license (CC BY 4.0).

### Coverage

`npm run coverage` lists plant names that plant lists give as text, most
used first (none until projects exist), every entry, field, and image
that depends on a non-commercial source or license, and every field that
holds a placeholder.

## Where the rules live

`config/sources.json`, `schemas/sources.schema.json`, the provenance block
in `lib/validate.ts`, `lib/attribution.ts`, `lib/coverage.ts`, and the
`plant-import` skill (`.claude/skills/plant-import/SKILL.md`).

## Extending

Register a source only after reading its terms: add it to
`config/sources.json` with `termsChecked` set to that day and
`termsSummary` saying what they allow. The survey of sources still to check,
and the 50-plant fixture set, are in
[`spec/v1/sources.md`](../spec/v1/sources.md).
