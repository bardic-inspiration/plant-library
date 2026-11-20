/**
 * Coverage: what the library still lacks, and what must be cleared before
 * commercial use, and the placeholders still to replace. Pure over the built data.
 */
import type { BuildData } from './build-data';
import { normalizeName } from './names';
import type { PlantData, VocabValue } from './types';

export interface Coverage {
  /** Plant names projects and palettes give as text, most used first. */
  unsourced: { name: string; lists: string[]; quantity: number }[];
  /** Everything that depends on a non-commercial source or image. */
  nonCommercial: { entry: string; what: string }[];
  /** Every field that holds a placeholder, to be replaced from a real source. */
  placeholders: { entry: string; what: string }[];
}

export function coverage(data: BuildData): Coverage {
  const { sources, vocab } = data.library.config;
  const nc = new Set((vocab.license as VocabValue[]).filter((l) => l.nonCommercial).map((l) => l.id));
  const unsourced = new Map<string, { name: string; lists: Set<string>; quantity: number }>();
  const nonCommercial: Coverage['nonCommercial'] = [];
  const placeholders: Coverage['placeholders'] = [];
  for (const b of data.entries) {
    const list = (b.entry.data as { plantList?: { plant: unknown; quantity?: number }[] }).plantList ?? [];
    for (const item of list) {
      if (typeof item.plant !== 'string') continue;
      const k = normalizeName(item.plant);
      const u = unsourced.get(k) ?? { name: item.plant.trim(), lists: new Set<string>(), quantity: 0 };
      u.lists.add(b.key);
      u.quantity += item.quantity ?? 0;
      unsourced.set(k, u);
    }
    if (b.entry.type === 'plant') {
      const d = b.entry.data as unknown as PlantData;
      for (const c of d.sources) if (sources[c.source]?.restriction === 'non-commercial') nonCommercial.push({ entry: b.key, what: `${c.source} cited for ${c.fields.join(', ')}` });
      for (const c of d.sources) if (sources[c.source]?.kind === 'placeholder') placeholders.push({ entry: b.key, what: c.fields.join(', ') });
      for (const img of d.images ?? []) if (nc.has(img.license)) nonCommercial.push({ entry: b.key, what: `${img.file} (${img.license})` });
    }
  }
  return {
    unsourced: [...unsourced.values()]
      .map((u) => ({ name: u.name, lists: [...u.lists].sort(), quantity: u.quantity }))
      .sort((a, b) => b.lists.length - a.lists.length || b.quantity - a.quantity || a.name.localeCompare(b.name)),
    nonCommercial: nonCommercial.sort((a, b) => a.entry.localeCompare(b.entry) || a.what.localeCompare(b.what)),
    placeholders: placeholders.sort((a, b) => a.entry.localeCompare(b.entry) || a.what.localeCompare(b.what)),
  };
}
