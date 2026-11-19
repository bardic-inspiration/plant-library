import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config';
import { readBundle, submissionText, writeBundle, type BundleSubmission } from '../lib/bundle';
import { checkSubmission, importBundle, listInbox, sha256 } from '../lib/inbox';
import { bundle, storeFor, type Sent } from '../site/src/lib/store';
import { fixtureEntries, ROOT, setup } from './helpers';

const { schemas } = setup();
const config = loadConfig(ROOT);
const entries = fixtureEntries();

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...Array.from({ length: 700 }, (_, i) => i % 256)]);
const CSV = Buffer.from('Botanical name,Quantity\nAcer circinatum,3\n');
const LONG = `${'a'.repeat(150)}.png`;

const temp = mkdtempSync(join(tmpdir(), 'bundle-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
let n = 0;
const dirs = () => {
  const d = join(temp, String(n++));
  return { inbox: join(d, 'inbox'), processed: join(d, 'processed') };
};

const fileMeta = (name: string, b: Buffer, role = 'image') => ({ name, sha256: sha256(b), bytes: b.length, role, rights: 'own-work', license: 'CC-BY-4.0' });
const sent = (id: string, files: Record<string, Buffer>): Sent => ({
  id,
  submission: {
    schema: 1,
    id,
    submittedAt: '2026-11-19T18:04:22Z',
    submitter: { name: 'Pat Example', role: 'Landscape architect' },
    kind: 'photo',
    target: 'plant/acer-circinatum',
    files: Object.entries(files).map(([name, b]) => fileMeta(name, b)),
  } as unknown as Sent['submission'],
  files: Object.entries(files).map(([name, b]) => ({ name, blob: new Blob([new Uint8Array(b)]) })),
});
const asBundle = (s: Sent, bytes: Record<string, Buffer>): BundleSubmission => ({
  id: s.id,
  submission: submissionText(s.submission),
  files: Object.entries(bytes).map(([name, b]) => ({ name, bytes: new Uint8Array(b) })),
});

describe('the browser store', () => {
  it('is the store config/site.json names, with put, list, get, and result', () => {
    const store = storeFor(config.site.store);
    expect(Object.keys(store).sort()).toEqual(['get', 'list', 'put', 'result']);
    expect(() => storeFor('nowhere')).toThrow('has no adapter');
  });
});

describe('export and inbox import round-trip', () => {
  const id = '20261119T180422Z-7f3a9c';
  const files = { 'fall.png': PNG, [LONG]: PNG.subarray(0, 300) };
  const s = sent(id, files);

  it('a submission with files, hashes intact, passing the file checks', async () => {
    const bytes = new Uint8Array(await (await bundle([s])).arrayBuffer());
    const d = dirs();
    expect(importBundle(bytes, d)).toEqual([{ id, status: 'imported', files: 2 }]);
    expect(listInbox(d.inbox)).toEqual([id]);
    const folder = join(d.inbox, id);
    expect(readdirSync(folder).sort()).toEqual([LONG, 'fall.png', 'submission.json'].sort());
    expect(JSON.parse(readFileSync(join(folder, 'submission.json'), 'utf8'))).toEqual(s.submission);
    for (const [name, b] of Object.entries(files)) expect(sha256(readFileSync(join(folder, name)))).toBe(sha256(b));
    const report = checkSubmission(folder, { config, schemas, entries });
    expect(report.rejected).toBe(false);
    expect(report.results.filter((r) => r.check === 'files').map((r) => r.status)).toEqual(['pass', 'pass']);
  });

  it('several submissions in one bundle', () => {
    const other = sent('20261119T190000Z-0a0b0c', { 'list.csv': CSV });
    const d = dirs();
    const r = importBundle(writeBundle([asBundle(s, files), asBundle(other, { 'list.csv': CSV })]), d);
    expect(r.map((x) => x.id)).toEqual([id, other.id]);
    expect(listInbox(d.inbox)).toEqual([id, other.id]);
  });

  it('skips a submission the inbox or processed/ already holds, leaving it as it was', () => {
    const d = dirs();
    const b = writeBundle([asBundle(s, files)]);
    importBundle(b, d);
    writeFileSync(join(d.inbox, id, 'fall.png'), 'changed');
    expect(importBundle(b, d)[0].status).toBe('skipped');
    expect(readFileSync(join(d.inbox, id, 'fall.png'), 'utf8')).toBe('changed');
    const e = dirs();
    mkdirSync(join(e.processed, id), { recursive: true });
    expect(importBundle(b, e)[0].status).toBe('skipped');
    expect(existsSync(join(e.inbox, id))).toBe(false);
  });

  it('is a tar file that tar itself reads', () => {
    const file = join(temp, 'b.tar');
    writeFileSync(file, writeBundle([asBundle(s, files)]));
    let listed: string;
    try {
      listed = execFileSync('tar', ['-tf', file], { encoding: 'utf8' });
    } catch {
      return; // no tar here
    }
    expect(listed.split('\n').filter(Boolean).sort()).toEqual([`${id}/`, `${id}/${LONG}`, `${id}/fall.png`, `${id}/submission.json`].sort());
  });
});

describe('a bundle is untrusted', () => {
  const id = '20261119T180422Z-7f3a9c';
  const good = () => writeBundle([{ id, submission: '{}\n', files: [{ name: 'a.png', bytes: new Uint8Array(PNG) }] }]);
  /** Rewrite the header at `at` with `edit`, fixing its checksum. */
  const patch = (b: Uint8Array, at: number, edit: (h: Uint8Array) => void) => {
    const h = b.subarray(at, at + 512);
    edit(h);
    h.fill(0x20, 148, 156);
    const sum = h.reduce((a, x) => a + x, 0);
    h.set(new TextEncoder().encode(sum.toString(8).padStart(6, '0')), 148);
    h[154] = 0;
    return b;
  };
  const setName = (name: string) => (h: Uint8Array) => {
    h.fill(0, 0, 100);
    h.fill(0, 345, 500);
    h.set(new TextEncoder().encode(name), 0);
  };
  const FILE_HEADER = 512 * 3; // folder header, submission.json header and its block

  it('reads back what it wrote', () => {
    expect(readBundle(good())).toEqual([{ id, submission: '{}\n', files: [{ name: 'a.png', bytes: new Uint8Array(PNG) }] }]);
  });

  it('refuses a path outside a submission folder', () => {
    expect(() => readBundle(patch(good(), FILE_HEADER, setName(`${id}/../../etc/passwd`)))).toThrow('not a plain file name');
    expect(() => readBundle(patch(good(), FILE_HEADER, setName('/etc/passwd')))).toThrow('not inside a submission folder');
    expect(() => readBundle(patch(good(), FILE_HEADER, setName(`${id}/sub/a.png`)))).toThrow('not a plain file name');
    expect(() => readBundle(patch(good(), FILE_HEADER, setName(`${id}/.hidden`)))).toThrow('not a plain file name');
  });

  it('refuses a link or any other entry that is not a plain file', () => {
    expect(() => readBundle(patch(good(), FILE_HEADER, (h) => (h[156] = '2'.charCodeAt(0))))).toThrow('not a plain file');
    expect(() => readBundle(patch(good(), FILE_HEADER, (h) => (h[156] = 'g'.charCodeAt(0))))).toThrow('not a plain file');
  });

  it('refuses a damaged, cut short, or empty bundle, or a folder with no submission.json', () => {
    const damaged = good();
    damaged[FILE_HEADER + 10] ^= 1;
    expect(() => readBundle(damaged)).toThrow('checksum');
    expect(() => readBundle(good().subarray(0, FILE_HEADER + 600))).toThrow('cut short');
    expect(() => readBundle(new Uint8Array(1024))).toThrow('no submissions');
    const noSub = writeBundle([{ id, submission: '', files: [] }]);
    patch(noSub, 512, setName(`${id}/other.txt`));
    expect(() => readBundle(noSub)).toThrow('has no submission.json');
  });

  it('writes nothing when any part of the bundle is bad', () => {
    const d = dirs();
    expect(() => importBundle(patch(good(), FILE_HEADER, setName(`${id}/../x`)), d)).toThrow();
    expect(existsSync(d.inbox)).toBe(false);
  });

  it('won\'t write a name a submission folder can\'t hold', () => {
    expect(() => writeBundle([{ id, submission: '{}', files: [{ name: '../x', bytes: new Uint8Array() }] }])).toThrow();
    expect(() => writeBundle([{ id: 'nope', submission: '{}', files: [] }])).toThrow('not a submission id');
  });
});
