/**
 * npm run basemap — cut the PMTiles basemap for the map: the newest
 * Protomaps daily build (OpenStreetMap data, ODbL) extracted to the three
 * states' bounding box and `basemap.maxZoom`, written to site/public at
 * `basemap.file` (config/site.json). The extract is published with the site,
 * never committed; the deploy workflow runs this before the build, and
 * `npm run build:map` adds the basemap to the style when the file is there.
 *
 *   BASEMAP_SOURCE=<url or path>  a PMTiles archive to cut from instead of the newest build
 *
 * Needs Go: the extract is `go-pmtiles`, run at a pinned version with `go run`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import site from '../config/site.json' with { type: 'json' };
import { repoRoot } from '../lib/config';
import { statesBbox } from '../lib/geo-load';

export const GO_PMTILES = 'github.com/protomaps/go-pmtiles@v1.31.2';
const BUILDS = 'https://build-metadata.protomaps.dev/builds.json';
const BUILD_BASE = 'https://build.protomaps.com/';

async function newestBuild(): Promise<string> {
  const res = await fetch(BUILDS);
  if (!res.ok) throw new Error(`${BUILDS}: HTTP ${res.status}`);
  const builds = (await res.json()) as { key: string }[];
  const keys = builds.map((b) => b.key).filter((k) => /^\d{8}\.pmtiles$/.test(k)).sort();
  if (!keys.length) throw new Error(`${BUILDS} lists no builds`);
  return BUILD_BASE + keys[keys.length - 1];
}

async function main(): Promise<void> {
  const root = repoRoot();
  const out = join(root, 'site', 'public', site.basemap.file);
  const source = process.env.BASEMAP_SOURCE || (await newestBuild());
  const bbox = statesBbox(root);
  mkdirSync(dirname(out), { recursive: true });
  console.log(`basemap: extracting ${source} to ${bbox.join(',')} at zoom 0–${site.basemap.maxZoom}`);
  execFileSync('go', ['run', GO_PMTILES, 'extract', source, out, `--bbox=${bbox.join(',')}`, `--maxzoom=${site.basemap.maxZoom}`], { stdio: 'inherit' });
  console.log(`basemap: wrote ${site.basemap.file}, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`basemap: ${(e as Error).message}`);
    process.exit(1);
  });
}
