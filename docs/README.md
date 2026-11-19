# Docs

What is built, one topic per file. Unbuilt design lives in
[`spec/v1/`](../spec/v1/README.md); a PR that builds part of it deletes that
part there and describes what now exists here.

| File | Covers |
|---|---|
| [architecture.md](architecture.md) | Layout, tech stack, the build pipeline, the scripts |
| [content-model.md](content-model.md) | Entries, the plant type, derived values, refs, validation |
| [geography.md](geography.md) | Boundary data in `geo/` and geography derived from a point |
| [map.md](map.md) | The map engine, the basemap extract, the style built from tokens, glyphs, project clustering, the overlay registry and layer list |
| [sources.md](sources.md) | The source registry, licensing rules, attribution, coverage |
| [submissions.md](submissions.md) | The submission format, edit differences, the inbox and its mechanical checks |
| [site.md](site.md) | Pages, the index, the list view, filters, search, detail pages |
| [styling.md](styling.md) | Tokens, type, color, Stylelint, contrast, accessibility |
| [workflow.md](workflow.md) | Lanes, CI, checks, deploy, the prototype and the company copy |
| [decisions.md](decisions.md) | Principles, and one row per decision |

## Conventions

- Each topic file has the sections **Purpose**, **Behavior**, **Where the
  rules live**, and **Extending**.
- Docs describe what exists, in the present tense. Plans belong in the spec
  or an issue.
- Every relative link must resolve: `npm run links` checks them, and so does
  the test suite.
