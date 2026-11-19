/**
 * The inbox's mechanical checks (docs/submissions.md#mechanical-checks):
 * the facts about a submission that need no judgment. Node only.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readBundle } from './bundle';
import type { Config } from './config';
import type { LoadedEntry } from './content';
import type { NameParts } from './types';
import { botanicalName, fullName, normalizeName } from './names';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { formatErrors, type Schemas } from './schemas';
import { editDifferences, entryText, pathsOverlap } from './submission';
import { ALLOWED, EXTENSIONS, LABEL, extension, sniff, type FileRole } from './sniff';

export { ALLOWED, sniff, type FileRole, type Sniffed } from './sniff';

export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export type Status = 'pass' | 'warn' | 'fail';
export interface CheckResult {
  /** Which check: schema, files, file-type, target, based-on, duplicate, paths, urls. */
  check: string;
  status: Status;
  message: string;
  /** For a stale basedOn: the changed paths that touch a field changed since. */
  touched?: string[];
}

export interface CheckReport {
  id: string;
  results: CheckResult[];
  /** A failed schema, file, or file type check: the routine rejects the submission and goes no further. */
  rejected: boolean;
}

export interface CheckContext {
  config: Config;
  schemas: Schemas;
  entries: LoadedEntry[];
  /** Earlier texts of an entry file, newest first (git history in the script); for telling which fields changed since basedOn. */
  history?: (file: string) => string[];
  /** The folder holding the library's assets/ (the repo root, or a fixture library), for images it already holds. */
  dataRoot?: string;
  /** The processed/ folder, whose submissions' files are the originals of images already integrated. */
  processed?: string;
}

interface Change {
  path: string;
  value?: unknown;
  add?: unknown[];
  remove?: unknown[];
  note?: string;
  sourceUrl?: string;
  citation?: string;
}

interface Submission {
  id?: string;
  kind?: string;
  target?: string;
  basedOn?: string;
  entry?: Record<string, unknown>;
  sourceUrl?: string;
  citation?: string;
  comment?: string;
  changes?: Change[];
  fieldNotes?: { note?: string; trait?: string }[];
  files?: { name: string; sha256: string; bytes: number; role: FileRole; sourceUrl?: string }[];
}

/** Run the mechanical checks on one submission folder. */
export function checkSubmission(dir: string, ctx: CheckContext): CheckReport {
  const results: CheckResult[] = [];
  const add = (check: string, status: Status, message: string, extra: Partial<CheckResult> = {}) => results.push({ check, status, message, ...extra });
  const id = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;

  let sub: Submission;
  try {
    sub = JSON.parse(readFileSync(join(dir, 'submission.json'), 'utf8'));
  } catch (e) {
    add('schema', 'fail', `submission.json can't be read as JSON: ${(e as Error).message}`);
    return { id, results, rejected: true };
  }
  if (!ctx.schemas.submission(sub)) {
    for (const m of formatErrors(ctx.schemas.submission.errors)) add('schema', 'fail', m);
    return { id, results, rejected: true };
  }
  add('schema', 'pass', 'submission.json validates');
  if (sub.id !== id) add('schema', 'fail', `the folder is ${id} but the submission's id is ${sub.id}`);

  checkFiles(dir, sub, ctx.config, add);
  const targetOk = checkTarget(sub, ctx, add);
  if (targetOk) {
    checkDuplicate(sub, ctx, add);
    checkPaths(sub, ctx, add);
  }
  checkImageDuplicates(dir, sub, ctx, add);
  checkUrls(sub, ctx.config, add);

  return { id, results, rejected: results.some((r) => r.status === 'fail' && ['schema', 'files', 'file-type'].includes(r.check)) };
}

type Add = (check: string, status: Status, message: string, extra?: Partial<CheckResult>) => void;

