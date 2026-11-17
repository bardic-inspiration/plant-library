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
- **Routines**: `docs/routines.md`, the `generate` and `revise` skills, the
  request and revise issue templates, gap fill, and the routine labels.
  Content is added in sessions the owner starts.
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

### Hosting

The repo is private, and the site must be readable only by the organization.
The build is static files, so any host that can put a login in front of
static files will do; nothing in the site depends on which. GitHub Pages as
TL uses it doesn't qualify: a Pages site is public even when its repo is
private, except with GitHub Enterprise Cloud's private Pages. The host is an
open question below. Until it is chosen, `deploy.yml` builds the site and
keeps it as a workflow artifact, and the site is run locally with
`npm run dev`.

Whatever the host, pages carry `noindex`, and the site makes no request that
sends project data to a third party.

### Layout

```
content/plant/<id>.json            plants
content/project/<id>.json          projects
content/palette/<id>.json          saved palettes
assets/images/plant/<id>/<n>.*     plant images
schemas/                           envelope and one schema per type
config/                            types.json, sources.json, overlays.json, vocab.json
geo/                               boundary data for derivation and overlays (map.md)
lib/                               helpers shared by scripts and the site
                                   (names, derive, compat, geo, site base)
scripts/                           validate, build-index, coverage, links, lane,
                                   pr-summary, serve, a11y, snapshots
site/                              the Astro project
tests/                             Vitest suites and fixtures
docs/                              what is built (README.md is the index)
spec/v1/                           this stage spec
.claude/, .github/                 session settings and skills; workflows and templates
AGENTS.md, CLAUDE.md, README.md, LICENSE, ATTRIBUTION.md
```

npm scripts: `validate`, `build:index`, `build`, `dev`, `check`, `links`,
`test`, `a11y`, `snapshots` as in TL, plus `coverage`, which lists the plants
that projects and palettes name but the library lacks
([sources.md](sources.md#import-workflow)).

### Lanes

| | Content lane | Dev lane |
|---|---|---|
| Paths | `content/**`, `assets/images/**` | Everything else; content paths only as a migration |
| Branch prefix | `content/<short-description>` | `dev/<short-description>`, `dependabot/` |
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
  publish to the host ([Hosting](#hosting)).

### Docs to write as parts are built

`docs/README.md` (index and conventions), `architecture.md`,
`content-model.md`, `sources.md`, `site.md`, `map.md`, `styling.md`,
`workflow.md`, `decisions.md` (the principles in this spec's README, then one
row per decision).

### Skills

- `ask-me`, `grill-me`: copied from TL.
- `plant-import`: the session workflow for adding plants from registered
  sources, written with the import workflow
  ([sources.md](sources.md#import-workflow)).

## Done when

- `npm ci && npm run build && npm run check && npm test` pass on an empty
  library and CI runs them on a PR.
- A PR that mixes content and dev paths, or uses the wrong branch prefix,
  fails the lane check; tests cover each rule.
- A merge to `main` produces the built site as an artifact, and its pages
  all link through the base.
- `AGENTS.md`, `CLAUDE.md`, and the `docs/` skeleton exist and pass the link
  check.

Repository settings (branch protection, visibility) and the host's access
control are manual checks and
go to a Testing backlog issue, not a milestone.

## Open questions

- **The host.** Candidates: GitHub Enterprise Cloud private Pages (access
  follows repo access, if the organization has that plan); a static host
  behind single sign-on, such as Cloudflare Pages with Access; or an
  internal web server. The choice also sets the file size limits the
  basemap works within ([map.md](map.md#basemap)).
- **`LICENSE`.** The repo was created with an MIT license file, which
  doesn't fit a private, proprietary repo. Replace it with a proprietary
  notice, or keep MIT for the code alone.

## Out of scope

Scheduled routines, a backend, user accounts, and submissions from the site.
