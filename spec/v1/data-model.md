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

The envelope, the `plant` type, and the `project` schema with its plant
list are built; see [docs/content-model.md](../../docs/content-model.md).
What remains is the `palette` type and the values derived from projects and
palettes.

### Project

The `project` schema, its plant list, and its validation are built; see
[docs/content-model.md](../../docs/content-model.md#project). Projects in
this repo are made up and carry `meta.fixture: true`; v1 has no other
project data ([docs/sources.md](../../docs/sources.md#fixture-projects)).
Everything that reads the proprietary fields (cards, filters, `costPerAcre`)
copes with their absence.

### Palette

A palette is a saved plant list that isn't a built project: a design mock-up,
a firm standard, or a list for a planting condition ("dry shade under
conifers").

| Field | Shape | Notes |
|---|---|---|
| `name` | envelope | |
| `site` | optional object | The conditions the palette is for: any of `sun`, `moisture`, `soil.drainage`, `hardinessZone`, and `location` (`{ lat, lon }`, from which the zone is derived when not given) |
| `plantList` | array | The same item shape as a project's ([docs/content-model.md](../../docs/content-model.md#project)); `quantity` is optional |

Palettes are made in the site's workspace
([library.md](library.md#palette-workspace)) and become entries by being
submitted and merged ([submissions.md](submissions.md#forms)).

### References

`RefOrText`, unsourced plants, and the rules on them are built
([docs/content-model.md](../../docs/content-model.md#references)), as is a
plant's `refBy`, which lists the projects whose lists include it. Palettes'
plant lists follow the same rules once the type exists.

### Derived values

Computed at build by `lib/derive.ts` and never stored (P3). Each is a facet
or a detail-page line. The plant's and project's derived values are built, and so is `deriveGeo`, a
point's state, county, place, and ecoregion
([docs/geography.md](../../docs/geography.md#derivation)); see
[docs/content-model.md](../../docs/content-model.md#derived-values).

| On | Derived | From |
|---|---|---|
| Plant | `companions` | The plants it most often shares a project list with ([map.md](map.md#distribution-analysis)) |
| Project | `geo.hardinessZone` | From the zone layer once it is added ([map.md](map.md#boundary-data)); `use.zones` waits on it |
| Palette | `compatibility` | [library.md](library.md#compatibility) |
| Palette | `geo.*` | `site.location`, when given |

### Validation

`npm run validate` checks, and fails closed on:

The plant and project rules are built
([docs/content-model.md](../../docs/content-model.md#validation)). Still to
add:

- the palette schema, with `fixtureRules` so the built fixtures-only rule
  applies to it, and the plant-list rules applied to its list.

## Cases

The fixtures the build must handle; each becomes a test, and each is
carried by a fictional fixture project
([docs/sources.md](../../docs/sources.md#fixture-projects)) or palette
([sources.md](sources.md#fixture-palettes)).

- A project whose list mixes refs and unsourced text names.
- A project on a state line, and one in an unincorporated area (no place).
- A proposed project with no completion date.
- A palette with site conditions and no location.

## Done when

- A schema exists for `palette`, and every rule under Validation has a
  passing and a failing fixture. (Built for `project`.)
- `lib/derive.ts` has a test for each derived value above, including each
  case.

## Open questions

- **Project boundaries.** A point is enough for v1. Whether a project should
  also carry a site polygon is left to the map pilot.

## Out of scope

Nursery availability and container sizes as structured data, maintenance
requirements, pest and disease data, Sunset climate zones (proprietary),
plant range polygons, and per-plant planting density.
