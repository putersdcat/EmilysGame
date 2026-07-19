/**
 * walk.ts — player walk query surface for the play kernel (PR3).
 *
 * Re-exports engine walkability-query (cell SSOT). Motor and other kernel
 * code import walk checks from here; engine remains the implementation home.
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md
 */

export {
  isWalkable,
  isPositionWalkable,
  isFootprintWalkable,
} from '../../engine/walkability-query';
