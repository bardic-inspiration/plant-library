/**
 * npm run a11y — run axe through Playwright on the built site, at a wide and
 * a narrow width, and fail on serious or critical violations. Build first.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { loadConfig } from '../lib/config';
import { serve } from '../lib/serve';
import { samplePages } from '../lib/pages';

const config = loadConfig();
const dist = join(config.root, 'site', 'dist');
if (!existsSync(dist)) {
  console.error('site/dist is missing. Run `npm run build` first.');
  process.exit(1);
}
const { server, url } = await serve(dist, config.site.base, 4500);
const browser = await chromium.launch();
let failures = 0;
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    for (const path of samplePages(dist)) {
      const page = await context.newPage();
      await page.goto(url + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(150);
      const result = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      for (const v of bad) {
        failures++;
        console.error(`${width}px /${path}: [${v.impact}] ${v.id} — ${v.help}`);
        for (const n of v.nodes.slice(0, 5)) console.error(`    ${n.target.join(' ')}`);
      }
      const minor = result.violations.length - bad.length;
      console.log(`${width}px /${path}: ${bad.length ? `${bad.length} serious or critical` : 'ok'}${minor ? ` (${minor} minor)` : ''}`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failures ? 1 : 0);
