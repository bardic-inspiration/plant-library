// The Astro project. Run from the repo root: `astro build --root site`.
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('../config/site.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: site.base,
  trailingSlash: 'always',
  output: 'static',
  build: { format: 'directory' },
  integrations: [preact()],
  vite: {
    server: { fs: { allow: ['..'] } },
  },
});
