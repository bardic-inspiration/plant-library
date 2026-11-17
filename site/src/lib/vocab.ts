/** Vocabulary labels for templates and the island. */
import vocabJson from '../../../config/vocab.json' with { type: 'json' };
import type { Vocab, VocabValue } from '../../../lib/types';

export const vocab = vocabJson as unknown as Vocab;

const maps = new Map<string, Map<string, VocabValue>>();

export function vocabList(list: string): VocabValue[] {
  return (vocab[list] as VocabValue[]) ?? [];
}

/** The label of a vocabulary value, or the value itself when it has none. */
export function label(list: string, id: string): string {
  let m = maps.get(list);
  if (!m) {
    m = new Map(vocabList(list).map((v) => [v.id, v]));
    maps.set(list, m);
  }
  return m.get(id)?.label ?? id;
}

export function labels(list: string, ids: string[] | undefined): string {
  return (ids ?? []).map((i) => label(list, i)).join(', ');
}
