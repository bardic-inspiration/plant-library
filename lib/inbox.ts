/**
 * The inbox's mechanical checks (docs/submissions.md#mechanical-checks):
 * the facts about a submission that need no judgment. Node only.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
import type { LoadedEntry } from './content';
import { formatErrors, type Schemas } from './schemas';
import { editDifferences, entryText, pathsOverlap } from './submission';

export type FileRole = 'image' | 'plant-list' | 'supporting';
export type Sniffed = 'jpeg' | 'png' | 'webp' | 'pdf' | 'xlsx' | 'csv';

/** What a file of each role may be, by its content. */
export const ALLOWED: Record<FileRole, Sniffed[]> = {
  image: ['jpeg', 'png', 'webp'],
  'plant-list': ['pdf', 'csv', 'xlsx'],
  supporting: ['jpeg', 'png', 'webp', 'pdf', 'csv', 'xlsx'],
};

const LABEL: Record<Sniffed, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', pdf: 'PDF', xlsx: 'XLSX', csv: 'CSV' };
const EXTENSIONS: Record<Sniffed, string[]> = { jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'], pdf: ['pdf'], xlsx: ['xlsx'], csv: ['csv'] };

const startsWith = (b: Buffer, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A file's type by its content, never its name; undefined when it is none of the allowed types. */
export function sniff(b: Buffer): Sniffed | undefined {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(b, ascii('%PDF-'))) return 'pdf';
  // An XLSX file is a zip whose entry names (stored uncompressed) include the workbook part.
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return b.includes('xl/workbook.xml') ? 'xlsx' : undefined;
  // CSV is text: UTF-8 with no control characters besides tab and line ends, and a separator.
  if (b.length && isText(b) && /[,;\t]/.test(b.toString('utf8'))) return 'csv';
  return undefined;
}

function isText(b: Buffer): boolean {
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return false;
  }
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
}

export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export type Status = 'pass' | 'warn' | 'fail';
export interface CheckResult {
  /** Which check: schema, files, file-type, target, based-on. */
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
}

interface Submission {
  id?: string;
  kind?: string;
  target?: string;
  basedOn?: string;
  changes?: { path: string }[];
  files?: { name: string; sha256: string; bytes: number; role: FileRole }[];
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
  checkTarget(sub, ctx, add);

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
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
    if (!EXTENSIONS[kind].includes(ext)) add('file-type', 'warn', `${f.name} is a ${LABEL[kind]} file by its content, whatever its name says`);
    else add('file-type', 'pass', `${f.name} is a ${LABEL[kind]} file`);
  }
  for (const name of readdirSync(dir).sort()) {
    if (name !== 'submission.json' && name !== 'result.json' && !listed.has(name)) add('files', 'warn', `${name} is in the folder but not listed in the submission; it is not used`);
  }
}

function checkTarget(sub: Submission, ctx: CheckContext, add: Add): void {
  const target = sub.target!;
  const [type, entryId] = target.split('/');
  if (!ctx.config.types[type]) return void add('target', 'fail', `${type} is not a type the library has`);
  if (!entryId) return void add('target', 'pass', `adds a ${type}`);
  const found = ctx.entries.find((e) => e.entry.type === type && e.entry.id === entryId);
  if (!found) return void add('target', 'fail', `${target} is not in the library`);
  add('target', 'pass', `${target} is in the library`);
  if (sub.basedOn) checkBasedOn(sub, found, ctx, add);
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
  return readdirSync(inbox).filter((n) => existsSync(join(inbox, n, 'submission.json'))).sort();
}

export function formatCheck(r: CheckReport): string {
  const lines = r.results.map((x) => `${x.status.padEnd(4)}  ${x.check.padEnd(9)}  ${x.message}`);
  lines.push(r.rejected ? `${r.id}: rejected by the mechanical checks` : `${r.id}: passes the mechanical checks${r.results.some((x) => x.status === 'warn') ? ', with warnings' : ''}`);
  return lines.join('\n');
}
