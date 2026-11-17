# Site

## Purpose

The static site: look plants up by name or criteria, read a plant, and
follow links between entries (P4, P7, P10).

## Behavior

### Pages

| Route | Content |
|---|---|
| `/` | The Library list view |
| `/plant/<id>/` | Plant detail page |
| `/about/` | What the library is, the source registry, licenses, image credits, contributors |
| `/styleguide/` | Every component state; not in navigation |
| `/404.html` | Not found |

The top bar lists only built sections (Library, About); Map, Workspace, and
Contribute join as they are built.

### Index

`site/public/library.json` holds the facet list (every facet of every type
that has values, plus one per tag key, values in vocabulary order) and one
lean record per entry: key, name and styled name parts, summary, URL,
thumbnail (the pinned image), facet values, tags, refs, back-refs, sort
keys, search text, and card fields. Full entries are at
`site/public/data/<type>/<id>.json`, for later exports and the workspace.

### List view

`site/src/islands/Library.tsx` loads the index once (revalidating) and
filters in memory. The page also renders every entry statically, so without
JavaScript it is a full list; the island hides that list once it loads.

- **Search:** MiniSearch, prefix and light fuzzy matching, all terms
  required. Botanical name, common names, synonyms, and trade name weigh
  three times the summary, family, tags, and description. "Berberis" finds
  the Mahonias through their synonyms. With search text, a Relevance sort
  is offered.
- **Filter tree:** type, then each facet (grouped as `config/types.json`
  groups them), then values with counts. Values in a facet combine as OR,
  facets as AND, and an entry missing a value never matches. A value's
  count is the result size with that value checked given the other facets'
  selections. Active filters show as removable chips.
- **Facet kinds** (`lib/facets.ts`): `value` (a field's value or values),
  `range` (buckets; a range matches every bucket it overlaps, so a 3–10 ft
  shrub is in "3 to 6 ft"), `zones` (a plant matches each half zone its
  range contains), `months` (bloom months, wrapping the year), `pairs`
  (`region:rating`).
- **Sort:** every type's sorts from `config/types.json`; missing values go
  last; ties fall back to name.
- **URL state:** `lib/filter.ts`. Search is `q`, a filter is its facet key
  repeated per value (`plant.sun=shade&plant.sun=part-shade`), then `sort`
  and `view`. Unknown parameters are kept, for the map. Checking a value
  pushes a history entry; typing replaces it.
- **Layout:** the tree is a sidebar from 64rem; below that it sits closed
  behind a Filters button.
- **Cards:** a plant card shows its pinned image (none, and no
  placeholder, when it has none), botanical name, primary common name, form
  badge, a Native badge, height and spread, hardiness, sun and moisture as
  labelled icons, and a twelve-cell bloom strip with a text alternative.

### Plant page

Botanical name, form and family (linked to the filtered Library), common
names, synonyms, summary, conditions; the image gallery, pinned first, each
with its credit and license; the description; a traits table grouped as
Size and habit, Site, Seasonal interest (with a bloom calendar), Ecology,
and Uses, with every value linked to the Library filtered by it, a marker
on any value resting on a staff observation, and field notes shown beside
the trait they address; related plants (the same species and its cultivars
and varieties); sources, each with its link, the fields it supports, the
access date, and its citation; further reading; and field notes.

### The fixture library

`tests/fixtures/library/` holds 14 made-up plant entries and generated
images covering the data model's cases (a variety, a cultivar, a hybrid
cultivar with a trade name, synonyms, a wrapping bloom, a non-native, a
staff observation, two citations of one trait). The tests use it.
`npm run build:fixtures` and `npm run dev:fixtures` build the site from it
(`PLANT_LIBRARY_DATA`), and every page then carries a banner saying its
values haven't been checked against the sources they cite.

## Where the rules live

`config/types.json` (facets, sorts, search fields), `lib/facets.ts`,
`lib/filter.ts`, `lib/build-data.ts`, `site/src/islands/Library.tsx`,
`site/src/pages/`, and the shared components in
`site/src/components/ui/`, which both the pages and the island render.

## Extending

- **A new facet:** an entry in the type's `facets` in `config/types.json`
  with a kind, a path into the entry (`data.…` or `derived.…`), and a
  vocabulary list or buckets. No code.
- **A new sort:** an entry in the type's `sorts`.
- **A new page:** a file in `site/src/pages/` using `layouts/Base.astro`;
  every internal link goes through `url()` from `lib/site.ts`.
