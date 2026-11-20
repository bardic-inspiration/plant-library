import { describe, expect, it } from 'vitest';
import { compatibility, type CompatAxis, type Compatibility } from '../lib/compat';
import type { PlantData, PlantListItem } from '../lib/types';

const base: PlantData = { genus: 'Testus', commonNames: ['Test'], family: 'Aceraceae', form: 'shrub', sources: [] };
const p = (species: string, over: Partial<PlantData> = {}): [string, PlantData] => [`plant/${species}`, { ...base, species, ...over }];
const refs = (...keys: string[]): PlantListItem[] => keys.map((k) => ({ plant: { ref: `plant/${k}` }, quantity: 1 }));
const axis = (c: Compatibility, a: CompatAxis) => c.axes.find((x) => x.axis === a)!;

describe('compatibility: shared ranges', () => {
  const plants = new Map([
    p('a', { sun: ['full-sun', 'part-shade'], moisture: ['dry', 'moist'], soil: { drainage: ['well', 'moderate'] }, hardiness: { min: '5', max: '9' }, waterUse: 'low' }),
    p('b', { sun: ['part-shade', 'shade'], moisture: ['moist'], soil: { drainage: ['moderate', 'poor'] }, hardiness: { min: '7b', max: '10' }, waterUse: 'low' }),
  ]);
  const c = compatibility(refs('a', 'b'), plants);

  it('gives the values every plant accepts, in scale order', () => {
    expect(axis(c, 'sun').shared).toEqual(['part-shade']);
    expect(axis(c, 'moisture').shared).toEqual(['moist']);
    expect(axis(c, 'drainage').shared).toEqual(['moderate']);
    expect(axis(c, 'hardiness').shared).toEqual(['7b', '8a', '8b', '9a', '9b']);
    expect(axis(c, 'waterUse').shared).toEqual(['low']);
    for (const a of c.axes) expect(a.conflicts).toEqual([]);
  });

  it('lists the grid: the scale as columns and each plant with what it accepts', () => {
    const sun = axis(c, 'sun');
    expect(sun.values).toEqual(['full-sun', 'part-shade', 'shade']);
    expect(sun.plants).toEqual([
      { key: 'plant/a', accepts: ['full-sun', 'part-shade'] },
      { key: 'plant/b', accepts: ['part-shade', 'shade'] },
    ]);
    expect(axis(c, 'hardiness').values[0]).toBe('1a');
  });

  it('counts a plant once when the list names it at two sizes', () => {
    const items: PlantListItem[] = [...refs('a'), { plant: { ref: 'plant/a' }, size: '#5', quantity: 2 }, ...refs('b')];
    expect(compatibility(items, plants).plants).toEqual(['plant/a', 'plant/b']);
  });

  it('an empty list has no data on any axis', () => {
    const e = compatibility([], plants);
    expect(e.plants).toEqual([]);
    for (const a of e.axes) {
      expect(a.shared).toBeNull();
      expect(a.conflicts).toEqual([]);
    }
  });
});

describe('compatibility: minimal conflicts', () => {
  it('one wet-soil plant against four dry-soil plants names the one', () => {
    const plants = new Map([
      p('wet', { moisture: ['wet'] }),
      p('d1', { moisture: ['dry'] }),
      p('d2', { moisture: ['dry', 'moist'] }),
      p('d3', { moisture: ['dry'] }),
      p('d4', { moisture: ['dry'] }),
    ]);
    const m = axis(compatibility(refs('d1', 'wet', 'd2', 'd3', 'd4'), plants), 'moisture');
    expect(m.shared).toEqual([]);
    expect(m.conflicts).toEqual([{ restores: ['dry'], plants: [{ key: 'plant/wet', needs: ['wet'] }] }]);
  });

  it('chooses the value that needs the fewest removals, with each plant\'s needs', () => {
    const plants = new Map([
      p('a', { sun: ['full-sun'] }),
      p('b', { sun: ['shade'] }),
      p('c', { sun: ['full-sun', 'part-shade'] }),
      p('d', { sun: ['part-shade', 'shade'] }),
      p('e', { sun: ['part-shade'] }),
    ]);
    // full-sun loses b, d, e; part-shade loses a, b; shade loses a, c, e.
    const s = axis(compatibility(refs('a', 'b', 'c', 'd', 'e'), plants), 'sun');
    expect(s.conflicts).toEqual([
      { restores: ['part-shade'], plants: [{ key: 'plant/a', needs: ['full-sun'] }, { key: 'plant/b', needs: ['shade'] }] },
    ]);
  });

  it('gives tied sets as alternatives, and groups values that need the same set', () => {
    const plants = new Map([p('dry', { moisture: ['dry'] }), p('wet', { moisture: ['wet'] })]);
    const m = axis(compatibility(refs('dry', 'wet'), plants), 'moisture');
    expect(m.conflicts).toEqual([
      { restores: ['dry'], plants: [{ key: 'plant/wet', needs: ['wet'] }] },
      { restores: ['wet'], plants: [{ key: 'plant/dry', needs: ['dry'] }] },
    ]);

    const zones = new Map([p('cold', { hardiness: { min: '3', max: '5' } }), p('warm', { hardiness: { min: '8', max: '10' } })]);
    const h = axis(compatibility(refs('cold', 'warm'), zones), 'hardiness');
    expect(h.conflicts).toEqual([
      { restores: ['3a', '3b', '4a', '4b', '5a', '5b'], plants: [{ key: 'plant/warm', needs: ['8a', '8b', '9a', '9b', '10a', '10b'] }] },
      { restores: ['8a', '8b', '9a', '9b', '10a', '10b'], plants: [{ key: 'plant/cold', needs: ['3a', '3b', '4a', '4b', '5a', '5b'] }] },
    ]);
  });

  it('water use is one level per plant: the odd one out is the conflict', () => {
    const plants = new Map([p('a', { waterUse: 'low' }), p('b', { waterUse: 'low' }), p('c', { waterUse: 'high' })]);
    const w = axis(compatibility(refs('a', 'b', 'c'), plants), 'waterUse');
    expect(w.shared).toEqual([]);
    expect(w.conflicts).toEqual([{ restores: ['low'], plants: [{ key: 'plant/c', needs: ['high'] }] }]);
  });
});

