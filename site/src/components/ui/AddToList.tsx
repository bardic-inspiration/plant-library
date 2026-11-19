import { useEffect, useState } from 'preact/hooks';
import { addLines, addPlant, hasPlant } from '../../../../lib/workspace';
import { url } from '../../../../lib/site';
import { currentList, readStore, withCurrent, writeStore } from '../../lib/workspace-store';

type State = { kind: 'idle' | 'on' | 'added' | 'busy' | 'failed'; list?: string; count?: number };

/**
 * "Add to list": adds a plant, or a project's or palette's whole list, to the
 * workspace's current list in local storage. A plant already on the list
 * says so instead of adding a second line. Rendered only in the browser
 * (the Library island's cards, and plant pages as an island), since it does
 * nothing without JavaScript.
 */
export function AddToList({ entry, name }: { entry: string; name: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const isPlant = entry.startsWith('plant/');

  useEffect(() => {
    if (!isPlant) return;
    const store = readStore();
    const list = currentList(store);
    if (hasPlant(list, entry)) setState({ kind: 'on', list: list.name });
  }, [entry]);

  const add = async () => {
    if (isPlant) {
      const store = readStore();
      const list = currentList(store);
      if (hasPlant(list, entry)) return setState({ kind: 'on', list: list.name });
      const ok = writeStore(withCurrent(store, (l) => addPlant(l, entry)));
      return setState(ok ? { kind: 'added', list: list.name, count: 1 } : { kind: 'failed' });
    }
    // A project or palette: its full entry holds the list.
    setState({ kind: 'busy' });
    try {
      const r = await fetch(url(`data/${entry}.json`));
      if (!r.ok) throw new Error(String(r.status));
      const items = ((await r.json()) as { data?: { plantList?: unknown[] } }).data?.plantList ?? [];
      const store = readStore();
      const list = currentList(store);
      const ok = writeStore(withCurrent(store, (l) => addLines(l, items)));
      setState(ok ? { kind: 'added', list: list.name, count: items.length } : { kind: 'failed' });
    } catch {
      setState({ kind: 'failed' });
    }
  };

  const message =
    state.kind === 'on'
      ? `Already on ${state.list}.`
      : state.kind === 'added'
        ? isPlant
          ? `Added to ${state.list}.`
          : `Added ${state.count} ${state.count === 1 ? 'line' : 'lines'} to ${state.list}.`
        : state.kind === 'failed'
          ? 'Not added: this browser blocked saving the list.'
          : '';
  return (
    <div class="add-to-list">
      <button type="button" class="add-button" onClick={add} disabled={state.kind === 'busy'} aria-label={`Add to list: ${name}`}>
        Add to list
      </button>
      <span class="add-status" role="status">
        {message && (
          <>
            {message} <a href={url('workspace/')}>Open the workspace</a>
          </>
        )}
      </span>
    </div>
  );
}