function checkFiles(dir: string, sub: Submission, config: Config, add: Add): void {
  const listed = new Set<string>();
  for (const f of sub.files ?? []) {
    listed.add(f.name);
    const path = join(dir, f.name);
    if (!existsSync(path) || !statSync(path).isFile()) {
      add('files', 'fail', `${f.name} is listed but missing`);
      continue;
    }
    const b = readFileSync(path);
    if (b.length !== f.bytes) add('files', 'fail', `${f.name} is ${b.length} bytes, not the ${f.bytes} stated`);
    else if (sha256(b) !== f.sha256) add('files', 'fail', `${f.name} doesn't match its stated sha256`);
    else add('files', 'pass', `${f.name} is present with the stated size and hash`);

    const max = config.site.submissions.maxBytes[f.role];
    if (b.length > max) add('file-type', 'fail', `${f.name} is ${b.length} bytes, over the ${max} allowed for a file of role ${f.role}`);
    const kind = sniff(b);
    const allowed = ALLOWED[f.role];
    if (!kind || !allowed.includes(kind)) {
      const want = allowed.map((k) => LABEL[k]).join(', ');
      add('file-type', 'fail', `${f.name} is ${kind ? `a ${LABEL[kind]} file` : 'none of the allowed types'} by its content; a file of role ${f.role} must be ${want}`);
      continue;
    }
    if (!EXTENSIONS[kind].includes(extension(f.name))) add('file-type', 'warn', `${f.name} is a ${LABEL[kind]} file by its content, whatever its name says`);
    else add('file-type', 'pass', `${f.name} is a ${LABEL[kind]} file`);
  }
  for (const name of readdirSync(dir).sort()) {
    if (name !== 'submission.json' && name !== 'result.json' && !listed.has(name)) add('files', 'warn', `${name} is in the folder but not listed in the submission; it is not used`);
  }
}

/** The target check; true when the target's type exists and, for an edit, photo, or note, its entry is in the library. */
function checkTarget(sub: Submission, ctx: CheckContext, add: Add): boolean {
  const target = sub.target!;
  const [type, entryId] = target.split('/');
  if (!ctx.config.types[type]) return void add('target', 'fail', `${type} is not a type the library has`), false;
  if (!entryId) return add('target', 'pass', `adds a ${type}`), true;
  const found = ctx.entries.find((e) => e.entry.type === type && e.entry.id === entryId);
  if (!found) return void add('target', 'fail', `${target} is not in the library`), false;
  add('target', 'pass', `${target} is in the library`);
  if (sub.basedOn) checkBasedOn(sub, found, ctx, add);
  return true;
}

function checkBasedOn(sub: Submission, current: LoadedEntry, ctx: CheckContext, add: Add): void {
  if (sha256(entryText(current.entry)) === sub.basedOn) return void add('based-on', 'pass', 'basedOn is the current entry');
  const base = (ctx.history?.(current.file) ?? []).map(parse).find((e) => e !== undefined && sha256(entryText(e)) === sub.basedOn);
  if (!base) return void add('based-on', 'warn', `basedOn is stale and matches no earlier version of ${current.file}; merge every change by hand against the current entry`);
  const changedSince = editDifferences(base, current.entry as unknown as Record<string, unknown>).map((d) => d.path);
  const touched = [...new Set((sub.changes ?? []).map((c) => c.path).filter((p) => changedSince.some((q) => pathsOverlap(p, q))))];
  if (!touched.length) return void add('based-on', 'warn', `basedOn is stale; the entry has changed since (${changedSince.join(', ')}), but not on a path this edit changes`);
  add('based-on', 'warn', `basedOn is stale, and this edit changes ${touched.join(', ')}, which changed since the form was opened (${changedSince.join(', ')}); merge by hand against the current entry`, { touched });
}

// ---------------------------------------------------------------------------
// duplicate: an add that names an entry the library holds.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

/** The names a plant answers to, normalized, with what each is ("name", "synonym …"). */
function plantNames(d: Obj): { name: string; is: string }[] {
  const out: { name: string; is: string }[] = [];
  if (typeof d.genus === 'string' && d.genus.trim()) {
    const parts = d as unknown as NameParts;
    out.push({ name: normalizeName(botanicalName(parts)), is: `name ${botanicalName(parts)}` });
    if (parts.tradeName) out.push({ name: normalizeName(fullName(parts)), is: `name and trade name ${fullName(parts)}` });
  }
  for (const s of strings(d.synonyms)) out.push({ name: normalizeName(s), is: `synonym ${s}` });
  return out;
}

