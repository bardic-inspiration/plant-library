import { join } from 'node:path';
import { loadConfig, repoRoot, type Config } from '../lib/config';
import { loadEntries, type LoadedEntry } from '../lib/content';
import { loadSchemas, type Schemas } from '../lib/schemas';
import { validateLibrary, type Report } from '../lib/validate';

export const ROOT = repoRoot();
export const FIXTURES = join(ROOT, 'tests', 'fixtures', 'library');

export function fixtureEntries(): LoadedEntry[] {
  return loadEntries(FIXTURES).entries;
}

export function setup(): { config: Config; schemas: Schemas } {
  const config = loadConfig(ROOT);
  const schemas = loadSchemas(ROOT, config.vocab, Object.fromEntries(Object.entries(config.types).map(([t, d]) => [t, d.schema])));
  return { config, schemas };
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Validate the fixture library after applying a change to one entry (by key). */
export function validateWith(
  change: (entries: LoadedEntry[]) => void,
  opts: { config?: (c: Config) => void; fileSize?: (p: string) => number | undefined } = {},
): Report {
  const { config, schemas } = setup();
  opts.config?.(config);
  const entries = clone(fixtureEntries());
  change(entries);
  return validateLibrary(config, schemas, entries, { dataRoot: FIXTURES, fileSize: opts.fileSize });
}

export function entry(entries: LoadedEntry[], key: string): LoadedEntry {
  const e = entries.find((x) => `${x.entry.type}/${x.entry.id}` === key);
  if (!e) throw new Error(`no fixture ${key}`);
  return e;
}

export const messages = (r: Report) => r.errors.map((e) => `${e.file}: ${e.message}`);
