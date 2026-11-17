/** npm run links — check Markdown links in the repo and, when built, the site's internal links. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config';
import { checkMarkdown, checkSite } from '../lib/links';

const config = loadConfig();
const dist = join(config.root, 'site', 'dist');
const md = checkMarkdown(config.root);
const site = checkSite(dist, config.site.base);
for (const p of [...md, ...site]) console.error(`${p.file}: ${p.link} — ${p.message}`);
console.log(`links: ${md.length} Markdown problems${existsSync(dist) ? `, ${site.length} site problems` : ' (site not built; skipped)'}`);
process.exit(md.length + site.length ? 1 : 0);
