/** Loading the repo's configuration. Node only. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { OverlayDef } from './overlays';
import type { SiteConfig, SourceDef, TypeRegistry, Vocab } from './types';

/** The repo root: the nearest folder above the working directory holding config/types.json. */
export function repoRoot(start = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'config', 'types.json')) && existsSync(join(dir, 'package.json'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`No repo root above ${start}`);
    dir = up;
  }
}

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export interface Config {
  root: string;
  site: SiteConfig;
  types: TypeRegistry;
  vocab: Vocab;
  sources: Record<string, SourceDef>;
  /** The map's overlays (config/overlays.json), bottom to top. */
  overlays: OverlayDef[];
}

function stripSchema<T>(o: T): T {
  const copy = { ...(o as Record<string, unknown>) };
  delete copy.$schema;
  return copy as T;
}

export function loadConfig(root = repoRoot()): Config {
  const c = (f: string) => join(root, 'config', f);
  return {
    root,
    site: stripSchema(readJson<SiteConfig>(c('site.json'))),
    types: stripSchema(readJson<TypeRegistry>(c('types.json'))),
    vocab: readJson<Vocab>(c('vocab.json')),
    sources: stripSchema(readJson<Record<string, SourceDef>>(c('sources.json'))),
    overlays: readJson<{ overlays: OverlayDef[] }>(c('overlays.json')).overlays,
  };
}
