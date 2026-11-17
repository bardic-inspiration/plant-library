---
depends: [data-model, library]
---

# Map

## Goal

Show the library on a map with the same filters as the list, let regions be
chosen on the map itself, and make the geographic distribution of plants
across projects something that can be seen and counted. The map must be
fast, fully restylable, open source, and able to take many custom overlays
(P4, P6, P10).

## Design

### Engine

**MapLibre GL JS** (BSD-3-Clause) renders the map, with **PMTiles** (BSD)
for tiles served as static files.

| Need | How MapLibre meets it |
|---|---|
| Fast | WebGL vector rendering; thousands of points and polygons stay smooth, with clustering built in |
| Graphically configurable | The whole look is a style document we write: every line weight, fill, and label. The basemap can be drawn in the site's own white, thin-black-line style from the same tokens. |
| Custom overlays | Any number of GeoJSON, vector tile, raster, and heatmap layers, each data-driven and toggled at runtime; custom WebGL layers if ever needed |
| No server | With PMTiles, tiles are one static file read by range requests, which an ordinary web server can serve |
| Open | No API key, no usage terms, no vendor |

Considered and not chosen:

- **Leaflet**: simplest, but raster-first; the basemap can't be restyled and
  large vector overlays are slow.
- **OpenLayers**: as capable for GIS work, but styling vector basemaps is
  weaker and the API heavier for what's needed.
- **Mapbox GL JS**: proprietary since v2 and needs a token.
- **deck.gl**: an analysis layer engine, not a map. It runs on top of
  MapLibre and can be added later if an overlay outgrows MapLibre's own
  layers.

MapLibre is loaded only on pages with a map, and only when the map is shown.

### Basemap

Drawn from OpenStreetMap data in the Protomaps basemap schema (data under
ODbL, attribution on the map), styled by our own style document: white land,
thin black linework for coast, water, boundaries, and major roads, restrained
labels in Montserrat. Glyphs and sprites are self-hosted.

