# Site

## Purpose

The static site: look plants up by name or criteria, read a plant, and
follow links between entries (P4, P7, P10).

## Behavior

### Pages

| Route | Content |
|---|---|
| `/` | The Library list view |
| `/map/` | The Library map view |
| `/plant/<id>/` | Plant detail page |
| `/project/<id>/` | Project detail page |
| `/palette/<id>/` | Palette detail page |
| `/about/` | What the library is, the source registry, licenses, image credits, contributors |
| `/styleguide/` | Every component state; not in navigation |
| `/404.html` | Not found |

The top bar lists only built sections (Library, Map, About); Workspace and
Contribute join as they are built.

### Index

`site/public/library.json` holds the facet list (every facet of every type
that has values, plus one per tag key, values in vocabulary order) and one
lean record per entry: key, name and styled name parts, summary, URL,
thumbnail (the pinned image), facet values, tags, refs, back-refs, sort
keys, search text, and card fields. Only types the site builds pages for
are indexed (`hasPages`, D35); projects and palettes are, with their card fields. Full entries
of every type are at
`site/public/data/<type>/<id>.json`, for later exports and the workspace.

### List view

`site/src/islands/Library.tsx` loads the index once (revalidating) and
filters in memory. The page also renders every entry statically, so without
JavaScript it is a full list; the island hides that list once it loads.

- **Search:** MiniSearch, prefix and light fuzzy matching, all terms
  required. Botanical name, common names, synonyms, and trade name weigh
  three times the summary, family, tags, and description. "Berberis" finds
  the Mahonias through their synonyms. A project is found by its name,
  landscape architect, client, or place (its place and county names). With
  search text, a Relevance sort is offered.
- **Filter tree:** type, then each facet (grouped as `config/types.json`
  groups them), then values with counts. Values in a facet combine as OR,
  facets as AND, and an entry missing a value never matches. A value's
  count is the result size with that value checked given the other facets'
  selections. Active filters show as removable chips; with more than one
  type indexed, a type's facet names its type ("Project type: Streetscape").
