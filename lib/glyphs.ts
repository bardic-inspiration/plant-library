/**
 * MapLibre glyph ranges (signed distance fields in protobuf) from the site's
 * own font files, so map labels are set in Montserrat and served with the
 * site (spec: glyphs are self-hosted). The distance of each pixel is measured
 * to the glyph's outline, flattened to segments, as fontnik does; the encoding
 * is MapLibre's: 24 px glyphs, a 3 px buffer, the edge at 192 of 255.
 */

/** A glyph outline in pixels, y up from the baseline: closed polylines. */
export interface Outline {
  contours: [number, number][][];
  advance: number;
}

export interface Glyph {
  id: number;
  bitmap: Uint8Array;
  width: number;
  height: number;
  left: number;
  top: number;
  advance: number;
}

export const GLYPH_SIZE = 24;
export const GLYPH_BUFFER = 3;
const RADIUS = 8;
const CUTOFF = 0.25;

/** Path commands as opentype.js gives them (y down), flattened to closed polylines in y-up pixels. */
export function flatten(commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[], steps = 8): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  let x = 0;
  let y = 0;
  const push = (px: number, py: number) => cur.push([px, -py]);
  for (const c of commands) {
    if (c.type === 'M') {
      if (cur.length > 1) out.push(cur);
      cur = [];
      x = c.x!;
      y = c.y!;
      push(x, y);
    } else if (c.type === 'L') {
      x = c.x!;
      y = c.y!;
      push(x, y);
    } else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        push(u * u * x + 2 * u * t * c.x1! + t * t * c.x!, u * u * y + 2 * u * t * c.y1! + t * t * c.y!);
      }
      x = c.x!;
      y = c.y!;
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        push(u * u * u * x + 3 * u * u * t * c.x1! + 3 * u * t * t * c.x2! + t * t * t * c.x!, u * u * u * y + 3 * u * u * t * c.y1! + 3 * u * t * t * c.y2! + t * t * t * c.y!);
      }
      x = c.x!;
      y = c.y!;
    } else if (c.type === 'Z') {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** Nonzero winding: TrueType and CFF outlines both fill by it. */
function inside(px: number, py: number, contours: [number, number][][]): boolean {
  let w = 0;
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const [ax, ay] = c[i];
      const [bx, by] = c[(i + 1) % c.length];
      if (ay <= py) {
        if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) w++;
      } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) w--;
    }
  }
  return w !== 0;
}

/** One glyph's SDF. `ascender` is in pixels; MapLibre measures `top` from it. */
export function rasterize(id: number, o: Outline, ascender: number): Glyph {
  const advance = Math.round(o.advance);
  const pts = o.contours.flat();
  if (!pts.length) return { id, bitmap: new Uint8Array(0), width: 0, height: 0, left: 0, top: 0, advance };
  const xmin = Math.floor(Math.min(...pts.map((p) => p[0])));
  const xmax = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const ymin = Math.floor(Math.min(...pts.map((p) => p[1])));
  const ymax = Math.ceil(Math.max(...pts.map((p) => p[1])));
  const width = xmax - xmin;
  const height = ymax - ymin;
  const bw = width + 2 * GLYPH_BUFFER;
  const bh = height + 2 * GLYPH_BUFFER;
  const bitmap = new Uint8Array(bw * bh);
  for (let row = 0; row < bh; row++) {
    const py = ymax + GLYPH_BUFFER - row - 0.5;
    for (let col = 0; col < bw; col++) {
      const px = xmin - GLYPH_BUFFER + col + 0.5;
      let d2 = Infinity;
      for (const c of o.contours) {
        for (let i = 0; i < c.length; i++) {
          const a = c[i];
          const b = c[(i + 1) % c.length];
          const s = segDist2(px, py, a[0], a[1], b[0], b[1]);
          if (s < d2) d2 = s;
        }
      }
      const d = Math.sqrt(d2) * (inside(px, py, o.contours) ? -1 : 1);
      bitmap[row * bw + col] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / RADIUS + CUTOFF))));
    }
  }
  return { id, bitmap, width, height, left: xmin, top: ymax - Math.round(ascender), advance };
}