Tiles are a PMTiles extract of the West Coast, cut by `pmtiles extract` to
the three states' bounding box and a maximum zoom, published with the site
rather than committed. Its maximum zoom is a setting in `config/site.json`,
because each zoom level roughly doubles the file. The prototype keeps a
small extract, enough for regional and city-scale views. The company copy's
internal server has no such limit and can take a street-level extract by
changing the setting ([docs/workflow.md](../../docs/workflow.md#the-prototype-and-the-company-copy)). The map
never calls a third-party tile service.

**The map shares the tokens.** A build step writes the MapLibre style
document from the token files ([docs/styling.md](../../docs/styling.md)), so
the basemap's line weights and the overlays' fills change with the tokens
and can't drift from the site. The style guide page gains the map with each
overlay.

### Boundary data

`geo/` holds the boundaries the build derives geography from and the map
draws as overlays, one source for both (P3):

| Layer | Source | Used for |
|---|---|---|
| States | US Census | `geo.state`, scope check, overlay, region filter |
| Counties | US Census | `geo.county`, overlay, region filter |
| Places | US Census | `geo.place` |
| Ecoregions | EPA Level III | `geo.ecoregion`, overlay, region filter |
| Hardiness zones | USDA 2023 map | `geo.hardinessZone`, overlay, region filter |

Each layer is clipped to the three states, simplified, and committed as
TopoJSON with a record of its source, date, and processing in
`geo/README.md`; its source is in the registry
([docs/sources.md](../../docs/sources.md#registry)). Derivation tests points against
the unsimplified-enough geometry that a project never lands in the wrong
county; the pilot sets the simplification tolerance with tests on points
near borders. Places are used for derivation only.

### Overlays

`config/overlays.json` registers each overlay: its id, label, data file,
kind (`fill`, `line`, `point`, `heat`), style tokens, legend, whether its
features can be selected as a region filter, and the facet a selection sets.
A new overlay is a data file and a registry entry (P4).

v1 overlays: projects (always on), states, counties, ecoregions, hardiness
zones, and the two analysis overlays below. Later overlays the registry is
meant to take without code: native range polygons, precipitation, watershed
boundaries, city limits.

### Map view

`/map/` is the Library with the results drawn instead of listed. The filter
tree, search, and URL state are the list view's own
([docs/site.md](../../docs/site.md#list-view)).

- **Projects** are points, clustered when zoomed out, colored by project
  type, with status shown by a filled or hollow mark. A point opens a popup
  with the project's card; the card links to its page.
- **Plants** have no location of their own. When the results include plants,
  the map shows where they are used: the projects whose lists include any
  matching plant, each sized by the quantity of matching plants, and a
  choropleth of that use by the active region overlay. With exactly one
  plant in the results, its native range draws as well (states in v1).
- **Palettes** with a site location show as points of their own kind.
- A results panel beside the map lists what is in view, in the list view's
  card form, and follows the map as it moves. On narrow screens it is a
  sheet that pulls up over the map.
- The map's center and zoom are in the URL.
- Without JavaScript or WebGL, the page shows the list view with a note.

Small maps on detail pages (a project's location, a plant's projects) use
the same component with controls reduced.

### Region filters

- **Pick regions.** With a selectable overlay active, clicking a state,
  county, ecoregion, or hardiness zone toggles it as a filter value, exactly
  as checking it in the tree would. Several can be picked.
- **Draw a box.** A box-select tool filters to a bounding box, held in the
  URL as `bbox`.
- Both apply to projects by location and to plants by where they are used,
  and both carry over to the list view.

Freehand and polygon selection are out of scope for v1.

### Distribution analysis

Computed at build from projects' plant lists and derived geography, and
read on the map and on detail pages. Every figure is a count the reader
could check against the lists.

- **Per plant**: projects and total quantity, by state, county, ecoregion,
  and hardiness zone, and over time by completion year. On the map this is
  the use choropleth. Where a plant is used in a state outside its native
  range, the page says so.
- **Per region**: for the selected regions, a ranked table of plants by
  number of projects and by quantity, taxa count, native share, and the mix
  by form. This is the "what gets planted here" view, and it exports as CSV.
- **Companions**: for a plant, the plants that share its project lists most
  often, ranked by the number of shared projects, with a minimum of two so a
  single project doesn't decide it.
- **Comparison**: two plants, or two regions, side by side on the same
  measures.

The measures are honest about sample size: every figure shows the number of
projects behind it, and the pages say the library reflects the projects
entered, not the region's planting as a whole.

## Cases

- Fifty projects and a statewide zoom: clusters, no overlap, smooth pan.
- A plant used on projects in two states and native to one.
- A county picked on the map shows checked in the tree after switching to
  the list view.
- A project within a few hundred feet of a county line derives the right
  county.
- A region with one project: the analysis shows its figures with the sample
  size, and companions are empty.
- The ecoregion and hardiness overlays on together, with a legend for each.

## Done when

- Geography derivation has tests for each layer, including border and
  unincorporated points.
- Overlay registration is tested: adding a fixture overlay file and registry
  entry puts it in the layer list with no code change.
- Region picking and the box filter produce the same URL state the tree
  does, covered by unit tests on the filter logic.
- The analysis functions have tests over the fixture projects.
- The map style is rebuilt from tokens in the build, and a test fails if a
  map color isn't a token.
- A Playwright check loads the map view on the built site, confirms the
  project layer rendered, and runs axe on the controls and the results
  panel.

Map rendering quality and performance on real devices are manual checks for
the Testing backlog.

## Open questions

- **Hardiness zone data terms**, and whether half zones are fine enough at
  a simplification that keeps the file small ([sources.md](sources.md#source-survey)).

## Out of scope

Routing, geocoding, address search, 3D terrain, satellite imagery, plant
range polygons, and editing geometry in the browser.
