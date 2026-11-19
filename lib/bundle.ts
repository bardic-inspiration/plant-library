/**
 * Submission bundles (docs/submissions.md#bundles): one or more submissions
 * with their files in one uncompressed tar file, laid out as the inbox is
 * (`<id>/submission.json`, `<id>/<file name>`). "Export" writes one in the
 * browser; `inbox import` reads one. Client-safe: bytes are Uint8Arrays.
 *
 * Only what a bundle needs is written or read: POSIX ustar headers, regular
 * files and folders, and a pax `path` record for a file name longer than a
 * ustar header holds (names go up to 200 characters). Anything else in a bundle (links, extended headers, a
 * path outside `<id>/<name>`) fails it, since a bundle is untrusted input.
 */

export interface BundleFile {
  name: string;
  bytes: Uint8Array;
}

export interface BundleSubmission {
  id: string;
  /** The text of submission.json, as filed. */
  submission: string;
  files: BundleFile[];
}

export const BUNDLE_TYPE = 'application/x-tar';
export const ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const BLOCK = 512;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/** The text a submission is filed as: two-space JSON and a newline. */
export const submissionText = (submission: unknown) => JSON.stringify(submission, null, 2) + '\n';

/** The bundle's file name for these submissions. */
export const bundleName = (ids: string[]) => (ids.length === 1 ? `submission-${ids[0]}.tar` : `submissions-${ids.length}.tar`);

/** A file name a bundle may hold beside submission.json: one plain path segment. */
export function plainFileName(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..' && !name.startsWith('.') && !/[\\/\u0000-\u001f\u007f]/.test(name) && name.length <= 200;
}

function octal(view: Uint8Array, at: number, width: number, n: number): void {
  const s = n.toString(8).padStart(width - 1, '0');
  if (s.length > width - 1) throw new Error(`${n} doesn't fit a tar header field`);
  view.set(enc.encode(s), at);
  view[at + width - 1] = 0;
}

function header(prefix: string, name: string, size: number, type: '0' | '5' | 'x', mtime: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  const n = enc.encode(name);
  const p = enc.encode(prefix);
  if (n.length > 100 || p.length > 155) throw new Error(`${prefix}/${name} is too long for a bundle`);
  h.set(n, 0);
  octal(h, 100, 8, type === '5' ? 0o755 : 0o644);
  octal(h, 108, 8, 0);
  octal(h, 116, 8, 0);
  octal(h, 124, 12, size);
  octal(h, 136, 12, mtime);
  h.fill(0x20, 148, 156);
  h[156] = type.charCodeAt(0);
  h.set(enc.encode('ustar\u000000'), 257);
  h.set(p, 345);
  let sum = 0;
  for (const b of h) sum += b;
  octal(h, 148, 7, sum);
  h[155] = 0x20;
  return h;
}

const padded = (n: number) => Math.ceil(n / BLOCK) * BLOCK;

function block(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(padded(bytes.length));
  out.set(bytes);
  return out;
}

/** One pax record, `<length> <key>=<value>\n`, whose length counts itself. */
function pax(key: string, value: string): Uint8Array {
  const rest = enc.encode(` ${key}=${value}\n`).length;
  let len = rest + 1;
  while (String(len).length + rest !== len) len = String(len).length + rest;
  return enc.encode(`${len} ${key}=${value}\n`);
}

/** A pax extended header's `path`; any other key fails the bundle. */
function paxPath(bytes: Uint8Array): string {
  let path: string | undefined;
  let at = 0;
  while (at < bytes.length) {
    const space = bytes.indexOf(0x20, at);
    const len = space > at ? Number(dec.decode(bytes.subarray(at, space))) : NaN;
    if (!Number.isInteger(len) || len <= space - at || at + len > bytes.length || bytes[at + len - 1] !== 0x0a) throw new Error('a bundle has a malformed pax header');
    const record = dec.decode(bytes.subarray(space + 1, at + len - 1));
    const eq = record.indexOf('=');
    if (eq < 1 || record.slice(0, eq) !== 'path') throw new Error(`a bundle's pax header sets ${eq < 1 ? 'nothing' : record.slice(0, eq)}, which bundles don't use`);
    path = record.slice(eq + 1);
    at += len;
  }
  if (path === undefined) throw new Error('a bundle has a pax header with no path');
  return path;
}

