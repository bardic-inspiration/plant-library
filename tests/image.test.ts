import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config';
import { nextImagePath, placeImage, reencodeImage } from '../lib/image';
import { ROOT } from './helpers';

const settings = loadConfig(ROOT).site.submissions.image;

/** A camera-like JPEG: wide, tagged to display rotated a quarter turn, with EXIF and GPS. */
const cameraJpeg = () =>
  sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#4a7a3a' } })
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: 'ExampleCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 36/1 0/1' } })
    .jpeg()
    .toBuffer();

describe('reencodeImage', () => {
  it('turns the photo upright, fits it to the longest edge, and drops its metadata', async () => {
    const input = await cameraJpeg();
    expect(await sharp(input).metadata()).toMatchObject({ orientation: 6, exif: expect.anything() });
    const out = await reencodeImage(input, settings);
    const meta = await sharp(out.bytes).metadata();
    expect(out.ext).toBe('jpg');
    expect(meta.format).toBe('jpeg');
    expect([out.width, out.height]).toEqual([800, settings.maxEdge]);
    expect([meta.width, meta.height]).toEqual([800, settings.maxEdge]);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('doesn\'t enlarge a small image, and writes the configured format', async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: '#00000000' } }).png().toBuffer();
    const out = await reencodeImage(png, { ...settings, format: 'webp' });
    expect(out).toMatchObject({ ext: 'webp', width: 300, height: 200 });
    expect((await sharp(out.bytes).metadata()).format).toBe('webp');
  });

  it('fails a file that only starts like a JPEG', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really a photo'.repeat(20))]);
    await expect(reencodeImage(broken, settings)).rejects.toThrow("can't be decoded as an image");
  });

  it('fails a file that isn\'t an allowed image', async () => {
    await expect(reencodeImage(Buffer.from('%PDF-1.7\n%%EOF\n'), settings)).rejects.toThrow('not a JPEG, PNG, or WebP');
  });
});

describe('placeImage', () => {
  const root = mkdtempSync(join(tmpdir(), 'images-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('numbers past the images an entry holds', () => {
    expect(nextImagePath(root, 'plant', 'acer-circinatum', 'jpg')).toBe('assets/images/plant/acer-circinatum/1.jpg');
    mkdirSync(join(root, 'assets/images/plant/acer-circinatum'), { recursive: true });
    writeFileSync(join(root, 'assets/images/plant/acer-circinatum/1.jpg'), 'x');
    writeFileSync(join(root, 'assets/images/plant/acer-circinatum/3.webp'), 'x');
    expect(nextImagePath(root, 'plant', 'acer-circinatum', 'jpg')).toBe('assets/images/plant/acer-circinatum/4.jpg');
  });

  it('writes the re-encoded image into the library', async () => {
    const src = join(root, 'IMG_2041.jpg');
    writeFileSync(src, await cameraJpeg());
    const out = await placeImage(src, { dataRoot: root, type: 'plant', id: 'thuja-plicata', settings });
    expect(out.path).toBe('assets/images/plant/thuja-plicata/1.jpg');
    expect((await sharp(readFileSync(join(root, out.path))).metadata()).exif).toBeUndefined();
  });

  it('refuses an entry id or type that would write outside assets/images/<type>/', async () => {
    const src = join(root, 'IMG_2041.jpg');
    for (const id of ['../../escape', 'thuja/plicata', 'Thuja-plicata', '']) {
      await expect(placeImage(src, { dataRoot: root, type: 'plant', id, settings }), id).rejects.toThrow(/not an entry id/);
    }
    await expect(placeImage(src, { dataRoot: root, type: '../plant', id: 'thuja-plicata', settings })).rejects.toThrow(/not an entry type/);
    expect(existsSync(join(root, 'escape'))).toBe(false);
  });
});
