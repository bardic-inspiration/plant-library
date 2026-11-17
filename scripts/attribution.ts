/** npm run attribution — regenerate ATTRIBUTION.md. `--check` fails when it is stale. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildData } from '../lib/build-data';
import { attribution, attributionMarkdown } from '../lib/attribution';

const data = buildData();
const file = join(data.library.config.root, 'ATTRIBUTION.md');
const text = attributionMarkdown(attribution(data));
if (process.argv.includes('--check')) {
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (cur !== text) {
    console.error('ATTRIBUTION.md is stale. Run `npm run attribution`.');
    process.exit(1);
  }
  console.log('ATTRIBUTION.md is current.');
} else {
  writeFileSync(file, text);
  console.log('Wrote ATTRIBUTION.md');
}