function checkDuplicate(sub: Submission, ctx: CheckContext, add: Add): void {
  if (sub.kind !== 'add') return;
  const type = sub.target!;
  const draft = sub.entry ?? {};
  const held = ctx.entries.filter((e) => e.entry.type === type);
  const hits: string[] = [];
  if (type === 'plant') {
    const mine = isObj(draft.data) ? plantNames(draft.data) : [];
    if (!mine.length) return void add('duplicate', 'warn', 'the draft plant has no name to compare with the library');
    for (const { entry } of held) {
      const theirs = plantNames(entry.data as unknown as Obj);
      for (const m of mine) {
        const t = theirs.find((x) => x.name === m.name);
        if (t) hits.push(`the draft's ${m.is} is the ${t.is} of plant/${entry.id}`);
      }
    }
  } else {
    const name = typeof draft.name === 'string' ? normalizeName(draft.name) : '';
    if (!name) return void add('duplicate', 'warn', `the draft ${type} has no name to compare with the library`);
    for (const { entry } of held) if (entry.name && normalizeName(entry.name) === name) hits.push(`the draft's name is the name of ${type}/${entry.id}`);
  }
  if (!hits.length) return void add('duplicate', 'pass', `no ${type} in the library has the draft's name${type === 'plant' ? ' or a synonym of it' : ''}`);
  for (const h of [...new Set(hits)]) add('duplicate', 'warn', `${h}; make it an edit of that entry, or return it`);
}

// ---------------------------------------------------------------------------
// duplicate (images): a submitted image the library already holds, by hash.

/** sha256 of each file under a folder, by path relative to `base`. */
function hashFiles(dir: string, base: string, out: Map<string, string>): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) hashFiles(p, base, out);
    else out.set(sha256(readFileSync(p)), relative(base, p).split(/[\\/]/).join('/'));
  }
}

function checkImageDuplicates(dir: string, sub: Submission, ctx: CheckContext, add: Add): void {
  const images = (sub.files ?? []).filter((f) => f.role === 'image');
  if (!images.length) return;
  const held = new Map<string, string>();
  const root = ctx.dataRoot ?? ctx.config.root;
  hashFiles(join(root, 'assets', 'images'), root, held);
  // An integrated image is re-encoded, so its original is found by the hash its processed submission lists.
  const here = dir.split(/[\\/]/).filter(Boolean).pop();
  if (ctx.processed && existsSync(ctx.processed)) {
    for (const id of readdirSync(ctx.processed).sort()) {
      if (id === here) continue;
      try {
        const s = JSON.parse(readFileSync(join(ctx.processed, id, 'submission.json'), 'utf8')) as Submission;
        for (const f of s.files ?? []) if (f.role === 'image' && !held.has(f.sha256)) held.set(f.sha256, `processed/${id}/${f.name}`);
      } catch {
        // An unreadable processed submission holds nothing to compare with.
      }
    }
  }
  for (const f of images) {
    const at = held.get(f.sha256);
    if (at) add('duplicate', 'warn', `${f.name} is the same file as ${at}, which the library already holds`);
    else add('duplicate', 'pass', `${f.name} is no image the library holds`);
  }
}

// ---------------------------------------------------------------------------
// paths: each changed path is in the type's schema, and each value fits it.

interface Node {
  /** The schema at this point, its $refs followed. */
  schema: Obj;
  /** Where it is, as a reference ajv can compile: <file>#<pointer>. */
  ref: string;
}

