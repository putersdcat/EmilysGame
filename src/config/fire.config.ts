/**
 * config/fire.config.ts - Fire variant definitions and animation config.
 * Issue #81: Animated Fire Primitive Set
 * TODO: DOC - fire variant system, animation phases, safe-zone rules
 */

export interface FireVariant {
  /** Asset key in ASSET_DEFS */
  assetKey: string;
  /** Light radius in pixels */
  lightRadius: number;
  /** Light color RGB */
  lightColor: [number, number, number];
  /** Light intensity 0-1 */
  lightIntensity: number;
  /** Scale pulse amplitude (0 = no pulse) */
  scalePulse: number;
  /** Scale pulse speed multiplier */
  pulseSpeed: number;
  /** Vertical wobble amplitude in pixels */
  wobbleY: number;
  /** Emoji variants to cycle through for animation */
  emojis: string[];
  /** Animation frame duration in game frames */
  frameDuration: number;
}

/** All fire variants with their visual and lighting properties */
export const FIRE_VARIANTS: Record<string, FireVariant> = {
  bonfire: {
    assetKey: 'bonfire',
    lightRadius: 110,
    lightColor: [255, 180, 60],
    lightIntensity: 0.85,
    scalePulse: 0.08,
    pulseSpeed: 1.0,
    wobbleY: 1.5,
    emojis: ['\u{1F525}'],  // fire emoji
    frameDuration: 8,
  },
  campfire: {
    assetKey: 'campfire',
    lightRadius: 70,
    lightColor: [255, 160, 40],
    lightIntensity: 0.60,
    scalePulse: 0.06,
    pulseSpeed: 1.3,
    wobbleY: 1.0,
    emojis: ['\u{1F525}'],
    frameDuration: 10,
  },
  biomass_fire: {
    assetKey: 'biomass_fire',
    lightRadius: 90,
    lightColor: [200, 220, 80],
    lightIntensity: 0.70,
    scalePulse: 0.10,
    pulseSpeed: 0.7,
    wobbleY: 2.0,
    emojis: ['\u{1F525}'],
    frameDuration: 12,
  },
};

/** Set of asset keys that are fire types (for quick lookup) */
export const FIRE_ASSET_KEYS = new Set(Object.values(FIRE_VARIANTS).map(v => v.assetKey));

/**
 * Get fire animation offsets for a given fire variant at a world position.
 * Uses deterministic phase from position so multiple fires desync naturally.
 * @param variant Fire variant config
 * @param gx World grid X
 * @param gy World grid Y
 * @param frameCount Global frame counter
 * @returns { scaleMultiplier, dyOffset } for render-time application
 */
export function getFireAnimation(
  variant: FireVariant,
  gx: number,
  gy: number,
  frameCount: number,
): { scaleMultiplier: number; dyOffset: number } {
  // Phase offset from world position (desyncs multiple fires)
  const phase = gx * 13.7 + gy * 29.3;
  const t = frameCount * 0.12 * variant.pulseSpeed + phase;
  // Multi-frequency scale pulse (same algorithm as light flicker)
  const pulse = variant.scalePulse * (
    0.5 * Math.sin(t) +
    0.3 * Math.sin(t * 2.7 + 1.3) +
    0.2 * Math.sin(t * 4.1 + 2.9)
  );
  // Vertical wobble
  const wobble = variant.wobbleY * Math.sin(t * 1.5 + 0.7);
  return {
    scaleMultiplier: 1.0 + pulse,
    dyOffset: wobble,
  };
}
