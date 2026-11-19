# Map

## Purpose

The map component that the map view and detail pages draw with: fast,
restyled entirely from the site's tokens, open source, and served as static
files with no tile service (P4, P9, P10).

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
| `project-points` | Projects, colored by type; constructed is filled, proposed is a ring |

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
project's card, and `projectFeatures` in `lib/map-data.ts` turns the index
into the map's GeoJSON. Points cluster up to zoom 11 with a 48 px radius
(`CLUSTER` in `lib/map-style.ts`). Clicking a cluster zooms to where it
splits; clicking a project opens a popup with its name, linking its page,
and its place.

The style guide shows the map with the library's projects and a legend.

## Where the rules live

`lib/map-style.ts` (the style, client-safe), `lib/map-style-load.ts` (reads
the tokens), `lib/glyphs.ts` and `lib/glyph-fonts.ts`, `lib/map-data.ts`,
`scripts/build-map.ts`, `scripts/basemap.ts`,
`site/src/islands/MapView.tsx`, `site/src/styles/tokens/map.css`, and
`tests/map.test.ts`, which fails if a color in the style isn't a token, and
checks that fifty generated projects cluster at statewide zooms with no two
marks overlapping.

## Extending

A new map color or size is a `--map-*` token in `map.css`, read by
`buildMapStyle`. A new basemap layer is a layer in `buildMapStyle` over the
Protomaps schema's source layers. A label weight needs a name in
`WEIGHT_NAMES`; `build:map` then writes its glyphs. A street-level map is a
higher `basemap.maxZoom`.
