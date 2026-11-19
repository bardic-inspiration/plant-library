---
depends: []
---

# Data model

## Goal

Define what the library stores: plants, projects, and palettes, the links
between them, and what is computed rather than stored. The model has to carry
the project's real complexity, which is in the data, the geography, and the
analysis built on them (P2, P3, P5, P6).

## Design

The envelope, the `plant` type, the `project` schema with its plant list,
and the `palette` type with its derived values are built; see
[docs/content-model.md](../../docs/content-model.md). What remains is a
project's hardiness zone.

### Project

The `project` schema, its plant list, and its validation are built; see
[docs/content-model.md](../../docs/content-model.md#project). Projects in
this repo are made up and carry `meta.fixture: true`; v1 has no other
project data ([docs/sources.md](../../docs/sources.md#fixture-projects)).
Everything that reads the proprietary fields (cards, filters, `costPerAcre`)
copes with their absence.

### References

`RefOrText`, unsourced plants, and the rules on them are built, for
projects' and palettes' lists, as is a plant's `refBy`, which lists the
projects and palettes whose lists include it
([docs/content-model.md](../../docs/content-model.md#references)).

### Derived values

Computed at build by `lib/derive.ts` and never stored (P3). Each is a facet
or a detail-page line. The plant's (companions included), project's, and palette's derived values
are built, and so is `deriveGeo`, a point's state, county, place, and
ecoregion ([docs/geography.md](../../docs/geography.md#derivation)); see
[docs/content-model.md](../../docs/content-model.md#derived-values).

| On | Derived | From |
|---|---|---|
| Project | `geo.hardinessZone` | From the zone layer once it is added ([map.md](map.md#boundary-data)); `use.zones` waits on it |

## Done when

- `lib/derive.ts` has a test for each derived value above.

## Out of scope

Nursery availability and container sizes as structured data, maintenance
requirements, pest and disease data, Sunset climate zones (proprietary),
plant range polygons, project site polygons (a project is a point, D40),
and per-plant planting density.
