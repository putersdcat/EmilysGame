// filepath: src/game/asset-bootstrap.ts
// B5 micro-slice 11.37 (#268): asset + content + WASM bootstrap extracted
// from main.ts init(). This is the "everything that needs to be ready
// before the game loop ticks" waterfall:
//
//   1. SVG tile sprites        (must complete before render — #82)
//   2. Emoji sprites           (eliminates per-frame ctx.filter, #115)
//   3. SVG asset sprites       (trees, rocks, fire — #115)
//   4. NPC paper-cut sprites   (#85)
//   5. Minimap canvas          (#105)
//   6. Debuff visual effects   (#110)
//   7. Book of Knowledge pack  (#120) + log content stats
//   8. WASM rendering core     (non-blocking; falls back to JS, #141)
//
// Order matters: SVG tiles block render, the rest are async parallelism
// hints. WASM init must run last so the benchmark runs against the
// already-warmed JS renderer.
import { preloadTiles } from '../rendering/tiles';
import { preloadEmojiSprites } from '../asset-pipeline/emoji-cache';
import { preloadAssetSprites } from '../asset-pipeline/asset-sprites';
import { preloadNpcSprites } from '../asset-pipeline/npc-sprites';
import { initMinimap } from '../rendering/minimap';
import { initDebuffVisuals } from '../rendering/debuff-visuals';
import { initBookContent, getBookContentStats } from '../ui/book-content';
import { initWasmRenderer, wasmBenchmark } from '../rendering/wasm-bridge';

/**
 * Run the full asset/content/WASM pre-roll.
 *
 * Sequential `await` on the SVG tile preload (rendering hard-dependency),
 * then a mix of sync pre-renders + the book + WASM awaits.
 * Logs `[INIT]` status messages on completion.
 *
 * **Failure semantics:** Each preloader swallows its own errors and
 * falls back (JS renderer if WASM fails, etc.) so this never throws.
 * The function is safe to call from the test mode entry point.
 */
export async function bootstrapAssets(): Promise<void> {
  // Preload SVG tile sprites (async, must complete before rendering)
  await preloadTiles();

  // Pre-render emoji sprites → eliminates per-frame ctx.filter + fillText
  preloadEmojiSprites();

  // Pre-render SVG asset sprites for trees, rocks, fire (#115)
  await preloadAssetSprites();

  // Preload NPC paper-cut sprites (#85)
  preloadNpcSprites();

  // Initialize minimap canvas
  initMinimap();

  // Initialize debuff visual effects (#110)
  initDebuffVisuals();

  // Load content packs for Book of Knowledge (#120)
  await initBookContent();
  const contentStats = getBookContentStats();
  console.log(
    `[INIT] Book content: ${contentStats.totalArticles} articles ` +
    `(${contentStats.packArticles} from pack, ${contentStats.staticArticles} static)`,
  );

  // Load WASM rendering core (non-blocking; falls back to JS if unavailable)
  const wasmOk = await initWasmRenderer();
  if (wasmOk) {
    console.log('[INIT] WASM rendering core loaded');
    wasmBenchmark();
  } else {
    console.log('[INIT] WASM unavailable, using JS renderer');
  }
}
