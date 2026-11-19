# Submissions

## Purpose

A contribution reaches the library as a **submission**: one JSON document and
its files, written once and never edited, that a routine checks and turns
into a pull request (P1, P5, P8). This file covers what is built: the
contribution forms, the submission format, the edit differences a form
submits, the inbox's mechanical checks so far, and professional opinion on
entries. The stores (export and `inbox import`), the remaining checks, and
the `integrate` skill are still in
[`spec/v1/submissions.md`](../spec/v1/submissions.md).

## Behavior

### Forms

`/contribute/` (Contribute in the top bar) is the `Contribute` island
(`site/src/islands/Contribute.tsx`), routed by its URL:

| Form | URL | Reached from | Files |
|---|---|---|---|
| Add plant, Add project, Submit palette (one per type) | `?form=add&type=<type>` | Contribute; an unsourced name in a project's schedule (`&name=`, which fills genus and species); the workspace's "Submit to library" (`&list=`, the share encoding) | Images for plants and projects; a plant list file (PDF, CSV, XLSX) for a type whose plant list needs quantities (projects) |
| Add photo | `?form=photo&target=<key>` | Plant and project pages; Contribute | Images, one or more |
| Suggest an edit | `?form=edit&target=<key>` | Plant, project, and palette pages; Contribute | Supporting files |
| Add field note | `?form=note&target=<key>` | Plant pages; Contribute | None |

A form reached without its target first asks for one, by name, from the
index. The entry points are `ContributeLinks.astro` on detail pages.

