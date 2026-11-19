/**
 * The MapLibre style document, built from the design tokens (spec: the map
 * shares the tokens). Pure: it is handed a token reader, so the build passes
 * the token files' values and the test passes sentinels to prove every color
 * in the style came from a token. Client-safe.
 *
 * The basemap is the Protomaps basemap schema (OpenStreetMap data, ODbL),
 * read from a PMTiles extract published with the site (scripts/basemap.ts).
 * Overlays (#29) insert their layers before `OVERLAY_BEFORE`, under the
 * basemap's water, so state and county polygons that run out to the state
 * line over water are hidden by the coastline without clipped copies (D41).
 */
import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';

export interface MapTokens {
  /** A color token's value: `color('--map-land')`. */
  color(name: string): string;
  /** A length token in pixels (or a unitless or em value as a number). */
  num(name: string): number;
}

export interface MapStyleOptions {
  /** The site's base path, ending in `/`. URLs in the style are under it; the client makes them absolute. */
  base: string;
  /** Whether a basemap extract was published; without one the map draws on plain land. */
  basemap: string | null;
  /** Project types in vocabulary order, each with the token its accent resolves to. */
  projectTypes: { id: string; token: string }[];
  /** Font stack names for labels, matching the glyph folders. */
  fonts: { regular: string; strong: string };
  /** Clustering, shared with the test that checks marks don't overlap. */
  cluster: ClusterOptions;
  /** The view the map opens on, [west, south, east, north]: the three states. */
  bounds: [number, number, number, number];
}

export interface ClusterOptions {
  /** Cluster radius in pixels (MapLibre's `clusterRadius`). */
  radius: number;
  /** Highest zoom at which points still cluster. */
  maxZoom: number;
  /** A cluster at or above this count draws at the large radius. */
  largeAt: number;
}

export const CLUSTER: ClusterOptions = { radius: 48, maxZoom: 11, largeAt: 10 };

export const BASEMAP_SOURCE = 'basemap';
export const PROJECT_SOURCE = 'projects';
/** Overlay layers are added before this layer id, or on top when there is no basemap. */
export const OVERLAY_BEFORE = 'water';
export const PROJECT_LAYERS = ['project-clusters', 'project-cluster-count', 'project-points'] as const;

/** Style metadata key holding the opening view's bounds. */
export const BOUNDS_KEY = 'plant-library:bounds';

export const BASEMAP_ATTRIBUTION = '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Glyph folders are named `<family> <weight name>` (scripts/build-map.ts writes them). */
export const WEIGHT_NAMES: Record<string, string> = { '400': 'Regular', '600': 'SemiBold', '800': 'ExtraBold' };

export function buildMapStyle(t: MapTokens, o: MapStyleOptions): StyleSpecification {
  const halo = { 'text-halo-color': t.color('--map-halo'), 'text-halo-width': t.num('--map-halo-width') };

  const typeColor = (fallback: string): ExpressionSpecification =>
    ['match', ['get', 'projectType'], ...o.projectTypes.flatMap((p) => [p.id, t.color(p.token)]), fallback] as unknown as ExpressionSpecification;

  const basemap: LayerSpecification[] = o.basemap
    ? [
        { id: 'earth', type: 'fill', source: BASEMAP_SOURCE, 'source-layer': 'earth', paint: { 'fill-color': t.color('--map-land') } },
        { id: 'water', type: 'fill', source: BASEMAP_SOURCE, 'source-layer': 'water', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': t.color('--map-water') } },
        { id: 'coast', type: 'line', source: BASEMAP_SOURCE, 'source-layer': 'water', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': t.color('--map-coast'), 'line-width': t.num('--map-line-coast') } },
        { id: 'roads-major', type: 'line', source: BASEMAP_SOURCE, 'source-layer': 'roads', minzoom: 8, filter: ['all', ['==', 'kind', 'major_road'], ['!has', 'is_tunnel']], paint: { 'line-color': t.color('--map-road'), 'line-width': t.num('--map-line-road') } },
        { id: 'roads-highway', type: 'line', source: BASEMAP_SOURCE, 'source-layer': 'roads', minzoom: 5, filter: ['all', ['==', 'kind', 'highway'], ['!has', 'is_tunnel'], ['!has', 'is_link']], paint: { 'line-color': t.color('--map-road'), 'line-width': t.num('--map-line-road') * 2 } },
        { id: 'boundaries', type: 'line', source: BASEMAP_SOURCE, 'source-layer': 'boundaries', filter: ['<=', 'kind_detail', 4], paint: { 'line-color': t.color('--map-boundary'), 'line-width': t.num('--map-line-boundary') } },
        {
          id: 'places-region',
          type: 'symbol',
          source: BASEMAP_SOURCE,
          'source-layer': 'places',
          maxzoom: 7,
          filter: ['==', 'kind', 'region'],
          layout: { 'text-field': ['get', 'name'], 'text-font': [o.fonts.strong], 'text-size': t.num('--map-label-size-large'), 'text-transform': 'uppercase', 'text-letter-spacing': t.num('--map-label-tracking') },
          paint: { 'text-color': t.color('--map-label-strong'), ...halo },
        },
        {
          id: 'places-locality',
          type: 'symbol',
          source: BASEMAP_SOURCE,
          'source-layer': 'places',
          filter: ['all', ['==', ['get', 'kind'], 'locality'], ['<=', ['get', 'min_zoom'], ['+', ['zoom'], 1]]],
          layout: { 'text-field': ['get', 'name'], 'text-font': [o.fonts.regular], 'text-size': t.num('--map-label-size'), 'symbol-sort-key': ['get', 'min_zoom'] },
          paint: { 'text-color': t.color('--map-label'), ...halo },
        },
      ]
    : [];

  const projects: LayerSpecification[] = [
    {
      id: 'project-clusters',
      type: 'circle',
      source: PROJECT_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': t.color('--map-cluster'),
        'circle-radius': ['step', ['get', 'point_count'], t.num('--map-cluster-radius'), o.cluster.largeAt, t.num('--map-cluster-radius-large')],
        'circle-stroke-color': t.color('--map-halo'),
        'circle-stroke-width': t.num('--map-line-coast'),
      },
    },
    {
      id: 'project-cluster-count',
      type: 'symbol',
      source: PROJECT_SOURCE,
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': [o.fonts.strong], 'text-size': t.num('--map-cluster-text-size'), 'text-allow-overlap': true },
      paint: { 'text-color': t.color('--map-cluster-text') },
    },
    {
      id: 'project-points',
      type: 'circle',
      source: PROJECT_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        // Constructed projects are filled; proposed ones are hollow rings.
        'circle-color': ['case', ['==', ['get', 'status'], 'proposed'], t.color('--map-mark-empty'), typeColor(t.color('--site-accent'))],
        'circle-radius': t.num('--map-mark-radius'),
        'circle-stroke-color': typeColor(t.color('--site-accent')),
        'circle-stroke-width': t.num('--map-line-mark'),
      },
    },
  ];

  return {
    version: 8,
    name: 'Plant Library',
    metadata: { [BOUNDS_KEY]: o.bounds },
    glyphs: `${o.base}map/glyphs/{fontstack}/{range}.pbf`,
    sources: {
      ...(o.basemap ? { [BASEMAP_SOURCE]: { type: 'vector' as const, url: `pmtiles://${o.base}${o.basemap}`, attribution: BASEMAP_ATTRIBUTION } } : {}),
      [PROJECT_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: o.cluster.radius, clusterMaxZoom: o.cluster.maxZoom },
    },
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': t.color('--map-land') } }, ...basemap, ...projects],
  };
}
