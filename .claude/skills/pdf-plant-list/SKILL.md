---
name: pdf-plant-list
description: Turn a plant-list PDF in docs/ (a city, county, or agency native plant list) into fixture plant entries with citations. Use when the owner uploads a reference PDF and asks for fixtures from it, or to re-run an import after its config changes.
---

# PDF plant list

Reads a reference PDF's plant tables and description pages and writes
`content/plant/` entries that cite it. It is the tool behind the Portland
Plant List fixtures (`lists/portland-2016.json`); a new document gets a new
config in `lists/`. The rules are the `plant-import` skill's and
`docs/sources.md`'s: this only does the reading and writing.

## Setup

- `pip install pdfplumber` (not installed by the session-start hook);
  `pdftotext` and `pdftoppm` (poppler) are already on the image.
- The source is registered in `config/sources.json` first, after its terms
  are read (or, with none stated, for facts only, as D18 and D23 did).
- Run Python with `-I`, from the repo root.

## Workflow

1. **Survey the PDF.** `pdftotext -layout` for the contents and where each
   list starts; `pdftoppm -f N -l N -r 70 -png` and look at a page of each
   kind of table. Note PDF page numbers (1-based), not printed ones.
2. **Write the config** in `lists/<document>.json`, starting from
   `portland-2016.json`. Keys:
   - `pdf`, `source` (registry id), `citationUrl` (the page actually read:
     the copy in `docs/` on GitHub), `note` (`{pages}` is filled in),
     `placeholderNote`.
   - `tables`: ruled tables, each `{label, first, last, step, form}`;
     `step: 2` for tables that run across a spread (the left page holds the
     facing page's words too). Optional `summaryLabel` names the form in the
     summary sentence.
   - `lifeCycleForms`: life-cycle codes that set `form` over the table's
     (`A` annual, `B` biennial); `evergreenLifeCycles` set `foliage`.
   - `lists`: short unruled lists, transcribed by hand,
     `{title, form, page, plants: [[name, common], …]}`. They come first,
     so their form outranks a table's.
   - `details`: description pages (`Mature height:`, `Mature spread:`,
     `Growth rate:`, `Conditions:` after a plant's name), `pages` mapping a
     range to extra values (such as `foliage`), `aliases` for names spelled
     differently there, and `conditionsOverride`.
   - `extra` (plants only in a list not worth parsing), `overrides`
     (form, synonyms, extra pages), `nameFixes` and `commonFixes` (obvious
     misspellings only), `sameAs` (a name the library holds under another
     id).
3. **Extract**: `python3 -I .claude/skills/pdf-plant-list/scripts/plant_list_pdf.py extract <config> <scratch>/rows.json`.
   The column reader knows these header words: Latin name, Common name,
   Mature height, Showy, Color, Form, the month letters, Life cycle, Full
   sun, Part sun, Full shade, Dry, Moist, Seas. wet, Pernl. wet, Sub, T/E,
   the habitat columns, and Wetland indicator status. A document with other
   headers needs `ATTR_TOKENS` extended.
4. **Check the rows against the pages.** Render two or three table spreads
   and compare every row: names, heights, bullets, bloom squares. Read the
   row count against the list. Fix the config or the reader, not the rows.
5. **Build**: `python3 -I .claude/skills/pdf-plant-list/scripts/plant_list_pdf.py build <config> <scratch>/rows.json . [accessed-date]`.
   - A plant new to the library is written whole, with its `family` from
     the `placeholder` source (D24) when the document gives none.
   - A plant another source already holds gains a citation, the
     document's common name and (for `sameAs`) its name as a synonym, and
     only traits the entry leaves empty; existing values stand.
   - Re-running is safe: this source's own entries are rewritten, its
     additions to others are undone and redone, and an unchanged entry keeps
     its dates.
6. **Then** as `plant-import` says: `npm run validate`, `npm run
   attribution`, `npm run build`, and, since the config lives outside
   `content/`, `npm run check` and `npm test`. Update the fixture set in
   `docs/sources.md`: counts, what each trait was read from, names fixed,
   and anything left out.

## What it records

| Trait | From |
|---|---|
| `commonNames`, `form` | the table or list a plant is in, or its life cycle |
| `height`, `spread` | the table's mature height, or the description page; inches and feet both read, stored in feet |
| `sun` | full sun `full-sun`, part sun `part-shade`, full shade `shade`, or the conditions line |
| `moisture` | dry, moist; seasonally wet, perennially wet, and submerged are `wet`; ranges ("dry to wet") fill in between |
| `bloom` | the color words, and the first to last month marked |
| `growthRate` | very slow and slow `slow`, medium `moderate`, fast and very fast `fast` |
| `foliage` | an evergreen life cycle, or a description-page section |

Wetland indicators are read into the rows but not written: `wetlandIndicator`
holds NWPL regional ratings, and older lists use another scheme. Summaries
are generated from the entry's own values; no prose is copied.
