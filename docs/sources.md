# Sources

## Purpose

Every technical value on a plant is traceable to a source whose terms allow
this use (P5). Facts are recorded in our own schema and words; a source's
text is never copied.

## Behavior

### Registry

`config/sources.json`, validated by `schemas/sources.schema.json`. Each
source has a `name`, `publisher`, `kind` (`federal`, `state`, `local`,
`university`, `botanical-institution`, `nonprofit`, `professional`), `url`,
`hosts` (for classifying submitted URLs), `provides` (`names`, `traits`,
`range`, `wetland`, `images`, `boundaries`), `license`, an optional
`restriction` (`non-commercial`), `termsUrl`, `termsChecked` (the date
someone read the terms; required), `termsSummary`, and a `citation`
template with `{year}`, `{accessed}`, and `{contributor}`.

Registered now:

| Source | Why |
|---|---|
| `usda-plants` | USDA PLANTS. Terms read while the spec was written: plant information is free for any use, with citation. |
| `staff-observation` | The organization's own observation, kind `professional`. Cited only for a trait no other source gives, and only with a `contributor`. It has no URL. |

### Licensing rules

- A source is registered only when its terms allow reuse in an open
  repository. A source that forbids redistributing its data may still be
  linked under a plant's `furtherReading`.
- Non-commercial sources and images are allowed in the prototype and
  flagged: the registry marks the source, an image is recognized by its
  license (`nonCommercial` in the vocabulary's license list), and
  `npm run coverage` lists them.
- Image licenses: public domain, CC0, CC BY, CC BY-SA, and their NC forms.
  No ND licenses.

### Attribution

`lib/attribution.ts` builds the list of cited sources (with the citation,
using the latest access date), every image's credit and license, and every
contributor. `npm run attribution` writes it to `ATTRIBUTION.md`; the About
page renders the same data. A test fails when `ATTRIBUTION.md` is stale, and
CI runs `npm run attribution -- --check` on every PR that validates.
`LICENSE-CONTENT` states the compilation's license (CC BY 4.0).

### Coverage

`npm run coverage` lists plant names that plant lists give as text, most
used first (none until projects exist), and every entry, field, and image
that depends on a non-commercial source or license.

## Where the rules live

`config/sources.json`, `schemas/sources.schema.json`, the provenance block
in `lib/validate.ts`, `lib/attribution.ts`, `lib/coverage.ts`, and the
`plant-import` skill (`.claude/skills/plant-import/SKILL.md`).

## Extending

Register a source only after reading its terms: add it to
`config/sources.json` with `termsChecked` set to that day and
`termsSummary` saying what they allow. The survey of sources still to check,
and the 50-plant fixture set, are in
[`spec/v1/sources.md`](../spec/v1/sources.md).
