/**
 * Plant names. The parts are stored; every display form is derived here, so
 * italics, the hybrid sign, and cultivar quoting are always right (P3, P7).
 */
import type { NameParts } from './types';

/** A run of name text and how it is set: italic, roman, or a trade name. */
export type NameSegment = [text: string, style: 'i' | 'r' | 't'];

/** The name as styled runs, for templates to render. */
export function nameSegments(p: NameParts): NameSegment[] {
  const out: NameSegment[] = [[p.genus, 'i']];
  if (p.species) {
    if (p.hybrid) out.push(['×', 'r']);
    out.push([p.species, 'i']);
  }
  if (p.infraRank && p.infraEpithet) {
    out.push([p.infraRank, 'r']);
    out.push([p.infraEpithet, 'i']);
  }
  if (p.cultivar) out.push([`‘${p.cultivar}’`, 'r']);
  if (p.tradeName) out.push([p.tradeName, 't']);
  return out;
}

/** The botanical name as plain text, as a plant schedule writes it. No trade name. */
export function botanicalName(p: NameParts): string {
  const words = [p.genus];
  if (p.species) {
    if (p.hybrid) words.push('×');
    words.push(p.species);
  }
  if (p.infraRank && p.infraEpithet) words.push(p.infraRank, p.infraEpithet);
  if (p.cultivar) words.push(`'${p.cultivar}'`);
  return words.join(' ');
}

/** The name with its trade name, as plain text. */
export function fullName(p: NameParts): string {
  return p.tradeName ? `${botanicalName(p)} ${p.tradeName}` : botanicalName(p);
}

/** Lowercase ASCII slug: letters and digits joined by single hyphens. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/×/g, ' x ')
    .replace(/['‘’"“”.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The id a plant must have: the slug of its botanical name. */
export function plantId(p: NameParts): string {
  return slugify(botanicalName(p));
}

/**
 * A plant name reduced for matching plant lists, synonyms, and duplicates:
 * case, diacritics, quotes, the hybrid sign, rank punctuation, and trademark
 * marks are dropped.
 */
export function normalizeName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[®™℠]/g, '')
    .replace(/×/g, ' ')
    .replace(/\b(cv|ssp)\.?(?=\s)/g, (m) => (m.startsWith('ssp') ? 'subsp' : ''))
    .replace(/['‘’"“”.,()]/g, '')
    .replace(/\s+x\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The sort key for a plant: its botanical name, normalized. */
export function sortName(p: NameParts): string {
  return normalizeName(botanicalName(p));
}
