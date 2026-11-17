/** The pages the a11y and snapshot runs visit: one of each kind in the built site. Node only. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function samplePages(dist: string): string[] {
  const pages = ['', 'about/', 'styleguide/', '?plant.form=shrub&q=a'];
  for (const type of ['plant', 'project', 'palette']) {
    const dir = join(dist, type);
    if (!existsSync(dir)) continue;
    const first = readdirSync(dir).sort()[0];
    if (first) pages.push(`${type}/${first}/`);
  }
  return pages;
}
