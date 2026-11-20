import { describe, expect, it } from 'vitest';
import { buildSubmission, linesFromPaste, safeFileName, submissionId, submissionProblems, type CheckOptions, type FileMeta, type SubmissionInput } from '../lib/contribute';
import { defFields, entryFields, fieldWarnings, flatFields, humanize, prune, setPath, traitOptions, type Field } from '../lib/form';
import { rawSchemas } from '../lib/schemas';
import { applyDifferences, editDifferences, entryHash } from '../lib/submission';
import { nameIndex } from '../lib/export';
import { CITED_TRAITS, TRAIT_PARENTS } from '../lib/traits';
import { sniff } from '../lib/sniff';
import { clone, entry, fixtureEntries, ROOT, setup } from './helpers';

const { config, schemas } = setup();
const ctx = { schemas: rawSchemas(ROOT), vocab: config.vocab };
const fields = (type: string, fixturesOnly = true) => entryFields(type, config.types[type], ctx, fixturesOnly);
const paths = (fs: Field[]) => flatFields(fs).map((f) => f.path);
const find = (fs: Field[], path: string) => flatFields(fs).find((f) => f.path === path);
const entries = fixtureEntries();
const acer = entry(entries, 'plant/acer-circinatum').entry as unknown as Record<string, unknown>;

const errors = (s: unknown) => (schemas.submission(s), JSON.stringify(schemas.submission.errors));
const NOW = new Date(Date.UTC(2026, 10, 19, 18, 4, 22));
const RANDOM = new Uint8Array([0x7f, 0x3a, 0x9c]);
const who = { name: 'Pat Example', role: 'Landscape architect' };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const opts: CheckOptions = { maxBytes: config.site.submissions.maxBytes, fixturesOnly: true, topics: ['performance', 'establishment', 'caution'], sniffed: {} };
const input = (over: Partial<SubmissionInput>): SubmissionInput => ({ kind: 'add', target: 'plant', submitter: who, now: NOW, random: RANDOM, ...over });

describe('form fields from the schemas', () => {
  it('a plant form has its data fields in schema order, and no name (plants are named by their data)', () => {
    const f = fields('plant');
    expect(f[0].path).toBe('summary');
    expect(paths(f)).not.toContain('name');
    expect(paths(f)).toEqual(expect.arrayContaining(['data.genus', 'data.height.min', 'data.soil.ph.max', 'data.bloom.months.start', 'data.wetlandIndicator.WMVC']));
  });

  it('leaves off read-only fields: a plant\'s images and sources', () => {
    expect(paths(fields('plant')).some((p) => p.startsWith('data.images') || p.startsWith('data.sources'))).toBe(false);
  });

  it('leaves off proprietary fields while fixturesOnly is on, and offers them when it is off', () => {
    expect(paths(fields('project'))).not.toContain('data.client');
    expect(paths(fields('project'))).not.toContain('data.constructionBudget');
    expect(paths(fields('project', false))).toEqual(expect.arrayContaining(['data.client', 'data.constructionBudget']));
  });

  it('takes enumerations from the vocabulary, labels from titles, facets, or the key, and units from facets', () => {
    const f = fields('plant');
    const form = find(f, 'data.form');
    expect(form?.kind).toBe('choice');
    expect(form?.kind === 'choice' && form.options.find((o) => o.id === 'shrub')?.label).toBe('Shrub');
    expect(find(f, 'data.sun')?.kind).toBe('choices');
    expect(find(f, 'data.commonNames')?.kind).toBe('strings');
    expect(find(f, 'data.hybrid')?.kind).toBe('boolean');
    expect(find(f, 'data.usdaSymbol')?.label).toBe('USDA symbol');
    expect(find(f, 'data.soil.texture')?.label).toBe('Texture');
    expect(find(f, 'data.growthRate')?.label).toBe('Growth rate');
    const height = find(f, 'data.height');
    expect(height?.kind === 'group' && height.unit).toBe('ft');
    const acres = find(fields('project'), 'data.sizeAcres');
    expect(acres?.kind === 'number' && acres.unit).toBe('acres');
    expect(humanize('landscapeArchitect')).toBe('Landscape architect');
  });

  it('marks required fields, and a project\'s and a palette\'s plant lists', () => {
    const f = fields('project');
    expect(find(f, 'data.landscapeArchitect')?.required).toBe(true);
    expect(find(f, 'name')?.required).toBe(true);
    const list = find(f, 'data.plantList');
    expect(list?.kind === 'plantList' && list.quantityRequired).toBe(true);
    const pal = find(fields('palette'), 'data.plantList');
    expect(pal?.kind === 'plantList' && pal.quantityRequired).toBe(false);
    expect(paths(fields('palette'))).toEqual(expect.arrayContaining(['data.site.sun', 'data.site.soil.drainage', 'data.site.location.lat']));
  });

  it('a field note\'s fields come from the submission schema, and its traits from the plant form', () => {
    const note = defFields('fieldNote', ctx);
    expect(note.map((f) => f.key)).toEqual(['topic', 'note', 'region', 'project', 'trait']);
    expect(note[0].kind).toBe('choice');
    const options = traitOptions(fields('plant'));
    const traits = options.map((o) => o.id);
    expect(traits).toEqual(expect.arrayContaining(['height', 'soil', 'soil.drainage', 'soil.ph', 'bloom', 'bloom.months', 'tolerates', 'hardiness', 'wetlandIndicator', 'nativeRange']));
    // The picker offers exactly what validation takes (lib/traits.ts), no name parts or pieces of a range.
    expect([...traits].sort()).toEqual([...Object.keys(CITED_TRAITS), ...Object.keys(TRAIT_PARENTS)].sort());
    expect(options.find((o) => o.id === 'soil.drainage')?.label).toMatch(/^Soil: /);
  });

  it('warns on what is missing or odd, without refusing it', () => {
    const f = fields('plant');
    let d = setPath({}, 'data.genus', 'acer');
    d = setPath(d, 'data.height', { min: 20, max: 10 });
    d = setPath(d, 'data.soil.ph', { min: 'six' });
    const w = fieldWarnings(f, d).map((x) => x.path);
    expect(w).toEqual(expect.arrayContaining(['summary', 'data.genus', 'data.commonNames', 'data.height', 'data.soil.ph.min', 'data.soil.ph.max']));
    // An optional group left empty asks for nothing inside it.
    expect(w).not.toContain('data.bloom.months.start');
  });

  it('prune drops empty strings, lists, and objects', () => {
    expect(prune({ a: ' ', b: [], c: { d: '' }, e: [' x ', ''], f: 0 })).toEqual({ e: ['x'], f: 0 });
    expect(prune({})).toBeUndefined();
    // What the entry already held stays, empty or not.
    expect(prune({ a: { list: [] }, b: '' }, { a: { list: [] }, b: 'x' })).toEqual({ a: { list: [] } });
  });
});

