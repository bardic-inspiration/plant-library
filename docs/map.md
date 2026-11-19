# Map

## Purpose

The map component that the map view and detail pages draw with: fast,
restyled entirely from the site's tokens, open source, served as static
files with no tile service, and taking new overlays as configuration (P4,
P9, P10).

## Behavior

### Engine

**MapLibre GL JS** (BSD-3-Clause) renders the map, reading the basemap from
a **PMTiles** archive (BSD) by HTTP range requests, so any static server
that honors ranges can serve it (`npm run preview` does). There is no API
key, usage term, or vendor.

MapLibre is loaded only on pages with a map, and only when the map scrolls
into view: `site/src/islands/MapView.tsx` imports it, its worker, the
PMTiles protocol, and MapLibre's stylesheet when an `IntersectionObserver`
first sees the map. Pages without a map never fetch any of it. Without
WebGL the component says so instead of drawing.

### Basemap

OpenStreetMap data in the Protomaps basemap schema (data under ODbL,
credited on the map), cut by `npm run basemap` (`scripts/basemap.ts`):

- the source is the newest Protomaps daily build, or `BASEMAP_SOURCE`;
- the extract is `go-pmtiles extract`, run at a pinned version with
  `go run`, so nothing is installed;
- the box is the three states' bounding box from `geo/states.topojson`,
  with half a degree of margin, and the zooms run from 0 to `basemap.maxZoom`
  in `config/site.json` (10 here; each level roughly doubles the file);
- the file goes to `site/public/` at `basemap.file`, and is published with
  the site, never committed (it is in `.gitignore`).

The deploy workflow cuts it before the build, once a week, and caches it
([workflow.md](workflow.md#ci)). If the cut fails, the site still deploys
and the map draws its marks on plain land, with a warning on the run (D42).
Pull request builds have no basemap.

### The style is built from the tokens

`npm run build:map` (`scripts/build-map.ts`, part of `npm run build`) writes
`site/public/map/style.json` from the token files with `buildMapStyle` in
`lib/map-style.ts`. Its colors, line widths, mark sizes, and label sizes are
the `--map-*` tokens in `site/src/styles/tokens/map.css`; project marks take
each project type's accent from `content.css`. Changing a token restyles the
map on the next build.

| Layer | Draws |
|---|---|
| `background`, `earth` | Land, white |
| `water`, `coast` | Water, a light gray, outlined in a thin black line |
| `roads-highway`, `roads-major` | Highways from zoom 5 and major roads from zoom 8, thin gray lines |
| `boundaries` | State and national lines, thin black |
| `places-region`, `places-locality` | State names (uppercase, letter-spaced, to zoom 7) and towns by their `min_zoom` |
| `project-clusters`, `project-cluster-count` | Clusters: black discs with a white count, larger from ten projects |
| `native-range-fill`, `native-range-line` | A single plant's native states in the map view, a pale fill with a strong outline (`--map-native-range*`), under the water |
| `project-points` | Projects, colored by type; constructed is filled, proposed is a ring; a mark with a `size` (0–1) grows from `--map-mark-radius` to `--map-mark-radius-max` |
| `palette-points`, `palette-centers` | Palettes with a site location: a dark disc (`--map-palette`) with a light center (`--map-palette-center`), unclustered, over the projects (D55) |

Overlays go under the water layer (`OVERLAY_BEFORE`), so state and county
polygons that run out over water to the state line are hidden by the
coastline, and no shoreline-clipped copies of the layers are needed (D41).

The opening view is the three states' bounds, written into the style's
metadata.

### Glyphs

Labels are set in Montserrat, from the same `@fontsource/montserrat` files
the site uses. `build:map` writes MapLibre glyph ranges (signed distance
fields, 24 px with a 3 px buffer, in protobuf) for the body and strong
weights into `site/public/map/glyphs/<font stack>/<range>.pbf`, for every
256-codepoint range the Latin and Latin Extended subsets cover
(`lib/glyphs.ts`, `lib/glyph-fonts.ts`). The style draws no icons, so there
is no sprite (D43).

### Projects

A project is a point, its `location` (D40). The index carries it on the
project's card, with `quantities` (each plant it refs, by key, with the
quantity listed), and `projectFeatures` in `lib/map-data.ts` turns the index
into the map's GeoJSON: every project, or, in the map view, the projects
`mapResults` draws for the results, with `quantity` and `size` (the square
root of quantity over the largest drawn, D47). Points cluster up to zoom 11
with a 48 px radius (`CLUSTER` in `lib/map-style.ts`). Clicking a cluster
zooms to where it splits; clicking a project opens a popup with its card,
and the matching plants' quantity when it has one.

`MapView` takes the page's index, the features to draw (redrawn when they
change), native states, an opening position, and an `onMove` callback with
the center, zoom, and bounds each time the map settles. It sets
`data-projects-rendered` to the number of project and palette marks drawn
once the map is idle, which the built-site check reads.

