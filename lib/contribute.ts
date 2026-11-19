/**
 * What a contribution form files (spec: submissions.md, Forms): building a
 * submission from what the person entered, what blocks it and what only
 * warns, reading pasted plant-list rows, and file names. Client-safe: the
 * form island uses it, and the tests check that every form's submission
 * validates against schemas/submission.schema.json.
 */
import type { Difference, Basis } from './submission';
import { ALLOWED, EXTENSIONS, LABEL, extension, type FileRole, type Sniffed } from './sniff';
import { resolveLine, type NameIndex } from './export';
import { cleanLine } from './workspace';
import type { PlantListItem } from './types';
import { url } from './site';

export type SubmissionKind = 'add' | 'edit' | 'photo' | 'note';
export type Rights = 'own-work' | 'organization-owned' | 'third-party';

/** The forms, by the `form` URL parameter of /contribute/. */
export type FormId = 'add' | 'edit' | 'photo' | 'note';

/** The types each form reaches from a page (spec: submissions.md, the forms table). Add and edit take any type. */
export const PHOTO_TYPES = ['plant', 'project'];
export const NOTE_TYPES = ['plant'];

export const BASES: { id: Basis; label: string; help: string }[] = [
  { id: 'observation', label: 'My observation', help: 'Your own professional experience.' },
  { id: 'source', label: 'A source', help: 'A published page or document; give its URL or a citation.' },
  { id: 'correction', label: 'A correction', help: 'A plain error, such as a misspelling.' },
];

export const RIGHTS: { id: Rights; label: string; help: string }[] = [
  { id: 'own-work', label: 'My own work', help: 'You took it, and grant it under the license you pick.' },
  { id: 'organization-owned', label: 'Owned by the organization', help: 'Taken for the organization; accepted only in the company copy.' },
  { id: 'third-party', label: 'Someone else’s', help: 'Give the page it came from; it is used only if that page states an allowed license.' },
];

export interface Submitter {
  name: string;
  role: string;
  email?: string;
}

/** A file's metadata as the submission lists it. */
export interface FileMeta {
  name: string;
  sha256: string;
  bytes: number;
  role: FileRole;
  rights?: Rights;
  license?: string;
  sourceUrl?: string;
  photographer?: string;
  takenAt?: string;
  place?: string;
  shows?: string;
  alt?: string;
}

/** A change as the form holds it: a difference with the basis and note the person gave it. */
export type ChangeInput = Difference & { basis?: Basis | ''; note?: string; sourceUrl?: string; citation?: string };

export interface FieldNoteInput {
  topic?: string;
  note?: string;
  region?: string;
  project?: string;
  trait?: string;
}

export interface SubmissionInput {
  kind: SubmissionKind;
  target: string;
  submitter: Partial<Submitter>;
  /** When it is filed; the id and submittedAt come from it. */
  now: Date;
  /** Three random bytes for the id's suffix. */
  random: Uint8Array;
  entry?: Record<string, unknown>;
  basis?: Basis | '';
  sourceUrl?: string;
  citation?: string;
  basedOn?: string;
  changes?: ChangeInput[];
  fieldNotes?: FieldNoteInput[];
  files?: FileMeta[];
  comment?: string;
  replyTo?: string;
  app?: { version?: string; libraryBuild?: string };
}

export interface Submission {
  schema: 1;
  id: string;
  submittedAt: string;
  submitter: Submitter;
  kind: SubmissionKind;
  target: string;
  entry?: Record<string, unknown>;
  basedOn?: string;
  basis?: Basis;
  sourceUrl?: string;
  citation?: string;
  changes?: (Difference & { basis: Basis; note: string; sourceUrl?: string; citation?: string })[];
  fieldNotes?: { topic: string; note: string; region?: string; project?: string; trait?: string }[];
  files?: FileMeta[];
  comment?: string;
  replyTo?: string;
  app?: { version?: string; libraryBuild?: string };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** `YYYY-MM-DDTHH:MM:SSZ`, to the second, in UTC. */
export function timestamp(now: Date): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}

