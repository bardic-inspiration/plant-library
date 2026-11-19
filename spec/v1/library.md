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
| `/map/` | The Library, map view ([map.md](map.md)) |
| `/project/<id>/`, `/palette/<id>/` | Detail pages |
| `/workspace/` | The palette workspace |
| `/contribute/` | The contribution forms and My submissions ([submissions.md](submissions.md#forms)) |
| `/print/` | Print view for a plant list or a set of entries |

The top bar will read **Library | Map | Workspace | Contribute | About**,
each joining as it is built. Library and Map are two views of one result
set: switching between them keeps the query string.

### List view, still to add

- **Cards.** The project card is built. A palette card shows name, plant
  count, and its site conditions. Every card has an "add to list" control
  for the workspace.
- **The view switch** (List, Map) beside sort and the count.
- **Project and palette facets.** Project: Type, Status, Completed (year
  range), Size, Budget, Cost per acre, Landscape architect, Client,
  Location (state, county, place, ecoregion, hardiness zone), Uses plant.
  Palette: site conditions. Plant: Used in (state, county, ecoregion, on a
  project).
- **Two cross-type filters** make the link structure usable from the tree:
  *Uses plant* narrows projects to those whose lists include the chosen
  plants; *Used in* and *on a project* narrow plants to those used in a
  region or on the chosen projects.
- **Region filters** set from the map ([map.md](map.md#region-filters)) show
  in the tree as ordinary checked values and can be cleared there.
- **Search** finds a project by its name, architect, client, or place.

### Plant page, still to add

After Traits: Used on (its projects with quantity and year, a small map of
them, and totals by state), then Often planted with (derived companions).
The page carries "Add photo", "Suggest an edit", and "Add field note".

### Project page, still to add

The project page is built ([docs/site.md](../../docs/site.md#project-page)).
Still to come: the location map (M5), the compatibility panel, and the
actions to export the schedule and open the list in the workspace (M6).

### Palette page

As a project page without the project facts: site conditions, plant list,
compatibility.

### Links, still to add

- A plant page lists every project and palette that uses it.
- A facet value on a project page (a county, an architect, a client, a
  project type) links to the Library filtered by that value.
- A region name also offers the same filter on the map.

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
  interest, and the compatibility panel.
- **Suggestions.** "Plants that fit": the Library filtered to the list's
  shared conditions and the site, with the companions of the plants already
  chosen listed first.
- **Keeping it.** The working list is saved in the browser's local storage,
  and several named lists can be kept. A list can be shared as a URL that
  encodes it, exported ([Exports](#exports)), or submitted to the library
  ([submissions.md](submissions.md#forms)); it becomes an entry only when
  that submission's PR is merged (P1).

### Compatibility

One pure function, `lib/compat.ts`, used by the build (for projects and
palettes) and the workspace, so both always agree (P3).

For a plant list and optional site conditions it returns, per axis (sun,
moisture, soil drainage, hardiness zone, water use):

- **Shared range**: the values every plant accepts.
- **Conflicts**: when no value is shared, the smallest set of plants whose
  removal restores one, each with the values it needs.
- **Site fit**, when a site is given: each plant passes, fails, or is
  unknown for the axis.

A plant with no data on an axis is reported as unknown and never counted as
a conflict. The panel shows a plant-by-value grid per axis, with shared
columns marked and conflicts named in words, so color is never the only
signal. Compatibility is about growing conditions only; it makes no claim
about design, spacing, or competition.

### Exports

- **CSV plant schedule** of any plant list (project, palette, or workspace):
  botanical name, common name, quantity, size, spacing, note.
- **JSON**: any entry as stored, or a workspace list as a palette entry.
- **Print**: a plant schedule, or plant cut sheets (one plant per section
  with image, traits, and sources) for the selection or the filtered
  results.

## Cases

- Filter: trees used on streetscape projects in King County.
- A project list with unsourced plants: the schedule shows them, the summary
  counts them as unknown, and compatibility ignores them.
- A palette where one wet-soil plant conflicts with four dry-soil plants: the
  conflict names the one.
- A workspace list shared by URL opens with the same lines on another device.

## Done when

- The cross-type filters have unit tests over a fixture index, including the
  filter case above.
- `lib/compat.ts` has tests for shared ranges, minimal conflicts, unknowns,
  and site fit.
- Palette pages build for every fixture entry, with every ref
  and facet link resolving.
- The workspace round-trips a list through local storage, a share URL, CSV,
  and a palette file that passes validation.
- `npm run a11y` passes on project and palette pages and the workspace.

## Out of scope

Accounts, saving lists on a server, editing library entries in the browser,
planting plan drawings, cost estimating, and quantity takeoff from areas.
