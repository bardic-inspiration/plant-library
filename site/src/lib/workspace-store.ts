/**
 * The workspace's lists in the browser's local storage, shared by the
 * workspace page and the "add to list" controls. Storage can be missing or
 * refuse a write (a private window, blocked site data); reads then give a
 * fresh store and writes report failure, so the page still works for the
 * visit.
 */
import { cleanStore, emptyList, STORE_KEY, type WorkspaceList, type WorkspaceStore } from '../../../lib/workspace';

export function readStore(): WorkspaceStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return cleanStore(raw ? JSON.parse(raw) : undefined);
  } catch {
    return cleanStore(undefined);
  }
}

/** Write the store; false when the browser refused it. */
export function writeStore(store: WorkspaceStore): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function currentList(store: WorkspaceStore): WorkspaceList {
  return store.lists.find((l) => l.id === store.current) ?? store.lists[0] ?? emptyList();
}

/** The store with the current list replaced by `change(current)`. */
export function withCurrent(store: WorkspaceStore, change: (list: WorkspaceList) => WorkspaceList): WorkspaceStore {
  const cur = currentList(store);
  const next = change(cur);
  return next === cur ? store : { ...store, lists: store.lists.map((l) => (l.id === cur.id ? next : l)) };
}
