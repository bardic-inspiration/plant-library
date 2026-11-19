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
the `/map/` view, the region filters (picking regions and the box), the
small maps on detail pages, and palette points are built; see [docs/map.md](../../docs/map.md) and
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
which makes zones pickable as region filters with no code); its id then
goes into the use choropleth's `regions`. Later overlays the registry is
meant to take without code: native range polygons, precipitation, watershed
boundaries, city limits.

### Distribution analysis

The functions are built: per-plant figures by state, county, ecoregion,
zone, and completion year, with the states outside a plant's native range;
per-region figures (the ranked plants, taxa, native share, and mix by
form); and companions, each figure with the number of projects behind it
([docs/content-model.md](../../docs/content-model.md#distribution-analysis)).
Plant pages read them: totals by state and year, the note on states
outside the native range, and companions
([docs/site.md](../../docs/site.md#plant-page)); the map view reads them
in the use choropleth and the "what gets planted here" view
([docs/site.md](../../docs/site.md#map-view)). What remains:

- **Comparison**: two plants, or two regions, side by side on the same
  measures.

Every figure shown gives its sample size, and the pages say the library
reflects the projects entered, not the region's planting as a whole, as
plant pages do.

## Cases

- A plant used on projects in two states and native to one.
- A region with one project: the analysis shows its figures with the sample
  size, and companions are empty.
- The ecoregion and hardiness overlays on together, with a legend for each.

## Done when

- The hardiness zone layer has derivation tests on points near zone lines,
  as the other layers do.

Map rendering quality and performance on real devices are manual checks for
the Testing backlog.

## Open questions

- **Hardiness zone data terms**, and whether half zones are fine enough at
  a simplification that keeps the file small ([sources.md](sources.md#source-survey)).

## Out of scope

Routing, geocoding, address search, 3D terrain, satellite imagery, plant
range polygons, and editing geometry in the browser.
