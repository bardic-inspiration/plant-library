/**
 * What this browser has sent: each submission with its files, kept in
 * IndexedDB (spec: submissions.md, Stores, the `browser` store). The forms
 * `put` here and "My submissions" lists it. IndexedDB can be missing or
 * refuse a write (a private window, blocked site data); calls then reject,
 * and the form says the submission wasn't filed.
 */
import type { Submission } from '../../../lib/contribute';

const DB = 'plant-library-submissions';
const STORE = 'submissions';

export interface SentFile {
  name: string;
  blob: Blob;
}

export interface Sent {
  id: string;
  submission: Submission;
  files: SentFile[];
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser has no IndexedDB.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB did not open.'));
  });
}

async function run<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB refused the request.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted the request.'));
    });
  } finally {
    db.close();
  }
}

/** File a submission and its files. Submissions are written once and never edited. */
export function put(sent: Sent): Promise<IDBValidKey> {
  return run('readwrite', (s) => s.add(sent));
}

/** Everything this browser has sent, newest first. */
export async function list(): Promise<Sent[]> {
  const all = await run<Sent[]>('readonly', (s) => s.getAll() as IDBRequest<Sent[]>);
  return all.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function get(id: string): Promise<Sent | undefined> {
  return run<Sent | undefined>('readonly', (s) => s.get(id) as IDBRequest<Sent | undefined>);
}