function schemaAt(ref: string, schemas: Schemas): Obj | undefined {
  const [file, pointer = ''] = ref.split('#');
  let at: unknown = schemas.ajv.getSchema(file)?.schema;
  for (const part of pointer.split('/').filter(Boolean)) at = isObj(at) ? at[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
  return isObj(at) ? at : undefined;
}

function follow(ref: string, schemas: Schemas): Node | undefined {
  let r = ref;
  let s = schemaAt(r, schemas);
  for (let i = 0; s && typeof s.$ref === 'string' && i < 10; i++) {
    const [file, pointer = ''] = (s.$ref as string).split('#');
    r = `${file || r.split('#')[0]}#${pointer}`;
    s = schemaAt(r, schemas);
  }
  return s ? { schema: s, ref: r } : undefined;
}

/** The schema a dotted entry path names, or why it names none. */
export function resolvePath(type: string, path: string, ctx: { config: Config; schemas: Schemas }): { node: Node; required: boolean } | { error: string } {
  const keys = path.split('.');
  const dataFile = ctx.config.types[type].schema.replace(/^schemas\//, '');
  let node = follow(keys[0] === 'data' ? `${dataFile}#` : `envelope.schema.json#/properties/${keys[0]}`, ctx.schemas);
  let required = false;
  if (keys[0] !== 'data') {
    const env = schemaAt('envelope.schema.json#', ctx.schemas)!;
    required = strings(env.required).includes(keys[0]);
  }
  for (let i = 1; i < keys.length; i++) {
    if (!node) break;
    const k = keys[i];
    const s = node.schema;
    const props = isObj(s.properties) ? s.properties : undefined;
    const sofar = keys.slice(0, i).join('.');
    if (s.readOnly === true) return { error: `${sofar} is read-only: it isn't changed by an edit` };
    if (props && k in props) {
      required = strings(s.required).includes(k);
      node = follow(`${node.ref}/properties/${k}`, ctx.schemas);
    } else if (isObj(s.additionalProperties)) {
      const names = isObj(s.propertyNames) ? follow(`${node.ref}/propertyNames`, ctx.schemas)?.schema : undefined;
      const allowed = !names || ((typeof names.pattern !== 'string' || new RegExp(names.pattern, 'u').test(k)) && (!Array.isArray(names.enum) || names.enum.includes(k)));
      if (!allowed) return { error: `${k} is not a key ${sofar} takes` };
      required = false;
      node = follow(`${node.ref}/additionalProperties`, ctx.schemas);
    } else if (s.type === 'array') {
      return { error: `${sofar} is a list; an edit changes it whole, or adds or removes items, not one item by path` };
    } else {
      return { error: `${sofar} has no ${k} in the ${type} schema` };
    }
  }
  if (!node) return { error: `${path} is not in the ${type} schema` };
  if (node.schema.readOnly === true) return { error: `${path} is read-only: it isn't changed by an edit` };
  return { node, required };
}

const compiled = new WeakMap<Schemas, Map<string, ValidateFunction>>();

function fits(ref: string, value: unknown, schemas: Schemas): string[] {
  let cache = compiled.get(schemas);
  if (!cache) compiled.set(schemas, (cache = new Map()));
  let v = cache.get(ref);
  if (!v) cache.set(ref, (v = schemas.ajv.getSchema(ref) ?? schemas.ajv.compile({ $ref: ref })));
  return v(value) ? [] : formatErrors(v.errors, 'value');
}

function checkPaths(sub: Submission, ctx: CheckContext, add: Add): void {
  const [type] = sub.target!.split('/');
  for (const c of sub.changes ?? []) {
    const at = resolvePath(type, c.path, ctx);
    if ('error' in at) {
      add('paths', 'fail', `${c.path}: ${at.error}`);
      continue;
    }
    const { node, required } = at;
    let problems: string[];
    if ('value' in c && c.value === null) {
      problems = required ? [`clears ${c.path}, which a ${type} must have`] : [];
    } else if ('value' in c) {
      problems = fits(node.ref, c.value, ctx.schemas);
    } else {
      const list = node.schema.type === 'array' || (Array.isArray(node.schema.oneOf) && (node.schema.oneOf as Obj[]).some((o) => o.type === 'array'));
      if (!list) problems = [`${c.path} isn't a list, so it takes a value, not items to add or remove`];
      else if (node.schema.type !== 'array') problems = []; // a tag that may be text or a list: either is fine
      else {
        const items = (c.add ?? c.remove ?? []) as unknown[];
        problems = c.add ? items.flatMap((x, i) => fits(`${node.ref}/items`, x, ctx.schemas).map((m) => m.replace(/^value/, `item ${i + 1}`))) : [];
      }
    }
    if (problems.length) for (const p of problems) add('paths', 'fail', `${c.path}: ${p}`);
    else add('paths', 'pass', `${c.path} is in the ${type} schema, and the change fits it`);
  }
  for (const n of sub.fieldNotes ?? []) {
    if (!n.trait) continue;
    if (type !== 'plant') {
      add('paths', 'fail', `a field note names the trait ${n.trait}, but only a plant's notes name a trait`);
      continue;
    }
    const at = resolvePath(type, `data.${n.trait}`, ctx);
    if ('error' in at) add('paths', 'fail', `field note trait ${n.trait}: ${at.error.replace(/^data\./, '')}`);
    else add('paths', 'pass', `field note trait ${n.trait} is a plant trait`);
  }
}

// ---------------------------------------------------------------------------
// urls: each URL, classed by its host against the source registry.

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/g;

/** The registered source whose `hosts` include a URL's host (or a parent of it), if any. */
export function classifyUrl(url: string, sources: Config['sources']): { host: string; source?: string } | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
  for (const [id, s] of Object.entries(sources)) {
    if ((s.hosts ?? []).some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`))) return { host, source: id };
  }
  return { host };
}

function checkUrls(sub: Submission, config: Config, add: Add): void {
  const found = new Map<string, string>(); // url → where
  const put = (url: string | undefined, where: string) => {
    const u = url?.replace(/[.,;:]+$/, '');
    if (u && !found.has(u)) found.set(u, where);
  };
  const scan = (text: string | undefined, where: string) => {
    for (const m of text?.match(URL_IN_TEXT) ?? []) put(m, where);
  };
  put(sub.sourceUrl, 'sourceUrl');
  scan(sub.citation, 'citation');
  sub.changes?.forEach((c) => {
    put(c.sourceUrl, `${c.path} sourceUrl`);
    scan(c.citation, `${c.path} citation`);
    scan(c.note, `${c.path} note`);
  });
  sub.files?.forEach((f) => put(f.sourceUrl, `${f.name} sourceUrl`));
  sub.fieldNotes?.forEach((n, i) => scan(n.note, `field note ${i + 1}`));
  scan(sub.comment, 'comment');
  for (const [url, where] of found) {
    const c = classifyUrl(url, config.sources);
    if (!c) add('urls', 'warn', `${where}: ${url} is not a URL that can be read`);
    else if (c.source) add('urls', 'pass', `${where}: ${url} is on ${c.host}, the registered source ${c.source}`);
    else add('urls', 'warn', `${where}: ${url} is on ${c.host}, which is no registered source's host`);
  }
}

function parse(text: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The submission folders in an inbox, oldest first (ids start with their time). */
export function listInbox(inbox: string): string[] {
  if (!existsSync(inbox)) return [];
  return readdirSync(inbox).filter((n) => !n.startsWith('.') && existsSync(join(inbox, n, 'submission.json'))).sort();
}

export function formatCheck(r: CheckReport): string {
  const lines = r.results.map((x) => `${x.status.padEnd(4)}  ${x.check.padEnd(9)}  ${x.message}`);
  lines.push(r.rejected ? `${r.id}: rejected by the mechanical checks` : `${r.id}: passes the mechanical checks${r.results.some((x) => x.status === 'warn') ? ', with warnings' : ''}`);
  return lines.join('\n');
}

export interface Imported {
  id: string;
  /** `imported`, or `skipped` when the inbox or processed/ already holds the id: a submission is written once. */
  status: 'imported' | 'skipped';
  files: number;
}

/**
 * Unpack a bundle into the inbox, one folder per submission
 * (docs/submissions.md#bundles). Each folder is written beside the inbox
 * and renamed into it, so a failed import leaves no half-written folder.
 * Throws on a malformed bundle before writing anything.
 */
export function importBundle(bytes: Uint8Array, dirs: { inbox: string; processed: string }): Imported[] {
  const subs = readBundle(bytes);
  mkdirSync(dirs.inbox, { recursive: true });
  return subs.map((s) => {
    if (existsSync(join(dirs.inbox, s.id)) || existsSync(join(dirs.processed, s.id))) return { id: s.id, status: 'skipped', files: s.files.length };
    const tmp = join(dirs.inbox, `.import-${s.id}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp);
    writeFileSync(join(tmp, 'submission.json'), s.submission);
    for (const f of s.files) writeFileSync(join(tmp, f.name), f.bytes);
    renameSync(tmp, join(dirs.inbox, s.id));
    return { id: s.id, status: 'imported', files: s.files.length };
  });
}