/** A submission's id: its time, `YYYYMMDDTHHMMSSZ`, a hyphen, and six hex digits. Ids sort oldest first. */
export function submissionId(now: Date, random: Uint8Array): string {
  const hex = [...random.slice(0, 3)].map((b) => b.toString(16).padStart(2, '0')).join('').padEnd(6, '0');
  return `${timestamp(now).replace(/[-:]/g, '')}-${hex}`;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const oneLine = (v: unknown): string | undefined => text(v)?.replace(/\s*[\r\n]+\s*/g, ' ');

function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** A basis with its source: the URL and citation are kept only for a `source` basis. */
function withBasis(basis: Basis | '' | undefined, sourceUrl?: string, citation?: string) {
  const b = basis || undefined;
  return compact({ basis: b, sourceUrl: b === 'source' ? text(sourceUrl) : undefined, citation: b === 'source' ? text(citation) : undefined });
}

/**
 * The submission a form files: text trimmed, empty parts dropped, and only
 * the parts its kind takes. It validates against the submission schema when
 * `submissionProblems` finds nothing blocking.
 */
export function buildSubmission(input: SubmissionInput): Submission {
  const s: Submission = {
    schema: 1,
    id: submissionId(input.now, input.random),
    submittedAt: timestamp(input.now),
    submitter: compact({ name: oneLine(input.submitter.name) ?? '', role: oneLine(input.submitter.role) ?? '', email: text(input.submitter.email) }),
    kind: input.kind,
    target: input.target,
  };
  if (input.kind === 'add') {
    s.entry = input.entry ?? {};
    Object.assign(s, withBasis(input.basis, input.sourceUrl, input.citation));
  }
  if (input.kind === 'edit') {
    if (input.basedOn) s.basedOn = input.basedOn;
    s.changes = (input.changes ?? []).map((c) => {
      const { basis, note, sourceUrl, citation, ...diff } = c;
      return { ...diff, ...withBasis(basis, sourceUrl, citation), note: text(note) ?? '' } as NonNullable<Submission['changes']>[number];
    });
  }
  const notes = (input.fieldNotes ?? [])
    .map((n) => compact({ topic: n.topic ?? '', note: text(n.note) ?? '', region: n.region || undefined, project: text(n.project), trait: n.trait || undefined }))
    .filter((n) => n.topic || n.note);
  if (notes.length) s.fieldNotes = notes;
  const files = (input.files ?? []).map((f) => {
    const out = compact({ ...f, license: text(f.license), sourceUrl: text(f.sourceUrl), photographer: oneLine(f.photographer), takenAt: text(f.takenAt), place: oneLine(f.place), shows: text(f.shows), alt: oneLine(f.alt) });
    if (out.rights !== 'third-party') delete out.sourceUrl;
    return out;
  });
  if (files.length) s.files = files;
  const comment = text(input.comment);
  if (comment) s.comment = comment;
  if (input.replyTo) s.replyTo = input.replyTo;
  if (input.app) s.app = input.app;
  return s;
}

export interface Problems {
  /** What makes the submission unusable; the form won't file it until these are fixed. */
  blocking: string[];
  /** Missing or odd values the routine can clean up or ask about. */
  warnings: string[];
}

export interface CheckOptions {
  /** Each listed file's type by its content, by name. */
  sniffed?: Record<string, Sniffed | undefined>;
  maxBytes: Record<FileRole, number>;
  fixturesOnly: boolean;
  /** The ids of the fieldNoteTopic vocabulary. */
  topics: string[];
  /** A change's path as the form labels it ("Height: Max"); the path itself when absent. */
  label?: (path: string) => string;
}

const URL_RE = /^https?:\/\/\S+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const TARGET_RE = /^[a-z]+(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;

/**
 * Lenient at the door (spec: submissions.md, Forms): only what would make a
 * submission unusable blocks it (no target, no content, a claim with no
 * basis, a file with no rights basis, over the size limit, or of the wrong
 * type, or anything the submission schema would refuse). Everything else
 * is a warning.
 */
export function submissionProblems(s: Submission, o: CheckOptions): Problems {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!s.submitter.name) blocking.push('Give your name.');
  if (!s.submitter.role) blocking.push('Give your role.');
  if (s.submitter.name.length > 200 || s.submitter.role.length > 200) blocking.push('Your name and role must each be under 200 characters.');
  if (s.submitter.email && (!EMAIL_RE.test(s.submitter.email) || s.submitter.email.length > 200)) blocking.push('The email address doesn’t look like one; correct it or leave it blank.');
  const typeOnly = s.kind === 'add';
  if (!s.target || !TARGET_RE.test(s.target) || typeOnly === s.target.includes('/')) blocking.push(typeOnly ? 'Choose what kind of entry to add.' : 'Choose the entry this is about.');

  const sourceProblem = (what: string, url?: string, citation?: string) => {
    if (!url && !citation) blocking.push(`${what}: give the source’s URL or a citation.`);
    if (url && !URL_RE.test(url)) blocking.push(`${what}: the source URL must start with https:// or http://.`);
  };
  if (s.kind === 'add') {
    if (!s.entry || !Object.keys(s.entry).length) blocking.push('Fill in at least one field.');
    if (!s.basis) blocking.push('Say what this entry is based on.');
    if (s.basis === 'source') sourceProblem('The entry', s.sourceUrl, s.citation);
  }
  if (s.kind === 'edit') {
    if (!s.basedOn) blocking.push('The entry didn’t load, so there is nothing to compare an edit with.');
    if (!s.changes?.length) blocking.push('Change at least one value.');
    for (const c of s.changes ?? []) {
      const what = o.label?.(c.path) ?? c.path;
      if (!c.basis) blocking.push(`${what}: say what the change is based on.`);
      if (!c.note) blocking.push(`${what}: add a note saying why.`);
      if (c.basis === 'source') sourceProblem(what, c.sourceUrl, c.citation);
    }
  }
  if (s.kind === 'photo' && !s.files?.some((f) => f.role === 'image')) blocking.push('Add at least one photo.');
  if (s.kind === 'note' && !s.fieldNotes?.length) blocking.push('Write a field note.');
  (s.fieldNotes ?? []).forEach((n, i) => {
    const which = (s.fieldNotes?.length ?? 0) > 1 ? `Field note ${i + 1}` : 'The field note';
    if (!o.topics.includes(n.topic)) blocking.push(`${which}: choose a topic.`);
    if (!n.note) blocking.push(`${which}: write the note.`);
  });

  const names = new Set<string>();
  for (const f of s.files ?? []) {
    if (names.has(f.name)) blocking.push(`Two files are named ${f.name}.`);
    names.add(f.name);
    if (!f.rights) blocking.push(`${f.name}: say whose it is (the rights basis).`);
    if (f.rights === 'third-party') {
      if (!f.sourceUrl) blocking.push(`${f.name}: give the page it came from.`);
      else if (!URL_RE.test(f.sourceUrl)) blocking.push(`${f.name}: the page’s URL must start with https:// or http://.`);
    }
    const max = o.maxBytes[f.role];
    if (f.bytes > max) blocking.push(`${f.name} is ${megabytes(f.bytes)}, over the ${megabytes(max)} limit.`);
    if (f.bytes < 1) blocking.push(`${f.name} is empty.`);
    const kind = o.sniffed?.[f.name];
    const allowed = ALLOWED[f.role];
    if (!kind || !allowed.includes(kind)) {
      blocking.push(`${f.name} isn’t ${list(allowed.map((k) => LABEL[k]))}${kind ? ` (it is a ${LABEL[kind]} file)` : ''}.`);
    } else if (!EXTENSIONS[kind].includes(extension(f.name))) {
      warnings.push(`${f.name} is a ${LABEL[kind]} file, whatever its name says.`);
    }
    if (f.role === 'image') {
      if (!f.alt) warnings.push(`${f.name}: describe the photo for people who can’t see it (alt text).`);
      if (!f.shows) warnings.push(`${f.name}: say what the photo shows.`);
      if (f.rights === 'own-work' && !f.license) warnings.push(`${f.name}: pick a license for your photo; this library is open source.`);
      if (f.rights !== 'third-party' && !f.photographer) warnings.push(`${f.name}: say who took it.`);
    }
    if (f.rights === 'organization-owned' && o.fixturesOnly) warnings.push(`${f.name}: photos owned by the organization are accepted only in the company copy, not this open-source prototype.`);
  }
  return { blocking, warnings };
}

function megabytes(n: number): string {
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}

function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * A file name fit for the submission's folder (no folders, not hidden, not
 * submission.json or result.json, at most 200 characters) and not already
 * in `used`.
 */
