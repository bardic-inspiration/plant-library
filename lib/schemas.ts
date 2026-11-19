/** Loading the JSON schemas with the vocabulary filled in. Node only. */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { readJson } from './config';
import type { Vocab, VocabValue } from './types';

/** Replace every `{ "x-vocab": "<list>" }` with an enum of that list's ids. */
export function injectVocab(schema: unknown, vocab: Vocab): unknown {
  if (Array.isArray(schema)) return schema.map((s) => injectVocab(s, vocab));
  if (schema && typeof schema === 'object') {
    const o = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'x-vocab') {
        const list = vocab[v as string];
        if (!Array.isArray(list)) throw new Error(`Schema names an unknown vocabulary list: ${v}`);
        out.enum = (list as VocabValue[]).map((x) => x.id);
      } else out[k] = injectVocab(v, vocab);
    }
    return out;
  }
  return schema;
}

export interface Schemas {
  ajv: Ajv2020;
  envelope: ValidateFunction;
  sources: ValidateFunction;
  site: ValidateFunction;
  types: ValidateFunction;
  overlays: ValidateFunction;
  data: Record<string, ValidateFunction>;
  /** The raw (vocab-filled) schema per type, for forms and path checks. */
  raw: Record<string, unknown>;
}

export function loadSchemas(root: string, vocab: Vocab, typeSchemas: Record<string, string>): Schemas {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  const load = (f: string) => injectVocab(readJson(join(root, f)), vocab) as Record<string, unknown>;
  for (const f of readdirSync(join(root, 'schemas'))) {
    if (!f.endsWith('.schema.json')) continue;
    ajv.addSchema(load(`schemas/${f}`));
  }
  const get = (id: string) => {
    const v = ajv.getSchema(id);
    if (!v) throw new Error(`Missing schema ${id}`);
    return v;
  };
  const data: Record<string, ValidateFunction> = {};
  const raw: Record<string, unknown> = {};
  for (const [type, file] of Object.entries(typeSchemas)) {
    const id = file.replace(/^schemas\//, '');
    data[type] = get(id);
    raw[type] = load(file);
  }
  return { ajv, envelope: get('envelope.schema.json'), sources: get('sources.schema.json'), site: get('site.schema.json'), types: get('types.schema.json'), overlays: get('overlays.schema.json'), data, raw };
}

export function formatErrors(errors: ErrorObject[] | null | undefined, prefix = ''): string[] {
  return (errors ?? []).map((e) => {
    const where = `${prefix}${e.instancePath}` || '(root)';
    if (e.keyword === 'additionalProperties') return `${where}: unknown key "${(e.params as { additionalProperty: string }).additionalProperty}"`;
    if (e.keyword === 'enum') return `${where}: must be one of ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')}`;
    return `${where}: ${e.message}`;
  });
}
