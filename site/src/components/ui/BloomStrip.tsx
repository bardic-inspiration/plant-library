import { monthName } from '../../../../lib/format';

/**
 * Twelve cells, January to December; bloom months are filled in the bloom
 * color. The text alternative says the same thing in words.
 */
export function BloomStrip({ months, colors, label }: { months?: number[]; colors?: string[]; label: string }) {
  if (!months?.length) return null;
  const set = new Set(months);
  const color = colors?.[0] ?? 'white';
  return (
    <span class="bloom-strip" role="img" aria-label={label}>
      {Array.from({ length: 12 }, (_, i) => (
        <span class={set.has(i + 1) ? 'bloom-cell on' : 'bloom-cell'} data-bloom={set.has(i + 1) ? color : undefined} title={monthName(i + 1)} />
      ))}
    </span>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span class="swatch-label">
      <span class="swatch" data-bloom={color} aria-hidden="true" />
      {label}
    </span>
  );
}
