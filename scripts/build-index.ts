/**
 * npm run build:index — validate, derive, resolve refs, and write the
 * site's data: site/public/library.json (the lean index), the full entries
 * under site/public/data/, and the plant images under site/public/assets/.
 * The output is sorted and has no timestamps, so two builds of the same
 * content are byte-identical.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildData } from '../lib/build-data';
import { formatReport } from '../lib/library';

const data = buildData();
const { report, config, dataRoot } = data.library;
if (report.errors.length) {
  console.error(formatReport({ errors: report.errors, warnings: [] }));
  console.error(`\nbuild:index stopped: ${report.errors.length} validation errors`);
  process.exit(1);
}

const pub = join(config.root, 'site', 'public');
mkdirSync(pub, { recursive: true });
writeFileSync(join(pub, 'library.json'), JSON.stringify(data.index) + '\n');

const dataDir = join(pub, 'data');
rmSync(dataDir, { recursive: true, force: true });
for (const b of data.entries) {
  const dir = join(dataDir, b.entry.type);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${b.entry.id}.json`), JSON.stringify(b.entry, null, 2) + '\n');
}

const assets = join(pub, 'assets');
rmSync(assets, { recursive: true, force: true });
if (existsSync(join(dataRoot, 'assets'))) cpSync(join(dataRoot, 'assets'), assets, { recursive: true, filter: (src) => !src.endsWith('.gitkeep') });

if (data.library.fixtureData) console.log(`build:index is using the fixture library at ${dataRoot}`);
console.log(`build:index wrote ${data.index.records.length} records and ${data.index.facets.length} facets`);
