/**
 * npm run inbox -- list | check <id> [--json] | import <bundle>
 *
 * The inbox's mechanical side (docs/submissions.md#inbox-and-mechanical-checks):
 * `list` the submissions in inbox/ oldest first, `check` one, and `import` a
 * bundle exported from the browser store into inbox/.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../../lib/config';
import { checkSubmission, formatCheck, importBundle, listInbox } from '../../lib/inbox';
import { loadLibrary } from '../../lib/library';

const root = repoRoot();
const dirs = { inbox: join(root, 'inbox'), processed: join(root, 'processed') };
const [command, arg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const json = process.argv.includes('--json');

function usage(): never {
  console.error('Usage: npm run inbox -- list | check <id> [--json] | import <bundle>');
  process.exit(2);
}

/** Earlier texts of a content file, newest first, from git. */
function history(file: string): string[] {
  try {
    const revs = execFileSync('git', ['log', '--format=%H', '--', file], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    return revs.map((r) => {
      try {
        return execFileSync('git', ['show', `${r}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        return '';
      }
    });
  } catch {
    return [];
  }
}

if (command === 'list') {
  const ids = listInbox(dirs.inbox);
  if (!ids.length) console.log('The inbox is empty.');
  for (const id of ids) {
    try {
      const s = JSON.parse(readFileSync(join(dirs.inbox, id, 'submission.json'), 'utf8'));
      console.log(`${id}  ${s.kind ?? '?'}  ${s.target ?? '?'}  ${s.submitter?.name ?? '?'}`);
    } catch {
      console.log(`${id}  (submission.json can't be read)`);
    }
  }
} else if (command === 'check') {
  if (!arg) usage();
  if (!listInbox(dirs.inbox).includes(arg)) {
    console.error(`${arg} is not in inbox/.`);
    process.exit(2);
  }
  const lib = loadLibrary(root);
  const report = checkSubmission(join(dirs.inbox, arg), { config: lib.config, schemas: lib.schemas, entries: lib.entries, history, dataRoot: lib.dataRoot, processed: dirs.processed });
  console.log(formatCheck(report));
  if (json) console.log(JSON.stringify(report, null, 2));
  process.exit(report.rejected ? 1 : 0);
} else if (command === 'import') {
  if (!arg) usage();
  let results;
  try {
    results = importBundle(readFileSync(arg), dirs);
  } catch (e) {
    console.error(`Not imported: ${(e as Error).message}.`);
    process.exit(1);
  }
  for (const r of results) {
    console.log(r.status === 'imported'
      ? `imported  ${r.id}  (${r.files} file${r.files === 1 ? '' : 's'}); next: npm run inbox -- check ${r.id}`
      : `skipped   ${r.id}  already in inbox/ or processed/; a submission is filed once`);
  }
} else usage();