export function safeFileName(name: string, used: ReadonlySet<string>): string {
  let base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^[.]+/, '');
  if (!base || base === 'submission.json' || base === 'result.json') base = `file-${base || 'upload'}`;
  if (base.length > 200) {
    const ext = extension(base);
    base = ext && ext.length < 10 ? `${base.slice(0, 199 - ext.length)}.${ext}` : base.slice(0, 200);
  }
  if (!used.has(base)) return base;
  const dot = base.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ''];
  for (let i = 2; ; i++) {
    const next = `${stem.slice(0, 190)}-${i}${ext}`;
    if (!used.has(next)) return next;
  }
}

export interface PasteImport {
  lines: PlantListItem[];
  /** Rows with no plant name, left out. */
  skipped: number;
}

const HEADER: Record<string, keyof PlantListItem> = {
  'botanical name': 'plant',
  plant: 'plant',
  name: 'plant',
  'scientific name': 'plant',
  quantity: 'quantity',
  qty: 'quantity',
  size: 'size',
  spacing: 'spacing',
  note: 'note',
  notes: 'note',
  remarks: 'note',
};

/**
 * Rows pasted from a spreadsheet as plant list lines. Cells are split on
 * tabs (a spreadsheet's copy), or on commas when a row has no tab. A first
 * row whose cells name the columns (Botanical name, Quantity, Size,
 * Spacing, Note, in any order) sets them; otherwise the first text cell is
 * the plant, the first whole number its quantity, and the remaining text
 * cells size, spacing, and note in that order. A name the library holds
 * becomes a ref to it; any other stays text.
 */
