/** npm run preview — serve site/dist under the base path. `--port <n>` (default 4321). */
import { join } from 'node:path';
import { loadConfig } from '../lib/config';
import { serve } from '../lib/serve';

const config = loadConfig();
const i = process.argv.indexOf('--port');
const port = i > 0 ? Number(process.argv[i + 1]) : 4321;
const { url } = await serve(join(config.root, 'site', 'dist'), config.site.base, port);
console.log(`Serving site/dist at ${url}`);
