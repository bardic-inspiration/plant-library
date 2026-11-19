/** Loading the site's Montserrat files for map glyphs (lib/glyphs.ts). Node only. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import opentype from 'opentype.js';
import { encodeRange, flatten, GLYPH_SIZE, rasterize, type Glyph } from './glyphs';

/** The @fontsource subsets whose glyphs labels may need: place names in the three states are Latin. */
export const GLYPH_SUBSETS = ['latin', 'latin-ext'];

interface OtGlyph {
  index: number;
  advanceWidth?: number;
  getPath(x: number, y: number, size: number): { commands: { type: string }[] };
}
interface OtFont {
  unitsPerEm: number;
  ascender: number;
  charToGlyph(c: string): OtGlyph;
  tables: { cmap: { glyphIndexMap: Record<string, number> } };
}

export interface GlyphFont {
  /** Codepoints the subsets cover, ascending. */
  codepoints: number[];
  glyph(cp: number): Glyph | null;
}

function fontsourceDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('@fontsource/montserrat/package.json')), 'files');
}

/** One weight of the family, across the subsets (the first subset holding a codepoint wins). */
export function loadGlyphFont(family: string, weight: string): GlyphFont {
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const fonts: OtFont[] = GLYPH_SUBSETS.map((s) => {
    const b = readFileSync(join(fontsourceDir(), `${slug}-${s}-${weight}-normal.woff`));
    return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) as unknown as OtFont;
  });
  const owner = new Map<number, OtFont>();
  for (const f of fonts) for (const k of Object.keys(f.tables.cmap.glyphIndexMap)) if (!owner.has(Number(k))) owner.set(Number(k), f);
  return {
    codepoints: [...owner.keys()].filter((cp) => cp < 0x10000).sort((a, b) => a - b),
    glyph(cp) {
      const f = owner.get(cp);
      if (!f) return null;
      const g = f.charToGlyph(String.fromCodePoint(cp));
      const scale = GLYPH_SIZE / f.unitsPerEm;
      const contours = flatten(g.getPath(0, 0, GLYPH_SIZE).commands as Parameters<typeof flatten>[0]);
      return rasterize(cp, { contours, advance: (g.advanceWidth ?? 0) * scale }, f.ascender * scale);
    },
  };
}

/** The ranges (`0-255`, `256-511`, …) the font covers, each encoded for MapLibre. */
export function glyphRanges(name: string, font: GlyphFont): Map<string, Uint8Array> {
  const starts = [...new Set(font.codepoints.map((cp) => cp - (cp % 256)))];
  const out = new Map<string, Uint8Array>();
  for (const start of starts) {
    const range = `${start}-${start + 255}`;
    const glyphs = font.codepoints.filter((cp) => cp >= start && cp <= start + 255).map((cp) => font.glyph(cp)!);
    out.set(range, encodeRange(name, range, glyphs));
  }
  return out;
}
