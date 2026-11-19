# Architecture

## Purpose

Plant Library is files plus a static site (P1). Entries are JSON files in
`content/`; scripts validate them and derive everything computable; Astro
builds one HTML page per entry and a Preact island for the Library.

## Behavior

### Layout

```
content/<type>/<id>.json           entries (plants so far)
assets/images/plant/<id>/<n>.*     plant images
schemas/                           JSON schemas: common, envelope, plant, project, sources, site, types, overlays
config/                            site.json, types.json, vocab.json, sources.json, overlays.json
geo/                               boundary layers (TopoJSON) the build derives geography from
lib/                               code shared by scripts, the site, and tests
scripts/                           the npm scripts' entry points
site/                              the Astro project (src/, public/, astro.config.mjs)
tests/                             Vitest suites; tests/fixtures/library is a fixture library
docs/                              this folder
spec/v1/                           the unbuilt part of the v1 design
.claude/, .github/                 session settings, hook, and skills; workflows and templates
```

### Stack

TypeScript on Node 22, npm with a committed lockfile, Astro 7 (static
output) with Preact 11 islands, Ajv (JSON Schema 2020-12), MiniSearch,
`marked` for the markdown subset, plain CSS with tokens and Stylelint,
Montserrat through `@fontsource`, `topojson-client` for the boundary
layers, MapLibre GL JS and PMTiles for the map ([map.md](map.md)), with
`opentype.js` for its glyphs, Lucide icons inlined, Vitest, and
Playwright with axe-core. Versions are pinned in `package-lock.json`;
Dependabot proposes upgrades ([decisions.md](decisions.md)).

### Pipeline

1. `lib/library.ts` loads config, schemas, and entries, and runs every
   validation rule ([content-model.md](content-model.md#validation)).
2. `lib/build-data.ts` derives values, resolves refs, computes
   back-references, extracts facets, and builds the index records. It runs
   once per process; the site's pages and the scripts share it.
3. `npm run build:index` writes `site/public/library.json` (the lean
   index), every full entry to `site/public/data/<type>/<id>.json` (and each
   plant list as a CSV schedule, `<id>.csv`, beside it), and
   copies `assets/` to `site/public/assets/`. It stops on any validation
   error. The output is sorted and has no timestamps, so two builds of the
   same content are byte-identical.
4. `npm run build:map` writes the map style from the tokens, the map
   glyphs, and the overlays' data to `site/public/map/` ([map.md](map.md)).
5. `astro build --root site` renders the pages to `site/dist/`.

Every internal URL goes through `lib/site.ts`, which reads the base path
from `config/site.json`.

### Scripts

| Script | Does |
|---|---|
| `validate` | All validation rules; exits 1 on any error |
| `build:index`, `build:map`, `build` | The index, the map style and glyphs, then the site |
| `dev`, `preview` | Astro's dev server; a static server for `site/dist` with range requests |
| `build:fixtures`, `dev:fixtures` | The same, from the fixture library ([site.md](site.md#the-fixture-library)) |
| `check` | `tsc`, Stylelint, and the link check |
| `links` | Relative Markdown links in the repo, and internal links in the built site |
| `test` | Vitest |
| `a11y` | axe on sample pages of the built site, at 1280 and 360 px |
| `snapshots` | Full-page screenshots of the sample pages into `snapshots/` |
| `lane`, `pr-summary` | CI helpers ([workflow.md](workflow.md)) |
| `coverage` | Unsourced plant names and non-commercial dependencies ([sources.md](sources.md#coverage)) |
| `attribution` | Regenerates `ATTRIBUTION.md`; `-- --check` fails when stale |
| `geo` | Rebuilds the boundary layers in `geo/` from their sources; not part of the build ([geography.md](geography.md)) |
| `basemap` | Cuts the PMTiles basemap into `site/public/`; run by the deploy workflow, needs Go ([map.md](map.md#basemap)) |

## Where the rules live

`lib/` holds every rule; scripts are thin entry points. Client-safe modules
(`names`, `derive`, `compat`, `geo`, `zones`, `facets`, `filter`, `format`, `markdown`,
`site`, `registry`, `map-style`, `map-data`, `glyphs`, `overlays`, `workspace`, `export`, `cutsheet`) have no Node imports, so the island uses them too.

## Extending

A new script is a file in `scripts/` that calls into `lib/`, plus a line in
`package.json` and in the table above.
