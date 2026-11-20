/**
 * The plant traits: the data paths that are cited when populated, which
 * registry category may cite each, and the parents cited for all their
 * parts. A field note's `trait` names one of these (or a parent), so the
 * contribution form's picker, the inbox `paths` check, and validation share
 * one list. Client-safe: no Node imports.
 */

/** Traits that must be cited when populated, and the registry category that may cite each. */
export const CITED_TRAITS: Record<string, string> = {
  family: 'names',
  form: 'traits',
  lifeCycle: 'traits',
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

/** Parent keys that may be cited for all their parts. */
export const TRAIT_PARENTS: Record<string, string[]> = { soil: ['soil.texture', 'soil.drainage', 'soil.ph'], bloom: ['bloom.colors', 'bloom.months'] };

/**
 * Whether a plant field note may name this path as its `trait`: a cited
 * trait or a parent of some (`soil`, `bloom`). Names, one end of a range
 * (`hardiness.min`), and one region of a wetland rating are not traits.
 */
export function isNoteTrait(path: string): boolean {
  return path in CITED_TRAITS || path in TRAIT_PARENTS;
}

/** Whether two cited paths overlap: the same trait, or a parent and one of its parts, either way round. */
export function traitsOverlap(a: string, b: string): boolean {
  return a === b || (TRAIT_PARENTS[a] ?? []).includes(b) || (TRAIT_PARENTS[b] ?? []).includes(a);
}
