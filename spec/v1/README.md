# v1 stage spec

The design for Plant Library v1. M1, M3, and M4 are built, M2 apart from
its plant data, and M5's engine, basemap, token-built style, overlays, map view, region filters, and small maps on detail pages, and M6's compatibility function, palette type, fixture palettes, palette pages and cards, and compatibility panel; what exists is described in [`docs/`](../../docs/README.md), and
this folder holds the rest. It follows the stage-spec convention of
`ttrpg-library` (TL below): it holds only unbuilt design, and the PR that
builds a part deletes it here and describes what now exists in `docs/`. The
stage is finished when only this README is left.

## What the library is

A static site, built from files in this repo, for landscape architects:

- **Look plants up** by name or by criteria (form, life cycle, size, sun,
  soil, moisture, hardiness, bloom, native status).
- **Build plant palettes**, check that their plants suit each other and a
  site, and mock up plant lists with quantities as a design tool.
- **Track use**: which plants went on which projects, and where.
- **See it on a map**: projects, regions, and how a plant's use is
  distributed across them.
- **Contribute**: colleagues add photos, projects, corrections, and their
  professional opinion through forms. A routine checks each submission and
  integrates it through a pull request.

### Subject matter and scope

- Trees, shrubs, vines, and herbaceous plants (forbs, ferns, and
  graminoids), whether perennial, biennial, or annual, used in landscape
  architecture. Habit (form) and life cycle are recorded separately.
- Washington, Oregon, and California.
- Species grown by West Coast wholesale landscape nurseries and native plant
  nurseries.
- Native and climate-adapted species suited to ecologically minded work.
- Public-realm use first: parks, campuses, streets, commercial landscapes,
  stormwater, and restoration.

Out of scope for v1: turf, edibles, houseplants, pest and disease
data, nursery pricing and availability, and any region outside the three
states.

### Prototype first

