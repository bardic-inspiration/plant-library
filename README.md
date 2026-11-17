# Plant Library

A library of plant information for landscape architects working on the West
Coast (Washington, Oregon, California). It stores plant and project data as
files and builds a static site for looking plants up by criteria, building
plant palettes and checking their compatibility, tracking where plants are
used, and mapping that use across projects.

The skeleton, the plant data model and its validation, and the Library list
view and plant pages are built ([`docs/`](docs/README.md)). The rest of the
design is in [`spec/v1/`](spec/v1/README.md). The library holds no plants
yet: the 50-plant fixture set waits on USDA PLANTS, the first registered
source.

```bash
npm ci
npm run validate
npm run build:fixtures
npm run preview
```

`build:fixtures` builds the site from the made-up plants in
`tests/fixtures/library/`, under a banner saying so; `npm run build` builds
the real, empty library. Contributors start with [`AGENTS.md`](AGENTS.md).

The repo is modeled on
[`ttrpg-library`](https://github.com/bardic-inspiration/ttrpg-library): one
JSON file per entry, strict validation in CI, a static Astro site, and every
change a pull request.

## Status and license

This repo is a personal, open source prototype under the MIT license
([`LICENSE`](LICENSE)). It holds no real project data: its projects are
made up, for testing. Real project data belongs to a company and will live
only in a separate copy on that company's own server
([`docs/workflow.md`](docs/workflow.md#the-prototype-and-the-company-copy)). Third-party
data and image licensing is designed in
[`docs/sources.md`](docs/sources.md).
