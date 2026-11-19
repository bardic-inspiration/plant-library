/**
 * Map overlays: the registry's types, and the MapLibre layers and legend an
 * overlay draws, built from its token names (P4, P9). Client-safe: the map
 * component reads the result from the style's metadata, and adds an
 * overlay's source and layers only when it is switched on (P10).
 * lib/overlays-load.ts reads the registry and prepares the data files.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapTokens } from './map-style';

export type OverlayKind = 'fill' | 'line' | 'point' | 'heat' | 'choropleth';

/** One entry of config/overlays.json. */
export interface OverlayDef {
  id: string;
  label: string;
  /**
   * `library` for the projects in the index; `analysis` for a figure the map
   * computes from the results (a choropleth); otherwise a TopoJSON file's
   * path from the repo root.
   */
  data: string;
  kind: OverlayKind;
  style?: { color?: string; palette?: string[]; outline?: string; width?: string; opacity?: string; radius?: string; ramp?: string[] };
  /** `steps`: a choropleth's steps, drawn by the map from the figures it shows. */
  legend: 'single' | 'features' | 'steps' | 'none';
  /** A choropleth's region overlays, by id, in order of preference: it draws by the first that is on, else the last. */
  regions?: string[];
  alwaysOn?: boolean;
  selectable: boolean;
  /** The facet a selection sets, by type. */
  facets?: Record<string, string>;
}

export interface LegendItem {
  label: string;
  /** Fill or line color, resolved from a token. */
  color: string;
  /** How the swatch draws: a filled square, a line, or a dot. */
  mark: 'fill' | 'line' | 'point';
}

/** What the map component needs to draw an overlay and list it: written into the style's metadata. */
export interface OverlayMeta {
  id: string;
  label: string;
  kind: OverlayKind;
  /** The overlay's data, a TopoJSON file under the site's base; null for the projects, which the style draws itself. */
  url: string | null;
  layers: LayerSpecification[];
  legend: LegendItem[];
  alwaysOn: boolean;
  selectable: boolean;
  facets: Record<string, string>;
  /** A choropleth's region overlays, in order of preference. */
  regions?: string[];
  /** A choropleth's ramp, low to high, resolved from its tokens. */
  ramp?: string[];
}

/** Style metadata key holding the overlays, bottom to top. */
export const OVERLAYS_KEY = 'plant-library:overlays';
/** Feature property holding a palette overlay's color index; neighbors never share one. */
export const PALETTE_PROP = 'pi';

/** Where build:map writes overlay data, under site/public and the base path: `<OVERLAY_DIR>/<id>.json`. */
export const OVERLAY_DIR = 'map/overlays';

export const overlaySource = (id: string) => `overlay-${id}`;
/** A selectable overlay's hit layer: an unseen fill the map queries for a pick, so line overlays can be picked inside their regions. */
export const pickLayer = (id: string) => `${overlaySource(id)}-pick`;
/** A selectable overlay's layers drawing the picked regions; their filter is set to the picked ids (`pickedFilter`). */
export const pickedLayers = (id: string) => [`${overlaySource(id)}-picked-fill`, `${overlaySource(id)}-picked-line`];

/** A choropleth's layers drawn over one region overlay's source: its fill and edge. */
export const choroplethLayers = (id: string, region: string) => [`${overlaySource(id)}-${region}-fill`, `${overlaySource(id)}-${region}-line`];

/** The filter that draws these regions as picked. */
export function pickedFilter(ids: string[]): ExpressionSpecification {
  return ['in', ['get', 'id'], ['literal', ids]] as unknown as ExpressionSpecification;
}

/**
 * The layers an overlay draws, from its token names. Their source is
 * `overlaySource(id)`, added with the data. A selectable boundary overlay
 * also gets the layers a region filter needs: the picked regions, drawn over
 * it, and an unseen fill to pick by, so a line overlay can be picked inside
 * its regions (spec map.md, region filters).
 */
