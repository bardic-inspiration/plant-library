/**
 * Submissions (docs/submissions.md): the edit differences a form submits,
 * applying them back, and the hash a form records as `basedOn`.
 * Client-safe: no Node imports, so a form can use it too.
 */

/** A change before it has its basis and note: a dotted path with exactly one of value, add, or remove. */
export type Difference =
  | { path: string; value: unknown }
  | { path: string; add: unknown[] }
  | { path: string; remove: unknown[] };

export type Basis = 'observation' | 'source' | 'correction';
export type Change = Difference & { basis: Basis; note: string; sourceUrl?: string; citation?: string };

/** The entry keys an edit may change. type and id name the entry, meta is the routine's, and field notes are their own part of a submission. */
export const EDITABLE_KEYS = ['name', 'summary', 'description', 'tags', 'data'] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPrimitive = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Deep equality of JSON values; object key order doesn't matter, array order does. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && jsonEqual(a[k], b[k]));
  }
  return false;
}

/** Items of a list in `of` that aren't in `minus` (by value). */
const without = (of: unknown[], minus: unknown[]) => of.filter((x) => !minus.some((y) => jsonEqual(x, y)));

/**
 * The differences between an entry as a form opened it and as the person
 * left it: exactly the paths that changed, in the entry's key order.
 * - Objects present on both sides are compared key by key.
 * - A list of plain values that kept its remaining items in order becomes
 *   `add` (appended) and `remove`; any other changed list is one `value`.
 * - A key the person cleared is `value: null`.
 */
export function editDifferences(before: Obj, after: Obj): Difference[] {
  const out: Difference[] = [];
  for (const k of EDITABLE_KEYS) walk(k, before[k], after[k], out);
  return out;
}

function walk(path: string, a: unknown, b: unknown, out: Difference[]): void {
  if (jsonEqual(a, b)) return;
  if (b === undefined) return void out.push({ path, value: null });
  if (isObj(a) && isObj(b)) {
    const keys = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))];
    for (const k of keys) walk(`${path}.${k}`, a[k], b[k], out);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every(isPrimitive)) {
    const add = without(b, a);
    const remove = without(a, b);
    if (jsonEqual(applyList(a, add, remove), b)) {
      if (remove.length) out.push({ path, remove });
      if (add.length) out.push({ path, add });
      return;
    }
  }
  out.push({ path, value: b });
}

function applyList(list: unknown[], add: unknown[], remove: unknown[]): unknown[] {
  return [...without(list, remove), ...without(add, list)];
}

/** Apply differences to a copy of an entry, as the routine does when it integrates an edit. */
export function applyDifferences<T extends Obj>(entry: T, diffs: readonly Difference[]): T {
  const out = structuredClone(entry) as Obj;
  for (const d of diffs) {
    const keys = d.path.split('.');
    const last = keys.pop()!;
    let at: Obj = out;
    for (const k of keys) {
      if (!isObj(at[k])) at[k] = {};
      at = at[k] as Obj;
    }
    if ('value' in d) {
      if (d.value === null) delete at[last];
      else at[last] = structuredClone(d.value);
    } else {
      const list = Array.isArray(at[last]) ? (at[last] as unknown[]) : [];
      at[last] = 'add' in d ? applyList(list, d.add, []) : applyList(list, [], d.remove);
    }
  }
  return out as T;
}

/** True when two dotted paths overlap: equal, or one inside the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

/** The text a form hashes for `basedOn`: the entry as the published data/<type>/<id>.json holds it. */
export function entryText(entry: unknown): string {
  return JSON.stringify(entry, null, 2) + '\n';
}

/** sha256 of an entry's text, in hex, with Web Crypto (in the browser and in Node). */
export async function entryHash(entry: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(entryText(entry));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
