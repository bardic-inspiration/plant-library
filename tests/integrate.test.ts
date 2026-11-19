import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkSubmission, listInbox, type Status } from '../lib/inbox';
import { loadLibrary } from '../lib/library';
import { closeSubmission, compareRun, loadExpected, resultProblems, statusFor, type ResultItem } from '../lib/result';
import { FIXTURES, ROOT } from './helpers';

const INBOX = join(ROOT, 'tests/fixtures/inbox');
const EXPECTED = join(ROOT, 'tests/fixtures/inbox-expected');
const lib = loadLibrary(ROOT, FIXTURES);
const validate = lib.schemas.result;
const expected = loadExpected(EXPECTED);

/** The fixture library's git history, as `inbox check` reads it (the stale basedOn case needs it). */
function history(file: string): string[] {
  const revs = execFileSync('git', ['log', '--format=%H', '--', file], { cwd: FIXTURES, encoding: 'utf8' }).split('\n').filter(Boolean);
  return revs.map((r) => execFileSync('git', ['show', `${r}:./${file}`], { cwd: FIXTURES, encoding: 'utf8' }));
}

const tmp: string[] = [];
afterAll(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));
function copyInbox() {
  const root = mkdtempSync(join(tmpdir(), 'integrate-'));
  tmp.push(root);
  cpSync(INBOX, join(root, 'inbox'), { recursive: true });
  return { inbox: join(root, 'inbox'), processed: join(root, 'processed') };
}
const full = (id: string, r: { status: string; items: ResultItem[]; questions?: string[] }) => ({ schema: 1, id, decidedAt: '2026-11-20T12:00:00Z', ...r });

describe('the fixture inbox', () => {
  const ids = listInbox(INBOX);

  it('holds every case in spec order, each with its expected result', () => {
    expect(ids.length).toBe(13);
    expect([...expected.keys()]).toEqual(ids);
    expect(readdirSync(INBOX).filter((n) => !ids.includes(n))).toEqual([]);
  });

  for (const id of ids) {
    const exp = expected.get(id)!;
    describe(`${id}: ${exp.case}`, () => {
      it('the mechanical checks find what the case documents', () => {
        const r = checkSubmission(join(INBOX, id), { config: lib.config, schemas: lib.schemas, entries: lib.entries, history, dataRoot: lib.dataRoot, processed: join(INBOX, '..', 'no-processed') });
        const rank: Record<Status, number> = { pass: 0, warn: 1, fail: 2 };
        const worst: Record<string, Status> = {};
        for (const x of r.results) if (!worst[x.check] || rank[x.status] > rank[worst[x.check]]) worst[x.check] = x.status;
        expect(r.rejected).toBe(exp.mechanical.rejected);
        expect(worst).toEqual(exp.mechanical.checks);
      });

      it('the expected result is a valid result, its status agreeing with its items', () => {
        expect(resultProblems(full(id, exp.result), validate)).toEqual([]);
      });

      it('a mechanically rejected submission is decided as a whole', () => {
        if (exp.mechanical.rejected) expect(exp.result.items.map((i) => i.item)).toEqual(['submission']);
        else expect(exp.result.items.map((i) => i.item)).not.toContain('submission');
      });
    });
  }

  it('the cases cover every status but needs-info, and every decision', () => {
    const statuses = new Set([...expected.values()].map((e) => e.result.status));
    expect([...statuses].sort()).toEqual(['integrated', 'partial', 'rejected']);
    const decisions = new Set([...expected.values()].flatMap((e) => e.result.items.map((i) => i.decision)));
    expect([...decisions].sort()).toEqual(['accepted', 'changed', 'not-used']);
  });
});

