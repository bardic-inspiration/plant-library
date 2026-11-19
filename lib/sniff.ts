/**
 * A file's type by its content, never its name: what the inbox's file-type
 * check and the contribution forms both use (docs/submissions.md).
 * Client-safe: works on any Uint8Array, a Node Buffer included.
 */

export type FileRole = 'image' | 'plant-list' | 'supporting';
export type Sniffed = 'jpeg' | 'png' | 'webp' | 'pdf' | 'xlsx' | 'csv';

/** What a file of each role may be, by its content. */
export const ALLOWED: Record<FileRole, Sniffed[]> = {
  image: ['jpeg', 'png', 'webp'],
  'plant-list': ['pdf', 'csv', 'xlsx'],
  supporting: ['jpeg', 'png', 'webp', 'pdf', 'csv', 'xlsx'],
};

export const LABEL: Record<Sniffed, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', pdf: 'PDF', xlsx: 'XLSX', csv: 'CSV' };
export const EXTENSIONS: Record<Sniffed, string[]> = { jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'], pdf: ['pdf'], xlsx: ['xlsx'], csv: ['csv'] };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** True when the bytes hold `s` (ASCII) anywhere. */
function contains(b: Uint8Array, s: string): boolean {
  const sig = ascii(s);
  outer: for (let i = 0; i + sig.length <= b.length; i++) {
    for (let j = 0; j < sig.length; j++) if (b[i + j] !== sig[j]) continue outer;
    return true;
  }
  return false;
}

/** A file's type by its content, never its name; undefined when it is none of the allowed types. */
export function sniff(b: Uint8Array): Sniffed | undefined {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(b, ascii('%PDF-'))) return 'pdf';
  // An XLSX file is a zip whose entry names (stored uncompressed) include the workbook part.
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return contains(b, 'xl/workbook.xml') ? 'xlsx' : undefined;
  // CSV is text: UTF-8 with no control characters besides tab and line ends, and a separator.
  const text = b.length ? utf8(b) : undefined;
  if (text !== undefined && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) && /[,;\t]/.test(text)) return 'csv';
  return undefined;
}

function utf8(b: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return undefined;
  }
}

/** A file name's extension, lower case, or '' when it has none. */
export const extension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
