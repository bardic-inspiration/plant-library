/**
 * Where a submission is filed (spec: submissions.md, Stores): one interface,
 * `SubmissionStore`, with an adapter per store, chosen by `store` in
 * config/site.json. A new store is an adapter file in `stores/` and an entry
 * in `STORES` and the site schema's enum (P4).
 *
 * Whatever the store, a submission can be exported as a bundle file
 * (lib/bundle.ts) that `npm run inbox -- import` unpacks into a checkout.
 */
import type { Submission } from '../../../lib/contribute';
import { BUNDLE_TYPE, bundleName, submissionText, writeBundle } from '../../../lib/bundle';
import { browserStore } from './stores/browser';

export interface SentFile {
  name: string;
  blob: Blob;
}

/** A filed submission with its files. */
export interface Sent {
  id: string;
  submission: Submission;
  files: SentFile[];
}

export type ResultStatus = 'integrated' | 'partial' | 'rejected' | 'needs-info';

/** What the routine decided, from the submission's `result.json` (written by the `integrate` skill). */
export interface SubmissionResult {
  status: ResultStatus;
  pr?: string;
}

export interface SubmissionStore {
  /** File a submission and its files. Submissions are written once and never edited. */
  put(sent: Sent): Promise<void>;
  /** Everything this store holds for this person, newest first. */
  list(): Promise<Sent[]>;
  get(id: string): Promise<Sent | undefined>;
  /** The routine's result, once the store has one. */
  result(id: string): Promise<SubmissionResult | undefined>;
}

export const STORES: Record<string, SubmissionStore> = {
  browser: browserStore,
};

/** The store config/site.json names; the build fails on one with no adapter (contribute.astro). */
export function storeFor(name: string): SubmissionStore {
  const s = STORES[name];
  if (!s) throw new Error(`The "${name}" store has no adapter in site/src/lib/stores/.`);
  return s;
}

/** Submissions and their files as one bundle file. */
export async function bundle(sents: Sent[]): Promise<Blob> {
  const subs = await Promise.all(sents.map(async (s) => ({
    id: s.id,
    submission: submissionText(s.submission),
    files: await Promise.all(s.files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) }))),
  })));
  return new Blob([writeBundle(subs, Math.floor(Date.now() / 1000))], { type: BUNDLE_TYPE });
}

/** Offer the bundle of these submissions to save. */
export async function exportBundle(sents: Sent[]): Promise<void> {
  const href = URL.createObjectURL(await bundle(sents));
  const a = Object.assign(document.createElement('a'), { href, download: bundleName(sents.map((s) => s.id)) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