describe('compatibility: unknowns', () => {
  const plants = new Map([
    p('a', { moisture: ['dry'] }),
    p('b', { moisture: ['dry', 'moist'] }),
    p('nodata'),
  ]);

  it('a plant with no data is unknown, never a conflict', () => {
    const m = axis(compatibility(refs('a', 'nodata', 'b'), plants), 'moisture');
    expect(m.unknown).toEqual(['plant/nodata']);
    expect(m.plants).toContainEqual({ key: 'plant/nodata', accepts: null });
    expect(m.shared).toEqual(['dry']);
    expect(m.conflicts).toEqual([]);
  });

  it('an axis with no data at all has no shared range', () => {
    const s = axis(compatibility(refs('a', 'nodata'), plants), 'sun');
    expect(s.shared).toBeNull();
    expect(s.unknown).toEqual(['plant/a', 'plant/nodata']);
    expect(s.conflicts).toEqual([]);
  });

  it('unsourced names and refs the library lacks are ignored', () => {
    const items: PlantListItem[] = [...refs('a'), { plant: 'Salix lucida', quantity: 5 }, ...refs('missing')];
    const c = compatibility(items, plants);
    expect(c.plants).toEqual(['plant/a']);
    expect(axis(c, 'moisture').plants).toEqual([{ key: 'plant/a', accepts: ['dry'] }]);
    expect(axis(c, 'moisture').unknown).toEqual([]);
  });
});

describe('compatibility: site fit', () => {
  const plants = new Map([
    p('a', { sun: ['full-sun', 'part-shade'], moisture: ['dry'], soil: { drainage: ['well'] }, hardiness: { min: '6', max: '8b' }, waterUse: 'low' }),
    p('b', { sun: ['shade'], hardiness: { min: '8b', max: '10' } }),
    p('c'),
  ]);
  const items = refs('a', 'b', 'c');

  it('is absent without a site', () => {
    for (const a of compatibility(items, plants).axes) expect(a.siteFit).toBeUndefined();
  });

  it('passes, fails, or is unknown per plant', () => {
    const c = compatibility(items, plants, { sun: 'part-shade', moisture: 'dry' });
    expect(axis(c, 'sun').siteFit).toEqual({ 'plant/a': 'pass', 'plant/b': 'fail', 'plant/c': 'unknown' });
    expect(axis(c, 'moisture').siteFit).toEqual({ 'plant/a': 'pass', 'plant/b': 'unknown', 'plant/c': 'unknown' });
  });

  it('is unknown for every plant on an axis the site does not state', () => {
    const c = compatibility(items, plants, { sun: 'part-shade' });
    expect(axis(c, 'drainage').siteFit).toEqual({ 'plant/a': 'unknown', 'plant/b': 'unknown', 'plant/c': 'unknown' });
    expect(axis(c, 'waterUse').siteFit).toEqual({ 'plant/a': 'unknown', 'plant/b': 'unknown', 'plant/c': 'unknown' });
  });

  it('a whole site zone needs both halves; a half zone needs only itself', () => {
    expect(axis(compatibility(items, plants, { hardinessZone: '8b' }), 'hardiness').siteFit)
      .toEqual({ 'plant/a': 'pass', 'plant/b': 'pass', 'plant/c': 'unknown' });
    expect(axis(compatibility(items, plants, { hardinessZone: '8' }), 'hardiness').siteFit)
      .toEqual({ 'plant/a': 'pass', 'plant/b': 'fail', 'plant/c': 'unknown' });
  });

  it('a site with several values needs the plant to accept each, except on sun, where one will do', () => {
    const c = compatibility(items, plants, { sun: ['full-sun', 'part-shade'], soil: { drainage: ['well', 'moderate'] } });
    expect(axis(c, 'sun').siteFit!['plant/a']).toBe('pass');
    expect(axis(c, 'drainage').siteFit!['plant/a']).toBe('fail');
    // Sun differs from place to place on a site: a shade plant has the shady part of a sun-and-shade site.
    expect(axis(compatibility(items, plants, { sun: ['full-sun', 'shade'] }), 'sun').siteFit).toEqual({ 'plant/a': 'pass', 'plant/b': 'pass', 'plant/c': 'unknown' });
    expect(axis(compatibility(items, plants, { sun: ['full-sun'] }), 'sun').siteFit).toEqual({ 'plant/a': 'pass', 'plant/b': 'fail', 'plant/c': 'unknown' });
    expect(axis(compatibility(items, plants, { moisture: ['dry', 'wet'] }), 'moisture').siteFit!['plant/a']).toBe('fail');
  });
});