- **Facet kinds** (`lib/facets.ts`): `value` (a field's value or values),
  `range` (buckets; a range matches every bucket it overlaps, so a 3–10 ft
  shrub is in "3 to 6 ft", and a single figure, such as a project's acreage,
  is in the bucket that holds it), `zones` (a plant matches each half zone its
  range contains), `months` (bloom months, wrapping the year), `pairs`
  (`region:rating`).
- **Facet labels:** a value in a vocabulary takes its label and order from
  it. A facet with `labels` takes them from a boundary layer (`counties`:
  "King County, WA", `places`: "Portland, OR", `ecoregions`: "Puget
  Lowland") or from the entries its values name (`entries`), in label order.
  Other values are their own labels, in alphabetical order.
- **Project facets:** Type, Status, Completed (year buckets), Size (acres),
  Budget, Cost per acre, Landscape architect, Client, Location (state,
  county, place, ecoregion, hardiness zone), and Uses plant. A facet with no
  values is left out of the index, so Client, Budget, and Cost per acre
  (blank in every fixture) and Hardiness zone (not derived, D33) don't show.
- **Palette facets:** Site conditions: Sun, Moisture, and Drainage, from the
  values the palette's `site` states.
- **Cross-type filters:** *Uses plant* (a project facet) narrows projects to
  those whose lists ref the chosen plants. *Used in* (a plant group: state,
  county, ecoregion, and *On a project*, by project name) narrows plants to
  those a project in the region, or a chosen project, lists by ref. And the
  project facets reach plants through their projects (D39): a plant meets
  the project filters when one project that lists it meets all of them, each
  project checked as a whole. So "trees used on streetscape projects in King
  County" is Type = Plants, Form = Tree, Project Type = Streetscape, County =
  King County, WA, and a tree only on a King County park stays out. Without
  a Type, a project filter shows the projects and the plants on them. A
  project value's count is the results it would leave, plants counted
  through their projects. Unsourced text never counts. `crossFilters` in
  `config/types.json` sets which types reach which, and through what path
  (plants: `{ "project": "derived.use.projects" }`); the index carries the
  linked keys as each record's `links`.
- **Sort:** every type's sorts from `config/types.json`; missing values go
  last; ties fall back to name.
- **URL state:** `lib/filter.ts`. Search is `q`, a filter is its facet key
  repeated per value (`plant.sun=shade&plant.sun=part-shade`), then `sort`.
  The page is the view (D46): an old `view` parameter is dropped. Unknown
  parameters are kept, so the map's `center` and `zoom` survive the list
  view. Checking a value pushes a history entry; typing replaces it.
- **View switch:** List and Map, beside the count, link the same query
  string to `/` and `/map/` (`viewUrl`).
- **Layout:** the tree is a sidebar from 64rem; below that it sits closed
  behind a Filters button.
- **Cards:** a plant card shows its pinned image (none, and no
  placeholder, when it has none), botanical name, primary common name, form
  badge, a Native badge, height and spread, hardiness, sun and moisture as
  labelled icons, and a twelve-cell bloom strip with a text alternative.
  A palette card shows its name, "Palette" with its place when its site has
  a location, its plant count (distinct refs plus distinct unsourced names,
  as a project card counts them), sun and moisture as labelled icons, and
  drainage and a stated zone as text, or "No site conditions".

### Map view

`/map/` is the same island (`Library` with `view="map"`): the search,
filter tree, chips, sort, and URL state above, with the results drawn on the
map ([map.md](map.md)) instead of listed. The map component is imported only
on this page.

- **Projects** in the results are points, clustered when zoomed out, colored
  by type, filled when constructed and hollow when proposed. A point opens a
  popup with the project's card, linking its page.
- **Palettes** whose site has a location are points of their own kind: a
  dark disc with a light center, unclustered, over the projects, opening a
  popup with the palette's card. A palette with no location is counted
  among the results the map can't place (D55).
- **Plants** have no location of their own: with plants in the results, the
  map draws the projects whose lists ref a matching plant, among those that
  meet the query's project filters, each sized by the quantity of matching
  plants it lists (the popup gives the figure). With exactly one plant in
  the results, the states it is native to are drawn with a legend, or a note
  says no native range is recorded (D47, D48). `mapResults` in
  `lib/map-data.ts`.
- **Results in view:** a panel beside the map lists the results in view in
  card form (projects drawn in the bounds, plants with a drawn project in
  them) and follows the map when it settles. Results the map can't place
  (plants on no drawn project) are counted under it, with a link to the list
  view. Below 64rem the panel is a sheet fixed to the bottom of the screen
  that pulls up over the map.
- **Region filters:** with a selectable overlay on (ecoregions, counties,
  states), clicking a region toggles it as a filter value, exactly as the
  tree would, and the regions the filters hold are drawn in the selection
  color. The value goes on the first of the overlay's `facets` that offers
  it, the project facet in the registry, which also reaches plants through
  their projects (D39); a second click, or the chip, removes it, whichever
  facet set it. Several can be picked; they are ORed like any tree values.
  With more than one selectable overlay on, a click asks which region it
  meant. A region no entry is in does nothing (D50; `pickRegion` in
  `lib/filter.ts`).
- **Box filter:** *Draw a box* lets the reader drag a box over the map
  (Escape cancels), and *Use this view* takes the map's bounds as one, for
  keyboard use. The box is held in the URL as `bbox=west,south,east,north`
  (rounded to four decimals), drawn on the map, and listed at the top of the
  tree and as a chip, each with a way to clear it. Projects meet it by their
  point; a plant meets it through a project inside it that also meets the
  query's project filters, and the map draws only those projects (D51;
  `withBbox`, `matches`).
- Both carry over to the list view in the query string. With no results the
  map stays, so a pick can be undone on it. A map view opened with region
  filters (a detail page's *on the map* link, or a list view's) switches on
  the overlays that hold them, so the regions show picked.
- **Position:** the map opens on the three states, or at `center=lon,lat`
  and `zoom` from the URL; a move the reader makes writes them back
  (`mapPosition`, `withMapPosition`).
- **Without JavaScript** the page lists every entry with a note; **without
  WebGL** the island shows the list view with a note.

`npm run a11y` loads the map view at both widths, fails if the map
drew no project or palette marks, and runs axe with the results panel showing (D49).

### Plant page

Botanical name, form and family (linked to the filtered Library), common
names, synonyms, summary, conditions; the image gallery, pinned first, each
with its credit and license; the description; a traits table grouped as
Size and habit, Site, Seasonal interest (with a bloom calendar), Ecology,
and Uses, with every value linked to the Library filtered by it, a marker
on any value resting on a staff observation, and field notes shown beside
the trait they address; Used on, when a project lists it by ref (each
project with its place, the quantity listed, and its completion year,
"(proposed)" when proposed, most recent first, then totals of projects and
plants by state, each state linked to the Library filtered by *Used in*);
a small map of those projects, each sized by the quantity listed, as the
map view draws the plant alone, and each state also offering the same
filter on the map; In palettes, the palettes whose lists ref it, by name;
related plants (the same species and its cultivars and varieties); sources, each with its link, the fields it supports, the
access date, and its citation; further reading; and field notes.

### Project page

Name, place and state ("Portland, OR": the place, else the county, named from
the boundary layers), summary, a facts table (landscape architect, client,
type, size, construction budget, cost per acre, status, completion, place,
county, state, ecoregion; a fact the entry leaves blank, as every fixture
does the client and budget, has no row), the plant schedule, and the list summary. The schedule is one table per
form (botanical name, common name, quantity, and the size, spacing, and note
columns when any line has one); a plant links to its page, and names the
library doesn't hold sit last, under "Not in the library", as plain text. The
summary gives taxa, names not in the library, total quantity, native share
(or "Unknown"), and the quantity mixed by form and by life cycle, with
unsourced lines under unknown. Architect, client, type, status, and the four
location facts link to the Library filtered by that value; the links are
built from the project's own index record (`libraryUrl` in `lib/filter.ts`),
so each names a value the index offers; place, county, state, and
ecoregion also offer the same filter on the map (`mapUrl`), which opens
with the overlay holding the region switched on and the region drawn
picked. Below the facts, a small map shows the project's location. After
the summary comes the compatibility panel, over the list alone, since a
project states no site conditions. Export and workspace actions (M6) join
later. A project card shows name,
place and state, type, status, completion year, size in acres, and plant
count (taxa plus unsourced names, D37).

### Palette page

Name, the place when its site has a location, summary, description, and
site conditions (sun, moisture, and drainage, each value linked to the
Library filtered by it, built from the palette's index record as a project
page's facts are; a stated hardiness zone; the place); a palette with none
says it is checked only for whether its plants suit each other. A small map
shows a located palette's point. The plant list is the project schedule
(`Schedule` in `site/src/components/ui/`), with the quantity column only
when a line has a quantity, and then the compatibility panel with the
site's fit.

### Compatibility panel

`CompatPanel` in `site/src/components/ui/`, rendered at build on project and
palette pages from the entry's derived `compatibility`, and ready for the
workspace. For each axis (sun, moisture, soil drainage, hardiness zone,
water use) it gives a status in words (Shared, Conflict, No data), the
sentences from `describeAxis` in `lib/compat-text.ts`, and a
plant-by-value grid:

- **Words:** what every plant with data shares; or, with nothing shared,
  which plants to remove, what each needs, and what the rest would then
  share, with tied alternatives numbered; the plants with no data; and,
  with a site, the plants not suited to it.
- **Grid:** one row per plant (linked), one column per value, a dot with
  the text "Yes" where the plant accepts it. Shared columns are tagged
  "shared" and shaded, the site's values tagged "site", a plant a conflict
  names tagged "conflict" and ruled, and a plant with no data reads "No
  data" across the row. A Site column gives Suits, Not suited, or Unknown
  where the site states the axis. Hardiness shows only the half zones from
  the lowest to the highest the plants and the site reach (`gridColumns`).
  An axis no plant has data on shows its sentence and no grid (D55).

### The fixture library

`tests/fixtures/library/` holds 14 made-up plant entries and generated
images covering the data model's cases (a variety, a cultivar, a hybrid
cultivar with a trade name, synonyms, a wrapping bloom, a non-native, a
staff observation, two citations of one trait), 7 fictional projects
([sources.md](sources.md#fixture-projects)), and 3 fictional palettes
([sources.md](sources.md#fixture-palettes)). The tests use it.
`npm run build:fixtures` and `npm run dev:fixtures` build the site from it
(`PLANT_LIBRARY_DATA`), and every page then carries a banner saying its
values haven't been checked against the sources they cite.

A build of the library's own content shows a banner too when any plant is
a fixture (`meta.fixture: true`), as every prototype plant is
([sources.md](sources.md#data-stages)).

## Where the rules live

`config/types.json` (facets, sorts, search fields), `lib/facets.ts`,
`lib/filter.ts`, `lib/map-data.ts`, `lib/compat-text.ts`, `lib/build-data.ts`, `site/src/islands/Library.tsx`,
`site/src/pages/`, and the shared components in
`site/src/components/ui/`, which both the pages and the island render.

## Extending

- **A new facet:** an entry in the type's `facets` in `config/types.json`
  with a kind, a path into the entry (`data.…` or `derived.…`), and a
  vocabulary list, buckets, or a `labels` source. No code.
- **A new sort:** an entry in the type's `sorts`.
- **A new page:** a file in `site/src/pages/` using `layouts/Base.astro`;
  every internal link goes through `url()` from `lib/site.ts`.
