import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildData } from '../lib/build-data';
import { attribution, attributionMarkdown } from '../lib/attribution';
import { coverage } from '../lib/coverage';
import { FIXTURES, ROOT } from './helpers';

describe('attribution', () => {
  it('ATTRIBUTION.md is current with the library', () => {
    const expected = attributionMarkdown(attribution(buildData({ dataRoot: ROOT })));
    expect(readFileSync(join(ROOT, 'ATTRIBUTION.md'), 'utf8'), 'run npm run attribution').toBe(expected);
  });

  it('lists each cited source, image, and contributor', () => {
    const a = attribution(buildData({ dataRoot: FIXTURES }));
    expect(a.sources.map((s) => s.id)).toEqual(['staff-observation', 'usda-plants']);
    expect(a.images.length).toBeGreaterThan(10);
    expect(a.contributors).toEqual(['Second Contributor', 'Test Contributor']);
  });
});

describe('coverage', () => {
  it('lists nothing non-commercial in the fixtures', () => {
    expect(coverage(buildData({ dataRoot: FIXTURES })).nonCommercial).toEqual([]);
  });

  it('lists every placeholder in the library', () => {
    const c = coverage(buildData({ dataRoot: FIXTURES }));
    expect(c.placeholders).toEqual([]);
    const lib = coverage(buildData({ dataRoot: ROOT }));
    expect(lib.placeholders.length).toBeGreaterThan(0);
    expect(lib.placeholders.every((p) => p.what === 'family')).toBe(true);
  });
});
