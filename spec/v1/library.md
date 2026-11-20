---
depends: [data-model]
---

# Library

## Goal

The list view and everything reached from it: looking plants up by criteria,
reading a plant or a project, following links between them, and building a
plant list as a design tool. It works the way TL's Library does, with a
simpler link structure, since this is information rather than rules (P4, P7,
P10).

## Design

The list view, filter tree, search, sort, URL state, the index, the plant,
project, and palette pages with their cards and contribution links, About,
the style guide, the contribution forms, the palette workspace with its
exports and submission, and the compatibility panel are built; see
[docs/site.md](../../docs/site.md). What remains:

### Palette workspace

- **Site.** The location supplies the hardiness zone once the zone layer
  exists (D33); until then the zone is chosen.

## Cases

- A project list with unsourced plants: the schedule shows them, the summary
  counts them as unknown, and compatibility ignores them.

## Out of scope

Accounts, saving lists on a server, editing library entries in the browser,
planting plan drawings, cost estimating, and quantity takeoff from areas.
