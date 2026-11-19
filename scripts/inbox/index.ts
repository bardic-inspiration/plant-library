/**
 * npm run inbox -- list | check <id> [--json] | import <bundle> | image <id> <file> [<entry id>]
 *                  | close <id> <result file> | compare
 *
 * The inbox's mechanical side (docs/submissions.md#inbox-and-mechanical-checks):
 * `list` the submissions in inbox/ oldest first, `check` one, `import` a
 * bundle exported from the browser store into inbox/, and re-encode one of a
 * submission's images into the library with `image`; `close` one with its
 * result, moving it to processed/, and `compare` processed/ with the fixture
 * inbox's expected results. PLANT_LIBRARY_INBOX names the folder holding
 * inbox/ and processed/ (default: the repo root), for a fixture run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { repoRoot } from '../../lib/config';
import { placeImage } from '../../lib/image';
import { checkSubmission, formatCheck, importBundle, listInbox } from '../../lib/inbox';
import { dataRootFor, loadLibrary } from '../../lib/library';
import { closeSubmission, compareRun, loadExpected } from '../../lib/result';

const root = repoRoot();
const inboxRoot = process.env.PLANT_LIBRARY_INBOX ? resolve(root, process.env.PLANT_LIBRARY_INBOX) : root;
const dirs = { inbox: join(inboxRoot, 'inbox'), processed: join(inboxRoot, 'processed') };
const [command, arg, arg2, arg3] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const json = process.argv.includes('--json');

function usage(): never {
  console.error('Usage: npm run inbox -- list | check <id> [--json] | import <bundle> | image <id> <file> [<entry id>] | close <id> <result file> | compare');
  process.exit(2);
}

/** Earlier texts of a content file (relative to the data root, which may be a fixture library), newest first, from git. */
function history(file: string): string[] {
  const cwd = dataRootFor(root);
  try {
    const revs = execFileSync('git', ['log', '--format=%H', '--', file], { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);
    return revs.map((r) => {
      try {
        return execFileSync('git', ['show', `${r}:./${file}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        return '';
      }
    });
  } catch {
    return [];
  }
}

function check(id: string) {
  if (!listInbox(dirs.inbox).includes(id)) {
    console.error(`${id} is not in inbox/.`);
    process.exit(2);
  }
  const lib = loadLibrary(root);
  return checkSubmission(join(dirs.inbox, id), { config: lib.config, schemas: lib.schemas, entries: lib.entries, history, dataRoot: lib.dataRoot, processed: dirs.processed });
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
  const report = check(arg);
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
} else if (command === 'image') {
  if (!arg || !arg2) usage();
  const report = check(arg);
  if (report.rejected) {
    console.error(`${arg} is rejected by the mechanical checks; no image is taken from it. Run: npm run inbox -- check ${arg}`);
    process.exit(1);
  }
  const lib = loadLibrary(root);
  const sub = JSON.parse(readFileSync(join(dirs.inbox, arg, 'submission.json'), 'utf8'));
  const f = (sub.files ?? []).find((x: { name: string }) => x.name === arg2);
  if (!f || f.role !== 'image') {
    console.error(`${arg2} is not an image file of ${arg}.`);
    process.exit(2);
  }
  const [type, targetId] = String(sub.target).split('/');
  const id = targetId ?? arg3;
  if (!id) {
    console.error(`${arg} adds a ${type}; name the new entry's id: npm run inbox -- image ${arg} ${arg2} <entry id>`);
    process.exit(2);
  }
  try {
    const out = await placeImage(join(dirs.inbox, arg, arg2), { dataRoot: lib.dataRoot, type, id, settings: lib.config.site.submissions.image });
    console.log(`wrote ${out.path} (${out.width}×${out.height}, re-encoded, metadata dropped)`);
    // The images item the form's metadata gives; the routine checks and completes it.
    const item = { file: out.path, alt: f.alt, shows: f.shows, credit: f.photographer, license: f.license, ...(f.sourceUrl ? { sourceUrl: f.sourceUrl } : {}) };
    console.log(JSON.stringify(item, null, 2));
  } catch (e) {
    console.error(`${arg2}: not written: ${(e as Error).message}.`);
    process.exit(1);
  }
} else if (command === 'close') {
  if (!arg || !arg2) usage();
  const lib = loadLibrary(root);
  try {
    const path = closeSubmission(dirs, arg, JSON.parse(readFileSync(arg2, 'utf8')), lib.schemas.result);
    console.log(`closed ${arg}: moved to processed/, result in ${path}`);
  } catch (e) {
    console.error(`${arg}: not closed: ${(e as Error).message}.`);
    process.exit(1);
  }
} else if (command === 'compare') {
  const rows = compareRun(dirs.processed, loadExpected(join(root, 'tests/fixtures/inbox-expected')));
  for (const r of rows) {
    console.log(`${r.differences.length ? 'differs' : 'agrees '}  ${r.id}  ${r.case}`);
    for (const d of r.differences) console.log(`         ${d}`);
  }
  const off = rows.filter((r) => r.differences.length).length;
  console.log(off ? `${off} of ${rows.length} cases differ from the expected result.` : `All ${rows.length} cases agree with the expected result.`);
  process.exit(off ? 1 : 0);
} else usage();
