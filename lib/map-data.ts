/** What the map draws, from the index records. Client-safe. */
import type { IndexRecord } from './types';

export interface ProjectFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { key: string; name: string; url: string; projectType: string; status: string; place: string };
}

/** Projects as points (D40: a project is a point), with what the style and the popup read. */
export function projectFeatures(records: IndexRecord[]): { type: 'FeatureCollection'; features: ProjectFeature[] } {
  const features: ProjectFeature[] = [];
  for (const r of records) {
    const loc = r.card.location as [number, number] | undefined;
    if (r.type !== 'project' || !loc) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: loc },
      properties: { key: r.key, name: r.name, url: r.url, projectType: String(r.card.projectType ?? ''), status: String(r.card.status ?? ''), place: String(r.card.place ?? '') },
    });
  }
  return { type: 'FeatureCollection', features };
}
