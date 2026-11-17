import { describe, expect, it } from 'vitest';
import { derivePlant, monthsBetween, seasonsFor, sizeClassFor } from '../lib/derive';
import { expandZones, formatZoneRange, zoneIndex } from '../lib/zones';
import type { PlantData } from '../lib/types';

const base: PlantData = { genus: 'Acer', species: 'circinatum', commonNames: ['Vine maple'], family: 'Aceraceae', form: 'tree', sources: [] };

describe('derived plant values', () => {
  it('name and sort name come from the parts', () => {
    const d = derivePlant({ ...base, cultivar: 'Pacific Fire' });
    expect(d.name).toBe("Acer circinatum 'Pacific Fire'");
    expect(d.sortName).toBe('acer circinatum pacific fire');
  });

  it('native status: native, adapted, or unknown', () => {
    expect(derivePlant({ ...base, nativeRange: { states: ['WA'], ecoregions: [] } }).nativeStatus).toBe('native');
    expect(derivePlant({ ...base, nativeRange: { states: [], ecoregions: [] } }).nativeStatus).toBe('adapted');
    expect(derivePlant(base).nativeStatus).toBeUndefined();
  });

  it('bloom months wrap the year, and give seasons', () => {
    expect(monthsBetween(11, 2)).toEqual([11, 12, 1, 2]);
    expect(monthsBetween(4, 4)).toEqual([4]);
    expect(seasonsFor([11, 12, 1, 2])).toEqual(['fall', 'winter']);
    const d = derivePlant({ ...base, bloom: { months: { start: 12, end: 2 } } });
    expect(d.bloomMonthList).toEqual([12, 1, 2]);
    expect(d.bloomSeasons).toEqual(['winter']);
  });

  it('size class by form and height', () => {
    expect(sizeClassFor('tree', 20)).toBe('small-tree');
    expect(sizeClassFor('tree', 25)).toBe('small-tree');
    expect(sizeClassFor('tree', 26)).toBe('medium-tree');
    expect(sizeClassFor('tree', 150)).toBe('large-tree');
    expect(sizeClassFor('shrub', 6)).toBe('medium-shrub');
    expect(sizeClassFor('perennial', 0.5)).toBe('low');
    expect(sizeClassFor('vine', 30)).toBeUndefined();
    expect(sizeClassFor('tree', undefined)).toBeUndefined();
  });

  it('hardiness zones expand to half zones', () => {
    expect(expandZones({ min: '7', max: '8' })).toEqual(['7a', '7b', '8a', '8b']);
    expect(expandZones({ min: '7b', max: '8a' })).toEqual(['7b', '8a']);
    expect(zoneIndex('1a', 'min')).toBe(0);
    expect(zoneIndex('13', 'max')).toBe(25);
    expect(formatZoneRange({ min: '5', max: '9' })).toBe('Zones 5–9');
    expect(derivePlant({ ...base, hardiness: { min: '8b', max: '9' } }).hardinessZones).toEqual(['8b', '9a', '9b']);
  });
});
