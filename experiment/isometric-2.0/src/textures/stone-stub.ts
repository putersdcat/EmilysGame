/**
 * stone-stub.ts — Legacy/fallback stub textures for stone-wall sides
 * and tops, used by `generateDemoChunk()` in chunk.ts BEFORE the
 * StoneBrick / RedClinker brick textures are wired in.
 *
 * Contract divergence (intentional)
 * ──────────────────────────────────────────────────────────────────────
 * These do NOT participate in the cross-tile grout-alignment guarantee
 * the real brick textures (stone-brick, red-clinker) provide. They are
 * solid colour rects with a few horizontal lines for visual rhythm,
 * and are deterministic per (col,row) only via a tiny channel jitter.
 *
 * They are kept around so the demo chunk generator can continue to
 * produce a passable preview when the real brick pipeline is bypassed
 * (e.g. early-boot diagnostics, asset-pack absence). Production wall
 * rendering uses StoneBrick / RedClinker via solver.ts wiring.
 *
 * @see textures/stone-brick.ts — production stone wall texture.
 * @see textures/red-clinker.ts — production red clinker variant.
 */

export const IMAGE_SIZE = 128;

/**
 * Side-face stub: a darker shade of the supplied baseColor with three
 * faint horizontal "course" lines and a (col,row) debug stamp.
 * Used as `nano.sideTextureSvg` for the demo stone-wall path.
 */
export function svgSide(baseColor: string, col: number, row: number): string {
  const rr = (parseInt(baseColor.slice(1, 3), 16) - 15) & 0xff;
  const gg = (parseInt(baseColor.slice(3, 5), 16) - 15) & 0xff;
  const bb = (parseInt(baseColor.slice(5, 7), 16) - 10) & 0xff;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">
    <rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="rgb(${rr},${gg},${bb})" />
    <line x1="0" y1="32" x2="128" y2="32" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <line x1="0" y1="64" x2="128" y2="64" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <line x1="0" y1="96" x2="128" y2="96" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <text x="64" y="64" text-anchor="middle" dy=".35em" font-size="7" fill="rgba(255,255,255,0.3)">${col},${row}</text>
  </svg>`;
}

/**
 * Top-cap stub: a lighter shade of the supplied baseColor with no
 * detail. Used as `nano.topTextureSvg` for the demo stone-wall path.
 */
export function svgTop(baseColor: string, _col: number, _row: number): string {
  const rr = (parseInt(baseColor.slice(1, 3), 16) + 20) & 0xff;
  const gg = (parseInt(baseColor.slice(3, 5), 16) + 20) & 0xff;
  const bb = (parseInt(baseColor.slice(5, 7), 16) + 15) & 0xff;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">
    <rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="rgb(${rr},${gg},${bb})" />
  </svg>`;
}