// Protobuf, by hand: glyphs { repeated fontstack stacks = 1 }, fontstack { name = 1; range = 2; repeated glyph glyphs = 3 },
// glyph { id = 1; bitmap = 2; width = 3; height = 4; sint32 left = 5; sint32 top = 6; advance = 7 }.

function varint(n: number, out: number[]): void {
  let v = n >>> 0;
  while (v > 127) {
    out.push((v & 127) | 128);
    v >>>= 7;
  }
  out.push(v);
}
const zigzag = (n: number) => (n << 1) ^ (n >> 31);
function bytesField(field: number, bytes: ArrayLike<number>, out: number[]): void {
  varint((field << 3) | 2, out);
  varint(bytes.length, out);
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
}
function intField(field: number, n: number, out: number[]): void {
  varint(field << 3, out);
  varint(n, out);
}

export function encodeRange(name: string, range: string, glyphs: Glyph[]): Uint8Array {
  const stack: number[] = [];
  bytesField(1, new TextEncoder().encode(name), stack);
  bytesField(2, new TextEncoder().encode(range), stack);
  for (const g of glyphs) {
    const m: number[] = [];
    intField(1, g.id, m);
    if (g.bitmap.length) bytesField(2, g.bitmap, m);
    intField(3, g.width, m);
    intField(4, g.height, m);
    intField(5, zigzag(g.left), m);
    intField(6, zigzag(g.top), m);
    intField(7, g.advance, m);
    bytesField(3, m, stack);
  }
  const out: number[] = [];
  bytesField(1, stack, out);
  return Uint8Array.from(out);
}

/** Protobuf fields of one message: varints as numbers, length-delimited as bytes. */
function fields(b: Uint8Array): [number, number | Uint8Array][] {
  const out: [number, number | Uint8Array][] = [];
  let pos = 0;
  const vint = () => {
    let v = 0;
    let s = 0;
    let byte: number;
    do {
      byte = b[pos++];
      v += (byte & 127) * 2 ** s;
      s += 7;
    } while (byte & 128);
    return v;
  };
  while (pos < b.length) {
    const key = vint();
    if ((key & 7) === 0) out.push([key >> 3, vint()]);
    else if ((key & 7) === 2) {
      const len = vint();
      out.push([key >> 3, b.subarray(pos, pos + len)]);
      pos += len;
    } else throw new Error(`unexpected wire type ${key & 7}`);
  }
  return out;
}

/** Decode a range, for tests and checks. */
export function decodeRange(buf: Uint8Array): { name: string; range: string; glyphs: Glyph[] } {
  const text = (v: number | Uint8Array) => new TextDecoder().decode(v as Uint8Array);
  const unzig = (n: number) => (n >>> 1) ^ -(n & 1);
  const result = { name: '', range: '', glyphs: [] as Glyph[] };
  for (const [f, stack] of fields(buf)) {
    if (f !== 1) continue;
    for (const [sf, sv] of fields(stack as Uint8Array)) {
      if (sf === 1) result.name = text(sv);
      else if (sf === 2) result.range = text(sv);
      else if (sf === 3) {
        const g: Glyph = { id: 0, bitmap: new Uint8Array(0), width: 0, height: 0, left: 0, top: 0, advance: 0 };
        for (const [gf, gv] of fields(sv as Uint8Array)) {
          if (gf === 1) g.id = gv as number;
          else if (gf === 2) g.bitmap = gv as Uint8Array;
          else if (gf === 3) g.width = gv as number;
          else if (gf === 4) g.height = gv as number;
          else if (gf === 5) g.left = unzig(gv as number);
          else if (gf === 6) g.top = unzig(gv as number);
          else if (gf === 7) g.advance = gv as number;
        }
        result.glyphs.push(g);
      }
    }
  }
  return result;
}
