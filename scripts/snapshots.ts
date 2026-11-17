/**
 * npm run snapshots — full-page screenshots of the sample pages at phone and
 * desktop widths into snapshots/ (git-ignored), for reviewing a styling
 * change side by side. Build first.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { loadConfig } from '../lib/config';
import { serve } from '../lib/serve';
import { samplePages } from '../lib/pages';

const config = loadConfig();
const dist = join(config.root, 'site', 'dist');
if (!existsSync(dist)) {
  console.error('site/dist is missing. Run `npm run build` first.');
  process.exit(1);
}
const out = join(config.root, 'snapshots');
mkdirSync(out, { recursive: true });
const { server, url } = await serve(dist, config.site.base, 4501);
const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    for (const path of samplePages(dist)) {
      await page.goto(url + path, { waitUntil: 'networkidle' });
      const name = `${(path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'library')}-${width}.png`;
      await page.screenshot({ path: join(out, name), fullPage: true });
      console.log(`snapshots/${name}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
