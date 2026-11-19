/**
 * Contribution forms generated from the schemas (spec: submissions.md,
 * Forms). A type's fields, enumerations, labels, and units come from its
 * JSON schema, `config/vocab.json`, and the facets in `config/types.json`,
 * so a new field needs no form code (P4). Client-safe: the build computes
 * the fields and the form island renders and checks them.
 */
import type { FacetDef, FacetGroupDef, TypeDef, Vocab, VocabValue } from './types';
import { jsonEqual } from './submission';

export interface Option {
  id: string;
  label: string;
}

interface Base {
  /** A dotted path from the entry's root, such as data.height.min. */
  path: string;
  key: string;
  label: string;
  required: boolean;
  description?: string;
}

export type Field =
  | (Base & { kind: 'text'; multiline?: boolean; pattern?: string; minLength?: number; maxLength?: number })
  | (Base & { kind: 'number'; integer: boolean; min?: number; max?: number; exclusiveMin?: number; unit?: string })
  | (Base & { kind: 'boolean' })
  | (Base & { kind: 'choice'; options: Option[] })
  | (Base & { kind: 'choices'; options: Option[] })
  | (Base & { kind: 'strings'; pattern?: string; maxLength?: number })
  | (Base & { kind: 'group'; fields: Field[]; unit?: string })
  | (Base & { kind: 'plantList'; quantityRequired: boolean });

type Schema = Record<string, unknown>;

export interface FormContext {
  /** Every schema by its `$id` (common.schema.json, plant.schema.json, …), as the files hold them: `x-vocab` not yet replaced. */
  schemas: Record<string, Schema>;
  vocab: Vocab;
}

/** Labels and units by data path, from a type's facets. */
function facetInfo(def: TypeDef | undefined): Map<string, { label: string; unit?: string }> {
  const out = new Map<string, { label: string; unit?: string }>();
  const add = (f: FacetDef) => {
    if (!out.has(f.path)) out.set(f.path, { label: f.label, unit: f.unit });
  };
  for (const f of def?.facets ?? []) {
    if ('group' in f) (f as FacetGroupDef).facets.forEach(add);
    else add(f as FacetDef);
  }
  return out;
}

