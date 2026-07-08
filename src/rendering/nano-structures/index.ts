/**
 * nano-structures/index.ts — authored structure dispatcher for nano-tile.ts.
 *
 * Keeps complex cottage/castle/chapel geometry out of the nano-tile core while
 * preserving one public render seam for authored positive-Z structures.
 */

import type { IsoNanoTile as NanoTile } from '../../types/iso-renderer.types';
import { drawCastleKeepNano, drawCathedralChapelNano } from './castle';
import { drawStarterCottageNano } from './cottage';
import type { SvgImageLoader } from './geometry';

export function isAuthoredStructureNanoKind(kind: NanoTile['kind']): boolean {
  return kind === 'starter-cottage' || kind === 'castle-keep' || kind === 'cathedral-chapel';
}

export function drawAuthoredStructureNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  loadSvgImage: SvgImageLoader,
): boolean {
  switch (nano.kind) {
    case 'starter-cottage':
      return drawStarterCottageNano(ctx, nano, screenX, screenY, loadSvgImage);
    case 'castle-keep':
      return drawCastleKeepNano(ctx, nano, screenX, screenY, loadSvgImage);
    case 'cathedral-chapel':
      return drawCathedralChapelNano(ctx, nano, screenX, screenY, loadSvgImage);
    default:
      return false;
  }
}

export type { SvgImageLoader } from './geometry';
