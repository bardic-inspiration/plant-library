import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary } from '../lib/library';
import { closeSubmission, loadExpected } from '../lib/result';
import { FIXTURES, ROOT } from './helpers';

/** `close` when the filesystem fails part way: the write of result.json, or the move into processed/. */
const fail = vi.hoisted(() => ({ write: false, rename: false }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    writeFileSync: ((...args: Parameters<typeof fs.writeFileSync>) => {
      if (fail.write && String(args[0]).endsWith('result.json')) throw new Error('ENOSPC: no space left on device');
      return fs.writeFileSync(...args);
    }) as typeof fs.writeFileSync,
    renameSync: ((...args: Parameters<typeof fs.renameSync>) => {
      if (fail.rename) throw new Error('EXDEV: cross-device link not permitted');
      return fs.renameSync(...args);
    }) as typeof fs.renameSync,
  };
});

const INBOX = join(ROOT, 'tests/fixtures/inbox');
const validate = loadLibrary(ROOT, FIXTURES).schemas.result;
const expected = loadExpected(join(ROOT, 'tests/fixtures/inbox-expected'));
const id = '20261120T090100Z-f10001';
const result = { schema: 1, id, decidedAt: '2026-11-20T12:00:00Z', ...expected.get(id)!.result };

const tmp: string[] = [];
afterAll(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));
afterEach(() => Object.assign(fail, { write: false, rename: false }));
function copyInbox() {
  const root = mkdtempSync(join(tmpdir(), 'close-'));
  tmp.push(root);
  cpSync(INBOX, join(root, 'inbox'), { recursive: true });
  return { inbox: join(root, 'inbox'), processed: join(root, 'processed') };
}

describe('close when the filesystem fails', () => {
  it('leaves the submission in the inbox when result.json can’t be written', () => {
    const dirs = copyInbox();
    const before = readdirSync(join(dirs.inbox, id)).sort();
    fail.write = true;
    expect(() => closeSubmission(dirs, id, result, validate)).toThrow(/ENOSPC/);
    expect(readdirSync(join(dirs.inbox, id)).sort()).toEqual(before);
    expect(existsSync(join(dirs.processed, id))).toBe(false);
  });

  it('takes result.json out again when the move fails', () => {
    const dirs = copyInbox();
    const before = readdirSync(join(dirs.inbox, id)).sort();
    fail.rename = true;
    expect(() => closeSubmission(dirs, id, result, validate)).toThrow(/EXDEV/);
    expect(readdirSync(join(dirs.inbox, id)).sort()).toEqual(before);
    expect(existsSync(join(dirs.processed, id))).toBe(false);
  });
});
