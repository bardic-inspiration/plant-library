/** USDA hardiness zones as written in entries: `7` (the whole zone) or `7a`, `7b`. */

const ZONE = /^([1-9]|1[0-3])([ab])?$/;

/** The half zones in order, 1a to 13b. */
export const HALF_ZONES: string[] = Array.from({ length: 13 }, (_, i) => [`${i + 1}a`, `${i + 1}b`]).flat();

export function isZone(z: string): boolean {
  return ZONE.test(z);
}

/** The position of a half zone on the 1a…13b scale; a whole zone takes its a or b end. */
export function zoneIndex(z: string, end: 'min' | 'max'): number {
  const m = ZONE.exec(z);
  if (!m) throw new Error(`Not a hardiness zone: ${z}`);
  const n = Number(m[1]);
  const half = m[2] ?? (end === 'min' ? 'a' : 'b');
  return (n - 1) * 2 + (half === 'a' ? 0 : 1);
}

/** Every half zone a range covers. */
export function expandZones(range: { min: string; max: string }): string[] {
  const lo = zoneIndex(range.min, 'min');
  const hi = zoneIndex(range.max, 'max');
  return HALF_ZONES.slice(lo, hi + 1);
}

/** A zone range written for people: "Zones 5–9" or "Zones 7b–10a". */
export function formatZoneRange(range: { min: string; max: string }): string {
  return range.min === range.max ? `Zone ${range.min}` : `Zones ${range.min}–${range.max}`;
}
