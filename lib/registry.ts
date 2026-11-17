/** The type registry, importable anywhere (the island included). */
import typesJson from '../config/types.json' with { type: 'json' };
import type { TypeRegistry } from './types';

const { $schema: _schema, ...rest } = typesJson as Record<string, unknown>;
export const TYPES = rest as unknown as TypeRegistry;
