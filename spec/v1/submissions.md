---
depends: [data-model, sources, library]
---

# Submissions

## Goal

Let people at the organization contribute what they know: add a photo, add a
project, add or correct plant, palette, and project data, and record their
professional opinion of how a plant performs. They do it through forms in
the site. A form doesn't change the library. It files a **submission**, with
enough metadata that a Claude Code routine can check its licensing and
quality and integrate what passes through a GitHub pull request, which a
person merges (P1, P5, P8).

## Design

### The flow

```
Form in the site ──► submission (JSON + files) ──► store (inbox)
                                                      │
              Claude Code routine, `integrate` skill ◄┘
                │  mechanical checks (script), then license and quality review
                ▼
        content PR, one per submission ──► owner reviews and merges
                │
                ▼
        result filed beside the submission; submission moved to processed
```

The library still changes only by a merged PR. Submissions are untrusted
input from start to finish.

### Forms

Built: the forms, generated from the schemas, with edits as differences,
a basis for every claim, plant lists, photo metadata, lenient checks,
drafts, the remembered submitter, and My submissions with Export and each
result once the store has one
([docs/submissions.md](../../docs/submissions.md#forms)).

### The submission

Built: the format, `schemas/submission.schema.json`, and the edit
differences a form submits are described in
[docs/submissions.md](../../docs/submissions.md#the-submission). The forms
produce it.

### Stores

Built: the `SubmissionStore` interface, the `browser` store, bundles, and
`inbox import` ([docs/submissions.md](../../docs/submissions.md#stores)).
Still to build: the `folder` store for the company copy, whose writing is
an open question. On disk a store is always the same layout, so the routine
doesn't care which filed it:

```
inbox/<id>/submission.json        the submission
inbox/<id>/<file name>            its files, as uploaded
processed/<id>/…                  the same, moved here once handled
processed/<id>/result.json        what the routine decided (below)
```

| Store | For | How it files |
|---|---|---|
| `folder` | The company copy | A folder on the organization's server. How the browser writes there is an open question, with three candidates below. Its `result` reads `processed/<id>/result.json`. |

Bundles also work everywhere as a fallback: export, then drop the file into
the shared folder by hand.

### Mechanical checks and the `integrate` skill

Built: `npm run inbox -- list | check | import | image | close | compare`,
results, the `integrate` skill, and the fixture inbox with every case's
expected result ([docs/submissions.md](../../docs/submissions.md#the-integrate-skill));
its routine is in [docs/routines.md](../../docs/routines.md).

### In the prototype

Built: the `browser` store and the skill's prototype rules
([docs/submissions.md](../../docs/submissions.md#the-integrate-skill)). What
remains is the `folder` store above.

## Done when

The forms' items, the `browser` store's round trip, and the skill with its
fixture inbox are met ([docs/submissions.md](../../docs/submissions.md)).
Still to meet, in the company copy: the `folder` store files and reads
results. What a routine run actually decides is a manual check for the
Testing backlog.

## Open questions

- **How the browser writes to the server folder.** Candidates for the
  company copy: (a) the browser's File System Access API, where each person
  picks the shared network folder once and the site writes straight to it,
  with no server code, in Chrome and Edge only; (b) an upload endpoint on
  the internal web server, such as WebDAV, which works in every browser and
  is the one piece of server configuration the site would need; (c) bundles
  dropped into the folder by hand. Decided at handover, with the firm's IT.
- **Where the routine runs.** It needs the inbox folder, a checkout, and
  GitHub access together: a scheduled Claude Code session on a machine
  inside the firm's network, or a sync of the inbox to somewhere a cloud
  session can read. Also for handover.
- **Transcribing plant list files.** How schedule abbreviations and
  misspellings are matched to plants, and how much the routine may infer
  before asking ([sources.md](sources.md#open-questions)).
- **Results reaching contributors.** With the `folder` store, "My
  submissions" can read `result.json`. Whether people also want an email or
  a message is left until there are contributors.

## Out of scope

Accounts and sign-in, moderation queues in the site, editing or withdrawing
a submission after it is filed, comments and discussion threads, and
anything that changes the library without a pull request.
