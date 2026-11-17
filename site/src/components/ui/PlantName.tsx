/** A plant name set by the naming rule: epithets italic, cultivars upright in quotes, trade names in small caps. */
export function PlantName({ parts, fallback }: { parts?: [string, 'i' | 'r' | 't'][]; fallback?: string }) {
  if (!parts?.length) return <>{fallback}</>;
  return (
    <span class="plant-name">
      {parts.map(([text, style], i) => (
        <>
          {i > 0 ? ' ' : ''}
          {style === 'i' ? <i>{text}</i> : style === 't' ? <span class="trade-name">{text}</span> : text}
        </>
      ))}
    </span>
  );
}
