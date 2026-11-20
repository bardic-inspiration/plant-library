# Submissions

## Purpose

A contribution reaches the library as a **submission**: one JSON document and
its files, written once and never edited, that a routine checks and turns
into a pull request (P1, P5, P8). This file covers what is built: the
contribution forms, the submission format, the edit differences a form
submits, the `browser` store with its bundles and `inbox import`, the
inbox's mechanical checks, results and `close`, the `integrate` skill with
its fixture inbox, and professional opinion on entries. The `folder` store
is still in [`spec/v1/submissions.md`](../spec/v1/submissions.md).

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
  schema's `fieldNote`; a note's trait is picked from the plant traits
  validation takes (`traitOptions`, from `isNoteTrait` in `lib/traits.ts`),
  labeled from the plant form's fields, and its project from the library's
  projects.
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
  rest size, spacing, and note. A name is matched to a plant as validation
  matches it, synonyms included. An attached plant list file is listed for
  the routine. Nothing transcribes it yet (how is an open question), so for
  now it is a placeholder, kept so the flow can be tested with the files
  the real data will come from (D69).
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
  with its files in the configured store ([Stores](#stores)).
  **My submissions**, on `/contribute/`, lists what the store holds, newest
  first, each with **Export** (its bundle) and its result once the store has
  one (Integrated, Partly integrated, Not used, Needs more information,
  linked to its pull request); "Export all" bundles every one.

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

### Stores

Where a submission is filed is behind one interface, `SubmissionStore` in
`site/src/lib/store.ts`: `put` (written once, never edited), `list`
(newest first), `get`, and `result` (the routine's `result.json`, once the
store has one). `store` in `config/site.json` names the adapter; the build
fails on a store with no adapter in `site/src/lib/stores/`.

| Store | Files in | Results |
|---|---|---|
| `browser` (`stores/browser.ts`) | IndexedDB in the person's browser (`plant-library-submissions`), each submission with its files as blobs. Missing or refused IndexedDB (a private window) makes `put` reject, and the form says the submission wasn't filed. | None: a result never reaches the browser |

### Bundles

A bundle carries submissions from any store to an inbox: one uncompressed
POSIX tar file laid out as the inbox is, `<id>/submission.json` (the
submission as two-space JSON and a newline) and `<id>/<file name>` for each
file, as uploaded. It is named `submission-<id>.tar`, or
`submissions-<n>.tar` for several; any tar tool can list or unpack it.
`lib/bundle.ts` writes and reads it, in the browser and in Node alike. A
file name over a ustar header's 100 bytes (names go to 200 characters)
travels in a pax `path` record.

`npm run inbox -- import <bundle>` unpacks it into the git-ignored `inbox/`
at the repo root. A bundle is untrusted, so reading it fails, and nothing
is written, on a damaged header, a cut-short file, a link or any entry that
isn't a plain file or folder, a pax record other than `path`, a path that
isn't `<id>/<plain file name>` under a well-formed id, a name given twice,
or a folder with no `submission.json`. A submission the inbox or
`processed/` already holds is skipped, never overwritten. Each folder is
written beside the inbox and renamed into it, so an import leaves no
half-written folder. What the submission says isn't checked here; that is
`check`.

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
submission: `inbox/<id>/submission.json` and the files beside it, put there
by `import` ([Bundles](#bundles)). `npm run inbox -- list` lists it oldest
first, with each one's kind, target, and submitter; `npm run inbox -- check <id>`
reports each check as `pass`, `warn`, or `fail` and exits 1 when the
submission is rejected (`--json` adds the report as JSON).
`PLANT_LIBRARY_INBOX` names another folder to hold `inbox/` and
`processed/`, for a run on a copy of the fixture inbox; `PLANT_LIBRARY_DATA`
names the library the checks read, and `based-on` reads that library's git
history.

| Check | Fails (rejects) | Warns |
|---|---|---|
| `schema` | `submission.json` isn't JSON or fails the schema (nothing more is checked); its `id` isn't its folder's name | |
| `files` | A listed file is missing, or its size or sha256 differs from the stated one | A file in the folder that the submission doesn't list; it isn't used |
| `file-type` | A file is none of its role's types by its content, or is over its role's size limit (`submissions.maxBytes` in `config/site.json`) | The content is an allowed type but the name's extension says another |
| `target` | The type isn't one the library has, or the entry isn't in the library | |
| `based-on` | | `basedOn` isn't the current entry; it names the paths changed since and, separately, the edit's paths that touch them (`touched`) |
| `duplicate` | | An `add` whose name or a synonym is the name, the name with trade name, or a synonym of an entry of its type (a project or palette by its `name`); an image whose sha256 is a file under `assets/images/`, or an image file listed by a submission in `processed/` |
| `paths` | A change's path isn't in the type's schema (the envelope's `name`, `summary`, `description`, `tags`, or the type's `data`), goes into a list or a read-only field, clears a required field, adds or removes items of a field that isn't a list, or its value (each added item) fails the schema there; a plant field note's `trait` isn't a plant trait (`isNoteTrait`, the list validation uses: a cited trait, or `soil` or `bloom`; a name, one end of a range, or one wetland region is in the schema but isn't a trait), or a project's or palette's note names one | |
| `urls` | | A URL whose host is no registered source's `hosts` (or a subdomain of one), or that can't be read; checked: every `sourceUrl`, and URLs in citations, notes, field notes, and the comment |

A file's type comes from its first bytes, never its name: JPEG, PNG, or WebP
for an image; PDF, CSV, or XLSX for a plant list; any of those for a
supporting file. An XLSX file is a zip holding `xl/workbook.xml`; a CSV file
is UTF-8 text with no control characters and a separator.

Only schema, file, and file type failures reject a submission. A failed
`target` or `paths` result means that item can't be used as it stands, and
the warnings are facts for the routine's review: a duplicate `add` is
turned into an edit or returned, and an unknown URL's fact is looked for in
a registered source. An integrated image is re-encoded, so its hash no
longer matches the file submitted; `processed/` keeps the original's hash
in its submission, which is where `duplicate` finds it.

A path's schema is found by walking the type's schema from the envelope,
following `$ref`s, through `properties` and, for a map such as `tags`,
`additionalProperties` with its `propertyNames`; its value is validated
against that schema with the vocabulary filled in.

A stale `basedOn` doesn't reject a submission: the routine merges it by hand
against the current entry. To say which fields changed since, `check` looks
through the entry file's git history for the version whose hash is
`basedOn` and compares it with the current entry; two paths touch when one
is the other or inside it.

### Library images

`npm run inbox -- image <id> <file> [<entry id>]` takes one image of a
submission into the library. It runs `check` first and refuses a rejected
submission, then re-encodes the file with `sharp` (`lib/image.ts`): turned
upright by its orientation tag, fitted inside `submissions.image.maxEdge`
pixels (never enlarged), converted to sRGB, and written as
`submissions.image.format` at `submissions.image.quality`, with no embedded
metadata: no EXIF, GPS, XMP, IPTC, or ICC profile. Date and place come from
the form, never the file. The defaults in `config/site.json` are JPEG,
2400 px, quality 82; a JPEG is flattened onto white.

The image goes to the next free `assets/images/<type>/<entry>/<n>.<ext>`
(one more than the highest number held), never over an existing file. For
an `add`, the new entry's id is the third argument; it must be a slug, as
an entry id is, so an id such as `../x` writes nothing outside the
entry's folder. The command prints the
`images` item the form's metadata gives (`file`, `alt`, `shows`, `credit`
from the photographer, `license`, `sourceUrl`), for the routine to check and
add to the entry. A file that only looks like an image, or that can't be
decoded, isn't written.

### Professional opinion

A colleague's judgment sits beside the published facts, never silently over
them (P5).

- **Field notes.** Plants, projects, and palettes take `fieldNotes`: each a
  `topic` from the `fieldNoteTopic` vocabulary (`performance`,
  `establishment`, `maintenance`, `availability`, `design`, `caution`), a
  markdown `note`, the `author`'s name and role, a `date`, and optionally a
  `region` (a state), a `project` (a ref to a project), and the
  `submission` it came from. Only a plant's note may name a `trait` (a
  cited trait such as `height` or `soil.drainage`, or `soil` or `bloom` for
  all their parts; `isNoteTrait` in `lib/traits.ts`), and the plant page then shows
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
trait; the `integrate` skill makes that call ([below](#the-integrate-skill)).

### Results

`npm run inbox -- close <id> <result file>` writes a submission's result as
`result.json` in its folder, then moves the folder from `inbox/<id>/` to
`processed/<id>/`, whole; nothing of the submission is deleted. It refuses,
changing nothing, a result that fails `schemas/result.schema.json` or the
rules below, one for another id, a submission not in the inbox, and one
already processed; if the move fails, the `result.json` it wrote is taken
out again, so the submission is left as it was.

A result holds `schema` (1), `id`, `status`, `decidedAt`, the `pr` when
anything was integrated, `items`, and `questions`. Each item is one decision:
`item` names what it decides, `decision` is `accepted`, `changed`, or
`not-used`, and `reason` says why, in words the contributor can act on.

| `item` | Decides |
|---|---|
| `submission` | The whole submission, when the mechanical checks reject it; then the only item |
| `entry` | An add's draft entry |
| `change:<path>` | One change of an edit |
| `file:<name>` | One file |
| `field-note:<n>` | One field note, numbered from 1 |
| `comment` | The comment |

The status follows from the items (`statusFor` in `lib/result.ts`), with the
comment not counted, since disregarding an unrelated comment or an
instruction in it doesn't make a submission partial: every item used is
`integrated`, some is `partial`, none is `rejected`. `needs-info` is the
skill's call: nothing is integrated, every item is `not-used`, and
`questions` says what to answer; the contributor answers with a new
submission naming this one in `replyTo`. A rejected result has no `pr`, and
an item is decided once.

### The integrate skill

[`.claude/skills/integrate/SKILL.md`](../.claude/skills/integrate/SKILL.md)
is the workflow a session follows, by hand in the prototype (there is no
schedule yet; [routines.md](routines.md)). For each submission, oldest
first: the mechanical checks, reading everything in it as data, the
license check, the quality check, placing professional opinion, then a
`content/sub-<id>` branch with what passed, `validate` and `build`, one
content PR listing every item's decision, and `close`. It never merges,
registers a source, or deletes anything.

Its prototype rules: a project submission is integrated only as a fixture,
with `meta.fixture: true` and the proprietary fields blank, and one that
reads as a real project is `rejected`; `organization-owned` files are not
used, since the repo is open source; an attached plant-list file isn't
transcribed, since how is still an open question
([spec/v1/sources.md](../spec/v1/sources.md#open-questions)), and is
`not-used` with that reason.

An observation fills a gap only when no source cited on that field gives
it, since citations are per field: one more item for a list a source gives
(such as `tolerates`) disagrees with that source's list and becomes a field
note on the trait.

### The fixture inbox

`tests/fixtures/inbox/` holds one submission per case below, written
against the test fixture library, and `tests/fixtures/inbox-expected/<id>.json`
documents each one: the `case`, what the mechanical checks find
(`mechanical`: rejected, and the worst status per check), and the expected
`result` (status, and each item's decision and reason). A case's `assume`
says what a page (keyed by its URL) states or a photo (keyed by its file
name) shows, the things a fixture can't hold; a fixture run takes them as
seen, and opens no URL. The photos are small generated images, and the URLs
are on `example.org` and `example-nursery.com` hosts.

| Id | Case | Expected |
|---|---|---|
| `…090100Z-f10001` | A photo declared own work, with full metadata | `integrated`: re-encoded, credited |
| `…090200Z-f10002` | A third-party photo whose page states CC BY-SA 4.0 | `integrated` under that license and credit |
| `…090300Z-f10003` | A third-party photo whose page states no license | `rejected` |
| `…090400Z-f10004` | A third-party photo whose page states CC BY-ND 4.0 | `rejected` |
| `…090500Z-f10005` | An edit citing a nursery catalog for a spread and a growth rate | `partial`: the spread cited to USDA PLANTS instead; the growth rate, which no registered source gives, not used |
| `…090600Z-f10006` | An observation that a plant tolerates compaction, which no source covers | `integrated`, cited to `staff-observation` |
| `…090700Z-f10007` | An observation that disputes a sourced height | `integrated` as a field note on height; the height stays |
| `…090800Z-f10008` | A field note whose comment asks for the other photos to be deleted | `integrated`; the comment ignored as an instruction, and reported |
| `…090900Z-f10009` | A new plant that is a synonym of one the library holds, adding nothing | `rejected`, pointing to Suggest an edit |
| `…091000Z-f10010` | An edit whose stale `basedOn` touches a field changed since | `partial`: the change already made is not used; the untouched one is |
| `…091100Z-f10011` | A project with a pasted plant list in which three names match no plant | `integrated` as a fixture, the three as plain names |
| `…091200Z-f10012` | A file named `.jpg` that is not an image | `rejected` by the mechanical checks |
| `…091300Z-f10013` | In the prototype, a project naming a real client | `rejected`, unintegrated |

`tests/integrate.test.ts` checks that every case has its expected file, that
the mechanical checks find what it documents, and that each expected result
is valid. `npm run inbox -- compare` holds the results in `processed/`
against the expected ones: the status and each item's decision, with reasons
left to reading. What a real run of the skill decides is a manual check
(Testing backlog).

## Where the rules live

`lib/form.ts` (fields from the schemas, warnings), `lib/contribute.ts`
(building a submission, what blocks it, pasted rows, file names),
`lib/sniff.ts`, `site/src/islands/Contribute.tsx`,
and `site/src/pages/contribute.astro`, tested in `tests/contribute.test.ts`;
`site/src/lib/store.ts` and `site/src/lib/stores/` (the stores, export),
`lib/bundle.ts` (bundles), and `importBundle` in `lib/inbox.ts`, tested in
`tests/bundle.test.ts`;
`schemas/submission.schema.json`; `schemas/common.schema.json` (`fieldNote`)
and `schemas/envelope.schema.json` (`fieldNotes`, `meta.submissions`); the
field-note rules in `lib/validate.ts`; `lib/submission.ts` (client-safe: edit
differences, applying them, `entryHash`); `lib/inbox.ts` (the checks, `resolvePath`,
`classifyUrl`, import); `lib/image.ts` (re-encoding, tested in
`tests/image.test.ts`); `schemas/result.schema.json` and `lib/result.ts`
(results, `close`, `compare`), the fixture inbox in `tests/fixtures/inbox/`
and `tests/fixtures/inbox-expected/`, tested in `tests/integrate.test.ts`;
`.claude/skills/integrate/SKILL.md`; `scripts/inbox/index.ts`; `config/site.json` (`submissions`);
tests in `tests/submission.test.ts`, field notes in `tests/validate.test.ts`.

## Extending

A new field on a type is on its forms with no form code: give it a `title`
when the key in words isn't its label, and `readOnly: true` when
contributors shouldn't edit it. A new type gets its Add and Suggest an edit
forms the same way. A new store is an adapter file in `site/src/lib/stores/`, an entry in
`STORES`, and a value in the site schema's `store` enum.
A new file type is a signature in `sniff` and an entry in `ALLOWED` for the
roles that take it. A new size limit is a value in `config/site.json`, as are the library image
settings (`submissions.image`). A new
check is a function in `lib/inbox.ts` that adds its results, with a passing
and a failing case in the tests. A new case for the routine is a submission
folder in `tests/fixtures/inbox/` and its expected file in
`tests/fixtures/inbox-expected/`; the test's case count changes with it.