/** A schema description as a form shows it: references to the repo's files, for maintainers, dropped. */
export function readerText(description: string): string {
  return description.replace(/\s*\((see )?[\w/.-]+\.(md|ts|json)(#[\w-]+)?[^)]*\)/g, '').replace(/\s*May hold \{ref:[^}]*\} tokens\./, '').trim();
}

/** A schema key as words: growthRate is "Growth rate". */
export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function vocabOptions(vocab: Vocab, list: string): Option[] {
  const values = vocab[list];
  if (!Array.isArray(values)) throw new Error(`A schema names an unknown vocabulary list: ${list}`);
  return (values as VocabValue[]).map((v) => ({ id: v.id, label: v.label }));
}

/** Follow `$ref`s, returning the schema and the `$id` of the file it is in. */
function resolve(schema: Schema, doc: string, ctx: FormContext): [Schema, string] {
  let s = schema;
  let d = doc;
  for (let i = 0; typeof s.$ref === 'string' && i < 10; i++) {
    const [file, pointer = ''] = (s.$ref as string).split('#');
    d = file || d;
    let at: unknown = ctx.schemas[d];
    if (!at) throw new Error(`Unknown schema ${d}`);
    for (const part of pointer.split('/').filter(Boolean)) at = (at as Schema)[part];
    // Siblings of a $ref (a title, a description) win over the target's.
    const { $ref: _ref, ...rest } = s;
    s = { ...(at as Schema), ...rest };
  }
  return [s, d];
}

function options(s: Schema, ctx: FormContext): Option[] | undefined {
  if (typeof s['x-vocab'] === 'string') return vocabOptions(ctx.vocab, s['x-vocab']);
  if (Array.isArray(s.enum)) return (s.enum as unknown[]).map((v) => ({ id: String(v), label: humanize(String(v)) }));
  return undefined;
}

interface Walk {
  ctx: FormContext;
  facets: Map<string, { label: string; unit?: string }>;
  /** Paths left off the form (a type's proprietary fields while fixturesOnly is on). */
  omit: Set<string>;
}

/** The field for one property, or undefined when the form doesn't take it (read-only, or a shape forms don't edit). */
function field(key: string, path: string, raw: Schema, doc: string, required: boolean, w: Walk): Field | undefined {
  if (w.omit.has(path)) return undefined;
  const [s, d] = resolve(raw, doc, w.ctx);
  if (s.readOnly === true) return undefined;
  const facet = w.facets.get(path);
  const base: Base = {
    path,
    key,
    label: (s.title as string | undefined) ?? facet?.label ?? humanize(key),
    required,
    ...(typeof s.description === 'string' ? { description: readerText(s.description) } : {}),
  };
  const opts = options(s, w.ctx);
  if (opts) return { ...base, kind: 'choice', options: opts };
  if (s.type === 'string') {
    return {
      ...base,
      kind: 'text',
      ...(typeof s.pattern === 'string' ? { pattern: s.pattern } : {}),
      ...(typeof s.minLength === 'number' ? { minLength: s.minLength } : {}),
      ...(typeof s.maxLength === 'number' ? { maxLength: s.maxLength } : {}),
      ...(typeof s.maxLength === 'number' && s.maxLength > 300 ? { multiline: true } : {}),
    };
  }
  if (s.type === 'number' || s.type === 'integer') {
    return {
      ...base,
      kind: 'number',
      integer: s.type === 'integer',
      ...(typeof s.minimum === 'number' ? { min: s.minimum } : {}),
      ...(typeof s.maximum === 'number' ? { max: s.maximum } : {}),
      ...(typeof s.exclusiveMinimum === 'number' ? { exclusiveMin: s.exclusiveMinimum } : {}),
      ...(facet?.unit ? { unit: facet.unit } : {}),
    };
  }
  if (s.type === 'boolean') return { ...base, kind: 'boolean' };
  if (s.type === 'array' && s.items && typeof s.items === 'object') {
    const [items] = resolve(s.items as Schema, d, w.ctx);
    const itemOpts = options(items, w.ctx);
    if (itemOpts) return { ...base, kind: 'choices', options: itemOpts };
    if (items.type === 'string') {
      return { ...base, kind: 'strings', ...(typeof items.pattern === 'string' ? { pattern: items.pattern } : {}), ...(typeof items.maxLength === 'number' ? { maxLength: items.maxLength } : {}) };
    }
    const props = items.properties as Record<string, Schema> | undefined;
    if (items.type === 'object' && props?.plant) {
      const req = (items.required as string[] | undefined) ?? [];
      return { ...base, kind: 'plantList', quantityRequired: req.includes('quantity') };
    }
    return undefined;
  }
  if (s.type === 'object') {
    const props = s.properties as Record<string, Schema> | undefined;
    const req = new Set((s.required as string[] | undefined) ?? []);
    let fields: Field[] = [];
    if (props) {
      fields = Object.entries(props)
        .map(([k, p]) => field(k, `${path}.${k}`, p, d, req.has(k), w))
        .filter((f): f is Field => f !== undefined);
    } else if (s.propertyNames && s.additionalProperties && typeof s.additionalProperties === 'object') {
      // A map from one vocabulary to another (wetland indicator by region): a choice per key.
      const keys = options(resolve(s.propertyNames as Schema, d, w.ctx)[0], w.ctx);
      const values = options(resolve(s.additionalProperties as Schema, d, w.ctx)[0], w.ctx);
      if (!keys || !values) return undefined;
      fields = keys.map((k) => ({ path: `${path}.${k.id}`, key: k.id, label: k.label, required: false, kind: 'choice' as const, options: values }));
    }
    if (!fields.length) return undefined;
    return { ...base, kind: 'group', fields, ...(facet?.unit ? { unit: facet.unit } : {}) };
  }
  return undefined;
}

/**
 * The fields of a type's entry form: the envelope's name (unless the type
 * derives its name), summary, and description, then the data fields in
 * schema order. Read-only fields (`readOnly: true`: a plant's images and
 * sources) and, with fixturesOnly, the type's proprietary fields are left
 * off.
 */
export function entryFields(type: string, def: TypeDef, ctx: FormContext, fixturesOnly: boolean): Field[] {
  const envelope = ctx.schemas['envelope.schema.json'];
  const dataId = def.schema.replace(/^schemas\//, '');
  const data = ctx.schemas[dataId];
  if (!envelope || !data) throw new Error(`Missing the envelope or the ${type} schema`);
  const w: Walk = { ctx, facets: facetInfo(def), omit: new Set(fixturesOnly ? (def.fixtureRules?.proprietary ?? []).map((p) => `data.${p}`) : []) };
  const envProps = envelope.properties as Record<string, Schema>;
  const envReq = new Set(envelope.required as string[]);
  const out: Field[] = [];
  for (const k of ['name', 'summary', 'description']) {
    if (k === 'name' && def.namedBy === 'derived') continue;
    const f = field(k, k, envProps[k], 'envelope.schema.json', envReq.has(k) || (k === 'name' && def.namedBy === 'entry'), w);
    if (f) out.push(k === 'description' && f.kind === 'text' ? { ...f, multiline: true } : f);
  }
  const req = new Set((data.required as string[] | undefined) ?? []);
  for (const [k, p] of Object.entries(data.properties as Record<string, Schema>)) {
    const f = field(k, `data.${k}`, p, dataId, req.has(k), w);
    if (f) out.push(f);
  }
  return out;
}

/** The fields of one of the submission schema's definitions (a field note, a file's metadata), with paths from its root. */
export function defFields(def: string, ctx: FormContext, omit: string[] = []): Field[] {
  const sub = ctx.schemas['submission.schema.json'];
  const s = (sub.$defs as Record<string, Schema>)[def];
  const req = new Set((s.required as string[] | undefined) ?? []);
  const w: Walk = { ctx, facets: new Map(), omit: new Set(omit) };
  return Object.entries(s.properties as Record<string, Schema>)
    .map(([k, p]) => field(k, k, p, 'submission.schema.json', req.has(k), w))
    .filter((f): f is Field => f !== undefined);
}

/** Every field, groups opened, in form order. */
export function flatFields(fields: readonly Field[]): Field[] {
  return fields.flatMap((f) => (f.kind === 'group' ? [f, ...flatFields(f.fields)] : [f]));
}

/** The leaf data paths a field note may name as its trait, with their labels ("Soil: Drainage"), from a type's fields. */
export function traitOptions(fields: readonly Field[]): Option[] {
  const out: Option[] = [];
  const walk = (fs: readonly Field[], prefix: string) => {
    for (const f of fs) {
      if (!f.path.startsWith('data.')) continue;
      const path = f.path.slice(5);
      // Field notes name a trait or one level inside it (soil.drainage), as the fieldNote schema allows.
      if (path.split('.').length > 2) continue;
      out.push({ id: path, label: prefix ? `${prefix}: ${f.label}` : f.label });
      if (f.kind === 'group' && !prefix && f.fields.every((c) => c.kind !== 'number')) walk(f.fields, f.label);
    }
  };
  walk(fields, '');
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value at a dotted path, or undefined. */
export function getPath(o: unknown, path: string): unknown {
  let at: unknown = o;
  for (const k of path.split('.')) {
    if (!isObj(at)) return undefined;
    at = at[k];
  }
  return at;
}

/** A copy of `o` with the value at a dotted path set; undefined deletes it. Objects left empty stay, for `prune` to drop. */
export function setPath<T extends Obj>(o: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const out = structuredClone(o) as Obj;
  let at = out;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(at[k])) at[k] = {};
    at = at[k] as Obj;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete at[last];
  else at[last] = value;
  return out as T;
}

/**
 * A value with empty strings, lists, and objects removed, and strings
 * trimmed; undefined when nothing is left. With `keep` (the entry an edit
 * opened with), any part equal to the same part of `keep` stays as it was,
 * so an empty list the entry already held isn't reported as cleared.
 */
export function prune(v: unknown, keep?: unknown): unknown {
  if (keep !== undefined && jsonEqual(v, keep)) return structuredClone(v);
  if (typeof v === 'string') return v.trim() === '' ? undefined : v.trim();
  if (Array.isArray(v)) {
    const items = v.map((x) => prune(x)).filter((x) => x !== undefined);
    return items.length ? items : undefined;
  }
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) {
      const p = prune(x, isObj(keep) ? keep[k] : undefined);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v === null ? undefined : v;
}

export interface FieldWarning {
  path: string;
  message: string;
}

/**
 * What looks missing or odd in a draft, field by field. Forms are lenient
 * at the door: these are warnings, never reasons to refuse a submission.
 * A required field inside an optional group is missing only once the
 * group has something in it.
 */
export function fieldWarnings(fields: readonly Field[], draft: unknown): FieldWarning[] {
  const out: FieldWarning[] = [];
  const walk = (fs: readonly Field[], prefix: string) => {
    for (const f of fs) {
      const v = getPath(draft, f.path);
      // A list the entry holds counts even when empty (a native range's ecoregions may be []).
      const empty = Array.isArray(v) ? false : prune(v) === undefined;
      const name = prefix ? `${prefix}: ${f.label}` : f.label;
      if (empty) {
        if (f.required) out.push({ path: f.path, message: `${name} is missing.` });
        continue;
      }
      if (f.kind === 'text' && typeof v === 'string') {
        const t = v.trim();
        if (f.maxLength !== undefined && t.length > f.maxLength) out.push({ path: f.path, message: `${name} is longer than ${f.maxLength} characters.` });
        else if (f.pattern && !new RegExp(f.pattern, 'u').test(t)) out.push({ path: f.path, message: `${name} doesn't look like the library's form for it.` });
      } else if (f.kind === 'number') {
        if (typeof v !== 'number' || Number.isNaN(v)) out.push({ path: f.path, message: `${name} isn't a number.` });
        else if (f.integer && !Number.isInteger(v)) out.push({ path: f.path, message: `${name} should be a whole number.` });
        else if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max) || (f.exclusiveMin !== undefined && v <= f.exclusiveMin)) {
          out.push({ path: f.path, message: `${name} is outside the expected range${f.min !== undefined && f.max !== undefined ? ` (${f.min} to ${f.max})` : ''}.` });
        }
      } else if (f.kind === 'strings' && Array.isArray(v) && f.pattern) {
        const re = new RegExp(f.pattern, 'u');
        const odd = v.filter((x) => typeof x === 'string' && x.trim() && !re.test(x.trim()));
        if (odd.length) out.push({ path: f.path, message: `${name}: ${odd.join(', ')} ${odd.length === 1 ? "doesn't" : "don't"} look like the library's form.` });
      } else if (f.kind === 'group') {
        const min = getPath(draft, `${f.path}.min`);
        const max = getPath(draft, `${f.path}.max`);
        if (typeof min === 'number' && typeof max === 'number' && min > max) out.push({ path: f.path, message: `${name}: the minimum is more than the maximum.` });
        walk(f.fields, name);
      }
    }
  };
  walk(fields, '');
  return out;
}