export function overlayLayers(t: MapTokens, def: OverlayDef): LayerSpecification[] {
  if (def.data === 'library') return [];
  if (def.kind === 'choropleth') return choropleth(t, def);
  const source = overlaySource(def.id);
  const pick: LayerSpecification[] =
    def.selectable && (def.kind === 'fill' || def.kind === 'line')
      ? [
          { id: pickedLayers(def.id)[0], type: 'fill', source, filter: pickedFilter([]), paint: { 'fill-color': t.color('--map-selection'), 'fill-opacity': t.num('--map-selection-opacity') } },
          { id: pickedLayers(def.id)[1], type: 'line', source, filter: pickedFilter([]), paint: { 'line-color': t.color('--map-selection'), 'line-width': t.num('--map-line-overlay-strong') } },
          { id: pickLayer(def.id), type: 'fill', source, paint: { 'fill-color': t.color('--map-selection'), 'fill-opacity': 0 } },
        ]
      : [];
  return [...drawnLayers(t, def, source), ...pick];
}

/**
 * A choropleth draws over its region overlays' sources, one fill and edge per
 * region overlay, with no data of its own. Each starts drawing nothing; the
 * map sets the regions and their colors from the figures (`choroplethPaint`).
 */
function choropleth(t: MapTokens, def: OverlayDef): LayerSpecification[] {
  const s = def.style ?? {};
  const opacity = s.opacity ? t.num(s.opacity) : 1;
  return (def.regions ?? []).flatMap((region): LayerSpecification[] => {
    const [fill, line] = choroplethLayers(def.id, region);
    const source = overlaySource(region);
    return [
      { id: fill, type: 'fill', source, filter: pickedFilter([]), paint: { 'fill-color': t.color(s.ramp![0]), 'fill-opacity': opacity } },
      { id: line, type: 'line', source, filter: pickedFilter([]), paint: { 'line-color': t.color(s.outline!), 'line-width': t.num(s.width!) } },
    ];
  });
}

/** One step of a choropleth: the counts from `min` to `max`, and its color. */
export interface ChoroplethStep {
  min: number;
  max: number;
  color: string;
}

/**
 * Steps for counts from 1 to `max`, one per ramp color at most: each count a
 * step of its own while they fit, else equal whole-number intervals. The
 * darkest colors go to the highest counts, so a few projects stay pale.
 */
export function choroplethSteps(max: number, ramp: readonly string[]): ChoroplethStep[] {
  if (max < 1 || !ramp.length) return [];
  const size = Math.ceil(max / ramp.length);
  const n = Math.ceil(max / size);
  return Array.from({ length: n }, (_, i) => ({ min: i * size + 1, max: Math.min((i + 1) * size, max), color: ramp[ramp.length - n + i] }));
}

/** The step a count falls in. */
export function stepFor(steps: readonly ChoroplethStep[], value: number): ChoroplethStep | undefined {
  return steps.find((s) => value >= s.min && value <= s.max);
}

/**
 * What a choropleth's layers draw for these figures: the regions with a
 * count (the filter), and each one's step color (the fill). Regions with no
 * count aren't drawn.
 */
export function choroplethPaint(figures: readonly { id: string; value: number }[], steps: readonly ChoroplethStep[]): { filter: ExpressionSpecification; color: string | ExpressionSpecification } {
  const shown = figures.filter((f) => f.value > 0 && stepFor(steps, f.value));
  const filter = pickedFilter(shown.map((f) => f.id));
  if (!shown.length) return { filter, color: steps[0]?.color ?? 'rgba(0, 0, 0, 0)' };
  const color = ['match', ['get', 'id'], ...shown.flatMap((f) => [f.id, stepFor(steps, f.value)!.color]), steps[0].color] as unknown as ExpressionSpecification;
  return { filter, color };
}

