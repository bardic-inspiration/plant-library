/**
 * npm run build:map — write the map's style and glyphs into site/public/map/:
 * style.json from the token files (lib/map-style.ts), and Montserrat glyph
 * ranges for the label weights it names, and each overlay's data file
 * (config/overlays.json, lib/overlays-load.ts). The basemap source is included
 * only when the extract is in site/public (scripts/basemap.ts puts it there).
 * Output is deterministic, so two builds are byte-identical.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import site from '../config/site.json' with { type: 'json' };
import { repoRoot } from '../lib/config';
import { glyphRanges, loadGlyphFont } from '../lib/glyph-fonts';
import { loadTokens, mapBuildFor, mapFonts } from '../lib/map-style-load';

const root = repoRoot();
const pub = join(root, 'site', 'public');
const out = join(pub, 'map');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const { style, files: overlays } = mapBuildFor(root, { base: site.base, basemap: site.basemap.file, publicDir: pub });
writeFileSync(join(out, 'style.json'), JSON.stringify(style, null, 2) + '\n');
for (const [path, body] of overlays) {
  mkdirSync(dirname(join(pub, path)), { recursive: true });
  writeFileSync(join(pub, path), body);
}

const fonts = mapFonts(loadTokens(root));
let files = 0;
for (const [name, weight] of [[fonts.regular, fonts.weights.regular], [fonts.strong, fonts.weights.strong]]) {
  const dir = join(out, 'glyphs', name);
  mkdirSync(dir, { recursive: true });
  for (const [range, buf] of glyphRanges(name, loadGlyphFont(fonts.family, weight))) {
    writeFileSync(join(dir, `${range}.pbf`), buf);
    files++;
  }
}

const basemap = style.sources.basemap ? `with the basemap at ${site.basemap.file}` : `without a basemap (no ${site.basemap.file} in site/public; scripts/basemap.ts makes one)`;
console.log(`build:map wrote the style ${basemap}, ${overlays.size} overlay files, and ${files} glyph ranges`);
