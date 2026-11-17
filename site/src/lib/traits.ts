/** Labels for plant data paths, used by detail pages, sources, and field notes. */
export const TRAIT_LABELS: Record<string, string> = {
  genus: 'Genus',
  species: 'Species',
  infraEpithet: 'Infraspecific name',
  commonNames: 'Common names',
  synonyms: 'Synonyms',
  usdaSymbol: 'USDA symbol',
  family: 'Family',
  form: 'Form',
  foliage: 'Foliage',
  height: 'Height',
  spread: 'Spread',
  growthRate: 'Growth rate',
  sun: 'Sun',
  moisture: 'Moisture',
  soil: 'Soil',
  'soil.texture': 'Soil texture',
  'soil.drainage': 'Soil drainage',
  'soil.ph': 'Soil pH',
  hardiness: 'Hardiness',
  waterUse: 'Water use',
  tolerates: 'Tolerates',
  bloom: 'Bloom',
  'bloom.colors': 'Bloom color',
  'bloom.months': 'Bloom period',
  fallColor: 'Fall color',
  fruit: 'Fruit',
  wildlife: 'Wildlife',
  uses: 'Uses',
  wetlandIndicator: 'Wetland indicator',
  nativeRange: 'Native range',
};

export function traitLabel(path: string): string {
  return TRAIT_LABELS[path] ?? path;
}
