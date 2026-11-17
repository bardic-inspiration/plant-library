/** Wording for values: the template's job (P7), shared by pages and the island. */
import type { Range } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthName(m: number, long = false): string {
  return (long ? MONTHS_LONG : MONTHS)[m - 1];
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** "8–15 ft", or "20 ft" for a single figure. */
export function formatRange(r: Range | undefined, unit = 'ft'): string {
  if (!r) return '';
  const u = unit ? ` ${unit}` : '';
  return r.min === r.max ? `${num(r.min)}${u}` : `${num(r.min)}–${num(r.max)}${u}`;
}

/** The same range in metres, for the metric line. */
export function formatMetric(r: Range | undefined): string {
  if (!r) return '';
  const m = (ft: number) => (ft * 0.3048 < 10 ? (Math.round(ft * 0.3048 * 10) / 10).toString() : Math.round(ft * 0.3048).toString());
  return r.min === r.max ? `${m(r.min)} m` : `${m(r.min)}–${m(r.max)} m`;
}

export function formatMonths(m: { start: number; end: number } | undefined): string {
  if (!m) return '';
  return m.start === m.end ? monthName(m.start, true) : `${monthName(m.start, true)} to ${monthName(m.end, true)}`;
}
