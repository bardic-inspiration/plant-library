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

The engine (MapLibre GL JS with PMTiles), the basemap extract, the style
built from the tokens, glyphs, project clustering, the overlay registry
with the project, state, county, and ecoregion overlays and the layer list,
the `/map/` view, and the region filters (picking regions and the box) are built; see [docs/map.md](../../docs/map.md) and
[docs/site.md](../../docs/site.md#map-view). What remains is below.

### Boundary data

The state, county, place, and ecoregion layers in `geo/`, and the
derivation of `geo.state`, `geo.county`, `geo.place`, and `geo.ecoregion`
from them, are built; see [docs/geography.md](../../docs/geography.md).
What remains is the hardiness zone layer:

| Layer | Source | Used for |
|---|---|---|
| Hardiness zones | USDA 2023 map | `geo.hardinessZone`, overlay, region filter |

It is processed like the others (clipped to the three states, simplified to
the same tolerance, committed as TopoJSON, recorded in `geo/README.md`, its
source registered), once its terms are read. The overlays draw the
committed layers as they are; places stay derivation-only.

### Overlays

The registry (`config/overlays.json`) and the project, state, county, and
ecoregion overlays are built ([docs/map.md](../../docs/map.md#overlays)).
Still to register: the hardiness zone overlay, once its layer is in `geo/`
(a palette fill with a legend per zone, selectable on the zone facets,
which makes zones pickable as region filters with no code),
and the two analysis overlays below (M8). Later overlays the registry is
meant to take without code: native range polygons, precipitation, watershed
boundaries, city limits.

### Map view, still to add

The map view is built ([docs/site.md](../../docs/site.md#map-view)). Still
to come:

- **The use choropleth** (M8): with plants in the results, their use by the
  active region overlay, beside the sized project points.
- **Palettes** with a site location show as points of their own kind (M6).

Small maps on detail pages (a project's location, a plant's projects) use
the same component with controls reduced.

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

- A plant used on projects in two states and native to one.
- A region with one project: the analysis shows its figures with the sample
  size, and companions are empty.
- The ecoregion and hardiness overlays on together, with a legend for each.

## Done when

- The hardiness zone layer has derivation tests on points near zone lines,
  as the other layers do.
- The analysis functions have tests over the fixture projects.

Map rendering quality and performance on real devices are manual checks for
the Testing backlog.

## Open questions

- **Hardiness zone data terms**, and whether half zones are fine enough at
  a simplification that keeps the file small ([sources.md](sources.md#source-survey)).

## Out of scope

Routing, geocoding, address search, 3D terrain, satellite imagery, plant
range polygons, and editing geometry in the browser.