describe('statusFor and resultProblems', () => {
  const item = (i: string, decision: ResultItem['decision']): ResultItem => ({ item: i, decision, reason: 'x' });

  it('derives the status from the items, not counting the comment', () => {
    expect(statusFor([item('change:summary', 'accepted'), item('change:data.height', 'changed')])).toBe('integrated');
    expect(statusFor([item('change:summary', 'accepted'), item('change:data.height', 'not-used')])).toBe('partial');
    expect(statusFor([item('entry', 'not-used')])).toBe('rejected');
    expect(statusFor([item('field-note:1', 'accepted'), item('comment', 'not-used')])).toBe('integrated');
    expect(statusFor([item('comment', 'accepted')])).toBe('rejected');
  });

  it('rejects a status its items contradict, a repeated item, and a rejected result with a PR', () => {
    const id = '20261120T090100Z-f10001';
    expect(resultProblems(full(id, { status: 'integrated', items: [item('entry', 'not-used')] }), validate)).toEqual(['status: the items make this rejected, not integrated']);
    expect(resultProblems(full(id, { status: 'partial', items: [item('change:summary', 'accepted'), item('change:summary', 'not-used')] }), validate)).toContain('items: change:summary is decided twice');
    expect(resultProblems({ ...full(id, { status: 'rejected', items: [item('entry', 'not-used')] }), pr: 'https://github.com/o/r/pull/1' }, validate)).toEqual(['pr: a rejected submission has no PR']);
  });

  it('a needs-info result asks something and integrates nothing', () => {
    const id = '20261120T090100Z-f10001';
    expect(resultProblems(full(id, { status: 'needs-info', items: [item('entry', 'not-used')] }), validate).length).toBeGreaterThan(0);
    expect(resultProblems(full(id, { status: 'needs-info', items: [item('entry', 'not-used')], questions: ['Which county?'] }), validate)).toEqual([]);
    expect(resultProblems(full(id, { status: 'needs-info', items: [item('entry', 'accepted')], questions: ['Which county?'] }), validate)).toEqual(['status: a needs-info result integrates nothing, so every item is not-used']);
  });

  it('the schema is strict about items', () => {
    const id = '20261120T090100Z-f10001';
    expect(validate(full(id, { status: 'rejected', items: [item('change:meta.fixture', 'not-used')] }))).toBe(false);
    expect(validate(full(id, { status: 'rejected', items: [item('field-note:0', 'not-used')] }))).toBe(false);
    expect(validate(full(id, { status: 'rejected', items: [{ ...item('entry', 'not-used'), reason: '' }] }))).toBe(false);
  });
});

describe('close and compare', () => {
  it('a run closing every case with its expected result agrees with it', () => {
    const dirs = copyInbox();
    for (const [id, exp] of expected) closeSubmission(dirs, id, full(id, exp.result), validate);
    expect(listInbox(dirs.inbox)).toEqual([]);
    expect(compareRun(dirs.processed, expected).filter((c) => c.differences.length)).toEqual([]);
  });

  it('close moves the folder whole and writes result.json beside it', () => {
    const dirs = copyInbox();
    const id = '20261120T090100Z-f10001';
    const path = closeSubmission(dirs, id, full(id, expected.get(id)!.result), validate);
    expect(path).toBe(join(dirs.processed, id, 'result.json'));
    expect(readdirSync(join(dirs.processed, id)).sort()).toEqual(['result.json', 'submission.json', 'vine-maple-fall.jpg']);
    expect(existsSync(join(dirs.inbox, id))).toBe(false);
    expect(() => closeSubmission(dirs, id, full(id, expected.get(id)!.result), validate)).toThrow(/not in the inbox/);
  });

  it('close changes nothing for an invalid result, or one for another submission', () => {
    const dirs = copyInbox();
    const id = '20261120T090100Z-f10001';
    expect(() => closeSubmission(dirs, id, { ...full(id, expected.get(id)!.result), status: 'rejected' }, validate)).toThrow(/isn't valid/);
    expect(() => closeSubmission(dirs, id, full('20261120T090200Z-f10002', expected.get('20261120T090200Z-f10002')!.result), validate)).toThrow(/is for/);
    expect(existsSync(join(dirs.inbox, id, 'submission.json'))).toBe(true);
    expect(existsSync(dirs.processed)).toBe(false);
  });

  it('compare reports a different status, a different decision, a missing or extra item, and an unclosed case', () => {
    const dirs = copyInbox();
    const [a, b] = [...expected.keys()];
    const got = structuredClone(expected.get(a)!.result);
    got.items = [{ ...got.items[0], decision: 'not-used' }, { item: 'comment', decision: 'not-used', reason: 'x' }];
    got.status = 'rejected';
    closeSubmission(dirs, a, full(a, got), validate);
    writeFileSync(join(dirs.processed, 'unused.txt'), '');
    const rows = compareRun(dirs.processed, expected);
    expect(rows.find((r) => r.id === a)!.differences).toEqual([
      'status: expected integrated, got rejected',
      'file:vine-maple-fall.jpg: expected accepted, got not-used',
      'comment: decided, but not an item the case expects',
    ]);
    expect(rows.find((r) => r.id === b)!.differences).toEqual(['no result: the run didn\'t close it']);
    expect(JSON.parse(readFileSync(join(dirs.processed, a, 'result.json'), 'utf8')).status).toBe('rejected');
  });
});
