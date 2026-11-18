# Decisions

## Principles

| | Principle | Meaning |
|---|---|---|
| P1 | Files are the database | One JSON file per entry, reviewed as a diff. Static build, served as static files; no runtime services, accounts, or in-browser editing of the library. Contributions arrive as submissions and enter by a PR. |
| P2 | Fail closed | Technical data is strict: an unknown key or malformed value fails CI. Tags stay open. |
| P3 | One source per fact | Each value is stored once. Anything computable is derived at build, never stored. |
| P4 | Configuration over code | A new type, facet, map overlay, or data source is a data or file addition. |
| P5 | Facts with provenance | Every technical value on a plant cites a registered source. We record facts in our own schema and write our own prose. Applied in full to production data; prototype fixtures follow lighter rules (D19). |
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
| D17 | 2026-11-18 | `admin/` branches are the dev lane, for maintenance such as dependency rounds. | Maintenance gets its own prefix; it changes code paths, so it runs every dev check. |
| D18 | 2026-11-18 | `king-county-native-plant-guide` is registered with license `unstated` and cited for facts only. | The brochure carries no copyright notice or reuse terms, and the county site's terms couldn't be read; the owner chose to use it as a public reference for facts, which aren't copyrightable, and never its prose, layout, or illustrations. |
| D19 | 2026-11-18 | Data has two stages. In the prototype stage (now) plants are fixtures, marked `meta.fixture: true`, whose values may be approximate and may come from any readable public source; production data, with P5 in full and USDA PLANTS names, is a later stage. | The owner needs fixtures to build and test the site; accurate, cleared data matters only for the production library. |
| D20 | 2026-11-18 | `wikidata`, read through the taxonomy box on Commons category pages, is registered for `family` in the prototype. Families follow Wikidata (APG, e.g. Sapindaceae), and the family table holds them beside USDA's; D7 applies again in production. | USDA PLANTS is unreachable, `family` is required, and Wikidata is CC0; `wikidata.org` itself is blocked from cloud sessions, Commons isn't. |
| D21 | 2026-11-18 | `ccr-` branches, as cloud sessions now name them, take their lane from their paths, like `claude/` branches (D11). | Cloud sessions are assigned `ccr-…` branches and may push nowhere else; the lane check rejected them. |
| D22 | 2026-11-18 | The fixture banner shows on any build that holds a fixture plant, not only on the test fixture library's build. | Prototype plants in `content/` are fixtures too, and their values are not checked. |
| D23 | 2026-11-18 | `portland-plant-list` is registered with license `unstated` and cited for facts only, at the copy the owner uploaded to `docs/`. Its native lists become fixtures: a plant King County already has gains a citation, a common name, and the traits King County leaves empty, and King County's values stand where both give one. Annuals and biennials are left out. | The June 2016 update states no terms and the city's sites couldn't be reached; the owner asked for fixtures of every listed plant, as with the King County guide (D18). No `form` fits an annual or biennial. |
| D24 | 2026-11-18 | A `placeholder` source kind stands in for a required field (`family`, `form`) that no reference gives, without a URL and only where no other citation covers the field; the family `Placeholderaceae` is in the family table for it, and `npm run coverage` lists every use. | The owner asked for placeholders where checks require a field the reference documents lack; citing a real source for a value it doesn't give would be an invented citation. |
| D25 | 2026-11-18 | `annual` and `biennial` are `form` values, with the herbaceous size classes, and annuals are in scope (the spec's out-of-scope list no longer names them). For a herbaceous plant the life cycle outranks the habit: an annual grass is `annual`. The 20 Portland annuals and biennials D23 left out are fixtures now. | The owner expects more of them from future lists. `perennial` already stands for the herbaceous perennial, so the other life cycles sit beside it; one form per plant keeps the Form filter simple. |
| D26 | 2026-11-18 | The Portland parser is kept as the `pdf-plant-list` skill: one Python script (pdfplumber) and a JSON config per document in `.claude/skills/pdf-plant-list/lists/`, re-runnable over the library. | More plant-list PDFs are coming; a config per document keeps each import reviewable and repeatable. It is a session tool, not part of the build, so it stays outside `scripts/` and the Node toolchain. |
