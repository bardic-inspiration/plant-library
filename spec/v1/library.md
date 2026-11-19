---
depends: [data-model]
---

# Library

## Goal

The list view and everything reached from it: looking plants up by criteria,
reading a plant or a project, following links between them, and building a
plant list as a design tool. It works the way TL's Library does, with a
simpler link structure, since this is information rather than rules (P4, P7,
P10).

## Design

The list view, filter tree, search, sort, URL state, the index, the plant
page, About, and the style guide are built; see
[docs/site.md](../../docs/site.md). What remains:

### Pages still to build

| Route | Content |
|---|---|
| `/workspace/` | The palette workspace |
| `/contribute/` | The contribution forms and My submissions ([submissions.md](submissions.md#forms)) |
| `/print/` | Print view for a plant list or a set of entries |

The top bar will read **Library | Map | Workspace | Contribute | About**,
each joining as it is built (Library, Map, and About are).

### List view, still to add

- **Cards.** The project and palette cards are built
  ([docs/site.md](../../docs/site.md#list-view)), as are the palette facets.
  Every card has an "add to list" control for the workspace.

### Plant page, still to add

Used on, with its small map of the projects, is built
([docs/site.md](../../docs/site.md#plant-page)). After it: Often planted
with (derived companions).
The page carries "Add photo", "Suggest an edit", and "Add field note".

### Project page, still to add

The project page and its compatibility panel are built
([docs/site.md](../../docs/site.md#project-page)), as is the palette page
([docs/site.md](../../docs/site.md#palette-page)). Still to come on both:
the actions to export the schedule and open the list in the workspace (M6).

### Palette workspace

The design tool for mocking up a plant list. It runs in the browser with no
account.

- **Building.** Plants are added from cards, detail pages, a project's list
  ("open in workspace"), or search within the workspace. Each line takes a
  quantity, size, spacing, and note. Lines can be reordered and grouped by
  form.
- **Site.** The list can be given site conditions: sun, moisture, drainage,
  and a location picked on a map, which supplies the hardiness zone, state,
  and ecoregion.
- **Feedback as you build**: totals, taxa count, native share for the site's
  state, mix by form and by life cycle, a combined bloom calendar showing gaps in seasonal
  interest, and the compatibility panel (built:
  [docs/site.md](../../docs/site.md#compatibility-panel); `CompatPanel`
  renders from the same `compatibility` result in the browser).
- **Suggestions.** "Plants that fit": the Library filtered to the list's
  shared conditions and the site, with the companions of the plants already
  chosen listed first.
- **Keeping it.** The working list is saved in the browser's local storage,
  and several named lists can be kept. A list can be shared as a URL that
  encodes it, exported ([Exports](#exports)), or submitted to the library
  ([submissions.md](submissions.md#forms)); it becomes an entry only when
  that submission's PR is merged (P1).

### Exports

- **CSV plant schedule** of any plant list (project, palette, or workspace):
  botanical name, common name, quantity, size, spacing, note.
- **JSON**: any entry as stored, or a workspace list as a palette entry.
- **Print**: a plant schedule, or plant cut sheets (one plant per section
  with image, traits, and sources) for the selection or the filtered
  results.

## Cases

- A project list with unsourced plants: the schedule shows them, the summary
  counts them as unknown, and compatibility ignores them.
- A workspace list shared by URL opens with the same lines on another device.

## Done when

- The workspace round-trips a list through local storage, a share URL, CSV,
  and a palette file that passes validation.
- `npm run a11y` passes on the workspace (it passes on project and palette
  pages).

## Out of scope

Accounts, saving lists on a server, editing library entries in the browser,
planting plan drawings, cost estimating, and quantity takeoff from areas.
