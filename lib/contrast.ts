/** Reading color tokens from the CSS files and measuring WCAG contrast. Node only. */
import { readFileSync } from 'node:fs';

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Custom properties declared on :root in the given files (the first value wins, as in light mode). */
export function rootTokens(files: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
    for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
      for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!out.has(m[1])) out.set(m[1], m[2].trim());
    }
  }
  return out;
}

/** Rules of the form [data-x='value'] { --prop: … } in a file. */
export function dataRules(file: string): { attr: string; value: string; prop: string; expr: string }[] {
  const css = readFileSync(file, 'utf8');
  return [...css.matchAll(/\[data-([\w-]+)='([\w-]+)'\]\s*\{\s*(--[\w-]+)\s*:\s*([^;]+);\s*\}/g)].map((m) => ({ attr: m[1], value: m[2], prop: m[3], expr: m[4].trim() }));
}

/** Resolve var() chains to a literal color. */
export function resolveColor(expr: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`var() loop at ${expr}`);
  const m = /^var\((--[\w-]+)\)$/.exec(expr.trim());
  if (!m) return expr.trim();
  const v = tokens.get(m[1]);
  if (v === undefined) throw new Error(`unknown token ${m[1]}`);
  return resolveColor(v, tokens, depth + 1);
}
