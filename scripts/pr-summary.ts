/**
 * npm run pr-summary — a Markdown summary of the entries a PR changes, with
 * their key facts, for the CI job summary.
 * Usage: npm run pr-summary -- [--base <ref>]
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { buildData } from '../lib/build-data';
import { formatRange } from '../lib/format';
import type { PlantData } from '../lib/types';

const i = process.argv.indexOf('--base');
const base = i > 0 ? process.argv[i + 1] : 'origin/main';
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const changed = git('diff', '--name-status', git('merge-base', base, 'HEAD'), 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t'))
  .filter(([, f]) => /^content\/[a-z]+\/[a-z0-9-]+\.json$/.test(f));

const data = buildData();
const status: Record<string, string> = { A: 'added', M: 'changed', D: 'deleted', R: 'renamed' };
const lines = ['## Changed entries', ''];
if (!changed.length) lines.push('No entries changed.');
else {
  lines.push('| Entry | Change | Key facts |', '|---|---|---|');
  for (const [s, f] of changed) {
    const key = f.replace(/^content\//, '').replace(/\.json$/, '');
    const b = data.byKey.get(key);
    let facts = '';
    if (b?.entry.type === 'plant') {
      const d = b.entry.data as unknown as PlantData;
      facts = [d.form, d.height && `${formatRange(d.height)} tall`, d.spread && `${formatRange(d.spread)} wide`, `${d.sources.length} sources`, `${(d.images ?? []).length} images`].filter(Boolean).join(', ');
    }
    lines.push(`| ${b ? b.name : key} | ${status[s[0]] ?? s} | ${facts} |`);
  }
}
const { errors, warnings } = data.library.report;
lines.push('', `Validation: ${errors.length} errors, ${warnings.length} warnings.`);
const text = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
console.log(text);