### Palettes

A palette whose `site` has a `location` is a point of its own kind, from its
own unclustered source (`PALETTE_SOURCE`): the index carries the point on
the palette's card, and `paletteFeatures` in `lib/map-data.ts` draws every
located palette, or, in the map view, those in the results (`mapResults`
gives them as `palettes`). Clicking one opens its card. A map given only
project `features` (a detail page's) draws no palettes unless it is also
given `palettes`.

The style guide shows the map with the library's projects and a legend.

### Small maps on detail pages

A project page (its location), a palette page (its site's location), and a
plant page's Used on (its projects) draw the same component, `compact`: `--map-height-compact` tall, with no
layer list or filter tools, and with MapLibre's cooperative gestures, so a
page scroll or a one-finger drag passes over the map and zooming takes a
modifier key or two fingers. The page passes the features at build,
`detailFeatures` in `lib/map-data.ts` (a project's own point, or the
projects that list a plant, sized by the quantity of it each lists, as the
map view draws that plant alone), and `fit`, the box around them
(`featureBounds`), which the map opens on, padded, no closer than
`DETAIL_ZOOM` (9) in `lib/map-style.ts`, so a single project shows its
town around it. Like any map it loads MapLibre and the index only when it
scrolls into view, and a click on a project opens its card (D52).

### Overlays

`config/overlays.json` registers every overlay, bottom to top (schema
`schemas/overlays.schema.json`). A new overlay is a data file and an entry
there, with no code change (P4):

| Key | Holds |
|---|---|
| `id`, `label` | The overlay's id, and its name in the layer list and legend |
| `data` | A TopoJSON file's path from the repo root, or `library` for the projects in the index |
| `kind` | `fill`, `line`, `point`, or `heat` |
| `style` | `--map-*` token names: `color`, or a `palette` for regions; `outline` and `width` for lines and fill edges; `opacity`; `radius` for points; `ramp` for heat, low to high |
| `legend` | `single` (one swatch with the label), `features` (a swatch per feature, by name), or `none` |
| `alwaysOn` | Shown and not switchable: the projects |
| `selectable`, `facets` | Whether a feature can be picked as a region filter, and the facet a pick sets, by type (a facet id in `config/types.json` whose values are the features' ids) |

The registered overlays:

| Overlay | Data | Draws | Legend | A pick sets |
|---|---|---|---|---|
| Projects | `library` | The project layers above, always on | (the project legend) | — |
| Ecoregions | `geo/ecoregions.topojson` | Pale fills from a seven-color palette, edged in gray | Each ecoregion by name | `project.ecoregion`, `plant.usedInEcoregion` |
| Counties | `geo/counties.topojson` | Thin gray lines | One line | `project.county`, `plant.usedInCounty` |
| States | `geo/states.topojson` | Heavy black lines | One line | `project.state`, `plant.usedInState` |

The boundary overlays draw the same committed `geo/` files the build
derives geography from (P3, D41). Places stay derivation-only. Hardiness
zones join the registry once their data's terms are read
([spec](../spec/v1/map.md#open-questions)).

`build:map` turns the registry into the style: `prepareOverlays`
(`lib/overlays-load.ts`) builds each overlay's MapLibre layers and legend
from its tokens (`overlayLayers` and `overlayLegend` in `lib/overlays.ts`)
and writes them into the style's metadata (`plant-library:overlays`), and
writes each overlay's data to `site/public/map/overlays/<id>.json`, still
TopoJSON, keeping only each feature's `id` and `name`. A palette overlay's
features also get a color index (`pi`), chosen by greedy coloring over
shared arcs so no two neighbors match; the build fails if the palette is too
short for that. An unknown token name fails the build too.

The style itself names no overlay source, so nothing is fetched until an
overlay is switched on (P10). The map component shows a layer list (a
checkbox per overlay; the projects are checked and disabled) and a legend
for each overlay that is on. Switching an overlay on the first time fetches
its file, decodes it with `topojson-client` (loaded then too), and adds its
source and layers under the basemap's water, below any overlay higher in
the registry that is already on, so the registry's order holds whatever the
order of clicks; switching it off hides its layers. A page can open a map
with overlays on and the layer list hidden (`overlays` and `layerList` on
`MapView`).

A selectable `fill` or `line` overlay also gets two layers drawing its
picked regions (`pickedLayers`, filtered to the picked ids by
`pickedFilter`) and an unseen fill to pick by (`pickLayer`), so a line
overlay can be picked anywhere inside its regions. They take
`--map-selection` and `--map-selection-opacity`, as does the box filter's
own source and layers (`bbox`, `BOX_LAYERS`, over the overlays and under
the projects). What a pick does is in [site.md](site.md#map-view).

Overlay colors are the `--map-overlay-*` tokens: seven pale tints of the
accent hues for region fills, on which map labels hold 4.5:1, and the
outline, county, and state line colors and widths.

The style guide shows the map with the layer list, and a map with each
overlay on, with its legend.

## Where the rules live

`lib/map-style.ts` (the style, client-safe), `lib/map-data.ts` (what the
map view draws and what is in view, tested in `tests/map-view.test.ts`), `lib/map-style-load.ts` (reads
the tokens), `config/overlays.json`, `lib/overlays.ts` and
`lib/overlays-load.ts` (the overlays), the overlay checks in
`lib/validate.ts`, `lib/glyphs.ts` and `lib/glyph-fonts.ts`,
`scripts/build-map.ts`, `scripts/basemap.ts`,
`site/src/islands/MapView.tsx`, `site/src/styles/tokens/map.css`, and
`tests/map.test.ts`, which fails if a color in the style isn't a token, and
checks that fifty generated projects cluster at statewide zooms with no two
marks overlapping, and `tests/overlays.test.ts`, which checks the registry,
that a fixture overlay (`tests/fixtures/overlays/`) reaches the layer list
with no code change, that overlay colors are tokens, that selectable
overlays carry the pick layers, and that neighboring ecoregions differ.
`tests/region-filters.test.ts` checks that picking and the box give the
same URL state as the tree. `tests/map-view.test.ts` also checks what the
detail pages' small maps draw and open on, and their map links.

## Extending

A new map color or size is a `--map-*` token in `map.css`, read by
`buildMapStyle`. A new overlay is a TopoJSON file (with `id` and `name` on
each feature) and an entry in `config/overlays.json`; with `selectable` and
`facets` its regions can be picked as filters, with no code; a longer palette is
more tokens in its `palette`. A new basemap layer is a layer in
`buildMapStyle` over the Protomaps schema's source layers. A label weight
needs a name in `WEIGHT_NAMES`; `build:map` then writes its glyphs. A
street-level map is a higher `basemap.maxZoom`.
