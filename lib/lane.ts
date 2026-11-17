/**
 * Work lanes (P8): a PR is either content or dev, decided by its branch
 * prefix, and its changed paths must fit the lane. Pure; scripts/lane.ts
 * feeds it git's view of the PR.
 */

export type Lane = 'content' | 'dev';
export type Check = 'validate' | 'build' | 'check' | 'test';

export interface LaneResult {
  lane: Lane | null;
  ok: boolean;
  errors: string[];
  /** The checks CI runs for this PR. */
  checks: Check[];
  /** Area labels for the PR, from its paths. */
  labels: string[];
  /** True when every changed file is prose (Markdown outside content/), so the reduced checks apply. */
  docsOnly: boolean;
}

export const CONTENT_PATHS = [/^content\//, /^assets\/images\//];

export function isContentPath(f: string): boolean {
  return CONTENT_PATHS.some((re) => re.test(f));
}

function isProse(f: string): boolean {
  return /\.md$/i.test(f) && !isContentPath(f);
}

/** Area labels by path, as .github/labeler.yml applies them. */
export function areaLabels(files: string[], lane: Lane | null): string[] {
  const labels = new Set<string>();
  for (const f of files) {
    if (f.startsWith('site/')) labels.add('ui');
    if (/^(schemas|config|lib)\//.test(f)) labels.add('data');
    if (f.startsWith('geo/') || /site\/src\/.*[Mm]ap/.test(f)) labels.add('map');
    if (f.startsWith('.github/')) labels.add('ci');
    if (lane === 'dev' && isContentPath(f)) labels.add('migration');
  }
  return [...labels].sort();
}

/**
 * Branch prefixes: `content/` (and `content/sub-<id>` for a submission),
 * `dev/`, and `dependabot/`. A `claude/` branch, as cloud sessions name
 * them, takes its lane from its paths. `spike/` branches can't merge.
 */
export function laneForBranch(branch: string): Lane | 'infer' | 'spike' | null {
  if (branch.startsWith('content/')) return 'content';
  if (branch.startsWith('dev/') || branch.startsWith('dependabot/')) return 'dev';
  if (branch.startsWith('claude/')) return 'infer';
  if (branch.startsWith('spike/')) return 'spike';
  return null;
}

export function checkLane(branch: string, files: string[]): LaneResult {
  const errors: string[] = [];
  const byBranch = laneForBranch(branch);
  let lane: Lane | null = null;
  if (byBranch === 'spike') errors.push(`${branch}: spike/ branches can't merge`);
  else if (byBranch === null) errors.push(`${branch}: branch names start with content/ or dev/ (or dependabot/)`);
  else if (byBranch === 'infer') lane = files.length > 0 && files.every(isContentPath) ? 'content' : 'dev';
  else lane = byBranch;

  if (branch === 'main') errors.push('never push to main');
  if (lane === 'content') {
    const stray = files.filter((f) => !isContentPath(f));
    if (stray.length) errors.push(`content lane: only content/ and assets/images/ may change; also changed ${stray.join(', ')}`);
    if (branch.startsWith('content/sub-') && !/^content\/sub-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/.test(branch)) errors.push(`${branch}: a submission branch is content/sub-<submission id>`);
  }
  const docsOnly = files.length > 0 && files.every(isProse);
  let checks: Check[] = [];
  if (lane === 'content') checks = ['validate', 'build'];
  else if (lane === 'dev') checks = docsOnly ? ['check'] : ['validate', 'build', 'check', 'test'];
  return { lane, ok: errors.length === 0, errors, checks, labels: areaLabels(files, lane), docsOnly };
}