/** Write submissions and their files as one bundle. */
export function writeBundle(subs: BundleSubmission[], mtime = 0): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  for (const s of subs) {
    if (!ID_PATTERN.test(s.id)) throw new Error(`${s.id} is not a submission id`);
    parts.push(header('', `${s.id}/`, 0, '5', mtime));
    const files = [{ name: 'submission.json', bytes: enc.encode(s.submission) }, ...s.files];
    const seen = new Set<string>();
    for (const f of files) {
      if (!plainFileName(f.name) || seen.has(f.name)) throw new Error(`${f.name} can't go in a bundle`);
      seen.add(f.name);
      if (enc.encode(f.name).length > 100) {
        const rec = pax('path', `${s.id}/${f.name}`);
        parts.push(header(s.id, 'PaxHeader', rec.length, 'x', mtime), block(rec));
        parts.push(header(s.id, 'long-name', f.bytes.length, '0', mtime));
      } else parts.push(header(s.id, f.name, f.bytes.length, '0', mtime));
      parts.push(block(f.bytes));
    }
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function field(h: Uint8Array, at: number, width: number): string {
  const raw = h.subarray(at, at + width);
  const end = raw.indexOf(0);
  return dec.decode(end < 0 ? raw : raw.subarray(0, end));
}

function readOctal(h: Uint8Array, at: number, width: number, what: string): number {
  const s = field(h, at, width).trim();
  if (!/^[0-7]+$/.test(s)) throw new Error(`a bundle header's ${what} isn't a number`);
  return parseInt(s, 8);
}

/** Read a bundle. Throws, naming the problem, on anything that isn't a well-formed bundle of submissions. */
export function readBundle(bytes: Uint8Array): BundleSubmission[] {
  const byId = new Map<string, { submission?: string; files: BundleFile[]; names: Set<string> }>();
  let at = 0;
  let ended = false;
  let longPath: string | undefined;
  while (at + BLOCK <= bytes.length) {
    const h = bytes.subarray(at, at + BLOCK);
    if (h.every((b) => b === 0)) {
      ended = true;
      break;
    }
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
    if (readOctal(h, 148, 8, 'checksum') !== sum) throw new Error(`the bundle is damaged: a header's checksum doesn't match, at byte ${at}`);
    if (field(h, 257, 6) !== 'ustar') throw new Error('the bundle is not a ustar file');
    const prefix = field(h, 345, 155);
    const size = readOctal(h, 124, 12, 'size');
    const type = String.fromCharCode(h[156] || 0x30);
    const body = at + BLOCK;
    if (body + size > bytes.length) throw new Error('the bundle is cut short');
    at = body + padded(size);
    if (type === 'x') {
      if (longPath !== undefined) throw new Error('a bundle has two pax headers in a row');
      longPath = paxPath(bytes.subarray(body, body + size));
      continue;
    }
    const path = longPath ?? (prefix ? `${prefix}/` : '') + field(h, 0, 100);
    longPath = undefined;

    const parts = path.replace(/\/$/, '').split('/');
    const id = parts[0];
    if (!ID_PATTERN.test(id)) throw new Error(`${path} is not inside a submission folder`);
    const sub = byId.get(id) ?? { files: [], names: new Set<string>() };
    byId.set(id, sub);
    if (type === '5') {
      if (parts.length !== 1) throw new Error(`${path}: a submission folder holds files only`);
      continue;
    }
    if (type !== '0') throw new Error(`${path} is not a plain file`);
    const name = parts[1];
    if (parts.length !== 2 || !plainFileName(name)) throw new Error(`${path} is not a plain file name in a submission folder`);
    if (sub.names.has(name)) throw new Error(`${path} is in the bundle twice`);
    sub.names.add(name);
    const content = bytes.slice(body, body + size);
    if (name === 'submission.json') {
      try {
        sub.submission = dec.decode(content);
      } catch {
        throw new Error(`${path} is not UTF-8 text`);
      }
    } else sub.files.push({ name, bytes: content });
  }
  if (longPath !== undefined) throw new Error('a bundle ends after a pax header');
  if (!ended) throw new Error('the bundle is cut short: it has no end marker');
  if (!byId.size) throw new Error('the bundle holds no submissions');
  return [...byId].map(([id, s]) => {
    if (s.submission === undefined) throw new Error(`${id} has no submission.json`);
    return { id, submission: s.submission, files: s.files };
  });
}
