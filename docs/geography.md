# Geography

## Purpose

Entries store a point; everything geographic about it (state, county,
place, ecoregion) is derived at build from boundary data in the repo, never
stored (P3, P6).

## Behavior

### Boundary layers

`geo/` holds four TopoJSON layers clipped to Washington, Oregon, and
California: states, counties, and places from the Census TIGER/Line
shapefiles, and EPA Level III ecoregions. Their sources, dates, and
processing are in [geo/README.md](../geo/README.md); both sources are in
the registry ([sources.md](sources.md#registry)). `npm run geo` rebuilds
them; the build only reads them.

Each layer is simplified to 20 m, so a point more than 20 m (66 ft) from a
boundary derives exactly what the unsimplified data would (D30).

### Derivation

`deriveGeo(location, layers)` in `lib/derive.ts` takes a `{ lat, lon }` and
returns:

| Value | Shape | Absent when |
|---|---|---|
| `state` | Postal code (`WA`, `OR`, `CA`), as in the `state` vocabulary | The point is outside the three states |
| `county` | 5-digit FIPS code (`53033`) | The point is outside the three states |
| `place` | 7-digit Census place code (`5363000`): an incorporated place or a census-designated place | The point is unincorporated and outside any CDP |
| `ecoregion` | US Level III code (`2`), as plants' `nativeRange.ecoregions` | The point is outside the three states |

The state is the county's, and the two layers share their lines, so they
always agree. A point outside the three states derives nothing, which is
how the scope check will read it. Names come from the layers (each feature
has `id` and `name`), never from entries. `geo.hardinessZone` isn't derived
yet: the zone data's terms are an open question
([spec/v1/map.md](../spec/v1/map.md#open-questions)).

## Where the rules live

`lib/geo.ts` (decoding and point-in-polygon, client-safe), `lib/geo-load.ts`
(reads `geo/`), `deriveGeo` in `lib/derive.ts`, `scripts/geo.ts`, and
`tests/geo.test.ts`.

## Extending

A new boundary layer is a source registered after reading its terms, a step
in `scripts/geo.ts`, an id in `GEO_LAYERS` in `lib/geo.ts`, a row in
`geo/README.md`, and tests on points near its lines. Changing the tolerance
means re-running `npm run geo` and the border tests.