describe('each form files a submission that validates', () => {
  it('Add plant, with a source as its basis and a photo', () => {
    const entry = prune(setPath(setPath({ summary: 'A small maple. ' }, 'data.genus', 'Acer'), 'data.commonNames', ['Vine maple', ''])) as Record<string, unknown>;
    const files: FileMeta[] = [{ name: 'maple.png', sha256: 'a'.repeat(64), bytes: 12, role: 'image', rights: 'own-work', license: 'CC-BY-4.0', photographer: 'Pat', alt: 'A vine maple', shows: 'habit' }];
    const s = buildSubmission(input({ entry, basis: 'source', sourceUrl: 'https://example.org/acer', citation: '', files }));
    expect(errors(s)).toBe('null');
    expect(s.id).toBe('20261119T180422Z-7f3a9c');
    expect(s.entry).toEqual({ summary: 'A small maple.', data: { genus: 'Acer', commonNames: ['Vine maple'] } });
    expect(submissionProblems(s, { ...opts, sniffed: { 'maple.png': sniff(PNG) } }).blocking).toEqual([]);
  });

  it('Add project, with a plant list picked and pasted, and an attached schedule', () => {
    const names = nameIndex([{ key: 'plant/acer-circinatum', botanicalName: 'Acer circinatum' }]);
    const pasted = linesFromPaste('Acer circinatum\t12\t#5\nNotaplant nonsuch\t3', names).lines;
    const entry = { name: 'Fictional Park', summary: 'A made-up park.', data: { landscapeArchitect: 'Example Studio', location: { lat: 47.6, lon: -122.3 }, plantList: pasted } };
    const files: FileMeta[] = [{ name: 'schedule.csv', sha256: 'b'.repeat(64), bytes: 40, role: 'plant-list', rights: 'organization-owned' }];
    const s = buildSubmission(input({ target: 'project', entry, basis: 'observation', files }));
    expect(errors(s)).toBe('null');
    expect(s.entry?.data).toMatchObject({ plantList: [{ plant: { ref: 'plant/acer-circinatum' }, quantity: 12, size: '#5' }, { plant: 'Notaplant nonsuch', quantity: 3 }] });
    const p = submissionProblems(s, { ...opts, sniffed: { 'schedule.csv': 'csv' } });
    expect(p.blocking).toEqual([]);
  });

  it('Submit palette', () => {
    const s = buildSubmission(input({ target: 'palette', entry: { name: 'Dry shade', data: { plantList: [{ plant: { ref: 'plant/mahonia-nervosa' } }] } }, basis: 'observation' }));
    expect(errors(s)).toBe('null');
    expect(submissionProblems(s, opts).blocking).toEqual([]);
  });

  it('Suggest an edit: exactly the fields changed, each with its basis, and basedOn the entry\'s hash', async () => {
    let after = clone(acer);
    after = setPath(after, 'data.height.max', 30);
    after = setPath(after, 'data.tolerates', [...((acer.data as { tolerates?: string[] }).tolerates ?? []), 'compaction']);
    after = setPath(after, 'summary', `${acer.summary as string}  `);
    const diffs = editDifferences(acer, prune(after, acer) as Record<string, unknown>);
    expect(diffs.map((d) => d.path)).toEqual(['data.height.max', 'data.tolerates']);
    const basedOn = await entryHash(acer);
    const s = buildSubmission(
      input({
        kind: 'edit',
        target: 'plant/acer-circinatum',
        basedOn,
        changes: [
          { ...diffs[0], basis: 'observation', note: 'Reaches 30 ft in irrigated beds.', sourceUrl: 'https://ignored.example' },
          { ...diffs[1], basis: 'source', note: 'Listed as tolerant.', sourceUrl: 'https://example.org/acer' },
        ],
      }),
    );
    expect(errors(s)).toBe('null');
    expect(s.changes?.map(({ basis, note, sourceUrl, citation, ...d }) => (void basis, void note, void sourceUrl, void citation, d))).toEqual(diffs);
    // A source URL is kept only on a sourced change.
    expect(s.changes?.[0].sourceUrl).toBeUndefined();
    expect(applyDifferences(acer, s.changes!)).toEqual(prune(after, acer));
    expect(submissionProblems(s, opts).blocking).toEqual([]);
  });

  it('Add photo, from a third party', () => {
    const files: FileMeta[] = [{ name: 'IMG_1.png', sha256: 'c'.repeat(64), bytes: 12, role: 'image', rights: 'third-party', sourceUrl: 'https://commons.example/File:Acer.png', alt: 'Leaves', shows: 'foliage' }];
    const s = buildSubmission(input({ kind: 'photo', target: 'plant/acer-circinatum', files }));
    expect(errors(s)).toBe('null');
    expect(submissionProblems(s, { ...opts, sniffed: { 'IMG_1.png': 'png' } }).blocking).toEqual([]);
  });

  it('Add field note, dropping a note left blank', () => {
    const s = buildSubmission(input({ kind: 'note', target: 'plant/acer-circinatum', fieldNotes: [{ topic: 'establishment', note: 'Slow in full sun.', region: 'WA', trait: 'height' }, {}] }));
    expect(errors(s)).toBe('null');
    expect(s.fieldNotes).toHaveLength(1);
    expect(submissionProblems(s, opts).blocking).toEqual([]);
  });
});

