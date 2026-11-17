---
depends: [data-model]
---

# Sources

## Goal

Decide where plant data, images, and boundary data may come from, how each
fact stays traceable to its source, and how the library is first filled: a
fixture set of 50 Pacific Northwest natives (P5, P8).

Technical plant information comes only from educational and governmental
sources and botanical institutions. Blogs, informal sources, and commercial
sites (nursery catalogs included) are not used for it.

## Design

### Source registry

`config/sources.json` lists every source an entry may cite. An entry citing
an unregistered source fails validation.

```json
"usda-plants": {
  "name": "USDA PLANTS Database",
  "publisher": "USDA Natural Resources Conservation Service",
  "kind": "federal",
  "url": "https://plants.usda.gov",
  "provides": ["names", "traits", "range", "wetland"],
  "license": "public-domain",
  "termsUrl": "https://plants.usda.gov/assets/docs/PLANTS_Help_Document.pdf",
  "termsChecked": "2026-11-17",
  "citation": "USDA, NRCS. {year}. The PLANTS Database (https://plants.usda.gov, {accessed}). National Plant Data Team, Greensboro, NC USA."
}
```

`kind` is one of `federal`, `state`, `local`, `university`,
`botanical-institution`, `nonprofit`, and `professional`, which is only the
organization's own `staff-observation`
([submissions.md](submissions.md#professional-opinion)). `provides` says what the source may be
cited for. `termsChecked` is the date someone read the terms; a source can't
be registered without it.

### Licensing rules

- **Facts, not text.** Entries record measurements and classifications in
  our own schema, and descriptions are written in our own words. A source's
  prose, tables, and layout are never copied.
- **A source is registered only when its terms allow this reuse.** Federal
  works are public domain. Anything else needs terms that permit reuse with
  attribution. A source that forbids redistributing its data is not
  registered, since this repo is open source; it may still be linked from a
  plant page under "Further reading".
- **Non-commercial sources are allowed in the prototype, and flagged.** The
  prototype is a personal, non-commercial project, so a source or image
  limited to non-commercial use may be used here. But the entries are meant
  to be copied into a company tool, where that use ends. So the registry
  marks such a source `"restriction": "non-commercial"`, an image under an
  NC license is recognized by its license, and `npm run coverage` lists
  every entry, field, and image that depends on one. The handover clears or
  replaces each before commercial use
  ([repo.md](repo.md#prototype-and-handover)). Prefer an unrestricted source
  whenever one gives the same fact, so that list stays short.
- **Images** need an explicit license per file: public domain, CC0, CC BY,
  CC BY-SA, the NC forms of those (flagged, as above), or the owner's own
  photographs. No ND licenses, and no image whose license can't be shown.
- **Each source is cited as it asks.** The registry's `citation` renders on
  the plant page and the About page.

### Attribution

`ATTRIBUTION.md` and the site's About page are generated from the registry
and the entries: each cited source with its citation, and each image with
its credit and license. `LICENSE-CONTENT` states the license of this repo's
own compilation and prose (CC BY 4.0, as TL); images keep their own
licenses.

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
| EPA Level III and IV Ecoregions | Ecoregion boundaries |
| US Census TIGER/Line | State, county, and place boundaries (federal) |
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

### Fixture set

The library starts with 50 plants native to the Pacific Northwest, enough to
exercise every form, trait, and filter.

- **Which plants.** The list below is a candidate, chosen for nursery
  availability and a spread of forms and conditions. The fixture task
  confirms each against the King County Native Plant Guide and USDA PLANTS
  (accepted name, native in Washington) and swaps any that fail. The King
  County site couldn't be reached from the session that wrote this spec, so
  none is confirmed yet.
- **Where the data comes from.** USDA PLANTS first, since its terms are
  verified. Gaps are filled from the federal sources above, then from others
  as their terms are checked. A trait no registered source gives stays empty.
- **Names** follow USDA PLANTS' accepted name, with the names the nursery
  trade uses as `synonyms` (Mahonia and Berberis, Frangula and Rhamnus,
  Struthiopteris and Blechnum).

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

Alongside them, about a dozen made-up projects and a few palettes, marked
as fixtures, spread across the three states and the project types, so the project
pages, the map, and the analysis have data before real projects arrive.

### Import workflow

The owner plans to fill the library from real projects' plant lists. In
this repo only the species come across: the plants a real list names are
sourced and added, while the project itself, and its PDF, stay out until the
company copy. The steps that are already settled:

1. A project entry is written from a plant list, with every plant the
   library holds as a ref and the rest as text
   ([data-model.md](data-model.md#references)).
2. `npm run coverage` lists the unsourced plants across all projects and
   palettes, most used first.
3. A `plant-import` session takes plants from that list, finds each in the
   registered sources, writes the entries with their `sources`, and replaces
   the text names with refs in the same PR.

## Done when

- `config/sources.json` has a schema, and a test fails an entry that cites
  an unregistered source or leaves a populated trait uncited.
- 50 plant entries pass validation with full provenance, and at least 40
  have a pinned image under an allowed license.
- `ATTRIBUTION.md` and the About page are generated, and a test fails when
  they are stale.
- `npm run coverage` lists the unsourced names in the fixture projects, and
  everything that depends on a non-commercial source or image.

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

Scraping at build time, live API calls from the site, and any source that
needs an account or a paid license.
