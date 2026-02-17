/**
 * scripts/content-pipeline/adapters/index.ts
 * Adapter registry — maps adapter IDs to adapter instances.
 * Issue #96
 */

import type { SourceAdapter } from '../types';
import { OpenTDBAdapter } from './opentdb';
import { ManualCurationAdapter } from './manual';

const ADAPTER_REGISTRY: Record<string, () => SourceAdapter> = {
  'opentdb': () => new OpenTDBAdapter(),
  'manual': () => new ManualCurationAdapter(),
};

/** Get an adapter instance by ID. Throws if unknown. */
export function getAdapter(id: string): SourceAdapter {
  const factory = ADAPTER_REGISTRY[id];
  if (!factory) {
    throw new Error(`Unknown adapter: "${id}". Available: ${Object.keys(ADAPTER_REGISTRY).join(', ')}`);
  }
  return factory();
}

/** List all available adapter IDs. */
export function listAdapters(): string[] {
  return Object.keys(ADAPTER_REGISTRY);
}
