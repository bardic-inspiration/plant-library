import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config';
import { checkSubmission, sha256, sniff, type CheckReport } from '../lib/inbox';
import { applyDifferences, editDifferences, entryHash, entryText, type Change } from '../lib/submission';
import { clone, entry, FIXTURES, fixtureEntries, ROOT, setup } from './helpers';

const { schemas } = setup();
const config = loadConfig(ROOT);
const entries = fixtureEntries();
const acer = entry(entries, 'plant/acer-circinatum');
const acerData = acer.entry as unknown as Record<string, unknown>;

const envelope = (over: Record<string, unknown>) => ({
  schema: 1,
  id: '20261117T180422Z-7f3a9c',
  submittedAt: '2026-11-17T18:04:22Z',
  submitter: { name: 'Pat Example', role: 'Landscape architect' },
  ...over,
});
const valid = (s: unknown) => schemas.submission(s) as boolean;
const errors = (s: unknown) => (schemas.submission(s), JSON.stringify(schemas.submission.errors));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const image = (name: string, b: Buffer) => ({ name, sha256: sha256(b), bytes: b.length, role: 'image', rights: 'own-work', license: 'CC-BY-4.0', photographer: 'Pat Example', alt: 'Vine maple in fall' });

describe('submission schema: one valid submission per kind', () => {
  const kinds: Record<string, Record<string, unknown>> = {
    add: { kind: 'add', target: 'plant', entry: { data: { genus: 'Acer', species: 'macrophyllum' } } },
    edit: { kind: 'edit', target: 'plant/acer-circinatum', basedOn: 'a'.repeat(64), changes: [{ path: 'data.height.max', value: 30, basis: 'observation', note: 'Taller in irrigated beds.' }] },
    photo: { kind: 'photo', target: 'plant/acer-circinatum', files: [image('IMG_2041.jpg', PNG)] },
    note: { kind: 'note', target: 'plant/acer-circinatum', fieldNotes: [{ topic: 'establishment', note: 'Slow to establish in full sun.', region: 'WA' }] },
  };
  for (const [kind, body] of Object.entries(kinds)) {
    it(`${kind} validates`, () => expect(errors(envelope(body))).toBe('null'));
  }

  it('the content is loose: a draft entry needn\'t be an entry', () => {
    expect(valid(envelope({ kind: 'add', target: 'plant', entry: { data: { height: 'about six feet' }, whatever: true } }))).toBe(true);
  });

  it('the envelope is strict', () => {
    expect(valid(envelope({ ...kinds.note, extra: 1 }))).toBe(false);
    expect(valid(envelope({ ...kinds.note, kind: 'delete' }))).toBe(false);
    expect(valid(envelope({ ...kinds.note, id: 'not-an-id' }))).toBe(false);
    expect(valid(envelope({ ...kinds.note, submitter: { name: 'Pat Example' } }))).toBe(false);
  });

  it('add names a type; the others name an entry', () => {
    expect(valid(envelope({ ...kinds.add, target: 'plant/acer-macrophyllum' }))).toBe(false);
    expect(valid(envelope({ ...kinds.note, target: 'plant' }))).toBe(false);
  });

  it('each kind needs its content', () => {
    expect(valid(envelope({ kind: 'add', target: 'plant' }))).toBe(false);
    expect(valid(envelope({ ...kinds.edit, changes: [] }))).toBe(false);
    expect(valid(envelope({ ...kinds.edit, basedOn: undefined }))).toBe(false);
    expect(valid(envelope({ ...kinds.photo, files: [] }))).toBe(false);
    expect(valid(envelope({ ...kinds.note, fieldNotes: [] }))).toBe(false);
  });

  it('a change has exactly one of value, add, or remove, a basis, and a note', () => {
    const change = (c: Record<string, unknown>) => envelope({ ...kinds.edit, changes: [c] });
    expect(valid(change({ path: 'data.sun', add: ['shade'], remove: ['full-sun'], basis: 'correction', note: 'x' }))).toBe(false);
    expect(valid(change({ path: 'data.sun', basis: 'correction', note: 'x' }))).toBe(false);
    expect(valid(change({ path: 'data.sun', add: ['shade'], note: 'x' }))).toBe(false);
    expect(valid(change({ path: 'data.sun', add: ['shade'], basis: 'correction' }))).toBe(false);
    expect(valid(change({ path: 'data.height', value: null, basis: 'correction', note: 'x' }))).toBe(true);
  });

  it('a change sourced to a source cites it', () => {
    const change = (c: Record<string, unknown>) => envelope({ ...kinds.edit, changes: [{ path: 'data.height.max', value: 30, note: 'x', ...c }] });
    expect(valid(change({ basis: 'source' }))).toBe(false);
    expect(valid(change({ basis: 'source', sourceUrl: 'https://example.org/acer' }))).toBe(true);
    expect(valid(change({ basis: 'source', citation: 'A field guide, p. 12' }))).toBe(true);
  });

  it('a change may not touch type, id, meta, or field notes', () => {
    for (const path of ['type', 'id', 'meta.fixture', 'fieldNotes']) {
      expect(valid(envelope({ ...kinds.edit, changes: [{ path, value: 1, basis: 'correction', note: 'x' }] }))).toBe(false);
    }
  });

  it('every file states its rights basis; a third-party file its source page', () => {
    const file = (f: Record<string, unknown>) => envelope({ ...kinds.photo, files: [{ ...image('a.png', PNG), ...f }] });
    expect(valid(file({ rights: undefined }))).toBe(false);
    expect(valid(file({ rights: 'third-party' }))).toBe(false);
    expect(valid(file({ rights: 'third-party', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.png' }))).toBe(true);
  });

  it('a file name is a plain name in the folder', () => {
    for (const name of ['../x.png', 'a/b.png', '.hidden.png', 'submission.json', 'result.json']) {
      expect(valid(envelope({ ...kinds.photo, files: [image(name, PNG)] })), name).toBe(false);
    }
  });
});

describe('edit differences', () => {
  const before = clone(acerData);
  const edited = (change: (e: Record<string, any>) => void) => {
    const e = clone(acerData) as Record<string, any>;
    change(e);
    return e;
  };

  it('an unchanged entry has no differences', () => {
    expect(editDifferences(before, clone(before))).toEqual([]);
  });

  it('holds exactly the paths changed', () => {
    const after = edited((e) => {
      e.data.height.max = 30;
      e.data.sun = e.data.sun.filter((s: string) => s !== 'full-sun');
      e.data.wildlife.push('deer-resistant');
      e.data.soil.ph.min = 5.5;
    });
    expect(editDifferences(before, after)).toEqual([
      { path: 'data.height.max', value: 30 },
      { path: 'data.sun', remove: ['full-sun'] },
      { path: 'data.soil.ph.min', value: 5.5 },
      { path: 'data.wildlife', add: ['deer-resistant'] },
    ]);
  });

  it('a reordered list, or a list of objects, is set whole', () => {
    const after = edited((e) => {
      e.data.commonNames = ['Mountain maple', ...e.data.commonNames];
      e.data.sources = e.data.sources.slice(1);
    });
    const d = editDifferences(before, after);
    expect(d.map((x) => x.path)).toEqual(['data.commonNames', 'data.sources']);
    expect(d[0]).toEqual({ path: 'data.commonNames', value: ['Mountain maple', 'Vine maple'] });
  });

  it('a cleared key is null; a new one is its value; meta and the name keys are left out', () => {
    const after = edited((e) => {
      delete e.data.fallColor;
      e.data.deerResistance = 'high';
      e.meta.revisedAt = '2030-01-01';
      e.id = 'other';
    });
    expect(editDifferences(before, after)).toEqual([
      { path: 'data.fallColor', value: null },
      { path: 'data.deerResistance', value: 'high' },
    ]);
  });

  it('applying the differences gives back the edited entry', () => {
    const after = edited((e) => {
      e.summary = 'A small tree for shade.';
      e.data.height = { min: 10, max: 30 };
      e.data.sun = ['part-shade', 'shade', 'full-sun'];
      e.data.moisture = [];
      delete e.data.fallColor;
      e.tags = { trial: 'yes' };
    });
    expect(applyDifferences(before, editDifferences(before, after))).toEqual(after);
  });

  it('an edit form\'s submission validates and holds exactly the fields changed', () => {
    const after = edited((e) => {
      e.data.height.max = 30;
      e.data.wildlife.push('deer-resistant');
    });
    const changes: Change[] = editDifferences(before, after).map((d) => ({ ...d, basis: 'observation', note: 'Seen on our projects.' }));
    const sub = envelope({ kind: 'edit', target: 'plant/acer-circinatum', basedOn: sha256(entryText(before)), changes });
    expect(errors(sub)).toBe('null');
    expect(changes.map((c) => c.path)).toEqual(['data.height.max', 'data.wildlife']);
  });

  it('basedOn hashes the entry as published, the same in the browser and in Node', async () => {
    expect(await entryHash(acerData)).toBe(sha256(entryText(acerData)));
  });
});

describe('file types by content', () => {
  it('knows each allowed type by its signature, not its name', () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('jpeg');
    expect(sniff(PNG)).toBe('png');
    expect(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('webp');
    expect(sniff(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
    expect(sniff(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from('[Content_Types].xml xl/workbook.xml')]))).toBe('xlsx');
    expect(sniff(Buffer.from('Botanical name,Quantity\nAcer circinatum,3\n'))).toBe('csv');
  });

  it('knows nothing else', () => {
    expect(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 'word/document.xml'.length]))).toBeUndefined();
    expect(sniff(Buffer.from('MZ\u0000\u0001binary'))).toBeUndefined();
    expect(sniff(Buffer.from('<html><body>hello</body></html>'))).toBeUndefined();
    expect(sniff(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('inbox check', () => {
  const inbox = mkdtempSync(join(tmpdir(), 'inbox-'));
  afterAll(() => rmSync(inbox, { recursive: true, force: true }));
  let n = 0;
  /** Write a submission folder; returns its path. */
  const file = (sub: Record<string, unknown>, files: Record<string, Buffer> = {}): string => {
    const id = `20261117T1804${String(n++).padStart(2, '0')}Z-7f3a9c`;
    const dir = join(inbox, id);
    mkdirSync(dir);
    writeFileSync(join(dir, 'submission.json'), JSON.stringify(envelope({ ...sub, id })));
    for (const [name, b] of Object.entries(files)) writeFileSync(join(dir, name), b);
    return dir;
  };
  const processed = mkdtempSync(join(tmpdir(), 'processed-'));
  afterAll(() => rmSync(processed, { recursive: true, force: true }));
  const run = (dir: string, history?: (f: string) => string[]) => checkSubmission(dir, { config, schemas, entries, history, dataRoot: FIXTURES, processed });
  const of = (r: CheckReport, check: string) => r.results.filter((x) => x.check === check);
  const photo = (files: Record<string, unknown>[]) => ({ kind: 'photo', target: 'plant/acer-circinatum', files });

  it('passes a well-formed photo submission', () => {
    const r = run(file(photo([image('fall.png', PNG)]), { 'fall.png': PNG }));
    expect(r.rejected).toBe(false);
    expect(r.results.map((x) => x.status)).not.toContain('fail');
    expect(r.results.map((x) => x.status)).not.toContain('warn');
  });

  it('rejects a submission that fails its schema, and checks nothing more', () => {
    const r = run(file({ kind: 'photo', target: 'plant/acer-circinatum' }));
    expect(r.rejected).toBe(true);
    expect(r.results.every((x) => x.check === 'schema' && x.status === 'fail')).toBe(true);
  });

  it('rejects a file named .jpg that is not an image', () => {
    const fake = Buffer.from('#!/bin/sh\necho "not a photo"\n');
    const r = run(file(photo([image('IMG_2041.jpg', fake)]), { 'IMG_2041.jpg': fake }));
    expect(r.rejected).toBe(true);
    expect(of(r, 'files').map((x) => x.status)).toEqual(['pass']);
    expect(of(r, 'file-type')).toEqual([expect.objectContaining({ status: 'fail', message: expect.stringContaining('IMG_2041.jpg is none of the allowed types by its content') })]);
  });

  it('rejects a real file of the wrong kind for its role', () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    const r = run(file(photo([image('photo.jpg', pdf)]), { 'photo.jpg': pdf }));
    expect(r.rejected).toBe(true);
    expect(of(r, 'file-type')[0].message).toContain('is a PDF file by its content; a file of role image must be JPEG, PNG, WebP');
  });

  it('warns, without rejecting, when an image\'s name says another image type', () => {
    const r = run(file(photo([image('fall.jpg', PNG)]), { 'fall.jpg': PNG }));
    expect(r.rejected).toBe(false);
    expect(of(r, 'file-type')).toEqual([expect.objectContaining({ status: 'warn' })]);
  });

  it('rejects a file over its role\'s size limit', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(config.site.submissions.maxBytes.image)]);
    const r = run(file(photo([image('big.png', big)]), { 'big.png': big }));
    expect(r.rejected).toBe(true);
    expect(of(r, 'file-type')[0].message).toContain('over the');
  });

  it('rejects a missing file, or one whose size or hash differs', () => {
    expect(of(run(file(photo([image('gone.png', PNG)]))), 'files')[0]).toMatchObject({ status: 'fail', message: 'gone.png is listed but missing' });
    const other = Buffer.concat([PNG, Buffer.from([1])]);
    const sized = run(file(photo([image('a.png', PNG)]), { 'a.png': other }));
    expect(sized.rejected).toBe(true);
    expect(of(sized, 'files')[0].message).toContain('bytes, not the');
    const swapped = Buffer.from(PNG);
    swapped[15] = 0;
    const hashed = run(file(photo([image('a.png', PNG)]), { 'a.png': swapped }));
    expect(of(hashed, 'files')[0].message).toBe("a.png doesn't match its stated sha256");
  });

  it('warns about a file in the folder that the submission doesn\'t list', () => {
    const r = run(file(photo([image('a.png', PNG)]), { 'a.png': PNG, 'stray.txt': Buffer.from('x') }));
    expect(r.rejected).toBe(false);
    expect(of(r, 'files')).toContainEqual(expect.objectContaining({ status: 'warn', message: expect.stringContaining('stray.txt') }));
  });

  it('fails a target the library doesn\'t hold', () => {
    const r = run(file({ kind: 'note', target: 'plant/acer-nonexistent', fieldNotes: [{ topic: 'design', note: 'x' }] }));
    expect(of(r, 'target')[0]).toMatchObject({ status: 'fail' });
    expect(run(file({ kind: 'add', target: 'shrub', entry: {} })).results).toContainEqual(expect.objectContaining({ check: 'target', status: 'fail' }));
  });

  describe('basedOn', () => {
    const current = clone(acerData) as Record<string, any>;
    const older = clone(acerData) as Record<string, any>;
    older.data.height.max = 20;
    older.summary = 'An older summary.';
    const history = (f: string) => (f === acer.file ? [entryText(current), entryText(older)] : []);
    const edit = (basedOn: string, paths: string[]) => file({
      kind: 'edit', target: 'plant/acer-circinatum', basedOn,
      changes: paths.map((path) => ({ path, value: 1, basis: 'observation', note: 'x' })),
    });

    it('passes when it is the current entry', () => {
      expect(of(run(edit(sha256(entryText(current)), ['data.height.max'])), 'based-on')[0].status).toBe('pass');
    });

    it('flags a stale basedOn that touches a field changed since', () => {
      const r = run(edit(sha256(entryText(older)), ['data.height.max', 'data.spread.max']), history);
      const [b] = of(r, 'based-on');
      expect(r.rejected).toBe(false);
      expect(b.status).toBe('warn');
      expect(b.touched).toEqual(['data.height.max']);
      expect(b.message).toContain('summary, data.height.max');
    });

    it('notes a stale basedOn that touches nothing changed since', () => {
      const [b] = of(run(edit(sha256(entryText(older)), ['data.spread.max']), history), 'based-on');
      expect(b.status).toBe('warn');
      expect(b.touched).toBeUndefined();
      expect(b.message).toContain('not on a path this edit changes');
    });

    it('says when basedOn matches no version it can find', () => {
      const [b] = of(run(edit('0'.repeat(64), ['data.spread.max']), history), 'based-on');
      expect(b.message).toContain('matches no earlier version');
    });
  });

  it('fails a submission whose id isn\'t its folder\'s name', () => {
    const dir = file({ kind: 'note', target: 'plant/acer-circinatum', fieldNotes: [{ topic: 'design', note: 'x' }] });
    const sub = JSON.parse(JSON.stringify(envelope({ kind: 'note', target: 'plant/acer-circinatum', fieldNotes: [{ topic: 'design', note: 'x' }], id: '20261117T000000Z-000000' })));
    writeFileSync(join(dir, 'submission.json'), JSON.stringify(sub));
    expect(run(dir).rejected).toBe(true);
  });

  describe('duplicate', () => {
    const addPlant = (data: Record<string, unknown>) => file({ kind: 'add', target: 'plant', entry: { data } });

    it('passes an add naming no plant the library holds', () => {
      const r = run(addPlant({ genus: 'Acer', species: 'macrophyllum' }));
      expect(of(r, 'duplicate')).toEqual([expect.objectContaining({ status: 'pass' })]);
    });

    it('warns when an add duplicates a plant by name', () => {
      const [d] = of(run(addPlant({ genus: 'acer', species: 'Circinatum' })), 'duplicate');
      expect(d.status).toBe('warn');
      expect(d.message).toContain('plant/acer-circinatum');
    });

    it('warns when an add is a synonym of a plant, or names a plant as its synonym', () => {
      const [a] = of(run(addPlant({ genus: 'Berberis', species: 'aquifolium' })), 'duplicate');
      expect(a).toMatchObject({ status: 'warn', message: expect.stringContaining('synonym Berberis aquifolium of plant/mahonia-aquifolium') });
      const [b] = of(run(addPlant({ genus: 'Berberis', species: 'repens', synonyms: ['Acer circinatum'] })), 'duplicate');
      expect(b).toMatchObject({ status: 'warn', message: expect.stringContaining('plant/acer-circinatum') });
    });

    it('compares a project or palette by its name', () => {
      expect(of(run(file({ kind: 'add', target: 'palette', entry: { name: 'Bioswale Bottom' } })), 'duplicate')[0]).toMatchObject({ status: 'warn', message: expect.stringContaining('palette/bioswale-bottom') });
      expect(of(run(file({ kind: 'add', target: 'palette', entry: { name: 'Roof garden' } })), 'duplicate')[0].status).toBe('pass');
    });

    it('warns when an image is one the library holds, by hash', () => {
      const held = readFileSync(join(FIXTURES, 'assets/images/plant/acer-circinatum/1.jpg'));
      const r = run(file(photo([image('again.jpg', held)]), { 'again.jpg': held }));
      expect(of(r, 'duplicate')).toEqual([expect.objectContaining({ status: 'warn', message: expect.stringContaining('assets/images/plant/acer-circinatum/1.jpg') })]);
      expect(r.rejected).toBe(false);
    });

    it('finds the original of an integrated image in processed/', () => {
      const original = Buffer.concat([PNG, Buffer.from('original')]);
      const id = '20261101T000000Z-abcdef';
      mkdirSync(join(processed, id));
      writeFileSync(join(processed, id, 'submission.json'), JSON.stringify(envelope({ id, ...photo([image('first.png', original)]) })));
      const [d] = of(run(file(photo([image('second.png', original)]), { 'second.png': original })), 'duplicate');
      expect(d).toMatchObject({ status: 'warn', message: expect.stringContaining(`processed/${id}/first.png`) });
      expect(of(run(file(photo([image('fresh.png', PNG)]), { 'fresh.png': PNG })), 'duplicate')[0].status).toBe('pass');
    });
  });

  describe('paths', () => {
    const edit = (changes: Record<string, unknown>[]) => run(file({
      kind: 'edit', target: 'plant/acer-circinatum', basedOn: sha256(entryText(acerData)),
      changes: changes.map((c) => ({ basis: 'observation', note: 'x', ...c })),
    }));
    const statuses = (r: CheckReport) => of(r, 'paths').map((x) => x.status);

    it('passes paths in the schema whose values fit', () => {
      const r = edit([
        { path: 'data.height.max', value: 30 },
        { path: 'data.sun', add: ['shade'] },
        { path: 'data.sun', remove: ['full-sun'] },
        { path: 'summary', value: 'A small tree for shade.' },
        { path: 'data.lifeCycle', value: null },
        { path: 'tags.use', value: 'street' },
      ]);
      expect(of(r, 'paths').filter((x) => x.status !== 'pass')).toEqual([]);
      expect(statuses(r)).toHaveLength(6);
    });

    it('fails a path the schema doesn\'t have', () => {
      const r = edit([{ path: 'data.colour', value: 'red' }, { path: 'data.height.tallest', value: 3 }]);
      expect(statuses(r)).toEqual(['fail', 'fail']);
      expect(of(r, 'paths')[1].message).toContain('data.height has no tallest');
      expect(r.rejected).toBe(false);
    });

    it('fails a value that doesn\'t fit, or a vocabulary value it doesn\'t know', () => {
      const r = edit([{ path: 'data.height.max', value: 'tall' }, { path: 'data.sun', add: ['moonlight'] }, { path: 'data.form', value: 'blob' }]);
      expect(statuses(r)).toEqual(['fail', 'fail', 'fail']);
      expect(of(r, 'paths')[1].message).toContain('item 1');
    });

    it('fails clearing a required field, a read-only one, a path into a list, and add on a non-list', () => {
      const r = edit([
        { path: 'data.genus', value: null },
        { path: 'data.sources', value: [] },
        { path: 'data.sun.0', value: 'shade' },
        { path: 'data.form', add: ['tree'] },
      ]);
      const m = of(r, 'paths').map((x) => x.message);
      expect(statuses(r)).toEqual(['fail', 'fail', 'fail', 'fail']);
      expect(m[0]).toContain('must have');
      expect(m[1]).toContain('read-only');
      expect(m[2]).toContain('is a list');
      expect(m[3]).toContain("isn't a list");
    });

    it('checks a field note\'s trait', () => {
      const note = (trait: string) => run(file({ kind: 'note', target: 'plant/acer-circinatum', fieldNotes: [{ topic: 'performance', note: 'x', trait }] }));
      expect(of(note('height'), 'paths')[0].status).toBe('pass');
      expect(of(note('soil.drainage'), 'paths')[0].status).toBe('pass');
      expect(of(note('wingspan'), 'paths')[0].status).toBe('fail');
      // In the schema, but not a trait: validation would reject the note once integrated.
      for (const t of ['genus', 'commonNames', 'hardiness.min', 'wetlandIndicator.AW', 'nativeRange.states']) expect(of(note(t), 'paths')[0].status, t).toBe('fail');
    });
  });

  describe('urls', () => {
    it('classes each URL by its host against the source registry', () => {
      const r = run(file({
        kind: 'edit', target: 'plant/acer-circinatum', basedOn: sha256(entryText(acerData)),
        changes: [
          { path: 'data.height.max', value: 30, basis: 'source', sourceUrl: 'https://plants.usda.gov/plant-profile/ACCI', note: 'x' },
          { path: 'data.spread.max', value: 25, basis: 'source', sourceUrl: 'https://www.example-nursery.com/acer', note: 'x' },
        ],
        comment: 'See also https://plants.sc.egov.usda.gov/x.',
      }));
      const u = of(r, 'urls');
      expect(u.map((x) => x.status)).toEqual(['pass', 'warn', 'pass']);
      expect(u[0].message).toContain('the registered source usda-plants');
      expect(u[1].message).toContain('example-nursery.com, which is no registered source');
      expect(u[2].message).toContain('https://plants.sc.egov.usda.gov/x is on');
    });

    it('checks a file\'s source page', () => {
      const r = run(file(photo([{ ...image('a.png', PNG), rights: 'third-party', sourceUrl: 'https://images.example.org/a' }]), { 'a.png': PNG }));
      expect(of(r, 'urls')).toEqual([expect.objectContaining({ status: 'warn' })]);
    });
  });
});
