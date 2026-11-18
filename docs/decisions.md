# Decisions

## Principles

| | Principle | Meaning |
|---|---|---|
| P1 | Files are the database | One JSON file per entry, reviewed as a diff. Static build, served as static files; no runtime services, accounts, or in-browser editing of the library. Contributions arrive as submissions and enter by a PR. |
| P2 | Fail closed | Technical data is strict: an unknown key or malformed value fails CI. Tags stay open. |
| P3 | One source per fact | Each value is stored once. Anything computable is derived at build, never stored. |
| P4 | Configuration over code | A new type, facet, map overlay, or data source is a data or file addition. |
| P5 | Facts with provenance | Every technical value on a plant cites a registered source. We record facts in our own schema and write our own prose. |
| P6 | Geography is derived | An entry stores coordinates or region codes only. Names, regions, and zones come from boundary data at build. |
| P7 | Templates own presentation | Entries hold content; templates hold wording, order, units, and typography. |
| P8 | Enforced, not by convention | Lanes, schemas, provenance, links, and accessibility are checked by CI. |
| P9 | Cheap, safe refinement | The look is tuned through tokens and a style guide, with WCAG 2.2 AA checked automatically. |
| P10 | Weight follows the selection | Pages load a lean index; full entries, images, and map layers load only when asked for. |
| P11 | A durable record | Sessions have no memory, so decisions live in the repo, issues, and PRs. |

## Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-11-17 | Dependencies start on Astro 5, Preact 10, TypeScript 5, Vitest 3, and Stylelint 16, the newest majors the first build was written against; Playwright is pinned to the version whose browser the cloud sessions have. | A known base first; Dependabot proposes the newer majors one PR at a time. |
| D2 | 2026-11-17 | A plant's images, sources, and further reading live inside `data` (`data.images`, `data.sources`, `data.furtherReading`). | The envelope rejects unknown top-level keys, and these are type-specific. |
| D3 | 2026-11-17 | Enumerations are lists in `config/vocab.json`; schemas name a list with `x-vocab`, filled in as an enum when loaded. | One source for values, labels, and order (P3), for schemas, filters, and forms alike. |
| D4 | 2026-11-17 | Facets have five kinds (`value`, `range`, `zones`, `months`, `pairs`), keyed `<type>.<id>`, held in the URL as one repeated parameter per value. | Every filter in the spec fits one of them, so a new facet is configuration (P4). |
| D5 | 2026-11-17 | A size range matches every bucket it overlaps. | A checkbox bucket can't say "at most 6 ft"; overlap never hides a plant that can be kept to the size. |
| D6 | 2026-11-17 | Native status is absent, not "adapted", when a plant has no `nativeRange`. | A missing trait never matches a filter (spec); unknown isn't introduced. |
| D7 | 2026-11-17 | Family names are recorded as USDA PLANTS gives them, and the family table in `config/vocab.json` holds each family's order. | Names follow USDA PLANTS (spec); the table keeps ranks above family out of entries. |
| D8 | 2026-11-17 | The `professional` source kind needs no URL or terms URL; `staff-observation` has neither. | It is the organization's own knowledge, not a published page. |
| D9 | 2026-11-17 | A bloom swatch passes contrast when it holds 3:1 against the white ground or its black frame. | A white bloom can't contrast with white; the frame carries it, and the label carries meaning. |
| D10 | 2026-11-17 | The top bar shows only built sections. | Links to unbuilt pages would fail the link check and the reader. |
| D11 | 2026-11-17 | `claude/` branches take their lane from their paths. | Cloud sessions must push to `claude/…` branches; the path rule still keeps lanes pure. |
| D12 | 2026-11-17 | A fixture library in `tests/fixtures/library/` backs the tests and a demo build, with a banner on every page of that build. | The real fixture set waits on USDA PLANTS being reachable; made-up values must never pass as sourced. |
| D13 | 2026-11-17 | The `ask-me` and `grill-me` skills were written fresh rather than copied from `ttrpg-library`. | That repo couldn't be read from the session that built M1; replace them with TL's if they differ in ways that matter. |
| D14 | 2026-11-17 | `npm run a11y` checks at 1280 and 360 px. | The filter layout changes at 64rem; both layouts must pass. |
| D15 | 2026-11-18 | The draft is published to GitHub Pages at `/plant-library/`, from the fixture build; `base` in `config/site.json` is `/plant-library/`. | The repo holds no proprietary data, and the real library is empty until the fixture set is sourced; the banner marks the values as unsourced. |
| D16 | 2026-11-18 | The first Dependabot round is taken together: Astro 7, `@astrojs/preact` 6, Preact 11, `marked` 18, TypeScript 7, Vitest 5, Stylelint 18, `postcss-html` 2, and Actions `checkout`, `setup-node`, `upload-artifact`, and `labeler` at v7. Playwright stays at 1.63.0 (D1) and `@types/node` at 22, matching `.nvmrc`; Dependabot ignores both. `engines.node` is `>=22.23.4`, Astro 7's floor. | Every check passes on the set; a newer Playwright needs a browser cloud sessions don't have, and Node 26 types would admit APIs the Node 22 runtime lacks. |
