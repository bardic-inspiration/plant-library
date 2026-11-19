/** The pages the a11y and snapshot runs visit: one of each kind in the built site. Node only. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeList, SHARE_PARAM } from './workspace';

export function samplePages(dist: string): string[] {
  const pages = ['', 'map/', 'about/', 'styleguide/', '?plant.form=shrub&q=a'];
  for (const type of ['plant', 'project', 'palette']) {
    const dir = join(dist, type);
    if (!existsSync(dir)) continue;
    const first = readdirSync(dir).sort()[0];
    if (first) pages.push(`${type}/${first}/`);
  }
  // A plant page with its "Used on" section, when any plant is on a project.
  const plants = join(dist, 'plant');
  if (existsSync(plants)) {
    const used = readdirSync(plants).sort().find((id) => readFileSync(join(plants, id, 'index.html'), 'utf8').includes('id="used-heading"'));
    if (used && !pages.includes(`plant/${used}/`)) pages.push(`plant/${used}/`);
  }
  // A palette page with its location map, when any palette's site has a location.
  const palettes = join(dist, 'palette');
  if (existsSync(palettes)) {
    const located = readdirSync(palettes).sort().find((id) => readFileSync(join(palettes, id, 'index.html'), 'utf8').includes('id="location-heading"'));
    if (located && !pages.includes(`palette/${located}/`)) pages.push(`palette/${located}/`);
  }
  // The workspace, empty and holding a palette's list opened by its share link.
  if (existsSync(join(dist, 'workspace'))) {
    pages.push('workspace/');
    const dataDir = join(dist, 'data', 'palette');
    const first = existsSync(dataDir) ? readdirSync(dataDir).sort()[0] : undefined;
    if (first) {
      const e = JSON.parse(readFileSync(join(dataDir, first), 'utf8')) as { name?: string; data: { site?: object; plantList: [] } };
      pages.push(`workspace/?${SHARE_PARAM}=${encodeList({ name: e.name ?? first, site: e.data.site ?? {}, lines: e.data.plantList })}`);
    }
  }
  return pages;
}
