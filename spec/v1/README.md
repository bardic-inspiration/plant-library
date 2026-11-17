# v1 stage spec

The design for Plant Library v1. Nothing is built yet, so this folder is the
whole description of the project. It follows the stage-spec convention of
`ttrpg-library` (TL below): it holds only unbuilt design, and the PR that
builds a part deletes it here and describes what now exists in `docs/`. The
stage is finished when only this README is left.

## What the library is

A static site, built from files in this repo, for landscape architects:

- **Look plants up** by name or by criteria (form, size, sun, soil, moisture,
  hardiness, bloom, native status).
- **Build plant palettes**, check that their plants suit each other and a
  site, and mock up plant lists with quantities as a design tool.
- **Track use**: which plants went on which projects, and where.
- **See it on a map**: projects, regions, and how a plant's use is
  distributed across them.

### Subject matter and scope

- Trees, shrubs, and herbaceous perennials (including ferns and graminoids)
  used in landscape architecture.
- Washington, Oregon, and California.
- Species grown by West Coast wholesale landscape nurseries and native plant
  nurseries.
- Native and climate-adapted species suited to ecologically minded work.
- Public-realm use first: parks, campuses, streets, commercial landscapes,
  stormwater, and restoration.

Out of scope for v1: annuals, turf, edibles, houseplants, pest and disease
data, nursery pricing and availability, and any region outside the three
states.

## Principles

Carried from TL's `docs/decisions.md`, renumbered, with two that are new here
(P5, P6).

| | Principle | Meaning |
|---|---|---|
| P1 | Files are the database | One JSON file per entry, reviewed as a diff. Static build on GitHub Actions and Pages; no runtime services, accounts, or in-browser editing of the library. |
| P2 | Fail closed | Technical data is strict: an unknown key or malformed value fails CI. Tags stay open. |
| P3 | One source per fact | Each value is stored once. Anything computable (display names, a project's county, how often a plant is used) is derived at build, never stored. |
| P4 | Configuration over code | A new type, facet, map overlay, or data source is a data or file addition. |
| P5 | Facts with provenance | Every technical value on a plant cites a registered source. We record facts in our own schema and write our own prose; we don't copy a source's text. |
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
| [`repo.md`](repo.md) | Repository layout, tech stack, lanes, CI, docs, what carries over from TL and what doesn't |
| [`data-model.md`](data-model.md) | Entry envelope, the `plant`, `project`, and `palette` types, derived values, references, validation |
| [`sources.md`](sources.md) | The source registry, licensing rules, the source survey, the 50-plant fixture set, the import workflow |
| [`library.md`](library.md) | The list view, filter tree, detail pages, links, the palette workspace, compatibility, exports |
| [`map.md`](map.md) | The map view, the map engine, basemap, overlays, region filters, distribution analysis |
| [`styling.md`](styling.md) | Visual direction, tokens, type, color, accessibility |

## Milestones

Each is a tracking issue with ordered sub-issues once the repo has issues. A
milestone's "done when" is the union of the "Done when" items its areas list
for it.

| | Milestone | Builds |
|---|---|---|
| M1 | Skeleton | `repo.md`: tooling, lanes, CI, deploy, docs skeleton, an empty site that builds |
| M2 | Plants | `data-model.md` plant type and validation; `sources.md` registry and the 50-plant fixture set |
| M3 | Library | `library.md` list view, filter tree, search, plant detail pages; `styling.md` |
| M4 | Projects | `data-model.md` project type and geography derivation; project pages; plant and project links |
| M5 | Map | `map.md` map view, overlays, region filters |
| M6 | Palettes | `data-model.md` palette type; `library.md` workspace, compatibility, exports |
| M7 | Analysis | `map.md` distribution analysis; the import workflow in `sources.md` once its questions are settled |

Each milestone starts with a pilot on its hardest cases, which is expected to
turn up amendments to this spec.

## Decisions to confirm

The design brief left room for these; each is decided in its area file and
listed here so the owner can overrule it in review.

- **A third type, `palette`,** holds saved plant lists that aren't tied to a
  project ([data-model.md](data-model.md#palette)).
- **A project's plant list may name a plant the library doesn't hold yet**,
  as plain text, so real plant lists can be entered before every species is
  sourced ([data-model.md](data-model.md#references)).
- **Feet and US units are stored**; the site can show metric
  ([data-model.md](data-model.md#plant)).
- **MapLibre GL JS with PMTiles** powers the map ([map.md](map.md#engine)).
- **No dark theme** ([styling.md](styling.md#color)).
- **Sources with a non-commercial restriction are not used** unless the owner
  clears one ([sources.md](sources.md#licensing-rules)).

## Open questions

Collected from the area files; no part with an open question is built.

1. Is real project data (client, budget) public? ([data-model.md](data-model.md#open-questions))
2. How deep must the basemap zoom? ([map.md](map.md#open-questions))
3. The PDF plant-list import workflow. ([sources.md](sources.md#open-questions))
4. Image sourcing and hosting limits. ([sources.md](sources.md#open-questions))
