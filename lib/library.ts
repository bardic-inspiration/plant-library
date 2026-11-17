/** Load and validate everything in one call, as the scripts and the site build do. Node only. */
import { resolve } from 'node:path';
import { loadConfig, repoRoot, type Config } from './config';
import { loadEntries, type LoadedEntry } from './content';
import { loadSchemas, type Schemas } from './schemas';
import { validateConfig, validateLibrary, type Report } from './validate';

export interface Library {
  config: Config;
  /** The folder holding content/ and assets/: the repo root, or a fixture library named by PLANT_LIBRARY_DATA. */
  dataRoot: string;
  /** True when the data is a test fixture library rather than the library's own content. */
  fixtureData: boolean;
  schemas: Schemas;
  entries: LoadedEntry[];
  report: Report;
}

/** The data root for this run: PLANT_LIBRARY_DATA (relative to the repo root) or the repo root itself. */
export function dataRootFor(root: string, dataDir = process.env.PLANT_LIBRARY_DATA): string {
  return dataDir ? resolve(root, dataDir) : root;
}

export function loadLibrary(root = repoRoot(), dataRoot = dataRootFor(root)): Library {
  const config = loadConfig(root);
  const schemas = loadSchemas(root, config.vocab, Object.fromEntries(Object.entries(config.types).map(([t, d]) => [t, d.schema])));
  const loaded = loadEntries(dataRoot);
  const cfg = validateConfig(config, schemas);
  const lib = validateLibrary(config, schemas, loaded.entries, { dataRoot });
  const report: Report = {
    errors: [...loaded.problems, ...cfg.errors, ...lib.errors],
    warnings: [...cfg.warnings, ...lib.warnings],
  };
  return { config, dataRoot, fixtureData: resolve(dataRoot) !== resolve(root), schemas, entries: loaded.entries, report };
}

export function formatReport(report: Report): string {
  const lines: string[] = [];
  for (const e of report.errors) lines.push(`error   ${e.file}: ${e.message}`);
  for (const w of report.warnings) lines.push(`warning ${w.file}: ${w.message}`);
  return lines.join('\n');
}
