/**
 * npm run inbox -- list | check <id> [--json] | import <bundle> | image <id> <file> [<entry id>]
 *
 * The inbox's mechanical side (docs/submissions.md#inbox-and-mechanical-checks):
 * `list` the submissions in inbox/ oldest first, `check` one, `import` a
 * bundle exported from the browser store into inbox/, and re-encode one of a
 * submission's images into the library with `image`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../../lib/config';
import { placeImage } from '../../lib/image';
import { checkSubmission, formatCheck, importBundle, listInbox } from '../../lib/inbox';
import { loadLibrary } from '../../lib/library';

const root = repoRoot();
const dirs = { inbox: join(root, 'inbox'), processed: join(root, 'processed') };
const [command, arg, arg2, arg3] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const json = process.argv.includes('--json');

function usage(): never {
  console.error('Usage: npm run inbox -- list | check <id> [--json] | import <bundle> | image <id> <file> [<entry id>]');
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
} else usage();