- **Generated from the schemas.** `entryFields` in `lib/form.ts` walks a
  type's schema at build: the envelope's `name` (unless the type is
  `namedBy: derived`), `summary`, and `description`, then `data` in schema
  order. A vocabulary (`x-vocab`) or `enum` is a choice, a list of one a set
  of checkboxes, a list of text one item per line, an object a group, a map
  from one vocabulary to another (wetland indicator) a choice per key, and a
  list whose items have a `plant` a plant list. A label is the schema's
  `title`, else the facet's label for that path, else the key in words; a
  unit is the facet's. Descriptions show as hints, without the references to
  repo files. Fields marked `readOnly` (a plant's `images` and `sources`)
  and, with `fixturesOnly`, the type's proprietary fields are left off. A
  list of other objects (a plant's `furtherReading`) has no form field; the
  comment carries it. Field notes take their fields from the submission
  schema's `fieldNote`; a note's trait is picked from the plant form's
  fields, and its project from the library's projects.
- **Edits are differences.** An edit opens the published
  `data/<type>/<id>.json`, records its `entryHash` as `basedOn`, and files
  `editDifferences` between it and what the person left. Emptied text is a
  clear, and parts of the entry left as they were, an empty list included,
  are never reported (`prune` with the entry to keep). Each change lists
  under "Your changes" with its basis and a note.
- **Every claim states its basis**: each change of an edit, and an add as a
  whole (`basis`, with `sourceUrl` or `citation` for `source`; D60). Add
  plant starts with none chosen; Add project and Submit palette start at
  `observation`. A `sourceUrl` or `citation` is kept only with `source`.
- **Plant lists** are rows: a plant picked from the library with
  autocomplete (a name it holds becomes a ref, any other stays text and is
  flagged as not in the library), quantity, size, spacing, and note. Rows
  pasted from a spreadsheet are read by `linesFromPaste`: tab-separated (or
  comma-separated without tabs), columns named by a header row, else the
  first text cell is the plant, the first whole number its quantity, and the
  rest size, spacing, and note. An attached plant list file is listed for
  the routine to transcribe.
- **Photos** ask for the rights basis (own work, organization owned, or
  third party with its page), the license granted (from the `license`
  vocabulary), who took it, when (the file's date to start), where, what it
  shows (`imageShows`), and alt text. A file's sha256 is computed in the
  browser and its type sniffed from its bytes (`lib/sniff.ts`, shared with
  `inbox check`); its name is made safe for the submission folder
  (`safeFileName`).
- **Lenient at the door.** `submissionProblems` in `lib/contribute.ts`
  blocks only what makes a submission unusable: no name or role, no target,
  no content, a change without a basis or note, a `source` with no URL or
  citation, a file with no rights basis, a third-party file with no page, a
  file over its role's size limit or not of its role's type by content, a
  field note without a topic or text, or a malformed email. The rest warns:
  `fieldWarnings` (a required field missing, text that fails its pattern, a
  number out of range, a minimum over its maximum), missing photo metadata,
  a name whose extension says another type, and organization-owned photos
  in the prototype. Field warnings show beside their fields after the first
  try to send, and all of them in a summary.
- **Drafts** save in local storage as the person types
  (`plant-library:draft:<form>:<target>`), and come back with "Start over".
  An edit's draft is kept only while `basedOn` is still the published
  entry. Files aren't kept in drafts.
- **Who.** Name, role, and optional email, remembered in local storage
  (`plant-library:submitter`).
- **Sending** builds the submission (`buildSubmission`: trimmed, empty
  parts dropped, an id from the time and three random bytes) and files it
  with its files in this browser's IndexedDB (`site/src/lib/sent-store.ts`,
  `put`, `list`, `get`). **My submissions**, on `/contribute/`, lists what
  this browser has sent, newest first; results join when the store has
  them.

`npm run a11y` checks the Contribute page and every form: Add plant, Add
project, Submit palette from a fixture palette, and Add photo, Suggest an
edit, and Add field note with and without a target.

### The submission

`schemas/submission.schema.json` defines it. The envelope and the metadata
are strict; the content (a draft entry, a change's value, a note's text) is
loose, since cleaning it up is the routine's job.

```json
{
  "schema": 1,
  "id": "20261117T180422Z-7f3a9c",
  "submittedAt": "2026-11-17T18:04:22Z",
  "submitter": { "name": "…", "role": "Landscape architect", "email": "…" },
  "kind": "edit",
  "target": "plant/acer-circinatum",
  "basedOn": "sha256 of the entry as the form opened it",
  "changes": [
    { "path": "data.height.max", "value": 25,
      "basis": "observation",
      "note": "Reaches 25 ft in irrigated beds on three of our Seattle projects after 15 years." },
    { "path": "data.tolerates", "add": ["compaction"],
      "basis": "source", "sourceUrl": "https://…" }
  ],
  "fieldNotes": [
    { "topic": "establishment", "note": "…", "region": "WA", "project": "project/…" }
  ],
  "files": [
    { "name": "IMG_2041.jpg", "sha256": "…", "bytes": 1834022, "role": "image",
      "rights": "own-work", "license": "CC-BY-4.0", "photographer": "…",
      "takenAt": "2025-10-12", "place": "Seattle, WA",
      "shows": "habit", "alt": "…" }
  ],
  "comment": "Anything else, free text.",
  "app": { "version": "…", "libraryBuild": "…" }
}
```

| Key | Rule |
|---|---|
| `id` | `YYYYMMDDTHHMMSSZ-` and six hex digits; also the submission's folder name. Ids sort oldest first. |
| `submitter` | `name` and `role` required, `email` optional. A statement, not an identity. |
| `kind` | `add`, `edit`, `photo`, or `note`, each needing its content: `add` an `entry` (any object), `edit` a `basedOn` and at least one change, `photo` at least one file, `note` at least one field note |
| `basis`, `sourceUrl`, `citation` | For `add` only: what the entry's claims rest on, by a change's rules (D60) |
| `target` | The type alone for `add`; `<type>/<id>` for the others |
| `basedOn` | The sha256, in hex, of `JSON.stringify(entry, null, 2)` plus a newline: the bytes of the published `data/<type>/<id>.json` the form opens with (`entryHash` in `lib/submission.ts`) |
| `changes[]` | A dotted `path` under `name`, `summary`, `description`, `tags`, or `data`, with exactly one of `value`, `add`, or `remove`; a `basis` (`observation`, `source`, `correction`) and a `note`; `sourceUrl` or `citation` when the basis is `source` |
| `fieldNotes[]` | `topic` from the `fieldNoteTopic` vocabulary and `note`; optional `region` (a state), `project`, and `trait`. Author and date come from the envelope. |
| `files[]` | `name` (a plain file name in the folder), `sha256`, `bytes`, `role` (`image`, `plant-list`, `supporting`), and `rights` (`own-work`, `organization-owned`, `third-party`); a `third-party` file needs its `sourceUrl`. `license`, `photographer`, `takenAt`, `place`, `shows`, and `alt` are optional. |
| `replyTo` | The id of a submission this one answers |

### Edit differences

An edit form opens with the entry and submits only what the person changed.
`editDifferences(before, after)` in `lib/submission.ts` gives exactly those
paths, in the entry's key order:

- objects present on both sides are compared key by key, so changing a
  height's maximum is `data.height.max`;
- a list of plain values (strings, numbers) whose remaining items kept their
  order becomes `remove` and `add` (added items go at the end); any other
  changed list, such as a reordered list of common names or a list of
  objects, is one `value`;
- a key the person cleared is `value: null`; a new key is its `value`;
- `type`, `id`, `meta`, and `fieldNotes` are never part of an edit.

The form adds each difference's basis and note. `applyDifferences` applies
them to an entry, and applying an entry's differences gives back the edited
entry exactly.

### Inbox and mechanical checks

The inbox is a git-ignored `inbox/` at the repo root, one folder per
submission: `inbox/<id>/submission.json` and the files beside it.
`npm run inbox -- list` lists it oldest first; `npm run inbox -- check <id>`
reports each check as `pass`, `warn`, or `fail` and exits 1 when the
submission is rejected (`--json` adds the report as JSON).

| Check | Fails (rejects) | Warns |
|---|---|---|
| `schema` | `submission.json` isn't JSON or fails the schema (nothing more is checked); its `id` isn't its folder's name | |
| `files` | A listed file is missing, or its size or sha256 differs from the stated one | A file in the folder that the submission doesn't list; it isn't used |
| `file-type` | A file is none of its role's types by its content, or is over its role's size limit (`submissions.maxBytes` in `config/site.json`) | The content is an allowed type but the name's extension says another |
| `target` | The type isn't one the library has, or the entry isn't in the library | |
| `based-on` | | `basedOn` isn't the current entry; it names the paths changed since and, separately, the edit's paths that touch them (`touched`) |

A file's type comes from its first bytes, never its name: JPEG, PNG, or WebP
for an image; PDF, CSV, or XLSX for a plant list; any of those for a
supporting file. An XLSX file is a zip holding `xl/workbook.xml`; a CSV file
is UTF-8 text with no control characters and a separator.

A stale `basedOn` doesn't reject a submission: the routine merges it by hand
against the current entry. To say which fields changed since, `check` looks
through the entry file's git history for the version whose hash is
`basedOn` and compares it with the current entry; two paths touch when one
is the other or inside it.

### Professional opinion

A colleague's judgment sits beside the published facts, never silently over
them (P5).

- **Field notes.** Plants, projects, and palettes take `fieldNotes`: each a
  `topic` from the `fieldNoteTopic` vocabulary (`performance`,
  `establishment`, `maintenance`, `availability`, `design`, `caution`), a
  markdown `note`, the `author`'s name and role, a `date`, and optionally a
  `region` (a state), a `project` (a ref to a project), and the
  `submission` it came from. Only a plant's note may name a `trait` (a data
  path such as `height` or `soil.drainage`), and the plant page then shows
  it beside that trait as well. Every page with notes ends with a "Field
  notes" section ([site.md](site.md#plant-page)).
- **An observation that fills a gap** is cited to the registry's
  `staff-observation` source (kind `professional`, D8), with its
  `contributor`, and only for a trait no other source gives
  ([sources.md](sources.md#registry)). The plant page marks such
  a value "(our staff's observation)".
- **Credit.** `meta.submissions` lists the submission ids an entry drew on;
  a field note's `submission` must be one of them. The About page and
  `ATTRIBUTION.md` list contributors by name: the authors of field notes and
  the contributors of `staff-observation` citations (`lib/attribution.ts`).

An observation that disagrees with a sourced value stays a field note on that
trait; the `integrate` skill, when it is built, makes that call.

## Where the rules live

`lib/form.ts` (fields from the schemas, warnings), `lib/contribute.ts`
(building a submission, what blocks it, pasted rows, file names),
`lib/sniff.ts`, `site/src/islands/Contribute.tsx`,
`site/src/lib/sent-store.ts`, and `site/src/pages/contribute.astro`, tested
in `tests/contribute.test.ts`;
`schemas/submission.schema.json`; `schemas/common.schema.json` (`fieldNote`)
and `schemas/envelope.schema.json` (`fieldNotes`, `meta.submissions`); the
field-note rules in `lib/validate.ts`; `lib/submission.ts` (client-safe: edit
differences, applying them, `entryHash`); `lib/inbox.ts` (the checks, file
sniffing); `scripts/inbox/index.ts`; `config/site.json` (`submissions`);
tests in `tests/submission.test.ts`, field notes in `tests/validate.test.ts`.

## Extending

A new field on a type is on its forms with no form code: give it a `title`
when the key in words isn't its label, and `readOnly: true` when
contributors shouldn't edit it. A new type gets its Add and Suggest an edit
forms the same way. A new file type is a signature in `sniff` and an entry in `ALLOWED` for the
roles that take it. A new size limit is a value in `config/site.json`. A new
check is a function in `lib/inbox.ts` that adds its results, with a passing
and a failing case in the tests.
