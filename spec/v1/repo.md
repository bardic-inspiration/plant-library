---
depends: []
---

# Repo

## Goal

Set the repository up like `ttrpg-library` (TL), without its D&D parts and
without agent routines, so the same working habits apply: every change is a
PR, CI enforces the rules, and `main` is always complete (P1, P8, P11).

## Design

### What carries over from TL

| From TL | Here |
|---|---|
| One JSON file per entry under `content/`, validated by Ajv schemas | Same, without the ruleset level: `content/<type>/<id>.json` |
| `config/types.json` type registry driving facets, cards, and filters | Same |
| `scripts/validate`, `build-index`, `links`, `lane`, `pr-summary`, `serve`, `a11y`, `snapshots` | Same roles |
| Astro static site with one Preact island for the gallery | Same, plus a map island |
| Plain CSS with token files, Stylelint forbidding literals, contrast tests | Same ([styling.md](styling.md)) |
| `docs/` conventions: topic files with Purpose, Behavior, Where the rules live, Extending | Same |
| Stage spec in `spec/v<N>/`, emptied by building it | Same (this folder) |
| `AGENTS.md`, `CLAUDE.md`, `docs/decisions.md` with principles | Same, rewritten for this repo |
| Work lanes enforced by branch prefix and changed paths | Same, with different prefixes (below) |
| `.claude/settings.json`, the session-start hook, the `ask-me` and `grill-me` skills | Same |
| Workflows `validate.yml`, `deploy.yml`, `labeler.yml`; Dependabot; issue and PR templates | Same |

### What doesn't

- **Rulesets**: `rulesets/`, derived rules values, text tokens other than
  `{ref:…}`, rules pages, primitives, components, and the wording layer.
