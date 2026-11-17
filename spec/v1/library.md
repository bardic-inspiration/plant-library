---
depends: [data-model, styling]
---

# Library

## Goal

The list view and everything reached from it: looking plants up by criteria,
reading a plant or a project, following links between them, and building a
plant list as a design tool. It works the way TL's Library does, with a
simpler link structure, since this is information rather than rules (P4, P7,
P10).

## Design

### Pages

| Route | Content |
|---|---|
| `/` | The Library, list view |
| `/map/` | The Library, map view ([map.md](map.md)) |
| `/plant/<id>/`, `/project/<id>/`, `/palette/<id>/` | Detail pages |
| `/workspace/` | The palette workspace |
| `/print/` | Print view for a plant list or a set of entries |
| `/about/` | What the library is, sources, licenses, attribution |
| `/styleguide/` | Every component state, not linked in navigation |

The top bar reads **Library | Map | Workspace | About**. Library and Map are
two views of one result set: switching between them keeps the query string.

### Index

The build validates, derives, resolves refs, and writes
`site/public/library.json`: one lean record per entry with its key, name,
summary, URL, thumbnail, facets, tags, refs, back-refs, and search text. A
project's record also carries its coordinates. Full entries are copied to
`site/public/data/<type>/<id>.json` and fetched only for exports and the
workspace. The file is sorted and has no timestamps, so two builds of the
same content are identical. Fetches revalidate, as in TL.

### List view

One Preact island that loads the index once and filters in memory. Without
JavaScript the page lists every entry by name.

**Layout.** Search above a filter tree; on wide screens the tree is a sidebar
beside the results, on narrow ones it sits closed behind a Filters button.
Sort, the result count, and the view switch (List, Map) head the results.

**Cards.** A plant card shows its pinned image, botanical name, primary
common name, a form badge, and its `cardFields`: height and spread, sun and
moisture as icons with text labels, hardiness, and bloom months as a
twelve-cell strip in the bloom colors. A project card shows name, place and
state, type, status, completion year, size, and plant count. A palette card
shows name, plant count, and its site conditions. Each card links to its
detail page and has an "add to list" control for the workspace.

**Filter tree.** A nested checkbox tree built from `config/types.json`, as in
TL: type, then field, then value, each value with its count.

- Plant: Form, Foliage, Size (height and spread ranges, size class), Sun,
  Moisture, Soil (texture, drainage, pH), Hardiness (a zone range; a plant
  matches when its range contains the chosen zone), Water use, Tolerates,
  Bloom (color, month, season), Wildlife, Uses, Native (status, native to
  state), Wetland indicator, Family and Genus, Used in (state, county,
  ecoregion, on a project).
- Project: Type, Status, Completed (year range), Size, Budget, Cost per
  acre, Landscape architect, Client, Location (state, county, place,
  ecoregion, hardiness zone), Uses plant.
- Palette: site conditions.
- Tags, for every type.

Values within a facet combine as OR, facets as AND. An entry missing a value
never matches a filter on it.

**Two cross-type filters** make the link structure usable from the tree:

- *Uses plant* narrows projects to those whose lists include the chosen
  plants.
- *Used in* and *on a project* narrow plants to those used in a region or on
  the chosen projects.

**Region filters** set from the map ([map.md](map.md#region-filters)) show
in the tree as ordinary checked values and can be cleared there.

**Sort.** Name (botanical for plants), common name, any facet, or created
date. Entries missing the sort value go last.

**Search.** MiniSearch over botanical name, common names, and synonyms
(boosted), then summary, family, tags, and description. A search for
"Berberis" finds Mahonia aquifolium through its synonym; a project is found
by its name, architect, client, or place.

**URL state.** Search, filters, sort, and view are in the query string, so
any view can be bookmarked or shared, and the same string drives the map.

### Detail pages

**Plant.** Botanical name as the title, common names, family. The image
gallery with the pinned image first, each image with its credit. A traits
table grouped as Size and habit, Site (sun, moisture, soil, hardiness, water
use, tolerances), Seasonal interest (a bloom calendar, fall color, fruit),
Ecology (native status and range, wetland indicator, wildlife), and Uses.
Then Used on: its projects with quantity and year, a small map of them, and
totals by state. Then Often planted with (derived companions). Then Sources:
each cited source with its link, access date, and the fields it supports,
and Further reading. Cultivars of the same species link to each other and to
the species.

**Project.** Name, place and state, a location map, and the facts table
(architect, client, type, size, budget, cost per acre, status, completion).
The plant list as a schedule table grouped by form: botanical name, common
name, quantity, size, spacing, note; unsourced plants show as plain text.
Then a summary of the list: taxa, total quantity, native share, mix by form,
and its compatibility panel. Actions: export the schedule, open the list in
the workspace.

**Palette.** As a project page without the project facts: site conditions,
plant list, compatibility.

### Links

Everything that names something links to it:

- A plant in any list links to its page; a plant page lists every project
  and palette that uses it.
- A `{ref:…}` token in prose links to its target by its current name.
- Every facet value on a detail page (a family, a form, a county, an
  architect, a client, a project type) links to the Library filtered by that
  value. There are no separate pages for families, firms, or regions; the
  filtered Library is that page.
- A region name also offers the same filter on the map.
- Sources link out to the cited page.

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
  state, mix by form, a combined bloom calendar showing gaps in seasonal
  interest, and the compatibility panel.
- **Suggestions.** "Plants that fit": the Library filtered to the list's
  shared conditions and the site, with the companions of the plants already
  chosen listed first.
- **Keeping it.** The working list is saved in the browser's local storage,
  and several named lists can be kept. A list can be shared as a URL that
  encodes it, exported ([Exports](#exports)), or downloaded as a palette
  entry file to commit through a content PR, which is the only way a list
  becomes part of the library (P1).

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

- Filter: evergreen shrubs under 6 feet for part shade and moist soil, hardy
  in zone 8b, native to Washington.
- Filter: trees used on streetscape projects in King County.
- Search "Oregon grape" and "Berberis" both find the Mahonias.
- A plant with no image, and one with five.
- A project list with unsourced plants: the schedule shows them, the summary
  counts them as unknown, and compatibility ignores them.
- A palette where one wet-soil plant conflicts with four dry-soil plants: the
  conflict names the one.
- A workspace list shared by URL opens with the same lines on another device.

## Done when

- The filter tree, sort, search, and URL state have unit tests over a
  fixture index, including each filter case above.
- `lib/compat.ts` has tests for shared ranges, minimal conflicts, unknowns,
  and site fit.
- Detail pages build for every fixture entry, with every ref and facet link
  resolving (the link check covers the built site's internal links).
- The workspace round-trips a list through local storage, a share URL, CSV,
  and a palette file that passes validation.
- `npm run a11y` passes on the Library, each detail page type, and the
  workspace.

## Out of scope

Accounts, saving lists on a server, editing library entries in the browser,
planting plan drawings, cost estimating, and quantity takeoff from areas.