export function linesFromPaste(pasted: string, names: NameIndex): PasteImport {
  const rows = pasted
    .split(/\r?\n/)
    .filter((r) => r.trim())
    .map((r) => (r.includes('\t') ? r.split('\t') : r.split(',')).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
  if (!rows.length) return { lines: [], skipped: 0 };
  const header = rows[0].map((c) => HEADER[c.toLowerCase()]);
  const named = header.includes('plant');
  const lines: PlantListItem[] = [];
  let skipped = 0;
  for (const row of named ? rows.slice(1) : rows) {
    const raw: Record<string, string> = {};
    if (named) {
      row.forEach((c, i) => {
        const k = header[i];
        if (k && c && !raw[k]) raw[k] = c;
      });
    } else {
      const rest: string[] = [];
      for (const c of row) {
        if (!c) continue;
        if (!raw.quantity && raw.plant && /^\d+$/.test(c.replace(/,/g, ''))) raw.quantity = c.replace(/,/g, '');
        else if (!raw.plant && !/^\d+$/.test(c)) raw.plant = c;
        else if (!raw.quantity && /^\d+$/.test(c)) raw.quantity = c;
        else rest.push(c);
      }
      [raw.size, raw.spacing, raw.note] = rest;
    }
    const line = cleanLine(raw);
    if (line) lines.push(resolveLine(line, names));
    else skipped++;
  }
  return { lines, skipped };
}

/** The URL of a contribution form: `/contribute/?form=…` with its parameters (type, target, name, list). */
export function contributeUrl(params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return url(`contribute/${s ? `?${s}` : ''}`);
}