describe('lenient at the door: what blocks a submission', () => {
  it('no target, no content, no basis, no name', () => {
    const p = submissionProblems(buildSubmission(input({ target: '', submitter: {}, entry: {} })), opts).blocking.join(' ');
    expect(p).toMatch(/your name/);
    expect(p).toMatch(/your role/);
    expect(p).toMatch(/kind of entry/);
    expect(p).toMatch(/at least one field/);
    expect(p).toMatch(/based on/);
  });

  it('an edit\'s change with no basis or note, or a source with nothing to find it by', () => {
    const s = buildSubmission(input({ kind: 'edit', target: 'plant/acer-circinatum', basedOn: 'a'.repeat(64), changes: [{ path: 'data.height.max', value: 30 }, { path: 'summary', value: 'x', basis: 'source', note: 'because' }] }));
    const p = submissionProblems(s, opts).blocking;
    expect(p).toEqual(['data.height.max: say what the change is based on.', 'data.height.max: add a note saying why.', 'summary: give the source’s URL or a citation.']);
    expect(errors(s)).not.toBe('null');
  });

  it('a file with no rights basis, over the size limit, or not of its role\'s type by content', () => {
    const files: FileMeta[] = [
      { name: 'a.jpg', sha256: 'a'.repeat(64), bytes: 10, role: 'image' },
      { name: 'b.png', sha256: 'b'.repeat(64), bytes: opts.maxBytes.image + 1, role: 'image', rights: 'own-work' },
      { name: 'c.jpg', sha256: 'c'.repeat(64), bytes: 10, role: 'image', rights: 'third-party' },
    ];
    const s = buildSubmission(input({ kind: 'photo', target: 'plant/acer-circinatum', files }));
    const p = submissionProblems(s, { ...opts, sniffed: { 'a.jpg': 'jpeg', 'b.png': 'png', 'c.jpg': 'pdf' } }).blocking.join(' ');
    expect(p).toMatch(/a\.jpg: say whose it is/);
    expect(p).toMatch(/b\.png is .* over the .* limit/);
    expect(p).toMatch(/c\.jpg: give the page it came from/);
    expect(p).toMatch(/c\.jpg isn’t JPEG, PNG or WebP \(it is a PDF file\)/);
  });

  it('warns, without blocking, on missing photo metadata and a name that says another type', () => {
    const files: FileMeta[] = [{ name: 'photo.jpg', sha256: 'a'.repeat(64), bytes: 10, role: 'image', rights: 'organization-owned' }];
    const p = submissionProblems(buildSubmission(input({ kind: 'photo', target: 'plant/acer-circinatum', files })), { ...opts, sniffed: { 'photo.jpg': 'png' } });
    expect(p.blocking).toEqual([]);
    expect(p.warnings.join(' ')).toMatch(/alt text/);
    expect(p.warnings.join(' ')).toMatch(/a PNG file, whatever its name says/);
    expect(p.warnings.join(' ')).toMatch(/only in the company copy/);
  });
});

