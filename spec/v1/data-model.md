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

The envelope, the `plant`, `project`, and `palette` types, plant lists with
their refs and unsourced names, and every derived value but one are built;
see [docs/content-model.md](../../docs/content-model.md) and
[docs/geography.md](../../docs/geography.md#derivation). What remains is a
project's hardiness zone:

| On | Derived | From |
|---|---|---|
| Project | `geo.hardinessZone` | From the zone layer once it is added ([map.md](map.md#boundary-data)); `use.zones` waits on it |

## Done when

- `lib/derive.ts` has a test for `geo.hardinessZone`.

## Out of scope

Nursery availability and container sizes as structured data, maintenance
requirements, pest and disease data, Sunset climate zones (proprietary),
plant range polygons, project site polygons (a project is a point, D40),
and per-plant planting density.
