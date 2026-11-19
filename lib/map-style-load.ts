/** Reading the map's tokens from the CSS token files and building the style. Node only. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { statesBbox } from './geo-load';
import { dataRules, resolveColor, rootTokens } from './contrast';
import { buildMapStyle, CLUSTER, WEIGHT_NAMES, type MapTokens } from './map-style';
import { loadOverlays, OVERLAYS_FILE, prepareOverlays } from './overlays-load';
import type { StyleSpecification } from 'maplibre-gl';

export const TOKEN_FILES = ['primitives.css', 'semantic.css', 'components.css', 'content.css', 'map.css'];

export function tokenDir(root: string): string {
  return join(root, 'site', 'src', 'styles', 'tokens');
}

/** Every :root token in the token files, by name. */
export function loadTokens(root: string): Map<string, string> {
  return rootTokens(TOKEN_FILES.map((f) => join(tokenDir(root), f)));
}

/** The token reader the style builder takes, resolving var() chains to literals. */
export function mapTokens(tokens: Map<string, string>): MapTokens {
  const literal = (name: string) => resolveColor(`var(${name})`, tokens);
  return {
    color: literal,
    num(name) {
      const v = literal(name);
      const m = /^(-?[\d.]+)(px|em)?$/.exec(v);
      if (!m) throw new Error(`map token ${name} is not a pixel, em, or plain number: ${v}`);
      return Number(m[1]);
    },
  };
}

/** Project types with the token each one's accent names, from the data-project-type rules in content.css. */
export function projectTypeTokens(root: string): { id: string; token: string }[] {
  return dataRules(join(tokenDir(root), 'content.css'))
    .filter((r) => r.attr === 'project-type' && r.prop === '--accent')
    .map((r) => {
      const m = /^var\((--[\w-]+)\)$/.exec(r.expr);
      if (!m) throw new Error(`project type ${r.value}'s accent is not a token: ${r.expr}`);
      return { id: r.value, token: m[1] };
    });
}

/** Label font stacks: the body font's family with the body and strong weights' names. */
export function mapFonts(tokens: Map<string, string>): { family: string; regular: string; strong: string; weights: { regular: string; strong: string } } {
  const lit = (n: string) => resolveColor(`var(${n})`, tokens);
  const family = lit('--font-body').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  const weights = { regular: lit('--weight-body'), strong: lit('--weight-strong') };
  const name = (w: string) => {
    if (!WEIGHT_NAMES[w]) throw new Error(`no glyph name for font weight ${w}`);
    return `${family} ${WEIGHT_NAMES[w]}`;
  };
  return { family, regular: name(weights.regular), strong: name(weights.strong), weights };
}

/**
 * The style for this repo, and the overlay data files to publish beside it.
 * `basemap` is the extract's path under the site (config/site.json), kept
 * only when the file is in `publicDir`; `overlays` is the registry's path
 * from the root (a test passes a fixture registry).
 */
export function mapBuildFor(
  root: string,
  opts: { base: string; basemap: string; publicDir?: string; tokens?: MapTokens; overlays?: string },
): { style: StyleSpecification; files: Map<string, string> } {
  const tokens = loadTokens(root);
  const fonts = mapFonts(tokens);
  const t = opts.tokens ?? mapTokens(tokens);
  const present = opts.publicDir ? existsSync(join(opts.publicDir, opts.basemap)) : true;
  const overlays = prepareOverlays(root, loadOverlays(root, opts.overlays ?? OVERLAYS_FILE), t, opts.base);
  const style = buildMapStyle(t, {
    base: opts.base,
    basemap: present ? opts.basemap : null,
    projectTypes: projectTypeTokens(root),
    fonts: { regular: fonts.regular, strong: fonts.strong },
    cluster: CLUSTER,
    bounds: statesBbox(root, 0),
    overlays: overlays.meta,
  });
  return { style, files: overlays.files };
}

/** The style alone. */
export function mapStyleFor(root: string, opts: Parameters<typeof mapBuildFor>[1]): StyleSpecification {
  return mapBuildFor(root, opts).style;
}
