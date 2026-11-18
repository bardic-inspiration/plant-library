---
name: plant-import
description: Add plants to the library from registered sources, with full provenance. Use when asked to add plants, to fill the fixture set, or to source the unsourced names that `npm run coverage` lists.
---

# Plant import

Adds plant entries whose every fact cites a registered source (P5). The
rules live in `docs/content-model.md` and `docs/sources.md`; this is the
session workflow.

## Which stage

The repo is in the **prototype** stage (`docs/sources.md`, "Data stages"):
plants are fixtures, and the production rules below are relaxed.

- Mark every entry `meta.fixture: true`.
- Use any public source you can read. If it states no terms, register it
  for facts only and say so in `termsSummary`. Names and families may
  follow the source rather than USDA PLANTS.
- Values may be approximate, but each still cites the page it came from.
  Never cite a page you didn't open, never copy prose, and use only images
  with an allowed license.

The steps below are the production workflow; in the prototype, follow them
as far as the sources at hand allow.

## Pick the plants

- From a request, from the fixture list in `docs/sources.md`, or from
  `npm run coverage`, most used first.
- Skip anything out of scope: annuals, turf, edibles, houseplants, and
  plants not grown in Washington, Oregon, or California.

## For each plant

1. **Name.** Find the accepted name in USDA PLANTS. The entry's name parts
   follow it; names the nursery trade uses go in `synonyms`. The `id` is
   the slug of the botanical name (`npm run validate` says if it isn't).
2. **Facts.** Read each fact from a source in `config/sources.json`, and
   record it in the schema's vocabulary and units (feet, USDA zones,
   months 1–12). Never copy a source's sentences; `summary` and
   `description` are written fresh.
3. **Cite.** Each citation names the source, the page URL you actually
   read, today's date as `accessed`, and the `fields` it supports. Every
   populated trait and `family` must be covered. A fact no registered
   source gives stays empty. Never cite a page you didn't open.
4. **Disagreements.** When two sources differ, record one value, cite both,
   and say in the PR which won and why.
5. **Images.** Only files with a license shown on their own page:
   public domain, CC0, CC BY, CC BY-SA (NC forms are allowed in the
   prototype and get flagged). Record credit, license, source URL, and alt
   text; pin one. Keep each under 500 KB.
6. **Family table.** A new family needs a row in `config/vocab.json`.

## Then

- Replace any text names in project and palette plant lists with refs to
  the new plants, in the same PR.
- `npm run validate`, `npm run attribution`, `npm run build`.
- Branch `content/<short-description>`; PR with the content template,
  listing sources and any disagreements.
- A source worth registering is named in the PR for the owner. Never
  register a source without reading its terms.