describe('helpers', () => {
  it('ids are the time and six hex digits, and sort oldest first', () => {
    expect(submissionId(NOW, RANDOM)).toMatch(/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/);
    expect(submissionId(new Date(Date.UTC(2026, 0, 1)), new Uint8Array([255, 255, 255])) < submissionId(NOW, new Uint8Array([0, 0, 0]))).toBe(true);
  });

  it('file names fit the submission folder and don\'t collide', () => {
    expect(safeFileName('../../etc/passwd', new Set())).toBe('passwd');
    expect(safeFileName('.hidden.jpg', new Set())).toBe('hidden.jpg');
    expect(safeFileName('submission.json', new Set())).toBe('file-submission.json');
    expect(safeFileName('IMG.jpg', new Set(['IMG.jpg', 'IMG-2.jpg']))).toBe('IMG-3.jpg');
    expect(safeFileName(`${'a'.repeat(300)}.jpg`, new Set())).toHaveLength(200);
  });

  it('pasted rows: by a header row, or by position, with names the library holds as refs', () => {
    const names = nameIndex([{ key: 'plant/acer-circinatum', botanicalName: 'Acer circinatum' }]);
    expect(linesFromPaste('Qty\tBotanical name\tSize\n5\tacer circinatum\t#2\n\t\t\n7\t\t', names)).toEqual({ lines: [{ plant: { ref: 'plant/acer-circinatum' }, quantity: 5, size: '#2' }], skipped: 1 });
    expect(linesFromPaste('Mystery plant, 3, 1 gal, 18 in o.c., near path', names).lines).toEqual([{ plant: 'Mystery plant', quantity: 3, size: '1 gal', spacing: '18 in o.c.', note: 'near path' }]);
    expect(linesFromPaste('12\tAcer circinatum', names).lines).toEqual([{ plant: { ref: 'plant/acer-circinatum' }, quantity: 12 }]);
    const withSynonym = nameIndex([{ key: 'plant/mahonia-aquifolium', botanicalName: 'Mahonia aquifolium', synonyms: ['Berberis aquifolium'] }]);
    expect(linesFromPaste('Berberis aquifolium\t4', withSynonym).lines).toEqual([{ plant: { ref: 'plant/mahonia-aquifolium' }, quantity: 4 }]);
  });
});

describe('an edit opened on a valid entry', () => {
  it('has no field warnings before anything changes', () => {
    for (const e of fixtureEntries()) {
      const w = fieldWarnings(fields(e.entry.type), e.entry);
      expect(w, `${e.entry.type}/${e.entry.id}`).toEqual([]);
    }
  });
});

describe('descriptions', () => {
  it('drop references to the repo\'s files', () => {
    const loc = find(fields('project'), 'data.location');
    expect(loc?.description).toBe('WGS 84, decimal degrees, at most 5 decimal places; must fall inside WA, OR, or CA.');
    expect(find(fields('project'), 'description')?.description).toBe('Text in the markdown subset.');
  });
});

describe('an add\'s basis in the submission schema', () => {
  it('is allowed only on an add, and a source needs a URL or citation', () => {
    const add = buildSubmission(input({ entry: { summary: 'x' }, basis: 'source', citation: 'Flora of the PNW, p. 12' }));
    expect(errors(add)).toBe('null');
    expect(errors({ ...add, citation: undefined })).not.toBe('null');
    const note = buildSubmission(input({ kind: 'note', target: 'plant/acer-circinatum', fieldNotes: [{ topic: 'design', note: 'Good.' }] }));
    expect(errors({ ...note, basis: 'observation' })).not.toBe('null');
  });
});