- **TL's routines**: the `generate` and `revise` skills, the request and
  revise issue templates, gap fill, and the routine labels. Nothing here
  generates content. The one routine integrates what people submit
  ([submissions.md](submissions.md#the-integrate-skill)); other content is
  added in sessions the owner starts.
- **SRD material**: the blocklist, SRD import, `srd-coverage`, `srd-extract`,
  and SRD attribution. Attribution here is per source
  ([sources.md](sources.md#attribution)).
- **Exports**: TL's PNG capture and translators. Exports here are CSV, JSON,
  and print ([library.md](library.md#exports)).
- **Themes**: one light palette ([styling.md](styling.md#color)).

### Technology

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript, Node 22 LTS | As TL |
| Package manager | npm, lockfile committed | As TL |
| Site generator | Astro, static output | One HTML page per entry |
| Islands | Preact | The library and the map |
| Schema validation | Ajv, JSON Schema 2020-12 | As TL |
| Search | MiniSearch | As TL |
| Markdown in text fields | `marked`, sanitized | The same limited subset as TL |
| Map | MapLibre GL JS, PMTiles | [map.md](map.md#engine) |
| Geometry | A point-in-polygon helper (`@turf/boolean-point-in-polygon` or `d3-geo`) | Build-time geography ([data-model.md](data-model.md#derived-values)) |
| Styling | Plain CSS, tokens, Stylelint | [styling.md](styling.md) |
| Fonts | Montserrat (OFL) via `@fontsource` | No external font requests |
| Icons | Lucide (ISC), inlined SVG | A handful of control icons |
| Tests | Vitest; Playwright with axe-core | As TL |

The site's base path is held in `lib/site.ts` and every internal link goes
through it, so the site can move between hosts.

### Prototype and handover

The project has two stages, and one codebase serves both.

**Prototype (this repo).** A personal, open source experiment under the MIT
license. It holds no real project data:

- Every project and palette is made up, and says so: `meta.fixture` is
  `true`, and the name makes it obvious.
- The proprietary fields, `client` and `constructionBudget`, are left blank
  ([data-model.md](data-model.md#project)).
- `config/site.json` has `"fixturesOnly": true`, and with it the validator
  fails any project or palette that isn't a fixture or that fills a
  proprietary field. The rule is enforced, not remembered (P8).

**Company copy.** When the prototype is ready, the repo is copied and the
copy's ownership passes to the company. From then on the copy is the
company's: it turns `fixturesOnly` off, takes real project data, and is
served from an internal web server. Nothing flows back from it to this repo.
Before the copy is used commercially, its handover checklist is worked
through:

- remove the fixture projects and palettes;
- clear or replace every source and image flagged non-commercial
  ([sources.md](sources.md#licensing-rules)); `npm run coverage` lists them;
- set the base path and the basemap's zoom for the internal server;
- decide the copy's own license notice.

### Hosting

The site is static files and depends on no particular host: the base path
and the basemap location are settings in `config/site.json`. The prototype
runs locally with `npm run dev`, and `deploy.yml` builds the site and keeps
it as a workflow artifact. The company copy publishes the same build to an
internal web server; the only requirement on that server is that it honors
HTTP range requests, for the basemap ([map.md](map.md#basemap)).

### Layout

```
content/plant/<id>.json            plants
content/project/<id>.json          projects
content/palette/<id>.json          saved palettes
assets/images/plant/<id>/<n>.*     plant images
schemas/                           envelope, one schema per type, submission
config/                            types.json, sources.json, overlays.json, vocab.json, site.json
geo/                               boundary data for derivation and overlays (map.md)
lib/                               helpers shared by scripts and the site
                                   (names, derive, compat, geo, site base)
scripts/                           validate, build-index, coverage, inbox, links,
                                   lane, pr-summary, serve, a11y, snapshots
inbox/, processed/                 submissions unpacked locally; git-ignored
site/                              the Astro project
tests/                             Vitest suites and fixtures
docs/                              what is built (README.md is the index)
spec/v1/                           this stage spec
.claude/, .github/                 session settings and skills; workflows and templates
AGENTS.md, CLAUDE.md, README.md, LICENSE, LICENSE-CONTENT, ATTRIBUTION.md
```

npm scripts: `validate`, `build:index`, `build`, `dev`, `check`, `links`,
`test`, `a11y`, `snapshots` as in TL, plus `coverage`, which lists the plants
that projects and palettes name but the library lacks
([sources.md](sources.md#import-workflow)), and `inbox`, which unpacks and
checks submissions ([submissions.md](submissions.md#mechanical-checks)).

### Lanes

| | Content lane | Dev lane |
|---|---|---|
| Paths | `content/**`, `assets/images/**` | Everything else; content paths only as a migration |
| Branch prefix | `content/<short-description>`; `content/sub-<id>` for a submission | `dev/<short-description>`, `dependabot/` |
| Before a push | `npm run validate`, `npm run build` | Those, then `npm run check` and `npm test` |
| PR template | `content.md` | `dev.md` |

Docs-only and text-only PRs run the reduced checks TL defines. `spike/`
branches can't merge. Never push to `main`; never rewrite pushed history;
PRs are squash-merged with the title `<area>: <summary>`.

Area labels, added by the labeler from paths: `ui` (`site/**`), `data`
(`schemas/**`, `config/**`, `lib/**`), `map` (`geo/**`, map components), `ci`
(`.github/**`), `migration` (content paths in a dev PR).

### CI

- **`validate.yml`** on every PR: lane rules, `validate`, `build`, and for
  dev PRs `check` and `test`. A job summary lists changed entries with their
  key facts (a plant's form and size; a project's location and plant count).
  The milestone-closing PR also runs `a11y`.
- **`deploy.yml`** on merge to `main`: build the index, `astro build`, and
  keep the site as an artifact ([Hosting](#hosting)).

### Docs to write as parts are built

`docs/README.md` (index and conventions), `architecture.md`,
`content-model.md`, `sources.md`, `site.md`, `map.md`, `styling.md`,
`submissions.md`, `routines.md`, `workflow.md`, `decisions.md` (the principles in this spec's README, then one
row per decision).

### Skills

- `ask-me`, `grill-me`: copied from TL.
- `plant-import`: the session workflow for adding plants from registered
  sources, written with the import workflow
  ([sources.md](sources.md#import-workflow)).
- `integrate`: checks submissions and opens their PRs
  ([submissions.md](submissions.md#the-integrate-skill)).

## Done when

- `npm ci && npm run build && npm run check && npm test` pass on an empty
  library and CI runs them on a PR.
- A PR that mixes content and dev paths, or uses the wrong branch prefix,
  fails the lane check; tests cover each rule.
- With `fixturesOnly` on, a non-fixture project and a project with a
  `client` each fail validation; with it off, both pass.
- A merge to `main` produces the built site as an artifact, and its pages
  all link through the base.
- `AGENTS.md`, `CLAUDE.md`, and the `docs/` skeleton exist and pass the link
  check.

Repository settings (branch protection) are manual checks and
go to a Testing backlog issue, not a milestone.

## Out of scope

A backend, user accounts, and any change to the library that isn't a pull
request.