This repo is the owner's personal, open source prototype, MIT licensed. It
holds no real project data: projects here are made up, and the fields that
would be proprietary are left blank. When the prototype is ready, it is
copied, the copy's ownership passes to the company, and real project data
goes only into that copy, served from an internal web server
([docs/workflow.md](../../docs/workflow.md#the-prototype-and-the-company-copy)). Everything is designed so the
copy needs configuration and data, not code changes.

### Data stages

Plant data is built in two stages
([docs/sources.md](../../docs/sources.md#data-stages)):

- **Prototype (now).** Plants are fixtures for developing and testing the
  site, marked `meta.fixture: true`. Accuracy isn't required: values may
  come from any public source a session can read and may be approximate,
  as long as each cites the page it came from and nothing is copied.
- **Production (later).** The dataset the company copy serves: P5 in full,
  USDA PLANTS names and families, every source's terms read. Building it
  is a later stage, outside the v1 milestones
  ([sources.md](sources.md#production-dataset)).

### v1 runs on fixtures

v1 is built, tested, and finished on fixture data only:

- **Plants**: the prototype fixture set in `content/plant/` and the test
  fixture library in `tests/fixtures/library/`.
- **Projects and palettes**: fictional ones, marked `meta.fixture: true`
  with the proprietary fields blank, in both libraries; both are built
  ([docs/sources.md](../../docs/sources.md#fixture-projects)).

Real project data, including filling the library from real projects' plant
lists ([sources.md](sources.md#import-workflow)), is deferred to a later
version, with the production dataset. No v1 milestone waits on it, and
every v1 "Done when" is met with fixtures.

## Principles

Carried from TL's `docs/decisions.md`, renumbered, with two that are new here
(P5, P6).

| | Principle | Meaning |
|---|---|---|
| P1 | Files are the database | One JSON file per entry, reviewed as a diff. Static build on GitHub Actions, served as static files; no runtime services, accounts, or in-browser editing of the library. Contributions arrive as submissions and enter by a PR. |
| P2 | Fail closed | Technical data is strict: an unknown key or malformed value fails CI. Tags stay open. |
| P3 | One source per fact | Each value is stored once. Anything computable (display names, a project's county, how often a plant is used) is derived at build, never stored. |
| P4 | Configuration over code | A new type, facet, map overlay, or data source is a data or file addition. |
| P5 | Facts with provenance | Every technical value on a plant cites a registered source. We record facts in our own schema and write our own prose; we don't copy a source's text. Applied in full to production data; prototype fixtures follow the lighter rules under [Data stages](#data-stages). |
| P6 | Geography is derived | An entry stores coordinates or region codes only. Names, regions, and zones come from boundary data at build. |
| P7 | Templates own presentation | Entries hold content; templates hold wording, order, units, and typography. |
| P8 | Enforced, not by convention | Lanes, schemas, provenance, links, and accessibility are checked by CI. |
| P9 | Cheap, safe refinement | The look is tuned through tokens and a style guide, with WCAG 2.2 AA checked automatically. |
| P10 | Weight follows the selection | Pages load a lean index; full entries, images, and map layers load only when asked for. |
| P11 | A durable record | Sessions have no memory, so decisions live in the repo, issues, and PRs. |

## Areas

One file per area. Each has front matter naming the areas it depends on, and
these sections in order: Goal, Design, Cases, Done when, Open questions, Out
of scope (Goal and Design required).

| File | Covers |
|---|---|
| [`data-model.md`](data-model.md) | The `project` and `palette` types, plant lists, derived use and geography, their validation |
| [`sources.md`](sources.md) | The source survey, the production dataset (a later stage), fixture projects, the import workflow |
| [`library.md`](library.md) | Project and palette pages and cards, cross-type filters, the palette workspace, compatibility, exports |
| [`map.md`](map.md) | The map view, the map engine, basemap and its style from tokens, overlays, region filters, distribution analysis |
| [`submissions.md`](submissions.md) | Contribution forms, the submission format, stores, the `integrate` skill and routine, professional opinion |

## Milestones

Each is a tracking issue with ordered sub-issues once the repo has issues. A
milestone's "done when" is the union of the "Done when" items its areas list
for it.

| | Milestone | Builds |
|---|---|---|
| M1 | Skeleton | Built: tooling, lanes, CI, deploy, docs, the site ([docs/workflow.md](../../docs/workflow.md)) |
| M2 | Plants | Built: the plant type, validation, the source registry, and a prototype fixture set of 473 plants from the King County guide and the Portland Plant List ([docs/sources.md](../../docs/sources.md#the-prototype-fixture-set)) |
| M3 | Library | Built: list view, filter tree, search, plant pages, styling ([docs/site.md](../../docs/site.md)) |
| M4 | Projects | Built: the project schema, validation, derived values, and fixture projects ([docs/content-model.md](../../docs/content-model.md#project), [docs/sources.md](../../docs/sources.md#fixture-projects)); geography apart from hardiness zones ([docs/geography.md](../../docs/geography.md)); project pages, project facets, the cross-type filters, project search, and plant and project links ([docs/site.md](../../docs/site.md)) |
| M5 | Map | Engine, basemap extract, style from tokens, glyphs, project clustering, the overlay registry with its boundary overlays, the `/map/` view, region filters, and small maps on detail pages built ([docs/map.md](../../docs/map.md), [docs/site.md](../../docs/site.md#map-view)); `map.md` hardiness zone overlay |
| M6 | Palettes | The compatibility function, the palette type with its derived values, the fixture palettes, palette pages and cards, the palette facet, palette points on the map, and the compatibility panel are built ([docs/content-model.md](../../docs/content-model.md#palette), [docs/sources.md](../../docs/sources.md#fixture-palettes), [docs/site.md](../../docs/site.md#palette-page)); `library.md` workspace, exports |
| M7 | Contributions | `submissions.md`: forms, the browser store, the inbox script, field notes, the `integrate` skill |
| M8 | Analysis | `map.md` distribution analysis |

Each milestone starts with a pilot on its hardest cases, which is expected to
turn up amendments to this spec.

## Decisions to confirm

The design brief left room for these; each is decided in its area file and
listed here so the owner can overrule it in review.

- **A third type, `palette`,** holds saved plant lists that aren't tied to a
  project ([docs/content-model.md](../../docs/content-model.md#palette)).
- **A project's plant list may name a plant the library doesn't hold yet**,
  as plain text, so real plant lists can be entered before every species is
  sourced ([data-model.md](data-model.md#references)).
- **Feet and US units are stored**; the site shows metric beside them
  ([docs/content-model.md](../../docs/content-model.md#plant)).
- **MapLibre GL JS with PMTiles** powers the map ([docs/map.md](../../docs/map.md#engine)).
- **No dark theme** ([docs/styling.md](../../docs/styling.md)).
- **Professional opinion is kept beside published facts, not over them**:
  field notes, and a `staff-observation` source for traits no source covers
  ([submissions.md](submissions.md#professional-opinion)).
- **Sources with a non-commercial restriction may be used in the
  prototype, flagged**, so they can be found and cleared before commercial
  use ([docs/sources.md](../../docs/sources.md#licensing-rules)).

## Open questions

Collected from the area files; no part with an open question is built.

1. The PDF plant-list import workflow; only M7's plant list attachment
   depends on it. ([sources.md](sources.md#open-questions))
2. Image sourcing. ([sources.md](sources.md#open-questions))
3. At handover: how the browser writes to the server folder, and where the
   routine runs. ([submissions.md](submissions.md#open-questions))
