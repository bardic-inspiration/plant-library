/**
 * Library validation (P2, P5, P8). Fails closed: every rule here is an error
 * unless it is listed as a warning. Node only; the rules themselves take the
 * loaded content and config, so tests run them over fixture sets.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
import type { LoadedEntry } from './content';
import { formatErrors, type Schemas } from './schemas';
import { botanicalName, normalizeName, plantId } from './names';
import { subsetProblems, refTokens } from './markdown';
import { zoneIndex } from './zones';
import { flatFacets, isGroup } from './facets';
import type { Entry, PlantData, VocabValue } from './types';

export interface Issue { file: string; message: string }
export interface Report { errors: Issue[]; warnings: Issue[] }

export const IMAGE_WARN_BYTES = 500 * 1024;
export const IMAGE_FAIL_BYTES = 2 * 1024 * 1024;

/** Traits that must be cited when populated, and the registry category that may cite each. */
export const CITED_TRAITS: Record<string, string> = {
  family: 'names',
  form: 'traits',
  foliage: 'traits',
  height: 'traits',
  spread: 'traits',
  growthRate: 'traits',
  sun: 'traits',
  moisture: 'traits',
  'soil.texture': 'traits',
  'soil.drainage': 'traits',
  'soil.ph': 'traits',
  hardiness: 'traits',
  waterUse: 'traits',
  tolerates: 'traits',
  'bloom.colors': 'traits',
  'bloom.months': 'traits',
  fallColor: 'traits',
  fruit: 'traits',
  wildlife: 'traits',
  uses: 'traits',
  wetlandIndicator: 'wetland',
  nativeRange: 'range',
};

/** Name fields a source may also be cited for, though citing them isn't required. */
const NAME_FIELDS = ['genus', 'species', 'infraEpithet', 'commonNames', 'synonyms', 'usdaSymbol'];

/** Parent keys that may be cited for all their parts. */
const PARENTS: Record<string, string[]> = { soil: ['soil.texture', 'soil.drainage', 'soil.ph'], bloom: ['bloom.colors', 'bloom.months'] };

export interface ValidateOptions {
  /** The folder image paths are relative to. Defaults to the repo root. */
  dataRoot?: string;
  /** Measure a file, or undefined when it doesn't exist. Defaults to the filesystem under dataRoot. */
  fileSize?: (path: string) => number | undefined;
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function populated(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** Walk every {min, max} pair under a value. */
function ranges(v: unknown, path: string, out: { path: string; min: unknown; max: unknown }[] = []) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ('min' in o && 'max' in o) out.push({ path, min: o.min, max: o.max });
    for (const [k, c] of Object.entries(o)) ranges(c, path ? `${path}.${k}` : k, out);
  } else if (Array.isArray(v)) v.forEach((c, i) => ranges(c, `${path}.${i}`, out));
  return out;
}

/** Every string in a value, with its path, except under the named keys. */
function strings(v: unknown, path: string, out: { path: string; value: string }[] = []) {
  if (typeof v === 'string') out.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((c, i) => strings(c, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) strings(c, path ? `${path}.${k}` : k, out);
  return out;
}

/** Every { ref } object in a value. */
function refObjects(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((c) => refObjects(c, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.ref === 'string' && Object.keys(o).length === 1) out.push(o.ref);
    else for (const c of Object.values(o)) refObjects(c, out);
  }
  return out;
}

export function validateConfig(config: Config, schemas: Schemas): Report {
  const errors: Issue[] = [];
  const check = (file: string, fn: (d: unknown) => boolean, data: unknown, name: string) => {
    if (!fn(data)) for (const m of formatErrors((fn as unknown as { errors: never }).errors)) errors.push({ file, message: `${name} ${m}` });
  };
  check('config/site.json', schemas.site, { ...config.site }, 'site');
  check('config/sources.json', schemas.sources, config.sources, 'sources');
  check('config/types.json', schemas.types, config.types, 'types');
  for (const [type, def] of Object.entries(config.types)) {
    for (const f of def.facets) {
      for (const facet of isGroup(f) ? f.facets : [f]) {
        for (const v of [facet.vocab, facet.keyVocab]) {
          if (v && !Array.isArray(config.vocab[v])) errors.push({ file: 'config/types.json', message: `${type}.${facet.id}: unknown vocabulary list "${v}"` });
        }
        if (facet.kind === 'range' && !facet.buckets?.length) errors.push({ file: 'config/types.json', message: `${type}.${facet.id}: a range facet needs buckets` });
      }
    }
    const keys = flatFacets(config.types, type).map((f) => f.key);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) errors.push({ file: 'config/types.json', message: `duplicate facet ${dup}` });
  }
  return { errors, warnings: [] };
}

