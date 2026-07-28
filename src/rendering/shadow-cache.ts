/**
 * shadow-cache.ts — Dynamic shadow sprite cache (#83).
 *
 * Pre-renders rotated/elongated shadow ellipses keyed by quantized scale.
 * The cache is invalidated when the dynamic shadow system reports a sun
 * angle change >15° or stretch change >15% (happens roughly every ~30s).
 *
 * Lives as a stateful class so the renderer can hold one instance and
 * query it per-draw. Extracted from `render.ts` in B6.3 (#269).
 */
import { RENDER_CONFIG } from '../config/game.config';
import { getShadowParams } from './shadows';

/** Default baked angle (radians) — matches initial `getShadowParams(0)` shape. */
const DEFAULT_SHADOW_ANGLE = 0.26;
/** Default baked stretch multiplier. */
const DEFAULT_SHADOW_STRETCH = 1.0;
/** Sun angle delta (radians) that triggers a full cache rebuild. */
const ANGLE_INVALIDATE_THRESHOLD = 0.25;
/** Stretch delta that triggers a full cache rebuild. */
const STRETCH_INVALIDATE_THRESHOLD = 0.15;

/**
 * Stateful shadow sprite cache. Owned by the renderer; queries are
 * allocation-free on cache hit and bounded on miss.
 */
export class ShadowSpriteCache {
  private cache = new Map<number, HTMLCanvasElement>();
  private _shadowAngle = DEFAULT_SHADOW_ANGLE;
  private _shadowStretch = DEFAULT_SHADOW_STRETCH;

  /**
   * Get a pre-rendered shadow canvas for the given scale and current
   * sun params. May rebuild the cache if sun angle/stretch changed.
   */
  getShadowSprite(scale: number, frameCount: number): HTMLCanvasElement {
    const params = getShadowParams(frameCount);

    if (
      Math.abs(params.angle - this._shadowAngle) > ANGLE_INVALIDATE_THRESHOLD ||
      Math.abs(params.stretch - this._shadowStretch) > STRETCH_INVALIDATE_THRESHOLD
    ) {
      this.cache.clear();
      this._shadowAngle = params.angle;
      this._shadowStretch = params.stretch;
    }

    // Quantize scale to reduce cache entries (0.1 increments)
    const qScale = Math.round(scale * 10) / 10;
    let cached = this.cache.get(qScale);
    if (cached) return cached;

    const rw = Math.ceil(qScale * RENDER_CONFIG.shadowScale.width);
    const rh = Math.ceil(qScale * RENDER_CONFIG.shadowScale.height);
    // Elongate shadow based on dynamic stretch factor
    const stretchX = Math.ceil(rw * (1.0 + this._shadowStretch * 0.3));
    // Canvas large enough for rotated ellipse
    const maxDim = Math.max(stretchX, rh) * 2 + 8;
    cached = document.createElement('canvas');
    cached.width = maxDim;
    cached.height = maxDim;
    const sctx = cached.getContext('2d')!;
    // Fill solid black; opacity controlled at draw time via globalAlpha
    sctx.fillStyle = 'rgb(0,0,0)';
    sctx.beginPath();
    sctx.ellipse(maxDim / 2, maxDim / 2, stretchX, rh, this._shadowAngle, 0, Math.PI * 2);
    sctx.fill();
    this.cache.set(qScale, cached);
    return cached;
  }
}
