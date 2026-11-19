/**
 * npm run a11y — run axe through Playwright on the built site, at a wide and
 * a narrow width, and fail on serious or critical violations. Build first.
 *
 * On the map view it first waits for the map, fails if no project mark was
 * drawn, and opens the results sheet on narrow screens, so axe checks the
 * map's controls and the results panel as a reader sees them.
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
/** The map view drew its project layer; on a narrow screen, its results sheet is opened. Returns the failures. */
async function checkMap(page: import('@playwright/test').Page, width: number, path: string): Promise<number> {
  const view = page.locator('.map-view[data-projects-rendered]');
  try {
    await view.waitFor({ timeout: 30000 });
  } catch {
    const status = await page.locator('.map-view').getAttribute('data-status').catch(() => null);
    console.error(`${width}px /${path}: the map didn't finish drawing (status ${status ?? 'none'})`);
    return 1;
  }
  const rendered = Number(await view.getAttribute('data-projects-rendered'));
  if (!(rendered > 0)) {
    console.error(`${width}px /${path}: the project layer drew no marks`);
    return 1;
  }
  console.log(`${width}px /${path}: project layer drew ${rendered} marks`);
  const toggle = page.locator('.sheet-toggle');
  if (await toggle.isVisible()) await toggle.click();
  return 0;
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
      if (path.startsWith('map/')) failures += await checkMap(page, width, path);
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