export function validateLibrary(config: Config, schemas: Schemas, loaded: LoadedEntry[], opts: ValidateOptions = {}): Report {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const warn = (file: string, message: string) => warnings.push({ file, message });
  const fileSize =
    opts.fileSize ??
    ((p: string) => {
      const abs = join(opts.dataRoot ?? config.root, p);
      return existsSync(abs) ? statSync(abs).size : undefined;
    });

  const licenses = new Map((config.vocab.license as VocabValue[]).map((l) => [l.id, l]));
  const keys = new Set<string>();
  const byKey = new Map<string, LoadedEntry>();

  // Envelope, schema, and path.
  for (const le of loaded) {
    const { file, entry } = le;
    if (!schemas.envelope(entry)) {
      for (const m of formatErrors(schemas.envelope.errors)) err(file, m);
      continue;
    }
    const def = config.types[entry.type];
    if (!def) {
      err(file, `unknown type "${entry.type}"`);
      continue;
    }
    const expected = `content/${entry.type}/${entry.id}.json`;
    if (!file.endsWith(expected)) err(file, `path must be ${expected} for type "${entry.type}" and id "${entry.id}"`);
    const validateData = schemas.data[entry.type];
    if (!validateData(entry.data)) for (const m of formatErrors(validateData.errors, 'data')) err(file, m);
    if (def.namedBy === 'derived') {
      if (entry.name !== undefined) err(file, 'name is derived for this type; omit it');
    } else if (!entry.name) err(file, 'name is required');
    if (entry.meta.revisedAt < entry.meta.createdAt) err(file, 'meta.revisedAt is before meta.createdAt');
    const key = `${entry.type}/${entry.id}`;
    if (keys.has(key)) err(file, `duplicate key ${key}`);
    keys.add(key);
    byKey.set(key, le);
  }

  const valid = loaded.filter((le) => byKey.get(`${le.entry.type}/${le.entry.id}`) === le && !errors.some((e) => e.file === le.file));

  // Ranges.
  for (const { file, entry } of valid) {
    for (const r of ranges(entry.data, 'data')) {
      if (typeof r.min === 'number' && typeof r.max === 'number' && r.min > r.max) err(file, `${r.path}: min is greater than max`);
      if (typeof r.min === 'string' && typeof r.max === 'string') {
        try {
          if (zoneIndex(r.min, 'min') > zoneIndex(r.max, 'max')) err(file, `${r.path}: min zone is warmer than max zone`);
        } catch {
          /* schema already reported it */
        }
      }
    }
  }

  // Markdown subset, ref tokens, refs.
  const markdownField = (path: string) => path === 'description' || /^fieldNotes\[\d+\]\.note$/.test(path);
  for (const { file, entry } of valid) {
    const { type: _t, id: _i, data, ...rest } = entry;
    for (const s of [...strings(rest, ''), ...strings(data, 'data')]) {
      const tokens = refTokens(s.value);
      if (markdownField(s.path)) {
        for (const p of subsetProblems(s.value)) err(file, `${s.path}: ${p}`);
        for (const k of tokens) if (!keys.has(k)) err(file, `${s.path}: {ref:${k}} does not resolve`);
      } else if (tokens.length || /\{ref:/.test(s.value)) {
        err(file, `${s.path}: {ref:…} tokens are allowed only in markdown fields`);
      }
    }
    for (const k of refObjects(entry)) if (!keys.has(k)) err(file, `ref ${k} does not resolve`);
  }

  // Fixtures only.
  if (config.site.fixturesOnly) {
    for (const { file, entry } of valid) {
      const rules = config.types[entry.type].fixtureRules;
      if (!rules) continue;
      if (entry.meta.fixture !== true) err(file, `fixturesOnly is on: every ${entry.type} must be a fixture (meta.fixture: true)`);
      for (const f of rules.proprietary) if (populated(get(entry.data, f))) err(file, `fixturesOnly is on: data.${f} is proprietary and must be blank`);
    }
  }

  // Plants.
  const plants = valid.filter((le) => le.entry.type === 'plant') as unknown as { file: string; entry: Entry<PlantData> }[];
  const nameOwner = new Map<string, string>(); // normalized name → key
  for (const { file, entry } of plants) {
    const d = entry.data;
    const id = plantId(d);
    if (entry.id !== id) err(file, `id must be "${id}", the slug of ${botanicalName(d)}`);
    if (d.hybrid && !d.species && !d.cultivar) err(file, 'a hybrid with no species epithet needs a cultivar');
    if (Boolean(d.infraRank) !== Boolean(d.infraEpithet)) err(file, 'infraRank and infraEpithet go together');
    if (!d.species && !d.cultivar) err(file, 'a plant needs a species epithet or a cultivar');
    if (!config.vocab.families[d.family]) err(file, `family ${d.family} is not in the config/vocab.json family table`);
    const n = normalizeName(botanicalName(d));
    const other = nameOwner.get(n);
    if (other) err(file, `botanical name ${botanicalName(d)} is also ${other}`);
    nameOwner.set(n, `plant/${entry.id}`);
  }
  for (const { file, entry } of plants) {
    for (const syn of entry.data.synonyms ?? []) {
      const n = normalizeName(syn);
      const owner = nameOwner.get(n);
      if (owner && owner !== `plant/${entry.id}`) err(file, `synonym "${syn}" is the name of ${owner}`);
      else if (owner) err(file, `synonym "${syn}" is the plant's own name`);
      else nameOwner.set(n, `plant/${entry.id}`);
    }
  }
  // Repeated synonyms across plants.
  const synSeen = new Map<string, string>();
  for (const { file, entry } of plants) {
    for (const syn of entry.data.synonyms ?? []) {
      const n = normalizeName(syn);
      const prev = synSeen.get(n);
      if (prev && prev !== entry.id) err(file, `synonym "${syn}" is also a synonym of plant/${prev}`);
      synSeen.set(n, entry.id);
    }
  }
  // Near-duplicate common names.
  const common = new Map<string, string>();
  for (const { file, entry } of plants) {
    const c = normalizeName(entry.data.commonNames[0]).replace(/[\s-]/g, '');
    const prev = common.get(c);
    if (prev) warn(file, `primary common name "${entry.data.commonNames[0]}" is nearly the same as plant/${prev}'s`);
    common.set(c, entry.id);
  }

  // Provenance.
  for (const { file, entry } of plants) {
    const d = entry.data;
    const covered = new Set<string>();
    d.sources.forEach((c, i) => {
      const src = config.sources[c.source];
      if (!src) {
        err(file, `data.sources[${i}]: "${c.source}" is not in the source registry`);
        return;
      }
      if (src.kind === 'professional' && !c.contributor) err(file, `data.sources[${i}]: a ${c.source} citation names its contributor`);
      if (src.kind !== 'professional' && !c.url) err(file, `data.sources[${i}]: give the URL of the page cited`);
      for (const f of c.fields) {
        const parts = PARENTS[f] ?? [f];
        for (const p of parts) {
          const cat = CITED_TRAITS[p] ?? (NAME_FIELDS.includes(p) ? 'names' : undefined);
          if (!cat) {
            err(file, `data.sources[${i}]: "${f}" is not a citable field`);
            continue;
          }
          if (!src.provides.includes(cat)) err(file, `data.sources[${i}]: ${c.source} may not be cited for ${p} (it provides ${src.provides.join(', ')})`);
          covered.add(p);
        }
        if (!parts.some((p) => populated(get(d, p)))) warn(file, `data.sources[${i}]: cites ${f}, which the entry leaves empty`);
      }
      if (src.kind === 'professional') {
        for (const f of c.fields) {
          const others = d.sources.filter((o) => o !== c && config.sources[o.source]?.kind !== 'professional' && o.fields.some((g) => g === f || (PARENTS[g] ?? []).includes(f)));
          if (others.length) err(file, `data.sources[${i}]: ${f} is given by ${others.map((o) => o.source).join(', ')}; an observation that differs belongs in a field note`);
        }
      }
    });
    for (const trait of Object.keys(CITED_TRAITS)) {
      if (populated(get(d, trait)) && !covered.has(trait)) err(file, `data.${trait} is populated but no source cites it`);
    }
  }

  // Images.
  for (const { file, entry } of plants) {
    const imgs = entry.data.images ?? [];
    if (imgs.length === 0) {
      warn(file, 'has no image');
      continue;
    }
    const pinned = imgs.filter((i) => i.pinned).length;
    if (pinned !== 1) err(file, `exactly one image must be pinned (found ${pinned})`);
    imgs.forEach((img, i) => {
      if (!img.file.startsWith(`assets/images/plant/${entry.id}/`)) err(file, `data.images[${i}]: file must be under assets/images/plant/${entry.id}/`);
      const size = fileSize(img.file);
      if (size === undefined) err(file, `data.images[${i}]: ${img.file} does not exist`);
      else if (size > IMAGE_FAIL_BYTES) err(file, `data.images[${i}]: ${img.file} is ${Math.round(size / 1024)} KB, over the 2 MB limit`);
      else if (size > IMAGE_WARN_BYTES) warn(file, `data.images[${i}]: ${img.file} is ${Math.round(size / 1024)} KB, over 500 KB`);
      if (!licenses.has(img.license)) err(file, `data.images[${i}]: license ${img.license} is not allowed`);
    });
    const files = imgs.map((i) => i.file);
    const dup = files.find((f, i) => files.indexOf(f) !== i);
    if (dup) err(file, `image ${dup} is listed twice`);
  }

  // Field notes.
  for (const { file, entry } of valid) {
    (entry.fieldNotes ?? []).forEach((n, i) => {
      if (n.trait && !(n.trait in CITED_TRAITS) && !(n.trait in PARENTS)) err(file, `fieldNotes[${i}].trait: "${n.trait}" is not a trait`);
    });
  }

  return { errors, warnings };
}
