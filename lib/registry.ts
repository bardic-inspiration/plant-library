/** The type registry, importable anywhere (the island included). */
import typesJson from '../config/types.json' with { type: 'json' };
import overlaysJson from '../config/overlays.json' with { type: 'json' };
import type { OverlayDef } from './overlays';
import type { TypeRegistry } from './types';

const { $schema: _schema, ...rest } = typesJson as Record<string, unknown>;
export const TYPES = rest as unknown as TypeRegistry;

/** The overlay registry (config/overlays.json), bottom to top. */
export const OVERLAYS = overlaysJson.overlays as unknown as OverlayDef[];
