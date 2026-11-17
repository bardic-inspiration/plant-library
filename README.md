# Plant Library

A library of plant information for landscape architects working on the West
Coast (Washington, Oregon, California). It stores plant and project data as
files and builds a static site for looking plants up by criteria, building
plant palettes and checking their compatibility, tracking where plants are
used, and mapping that use across projects.

Nothing is built yet. The design is in [`spec/v1/`](spec/v1/README.md); start
there.

The repo is modeled on
[`ttrpg-library`](https://github.com/bardic-inspiration/ttrpg-library): one
JSON file per entry, strict validation in CI, a static Astro site, and every
change a pull request.

## License

Code is MIT ([`LICENSE`](LICENSE)). Data and image licensing is designed in
[`spec/v1/sources.md`](spec/v1/sources.md).
