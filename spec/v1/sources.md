---
depends: [data-model]
---

# Sources

## Goal

Decide where plant data, images, and boundary data may come from, how each
fact stays traceable to its source, and how the production library is
first filled: 50 Pacific Northwest natives (P5, P8).

This file is about production data, a later stage
([README](README.md#data-stages)). Prototype fixtures follow lighter rules
and are built ([docs/sources.md](../../docs/sources.md#data-stages)).

In production, technical plant information comes only from educational and governmental
sources and botanical institutions. Blogs, informal sources, and commercial
sites (nursery catalogs included) are not used for it.

## Design

The source registry, the licensing rules, attribution, and coverage are
built; see [docs/sources.md](../../docs/sources.md). What remains is the
survey of sources still to check, the production dataset, the fixture
projects and palettes v1 runs on, and the import workflow (a later
version).

### Source survey

The first pass of the survey, done while writing this spec. "Verified" means
the terms were read; everything else must be checked before it is
registered.

**Register first** (terms verified, reuse allowed):

| Source | Use for | Terms |
|---|---|---|
| USDA PLANTS Database | Accepted names and symbols, family, native status by state, wetland indicator status, and the Characteristics data (height, bloom period, flower color, moisture use, shade tolerance, soil texture, pH, minimum temperature) where a species has it | Plant information, lists, and distribution maps are not copyrighted and are free for any use, with citation. Images vary per file. |
| GBIF | Occurrence records for native range, later | Every dataset is CC0, CC BY, or CC BY-NC; prefer the first two, and cite the download DOI |
| Calflora | California occurrence and status data | Contributed public data is dedicated CC0; photos default to CC BY-NC, so flagged if used |

**Check terms, then register** (expected to be usable):

| Source | Use for |
|---|---|
| USDA NRCS Plant Guides and Fact Sheets | Establishment, uses, site conditions (federal) |
| USDA Forest Service Fire Effects Information System and Silvics manuals | Site conditions and habit of native trees and shrubs (federal) |
| USACE National Wetland Plant List | Wetland indicator status (federal) |
| USDA Plant Hardiness Zone Map (2023) | Zone boundaries; the GIS data is published through PRISM at Oregon State, whose terms need reading |
| EPA Level IV Ecoregions | Finer ecoregion boundaries, later (Level III is registered: `epa-ecoregions`) |
| USGS digitized range maps of Little's *Atlas of United States Trees* | Tree native ranges, later |
| King County Native Plant Guide | Which Western Washington natives suit landscapes, with size, moisture, and exposure |
| Washington Department of Ecology, Rain Garden Handbook for Western Washington | Rain garden plant lists by zone |
| City of Seattle Stormwater Manual, Appendix J plant and tree lists; Green Factor plant list; SDOT street tree list | Bioretention and street tree suitability |
| City of Portland plant list and Stormwater Management Manual | Native and stormwater suitability in Oregon |
| WUCOLS (UC Davis) | Water use by California region |
| SelecTree (Cal Poly Urban Forest Ecosystems Institute) | Tree traits and street tree suitability |
| OSU Landscape Plants | Identification and traits of landscape plants |
| WSU Extension and the Washington Native Plant Society | Native plant traits and lists |
| Jepson eFlora (UC Berkeley) | California taxonomy and descriptions |
| Burke Herbarium Image Collection (University of Washington) | Washington taxonomy and distribution |
| World Flora Online, ITIS | Accepted names and synonyms |
| Wikimedia Commons, iNaturalist | Images, per-file license only |

**Restricted:**

| Source | Terms | Here |
|---|---|---|
| Calscape (California Native Plant Society) | Non-commercial use only; commercial use needs written consent | May be registered, flagged non-commercial |
| OregonFlora | Asks that data not be redistributed without the data owners' permission | Not registered; further reading only, unless its owners give permission |

The survey continues as a build task: read each remaining source's terms,
register the ones that pass, and add county, city, and botanical garden
sources for Oregon and California to match the Washington ones above.

### Production dataset

A later stage, outside the v1 milestones: it starts when the owner opens
it. The prototype fixture plants
([docs/sources.md](../../docs/sources.md#the-prototype-fixture-set)) are
then checked against these rules or replaced.

- **Which plants.** The production library starts with 50 plants native to
  the Pacific Northwest, enough to exercise every form, trait, and filter.
  The list below is a candidate, chosen for nursery availability and a
  spread of forms and conditions. The task confirms each against the King
  County Native Plant Guide and USDA PLANTS (accepted name, native in
  Washington) and swaps any that fail.
- **Where the data comes from.** USDA PLANTS first, since its terms are
  verified. Gaps are filled from the federal sources above, then from others
  as their terms are checked. A trait no registered source gives stays empty.
  Sources registered only for the prototype (`wikidata`, and
  `king-county-native-plant-guide`, whose terms are unstated) are cleared or
  dropped.
- **Names** follow USDA PLANTS' accepted name, with the names the nursery
  trade uses as `synonyms` (Mahonia and Berberis, Frangula and Rhamnus,
  Struthiopteris and Blechnum).
- **Done when** 50 plant entries, not fixtures, pass validation with full
  provenance, and at least 40 have a pinned image under an allowed license.
- **Last known blocker.** USDA PLANTS' API answered every request with a 504
  from its own load balancer on 2026-11-17 and 2026-11-18, and
  `plants.usda.gov` redirects to `plants.sc.egov.usda.gov`, which the cloud
  environment doesn't allow.

Trees (14): Acer circinatum, Acer macrophyllum, Alnus rubra, Arbutus
menziesii, Cornus nuttallii, Crataegus douglasii, Frangula purshiana, Malus
fusca, Picea sitchensis, Pinus contorta var. contorta, Pseudotsuga menziesii,
Quercus garryana, Thuja plicata, Tsuga heterophylla.

Shrubs (20): Amelanchier alnifolia, Cornus sericea, Corylus cornuta var.
californica, Gaultheria shallon, Holodiscus discolor, Lonicera involucrata,
Mahonia aquifolium, Mahonia nervosa, Morella californica, Oemleria
cerasiformis, Philadelphus lewisii, Physocarpus capitatus, Ribes sanguineum,
Rosa nutkana, Rubus parviflorus, Rubus spectabilis, Sambucus racemosa,
Spiraea douglasii, Symphoricarpos albus, Vaccinium ovatum.

Perennials, ferns, and graminoids (16): Achillea millefolium, Aquilegia
formosa, Arctostaphylos uva-ursi, Aruncus dioicus, Asarum caudatum, Camassia
quamash, Carex obnupta, Deschampsia cespitosa, Dicentra formosa, Fragaria
chiloensis, Iris tenax, Juncus ensifolius, Polystichum munitum, Sisyrinchium
idahoense, Struthiopteris spicant, Tellima grandiflora.

### Fixture projects and palettes

v1's only project and palette data
([README](README.md#v1-runs-on-fixtures)). Every one is fictional, marked
`meta.fixture: true`, with `client` and `constructionBudget` blank.

- **Where.** `content/project/` and `content/palette/` for the library's own
  build, referencing the prototype fixture plants; `tests/fixtures/library/`
  holds a smaller set referencing its own plants, for tests and
  `build:fixtures`. Tests may also generate projects in memory where a case
  needs volume (the map's fifty-project case).
- **How many.** About a dozen projects and a few palettes in each library,
  spread across the three states and every project type and status.
- **What they exercise.** Between them they carry the Cases in
  [data-model.md](data-model.md#cases), [library.md](library.md#cases), and
  [map.md](map.md#cases): mixed refs and unsourced text names (made-up or
  real species the library lacks, never a client's schedule), points on and
  near state and county lines, an unincorporated point, a proposed project
  with no completion date, plants shared across projects so companions have
  data, and a palette with a wet-soil conflict.
- **Who builds them.** M4 adds the projects (with the project type) and M6
  the palettes (with the palette type).

### Import workflow

A later version, outside v1, with real project data. The owner plans to
fill the library from real projects' plant lists. In this repo only the
species come across: the plants a real list names are sourced and added,
while the project itself, and its PDF, stay out until the company copy.
The steps that are already settled:

1. A project entry is written from a plant list, with every plant the
   library holds as a ref and the rest as text
   ([data-model.md](data-model.md#references)).
2. `npm run coverage` lists the unsourced plants across all projects and
   palettes, most used first.
3. A `plant-import` session takes plants from that list, finds each in the
   registered sources, writes the entries with their `sources`, and replaces
   the text names with refs in the same PR.

## Done when

- Both libraries hold the fixture projects (M4) and palettes (M6) above,
  passing validation with `fixturesOnly` on.
- `npm run coverage` lists the unsourced names in the fixture projects
  (the listing itself is built; the fixture projects aren't).

## Open questions

- **PDF plant lists.** A plant list file arrives attached to an "Add
  project" submission ([submissions.md](submissions.md#forms)) and the
  `integrate` routine transcribes it. Still open: how schedule
  abbreviations and misspellings are matched to plants. Steps 1 to 3 above
  don't depend on the answer.
- **Images.** Whether openly licensed photographs exist for every plant at
  usable quality, or the owner will supply their own; and how many images a
  plant may have before the repo gets too heavy.

## Out of scope

The production dataset and real project data, in v1: a later version
([Production dataset](#production-dataset), [Import workflow](#import-workflow)).

Scraping at build time, live API calls from the site, and any source that
needs an account or a paid license.
