/** Reading entries from content/. Node only. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Entry } from './types';

export interface LoadedEntry {
  /** Repo-relative path, with forward slashes. */
  file: string;
  entry: Entry;
}

export interface LoadResult {
  entries: LoadedEntry[];
  /** Files that couldn't be read as entries at all. */
  problems: { file: string; message: string }[];
}

export function loadEntries(root: string, contentDir = 'content'): LoadResult {
  const out: LoadResult = { entries: [], problems: [] };
  const base = join(root, contentDir);
  if (!existsSync(base)) return out;
  for (const type of readdirSync(base).sort()) {
    const dir = join(base, type);
    if (!statSync(dir).isDirectory()) {
      if (type !== '.gitkeep') out.problems.push({ file: `${contentDir}/${type}`, message: 'Only type folders belong in content/' });
      continue;
    }
    for (const name of readdirSync(dir).sort()) {
      const file = `${contentDir}/${type}/${name}`;
      if (name === '.gitkeep') continue;
      if (!name.endsWith('.json')) {
        out.problems.push({ file, message: 'Entries are .json files' });
        continue;
      }
      try {
        out.entries.push({ file, entry: JSON.parse(readFileSync(join(dir, name), 'utf8')) });
      } catch (e) {
        out.problems.push({ file, message: `Not valid JSON: ${(e as Error).message}` });
      }
    }
  }
  return out;
}
