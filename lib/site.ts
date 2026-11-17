/**
 * The site's base path. Every internal link goes through `url()`, so the
 * site can move between hosts by changing config/site.json alone.
 */
import site from '../config/site.json' with { type: 'json' };

export const BASE: string = site.base;
export const SITE_TITLE: string = site.title;

/** An internal URL under the base. `url('plant/acer-circinatum/')` → `/plant/acer-circinatum/`. */
export function url(path = ''): string {
  return BASE + path.replace(/^\/+/, '');
}

/** The page URL of an entry. */
export function entryUrl(key: string): string {
  return url(`${key}/`);
}
