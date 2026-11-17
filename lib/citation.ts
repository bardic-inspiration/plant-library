/** Rendering a source's citation template for one entry's citation. */
import type { Citation, SourceDef } from './types';

export function renderCitation(src: SourceDef, c: Citation): string {
  return src.citation
    .replace('{year}', c.accessed.slice(0, 4))
    .replace('{accessed}', c.accessed)
    .replace('{contributor}', c.contributor ? `${c.contributor.name}, ${c.contributor.role}` : 'a colleague');
}
