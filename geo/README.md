# Boundary data

The boundaries the build derives geography from (P6), and that the map
draws as overlays (`config/overlays.json`): one source for both (P3). Each file is TopoJSON in WGS 84,
written by `npm run geo` ([`scripts/geo.ts`](../scripts/geo.ts)); don't edit
them by hand. How they're used is in
[docs/geography.md](../docs/geography.md).

| File | Features | Properties | Source |
|---|---|---|---|
| `states.topojson` | 3 | `id` (postal code), `name` | Dissolved from the counties below |
| `counties.topojson` | 133 | `id` (5-digit FIPS), `name`, `state` (postal code) | `census-tiger` |
| `places.topojson` | 2,687 | `id` (7-digit place code), `name`, `kind` (`incorporated` or `cdp`) | `census-tiger` |
| `ecoregions.topojson` | 20 | `id` (US Level III code), `name` | `epa-ecoregions` |

Hardiness zones aren't here yet: the USDA 2023 zone data's terms (published
through PRISM at Oregon State) haven't been read, so the layer and
`geo.hardinessZone` wait on that open question
([spec/v1/map.md](../spec/v1/map.md#open-questions)).

## Sources

Both are registered in `config/sources.json`, with their terms.

- **`census-tiger`**: U.S. Census Bureau, TIGER/Line Shapefiles, 2026
  edition (created 2026-09), downloaded 2026-11-19 from
  `www2.census.gov/geo/tiger/TIGER2026/`: `COUNTY/tl_2026_us_county.zip`
  and `PLACE/tl_2026_{06,41,53}_place.zip`. Not copyrighted; acknowledge the
  Census Bureau as the source. Its boundaries are statistical, not legal
  determinations. County and state polygons extend over water to the state
  boundary, so a coastal or river point still has a county.
- **`epa-ecoregions`**: U.S. EPA, Level III Ecoregions of the Conterminous
  United States (published 2013-04-16), downloaded 2026-11-19 as
  `us_eco_l3.zip` from the EPA's ecoregion data bucket (the URL is in
  `scripts/geo.ts`). No use constraints; the EPA asks to be acknowledged.
  The lines were digitized from 1:250,000 maps, so they are far coarser than
  our simplification.

## Processing

`scripts/geo.ts` runs mapshaper 0.8.5 (fetched by `npx`, not a dependency):

1. Counties: keep FIPS 06, 41, and 53; add `state`; reproject from NAD83 to
   WGS 84; dissolve the states from them in the same topology, so state and
   county lines share arcs and a county always lies inside its state.
2. Places: merge the three state files; `kind` is `cdp` for class codes
   starting with `U`, otherwise `incorporated`.
3. Ecoregions: reproject from Albers to WGS 84, clip to the states, and
   dissolve by Level III code.
4. Every layer: Douglas–Peucker simplification at **20 m**
   (`GEO_TOLERANCE_METERS` in `lib/geo.ts`), keeping every shape, and
   TopoJSON quantization of 1e6 (a grid step under 2 m).

No simplified line is farther than 20 m (66 ft) from the source line, so a
point more than that from a boundary derives the same county, place, and
ecoregion as it would from the unsimplified data. The tolerance was set by
comparing 20,000 points scattered within 300 m of every boundary against the
unsimplified layers at 10, 20, 30, and 50 m: every mismatch lay within the
tolerance of the true line. 20 m keeps the files at about 3.5 MB together;
`tests/geo.test.ts` holds pairs of points 60 m (200 ft) either side of
state, county, place, and ecoregion lines (D30).

The output is deterministic: two runs over the same downloads are
byte-identical. Downloads are cached in `.cache/geo/` (ignored by git).
