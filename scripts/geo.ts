/**
 * npm run geo — rebuild the boundary layers in geo/ from their sources.
 *
 * Downloads the Census TIGER/Line county and place shapefiles and the EPA
 * Level III ecoregions (cached in .cache/geo/), keeps Washington, Oregon, and
 * California, dissolves the states from their counties, clips the ecoregions
 * to the states, reprojects to WGS 84, simplifies, and writes TopoJSON.
 * geo/README.md records the sources, dates, and processing; change both
 * together. Not part of the build: the output is committed.
 *
 *   npm run geo                 rebuild with the committed tolerance
 *   npm run geo -- --tolerance 50 --out <dir>   try another (meters)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GEO_TOLERANCE_METERS, GEO_QUANTIZATION } from '../lib/geo';

const TIGER = 'https://www2.census.gov/geo/tiger/TIGER2026';
const DOWNLOADS: Record<string, string> = {
  county: `${TIGER}/COUNTY/tl_2026_us_county.zip`,
  place06: `${TIGER}/PLACE/tl_2026_06_place.zip`,
  place41: `${TIGER}/PLACE/tl_2026_41_place.zip`,
  place53: `${TIGER}/PLACE/tl_2026_53_place.zip`,
  ecoregion: 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/us/us_eco_l3.zip',
};
/** FIPS codes of the scope states (P6: names come from the data). */
const STATEFP = ['06', '41', '53'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const root = resolve(import.meta.dirname, '..');
const cache = resolve(arg('cache') ?? join(root, '.cache/geo'));
const out = resolve(arg('out') ?? join(root, 'geo'));
const tolerance = Number(arg('tolerance') ?? GEO_TOLERANCE_METERS);

function fetchAll(): Record<string, string> {
  const shp: Record<string, string> = {};
  for (const [key, url] of Object.entries(DOWNLOADS)) {
    const dir = join(cache, key);
    const zip = join(cache, `${key}.zip`);
    if (!existsSync(dir)) {
      mkdirSync(cache, { recursive: true });
      if (!existsSync(zip)) {
        console.log(`Downloading ${url}`);
        execFileSync('curl', ['-sSfL', '-o', zip, url], { stdio: 'inherit' });
      }
      mkdirSync(dir, { recursive: true });
      execFileSync('unzip', ['-qo', zip, '-d', dir]);
    }
    const file = readdirSync(dir).find((f) => f.endsWith('.shp'));
    if (!file) throw new Error(`No shapefile in ${dir}`);
    shp[key] = join(dir, file);
  }
  return shp;
}

const q = (s: string) => `"${s}"`;

/** mapshaper, pinned, fetched by npx: a processing tool, not a dependency of the build. */
const MAPSHAPER = 'mapshaper@0.8.5';

function run(cmd: string): void {
  execFileSync('sh', ['-c', `npx -y ${MAPSHAPER} ${cmd}`], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function main(): void {
  const shp = fetchAll();
  mkdirSync(out, { recursive: true });
  const simplify = `-simplify dp interval=${tolerance} keep-shapes`;
  const topo = `format=topojson quantization=${GEO_QUANTIZATION}`;
  const inScope = `[${STATEFP.map((s) => `'${s}'`).join(',')}].includes(STATEFP)`;

  // Counties, and states dissolved from them, share arcs, so they are simplified
  // together and a point's county always lies in its state.
  run(
    [
      `-i ${q(shp.county)} name=counties -filter ${q(inScope)}`,
      `-each ${q("state = ({'06':'CA','41':'OR','53':'WA'})[STATEFP]")}`,
      '-proj wgs84',
      `-filter-fields GEOID,NAME,state -rename-fields id=GEOID,name=NAME`,
      `-dissolve state + name=states`,
      `-each ${q("id = state; name = ({CA:'California',OR:'Oregon',WA:'Washington'})[state]; delete state")} target=states`,
      `-target counties`,
      simplify,
      `-o ${q(join(out, 'counties.topojson'))} ${topo} target=counties`,
      `-o ${q(join(out, 'states.topojson'))} ${topo} target=states`,
    ].join(' '),
  );

  run(
    [
      `-i ${q(shp.place06)} ${q(shp.place41)} ${q(shp.place53)} combine-files`,
      '-merge-layers name=places',
      '-proj wgs84',
      `-each ${q("kind = CLASSFP.startsWith('U') ? 'cdp' : 'incorporated'")}`,
      '-filter-fields GEOID,NAME,kind -rename-fields id=GEOID,name=NAME',
      simplify,
      `-o ${q(join(out, 'places.topojson'))} ${topo}`,
    ].join(' '),
  );

  run(
    [
      `-i ${q(shp.ecoregion)} name=ecoregions`,
      '-proj wgs84',
      `-i ${q(join(out, 'states.topojson'))} name=clip`,
      '-clip clip target=ecoregions',
      '-dissolve US_L3CODE copy-fields=US_L3NAME',
      '-rename-fields id=US_L3CODE,name=US_L3NAME',
      simplify,
      `-o ${q(join(out, 'ecoregions.topojson'))} ${topo}`,
    ].join(' '),
  );

  for (const f of readdirSync(out).filter((f) => f.endsWith('.topojson'))) {
    console.log(`${f}: ${(statSync(join(out, f)).size / 1024).toFixed(0)} KB`);
  }
}

main();
