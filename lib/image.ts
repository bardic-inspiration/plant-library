/**
 * Re-encoding a submitted photo for the library
 * (docs/submissions.md#library-images): decoded, turned upright by its
 * orientation tag, resized to fit `submissions.image.maxEdge`, and written
 * in `submissions.image.format` in sRGB, with no embedded metadata (EXIF,
 * GPS, XMP, IPTC, or ICC profile). Date and place come from the form. Node only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { ImageSettings } from './types';
import { ALLOWED, sniff } from './sniff';

export const EXTENSION: Record<ImageSettings['format'], string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export interface Reencoded {
  bytes: Buffer;
  ext: string;
  width: number;
  height: number;
}

/** Re-encode image bytes with the library's settings. Throws when the bytes aren't an allowed image or can't be decoded. */
export async function reencodeImage(input: Uint8Array, settings: ImageSettings): Promise<Reencoded> {
  const kind = sniff(input);
  if (!kind || !ALLOWED.image.includes(kind)) throw new Error('not a JPEG, PNG, or WebP image by its content');
  let img = sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: settings.maxEdge, height: settings.maxEdge, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb');
  if (settings.format === 'jpeg') img = img.flatten({ background: '#ffffff' }).jpeg({ quality: settings.quality, mozjpeg: true });
  else if (settings.format === 'webp') img = img.webp({ quality: settings.quality });
  else img = img.png({ compressionLevel: 9 });
  let out;
  try {
    out = await img.toBuffer({ resolveWithObject: true });
  } catch (e) {
    throw new Error(`can't be decoded as an image: ${(e as Error).message}`);
  }
  return { bytes: out.data, ext: EXTENSION[settings.format], width: out.info.width, height: out.info.height };
}

/** The next free library image path for an entry: assets/images/<type>/<id>/<n>.<ext>, n one more than the highest held. */
export function nextImagePath(dataRoot: string, type: string, id: string, ext: string): string {
  const dir = join(dataRoot, 'assets', 'images', type, id);
  const held = existsSync(dir) ? readdirSync(dir).map((n) => /^([0-9]+)\./.exec(n)?.[1]).filter(Boolean).map(Number) : [];
  return `assets/images/${type}/${id}/${Math.max(0, ...held) + 1}.${ext}`;
}

/**
 * Re-encode one image of a submission into the library, at the next free
 * path for the entry. Returns the repo-relative path written.
 */
export async function placeImage(file: string, opts: { dataRoot: string; type: string; id: string; settings: ImageSettings }): Promise<{ path: string } & Omit<Reencoded, 'bytes'>> {
  const out = await reencodeImage(readFileSync(file), opts.settings);
  const path = nextImagePath(opts.dataRoot, opts.type, opts.id, out.ext);
  mkdirSync(join(opts.dataRoot, path, '..'), { recursive: true });
  writeFileSync(join(opts.dataRoot, path), out.bytes, { flag: 'wx' });
  return { path, ext: out.ext, width: out.width, height: out.height };
}
