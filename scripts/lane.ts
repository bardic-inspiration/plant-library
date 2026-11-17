/**
 * npm run lane — check the current branch's changes against its lane.
 * Usage: npm run lane -- [--branch <name>] [--base <ref>] [--json]
 * In CI the workflow passes the PR's head branch and base SHA.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { checkLane } from '../lib/lane';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();

const branch = arg('branch') ?? process.env.GITHUB_HEAD_REF ?? git('rev-parse', '--abbrev-ref', 'HEAD');
const base = arg('base') ?? 'origin/main';
const mergeBase = git('merge-base', base, 'HEAD');
const files = git('diff', '--name-only', mergeBase, 'HEAD').split('\n').filter(Boolean);
const result = checkLane(branch, files);

if (process.argv.includes('--json')) console.log(JSON.stringify(result));
else {
  console.log(`branch ${branch}: ${result.lane ?? 'no'} lane, ${files.length} files changed`);
  console.log(`checks: ${result.checks.join(', ') || 'none'}${result.docsOnly ? ' (docs only)' : ''}`);
  if (result.labels.length) console.log(`labels: ${result.labels.join(', ')}`);
  for (const e of result.errors) console.error(`error: ${e}`);
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `lane=${result.lane ?? ''}\nchecks=${result.checks.join(',')}\n`);
}
process.exit(result.ok ? 0 : 1);