/** The region overlay a choropleth draws by: the first of its regions that is on, else the last. */
export function activeRegion(def: Pick<OverlayMeta, 'regions'>, on: readonly string[]): string | undefined {
  const regions = def.regions ?? [];
  return regions.find((r) => on.includes(r)) ?? regions.at(-1);
}

function drawnLayers(t: MapTokens, def: OverlayDef, source: string): LayerSpecification[] {
  const s = def.style ?? {};
  const id = (part: string) => `${source}-${part}`;
  const color = (): string | ExpressionSpecification =>
    s.palette
      ? (['match', ['get', PALETTE_PROP], ...s.palette.flatMap((tok, i) => [i, t.color(tok)]), t.color(s.palette[0])] as unknown as ExpressionSpecification)
      : t.color(s.color!);
  const opacity = s.opacity ? t.num(s.opacity) : 1;
  const line = (c: string | ExpressionSpecification): LayerSpecification => ({ id: id('line'), type: 'line', source, paint: { 'line-color': c, 'line-width': t.num(s.width!), 'line-opacity': opacity } });

  switch (def.kind) {
    case 'fill': {
      const layers: LayerSpecification[] = [{ id: id('fill'), type: 'fill', source, paint: { 'fill-color': color(), 'fill-opacity': opacity } }];
      if (s.outline && s.width) layers.push(line(t.color(s.outline)));
      return layers;
    }
    case 'line':
      return [line(color())];
    case 'point':
      return [
        {
          id: id('point'),
          type: 'circle',
          source,
          paint: {
            'circle-color': color(),
            'circle-radius': t.num(s.radius!),
            'circle-opacity': opacity,
            ...(s.outline && s.width ? { 'circle-stroke-color': t.color(s.outline), 'circle-stroke-width': t.num(s.width) } : {}),
          },
        },
      ];
    case 'choropleth':
      return [];
    case 'heat': {
      const ramp = s.ramp!;
      const stops = ramp.flatMap((tok, i) => [i / (ramp.length - 1), t.color(tok)]);
      return [{ id: id('heat'), type: 'heatmap', source, paint: { 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...stops] as unknown as ExpressionSpecification, 'heatmap-opacity': opacity } }];
    }
  }
}

/**
 * An overlay's legend. `features` lists each feature by name with its palette
 * color, so it needs the features' names and color indexes from the data.
 */
export function overlayLegend(t: MapTokens, def: OverlayDef, features: { name: string; pi?: number }[] = []): LegendItem[] {
  const s = def.style ?? {};
  const mark: LegendItem['mark'] = def.kind === 'line' ? 'line' : def.kind === 'point' ? 'point' : 'fill';
  if (def.legend === 'none' || def.legend === 'steps') return [];
  if (def.legend === 'single') return [{ label: def.label, color: t.color(s.color ?? s.palette?.[0] ?? s.ramp!.at(-1)!), mark }];
  return [...features]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ label: f.name, color: t.color(s.palette![f.pi ?? 0]), mark }));
}

/** The overlays in a built style, bottom to top: what the layer list shows. */
export function layerList(style: Pick<StyleSpecification, 'metadata'>): OverlayMeta[] {
  return ((style.metadata as Record<string, unknown> | undefined)?.[OVERLAYS_KEY] as OverlayMeta[] | undefined) ?? [];
}

/**
 * The layer an overlay's layers go before when it is switched on: the first
 * layer of the next overlay up that is already on the map, else `fallback`
 * (the basemap's water, or the projects without a basemap). Keeps the
 * registry's order whatever order overlays are switched on in.
 */
export function beforeLayer(overlays: OverlayMeta[], id: string, present: (layerId: string) => boolean, fallback: string | undefined): string | undefined {
  const i = overlays.findIndex((o) => o.id === id);
  for (const o of overlays.slice(i + 1)) {
    const first = o.layers.find((l) => present(l.id));
    if (first) return first.id;
  }
  return fallback;
}
