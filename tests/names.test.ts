import { describe, expect, it } from 'vitest';
import { botanicalName, fullName, nameSegments, normalizeName, plantId, slugify, sortName } from '../lib/names';

describe('plant names', () => {
  it('a species', () => {
    const p = { genus: 'Acer', species: 'circinatum' };
    expect(botanicalName(p)).toBe('Acer circinatum');
    expect(plantId(p)).toBe('acer-circinatum');
    expect(nameSegments(p)).toEqual([['Acer', 'i'], ['circinatum', 'i']]);
  });

  it('a variety: the rank is upright, the epithet italic', () => {
    const p = { genus: 'Pinus', species: 'contorta', infraRank: 'var.', infraEpithet: 'contorta' };
    expect(botanicalName(p)).toBe('Pinus contorta var. contorta');
    expect(plantId(p)).toBe('pinus-contorta-var-contorta');
    expect(nameSegments(p)[2]).toEqual(['var.', 'r']);
    expect(nameSegments(p)[3]).toEqual(['contorta', 'i']);
  });

  it('a cultivar of a species: quoted and upright', () => {
    const p = { genus: 'Acer', species: 'circinatum', cultivar: 'Pacific Fire' };
    expect(botanicalName(p)).toBe("Acer circinatum 'Pacific Fire'");
    expect(plantId(p)).toBe('acer-circinatum-pacific-fire');
    expect(nameSegments(p).at(-1)).toEqual(['‘Pacific Fire’', 'r']);
  });

  it('a hybrid species puts × before the epithet', () => {
    const p = { genus: 'Acer', species: 'freemanii', hybrid: true };
    expect(botanicalName(p)).toBe('Acer × freemanii');
    expect(plantId(p)).toBe('acer-x-freemanii');
    expect(nameSegments(p)[1]).toEqual(['×', 'r']);
  });

  it('a hybrid cultivar with no species epithet and a trade name', () => {
    const p = { genus: 'Rosa', hybrid: true, cultivar: 'Radrazz', tradeName: 'Knock Out' };
    expect(botanicalName(p)).toBe("Rosa 'Radrazz'");
    expect(fullName(p)).toBe("Rosa 'Radrazz' Knock Out");
    expect(plantId(p)).toBe('rosa-radrazz');
    expect(nameSegments(p).at(-1)).toEqual(['Knock Out', 't']);
  });

  it('normalizes names for matching plant lists', () => {
    expect(normalizeName("Cornus sericea 'Kelseyi'")).toBe(normalizeName('cornus sericea ‘Kelseyi’'));
    expect(normalizeName('Acer × freemanii')).toBe(normalizeName('Acer x freemanii'));
    expect(normalizeName('Berberis aquifolium')).toBe('berberis aquifolium');
    expect(normalizeName('Physocarpus opulifolius ssp. capitatus')).toBe(normalizeName('Physocarpus opulifolius subsp. capitatus'));
    expect(normalizeName('Rosa Knock Out®')).toBe('rosa knock out');
  });

  it('slugifies to lowercase ASCII', () => {
    expect(slugify('Ceanothus ‘Ray Hartman’')).toBe('ceanothus-ray-hartman');
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
    expect(sortName({ genus: 'Acer', species: 'circinatum' })).toBe('acer circinatum');
  });
});
