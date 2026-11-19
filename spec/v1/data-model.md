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

The envelope and the `plant` type are built; see
[docs/content-model.md](../../docs/content-model.md). What remains is the
`project` and `palette` types, plant lists, and the values derived from them.

### Project

| Field | Shape | Notes |
|---|---|---|
| `name` | envelope | |
| `landscapeArchitect` | string | The landscape architect of record (firm) |
| `client` | string | Optional; proprietary |
| `location` | `{ lat, lon }` | WGS 84, decimal degrees, at most 5 decimal places. Must fall inside WA, OR, or CA. |
| `projectType` | enum | `park`, `campus`, `streetscape`, `commercial`, `civic`, `stormwater`, `restoration`, `residential` |
| `sizeAcres` | number | |
| `constructionBudget` | integer | Optional; proprietary. Landscape construction, US dollars, not adjusted for inflation |
| `status` | enum | `proposed`, `constructed` |
| `completed` | `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` | Required when `constructed`; an expected date when `proposed` |
| `plantList` | array | See below |

`client` and `constructionBudget` are the proprietary fields: optional in
the schema, left blank in this repo, and filled only in the company copy
([docs/workflow.md](../../docs/workflow.md#the-prototype-and-the-company-copy)). Everything that reads them
(cards, filters, `costPerAcre`) copes with their absence. The other fields
are required. Projects in this repo are made up and carry
`meta.fixture: true`; v1 has no other project data
([sources.md](sources.md#fixture-projects-and-palettes)).

No state, county, or town is stored; they are derived from `location` (P6).

A `plantList` item:

```json
{ "plant": { "ref": "plant/acer-circinatum" }, "quantity": 24,
  "size": "#5 container", "spacing": "As shown", "note": "Multi-stem" }
```

`quantity` is a positive integer and is required. `size`, `spacing`, and
`note` are optional short text, as written on the schedule. A plant appears
once per distinct `size`.

### Palette

A palette is a saved plant list that isn't a built project: a design mock-up,
a firm standard, or a list for a planting condition ("dry shade under
conifers").

| Field | Shape | Notes |
|---|---|---|
| `name` | envelope | |
| `site` | optional object | The conditions the palette is for: any of `sun`, `moisture`, `soil.drainage`, `hardinessZone`, and `location` (`{ lat, lon }`, from which the zone is derived when not given) |
| `plantList` | array | The same item shape as a project's; `quantity` is optional |

Palettes are made in the site's workspace
([library.md](library.md#palette-workspace)) and become entries by being
submitted and merged ([submissions.md](submissions.md#forms)).

### References

- **`RefOrText`.** A ref object or plain text is valid at fields the schema
  declares as `RefOrText`. In v1 that is `plantList[].plant`. (Ref objects
  and `{ref:…}` tokens are built; see
  [docs/content-model.md](../../docs/content-model.md#references).)
- **Unsourced plants.** A `plantList` item may name a plant as plain text
  instead, exactly as the schedule wrote it:
  `{ "plant": "Cornus sericea 'Kelseyi'", "quantity": 120 }`. This lets a
  real plant list be entered whole before every plant is in the library.
  Validation warns on each one, and fails if the text matches the name or a
  synonym of a plant the library holds (it must be a ref then).
  `npm run coverage` lists them, most used first.
- Deleting an entry others reference fails CI (refs must resolve, which is
  built); a plant's `refBy` then lists the projects and palettes whose lists
  include it.

### Derived values

Computed at build by `lib/derive.ts` and never stored (P3). Each is a facet
or a detail-page line. The plant's own derived values are built, and so is
`deriveGeo`, a point's state, county, place, and ecoregion
([docs/geography.md](../../docs/geography.md#derivation)).

| On | Derived | From |
|---|---|---|
| Plant | `use.projects`, `use.quantity` | Back-references from projects |
| Plant | `use.states`, `use.counties`, `use.ecoregions`, `use.zones` | The geography of the projects that use it |
| Plant | `companions` | The plants it most often shares a project list with ([map.md](map.md#distribution-analysis)) |
| Project | `geo.*` | `deriveGeo(location)`; `geo.hardinessZone` from the zone layer once it is added ([map.md](map.md#boundary-data)) |
| Project | `plants.taxa`, `plants.quantity`, `plants.nativeShare`, `plants.byForm` | `plantList` and the plants it refs; `nativeShare` counts natives of the project's own state |
| Project | `costPerAcre` | `constructionBudget` and `sizeAcres` |
| Palette | `compatibility` | [library.md](library.md#compatibility) |
| Palette | `geo.*` | `site.location`, when given |

### Validation

`npm run validate` checks, and fails closed on:

The plant rules are built ([docs/content-model.md](../../docs/content-model.md#validation)).
Still to add:

- the project and palette schemas, with `fixtureRules` on both so the
  built fixtures-only rule applies to them;
- a project's `location` inside the scope states, and `completed` present
  when `constructed`;
- a plant appearing once per distinct `size` in a plant list;
- an unsourced plant name that matches a plant's name or synonym (an error:
  it must be a ref).

It warns on unsourced plants in a plant list.

## Cases

The fixtures the build must handle; each becomes a test, and each is
carried by a fictional fixture project or palette
([sources.md](sources.md#fixture-projects-and-palettes)).

- A project whose list mixes refs and unsourced text names.
- A project on a state line, and one in an unincorporated area (no place).
- A proposed project with no completion date.
- A palette with site conditions and no location.

## Done when

- Schemas exist for `project` and `palette`, and every rule under
  Validation has a passing and a failing fixture.
- `lib/derive.ts` has a test for each derived value above, including each
  case.

## Open questions

- **Project boundaries.** A point is enough for v1. Whether a project should
  also carry a site polygon is left to the map pilot.

## Out of scope

Nursery availability and container sizes as structured data, maintenance
requirements, pest and disease data, Sunset climate zones (proprietary),
plant range polygons, and per-plant planting density.
