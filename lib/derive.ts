/**
 * Values computed at build and never stored (P3). Pure functions, shared by
 * the index build, the detail pages, and the tests.
 */
import vocabJson from '../config/vocab.json' with { type: 'json' };
import { featureAt, type GeoLayers } from './geo';
import { botanicalName, sortName } from './names';
import { expandZones, zoneIndex } from './zones';
import type { GeoDerived, LatLon, PlantData, PlantDerived, Vocab } from './types';

const defaultVocab = vocabJson as unknown as Vocab;

/** The months a bloom period covers, in calendar order of the period (wrapping the year). */
export function monthsBetween(start: number, end: number): number[] {
  const out: number[] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === end) break;
    m = (m % 12) + 1;
  }
  return out;
}

export function seasonsFor(months: number[], vocab: Vocab = defaultVocab): string[] {
  const set = new Set(months);
  const order = (vocab.season as { id: string }[]).map((s) => s.id);
  return order.filter((s) => (vocab.seasonMonths[s] ?? []).some((m) => set.has(m)));
}

export function sizeClassFor(form: string, heightMax: number | undefined, vocab: Vocab = defaultVocab): string | undefined {
  if (heightMax === undefined) return undefined;
  const rules = vocab.sizeClassRules[form];
  if (!rules) return undefined;
  for (const r of rules) {
    if (r.maxHeight === null || heightMax <= r.maxHeight) return r.class;
  }
  return undefined;
}

export function derivePlant(d: PlantData, vocab: Vocab = defaultVocab): PlantDerived {
  const out: PlantDerived = {
    name: botanicalName(d),
    sortName: sortName(d),
  };
  if (d.nativeRange) out.nativeStatus = d.nativeRange.states.length > 0 ? 'native' : 'adapted';
  if (d.bloom?.months) {
    out.bloomMonthList = monthsBetween(d.bloom.months.start, d.bloom.months.end);
    out.bloomSeasons = seasonsFor(out.bloomMonthList, vocab);
  }
  const sc = sizeClassFor(d.form, d.height?.max, vocab);
  if (sc) out.sizeClass = sc;
  if (d.hardiness) {
    out.hardinessZones = expandZones(d.hardiness);
    out.hardinessMin = zoneIndex(d.hardiness.min, 'min');
  }
  return out;
}

/**
 * A point's geography from the boundary layers in geo/ (P6): `state` (postal
 * code, as in the `state` vocabulary), `county` (5-digit FIPS), `place` (7-digit
 * Census place code, absent outside any incorporated place or CDP), and
 * `ecoregion` (EPA Level III code). Every value is absent for a point outside
 * the three states. The state is the county's, so the two always agree. Pass
 * `loadGeo()` from lib/geo-load.ts. `hardinessZone` waits on the zone data's terms
 * (spec/v1/map.md#open-questions).
 */
export function deriveGeo(location: LatLon, layers: GeoLayers): GeoDerived {
  const { lat, lon } = location;
  const county = featureAt(layers.counties, lon, lat);
  if (!county) return {};
  const out: GeoDerived = { state: county.props.state, county: county.id };
  const place = featureAt(layers.places, lon, lat);
  if (place) out.place = place.id;
  const eco = featureAt(layers.ecoregions, lon, lat);
  if (eco) out.ecoregion = eco.id;
  return out;
}
