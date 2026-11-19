/**
 * Results: what the `integrate` skill decided about a submission
 * (docs/submissions.md#results). `close` writes one and moves the submission
 * to processed/; `compareRun` holds a run's results against the fixture
 * inbox's expected ones. Node only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { formatErrors } from './schemas';

export type Decision = 'accepted' | 'changed' | 'not-used';
export type ResultStatus = 'integrated' | 'partial' | 'rejected' | 'needs-info';

export interface ResultItem {
  item: string;
  decision: Decision;
  reason: string;
}

export interface Result {
  schema: 1;
  id: string;
  status: ResultStatus;
  decidedAt: string;
  pr?: string;
  items: ResultItem[];
  questions?: string[];
}

/**
 * The status a result's items call for, apart from needs-info, which is the
 * skill's call. The comment is reported but never counted: disregarding an
 * unrelated comment or an instruction in it doesn't make a submission partial.
 */
export function statusFor(items: readonly ResultItem[]): Exclude<ResultStatus, 'needs-info'> {
  const counted = items.filter((i) => i.item !== 'comment');
  const used = counted.filter((i) => i.decision !== 'not-used').length;
  if (!counted.length || !used) return 'rejected';
  return used === counted.length ? 'integrated' : 'partial';
}

/** Problems with a result: its schema, then whether its status agrees with its items. */
export function resultProblems(result: unknown, validate: ValidateFunction): string[] {
  if (!validate(result)) return formatErrors(validate.errors);
  const r = result as Result;
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const i of r.items) {
    if (seen.has(i.item)) problems.push(`items: ${i.item} is decided twice`);
    seen.add(i.item);
  }
  if (r.status === 'needs-info') {
    if (r.items.some((i) => i.item !== 'comment' && i.decision !== 'not-used')) problems.push('status: a needs-info result integrates nothing, so every item is not-used');
  } else if (statusFor(r.items) !== r.status) {
    problems.push(`status: the items make this ${statusFor(r.items)}, not ${r.status}`);
  }
  if (r.status === 'rejected' && r.pr) problems.push('pr: a rejected submission has no PR');
  return problems;
}

export interface InboxDirs {
  inbox: string;
  processed: string;
}

/**
 * Write a submission's result and move it from inbox/ to processed/. The
 * folder is moved whole, then result.json is written beside it; nothing is
 * deleted. Throws, changing nothing, on an invalid result or a submission
 * that isn't in the inbox or is already processed.
 */
export function closeSubmission(dirs: InboxDirs, id: string, result: unknown, validate: ValidateFunction): string {
  const problems = resultProblems(result, validate);
  if (problems.length) throw new Error(`the result isn't valid: ${problems.join('; ')}`);
  if ((result as Result).id !== id) throw new Error(`the result is for ${(result as Result).id}, not ${id}`);
  const from = join(dirs.inbox, id);
  const to = join(dirs.processed, id);
  if (!existsSync(join(from, 'submission.json'))) throw new Error(`${id} is not in the inbox`);
  if (existsSync(to)) throw new Error(`${id} is already in processed/`);
  if (existsSync(join(from, 'result.json'))) throw new Error(`${id} already holds a result.json`);
  mkdirSync(dirs.processed, { recursive: true });
  renameSync(from, to);
  const path = join(to, 'result.json');
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
}

/** One case of the fixture inbox: tests/fixtures/inbox-expected/<id>.json. */
export interface ExpectedCase {
  /** The case in spec/v1/submissions.md#cases (kept in docs/submissions.md#the-fixture-inbox) it stands for. */
  case: string;
  /**
   * What the routine would find by looking, for the things a fixture can't
   * hold: a URL's page (its key is the URL) or an image's subject and
   * quality (its key is the file name). A fixture run takes these as what it
   * saw, and opens none of the URLs.
   */
  assume?: Record<string, string>;
  /** `inbox check` against the test fixture library: rejected, and the worst status per check. */
  mechanical: { rejected: boolean; checks: Record<string, 'pass' | 'warn' | 'fail'> };
  /** The documented result, without id, decidedAt, and pr. */
  result: Omit<Result, 'schema' | 'id' | 'decidedAt' | 'pr'>;
}

export function loadExpected(dir: string): Map<string, ExpectedCase> {
  const out = new Map<string, ExpectedCase>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) out.set(f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8')));
  return out;
}

export interface Comparison {
  id: string;
  case: string;
  /** Each way the run's result differs from the expected one; empty when it agrees. */
  differences: string[];
}

/**
 * Hold a run's results (processed/<id>/result.json) against the expected
 * ones: the status, and the decision on each expected item. Reasons are
 * words, compared by reading, not here.
 */
export function compareRun(processed: string, expected: Map<string, ExpectedCase>): Comparison[] {
  return [...expected].map(([id, exp]) => {
    const path = join(processed, id, 'result.json');
    if (!existsSync(path)) return { id, case: exp.case, differences: ['no result: the run didn\'t close it'] };
    let got: Result;
    try {
      got = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      return { id, case: exp.case, differences: [`result.json can't be read: ${(e as Error).message}`] };
    }
    const differences: string[] = [];
    if (got.status !== exp.result.status) differences.push(`status: expected ${exp.result.status}, got ${got.status}`);
    const decided = new Map((got.items ?? []).map((i) => [i.item, i.decision]));
    for (const i of exp.result.items) {
      const d = decided.get(i.item);
      if (!d) differences.push(`${i.item}: expected ${i.decision}, not decided`);
      else if (d !== i.decision) differences.push(`${i.item}: expected ${i.decision}, got ${d}`);
    }
    for (const i of got.items ?? []) if (!exp.result.items.some((e) => e.item === i.item)) differences.push(`${i.item}: decided, but not an item the case expects`);
    return { id, case: exp.case, differences };
  });
}
