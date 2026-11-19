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
| `/contribute/` | The contribution forms and My submissions ([submissions.md](submissions.md#forms)) |
| `/print/` | Print view for a plant list or a set of entries |

The top bar will read **Library | Map | Workspace | Contribute | About**,
each joining as it is built (Library, Map, Workspace, and About are).

### List view, still to add

- **Cards.** The project and palette cards are built
  ([docs/site.md](../../docs/site.md#list-view)), as are the palette facets
  and every card's "add to list" control.

### Plant page, still to add

Used on, with its small map of the projects, is built
([docs/site.md](../../docs/site.md#plant-page)). After it: Often planted
with (derived companions).
The page carries "Add photo", "Suggest an edit", and "Add field note".

### Project page, still to add

The project page and its compatibility panel are built
([docs/site.md](../../docs/site.md#project-page)), as is the palette page
([docs/site.md](../../docs/site.md#palette-page)), with "Open in workspace".
Still to come on both: the action to export the schedule (M6).

### Palette workspace

Built ([docs/site.md](../../docs/site.md#workspace)). Still to come:

- **Suggestions.** In "Plants that fit", the companions of the plants
  already chosen are listed first, once M8 derives companions
  ([map.md](map.md)).
- **Keeping it.** Exporting a list ([Exports](#exports)), and submitting it
  to the library ([submissions.md](submissions.md#forms)); it becomes an
  entry only when that submission's PR is merged (P1).
- **Site.** The location supplies the hardiness zone once the zone layer
  exists (D33); until then the zone is chosen.

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

## Done when

- The workspace round-trips a list through CSV and a palette file that
  passes validation (local storage and the share URL are built and tested,
  and `npm run a11y` passes on the workspace).

## Out of scope

Accounts, saving lists on a server, editing library entries in the browser,
planting plan drawings, cost estimating, and quantity takeoff from areas.
