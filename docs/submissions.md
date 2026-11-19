# Submissions

## Purpose

A contribution reaches the library as a **submission**: one JSON document and
its files, written once and never edited, that a routine checks and turns
into a pull request (P1, P5, P8). This file covers what is built: the
submission format, the edit differences a form submits, and the inbox's
mechanical checks so far. The forms, the stores, the remaining checks, and
the `integrate` skill are still in
[`spec/v1/submissions.md`](../spec/v1/submissions.md).

## Behavior

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

## Where the rules live

`schemas/submission.schema.json`; `lib/submission.ts` (client-safe: edit
differences, applying them, `entryHash`); `lib/inbox.ts` (the checks, file
sniffing); `scripts/inbox/index.ts`; `config/site.json` (`submissions`);
tests in `tests/submission.test.ts`.

## Extending

A new file type is a signature in `sniff` and an entry in `ALLOWED` for the
roles that take it. A new size limit is a value in `config/site.json`. A new
check is a function in `lib/inbox.ts` that adds its results, with a passing
and a failing case in the tests.
