/**
 * Water material contracts for the Iso 2.0 D.6 water-family port.
 * Source: experiment/isometric-2.0/src/textures/water-family.ts
 */

import type {
  IsoFeatureConnections as FeatureConnections,
  IsoFeatureVariant as FeatureVariant,
} from '../../types/iso-renderer.types';

export type { FeatureConnections, FeatureVariant };

export type WaterStyleId = 'clear-river' | 'muddy-creek' | 'deep-pond' | 'marsh-water';

export interface WaterStyle {
  readonly id: WaterStyleId;
  readonly bankOuter: string;
  readonly bankInner: string;
  readonly bankWet: string;
  readonly shallow: string;
  readonly mid: string;
  readonly deep: string;
  readonly foam: string;
  readonly glint: string;
  readonly vegetation: string;
  readonly pebble: string;
  readonly channelWidth: number;
  readonly bankWidth: number;
  readonly flowSpeed: number;
  readonly rippleDensity: number;
  readonly opacity: number;
}

export interface WaterFactoryOptions {
  readonly style?: WaterStyleId | WaterStyle;
  /** Animation frame index. Frame 0 is the stable default texture. */
  readonly frame?: number;
  /** Number of frames in the animation loop. */
  readonly frameCount?: number;
  /** Extra bank wetness/darkness. */
  readonly wetness?: number;
  /** Extra foam/ripple brightness. */
  readonly turbulence?: number;
  /** Extra silt/muddy bank tint, -1..1 around the style baseline. */
  readonly silt?: number;
  /** Extra reeds / shoreline vegetation, -1..1 around the style baseline. */
  readonly reeds?: number;
  /** Deterministic material seed. */
  readonly seed?: string;
}
