/**
 * iso2-e-wall-fence-biome-wiring.spec.ts — Slice E wall/fence real-generation
 * collision precision + biome material variety.
 *
 * Two independent findings/fixes proven here:
 *
 * 1. COLLISION PRECISION (the bigger finding): ObstacleSolver.ts places real
 *    generated walls/fences with the literal, UNRESOLVED assetKey ('wall'/
 *    'fence' -- never the resolved tileType 'stone_wall'/'wooden_fence').
 *    `assetToNanoKind` (mechanics.ts) and `getNanoStack` (nano-tile-defs.ts)
 *    had no case for these bare strings, so EVERY real biome-obstacle-
 *    weighted wall/fence fell through to the blunt whole-tile `cell.walkable`
 *    block instead of the precise nano footprint -- a visual/collision
 *    mismatch (the wall looks like a narrow band with open grass beside it,
 *    but the whole tile was blocked). Fixed by aliasing the bare assetKeys
 *    to the same nano kind as their resolved tileType in both places.
 *
 * 2. BIOME MATERIAL VARIETY (the originally-scoped Slice E question):
 *    render.ts always drew plain 'stone_wall'/'wooden_fence' regardless of
 *    biome. `wallTileTypeForBiome`/`fenceTileTypeForBiome` (mirroring the
 *    existing `waterStyleIdForBiome` pattern) now give castle ruins an aged
 *    cottage-foundation stone + split-rail fencing, and meadows a cheerful
 *    picket fence, purely at render time (never touches collision, since
 *    Slice B.5 already confirmed every stone_wall and wooden_fence
 *    sub-variant shares identical footprint geometry).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

// ─── 1. Pure logic: biome → material tileType mapping ──────────────────────

test('wallTileTypeForBiome / fenceTileTypeForBiome pick the intended per-biome materials', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { wallTileTypeForBiome, fenceTileTypeForBiome } = await import('/rendering/nano-tile-defs.ts');
    return {
      wall: [0, 1, 2, 3].map((id) => wallTileTypeForBiome(id)),
      fence: [0, 1, 2, 3].map((id) => fenceTileTypeForBiome(id)),
      // Negative/out-of-range ids must never throw (mirrors waterStyleIdForBiome's wraparound safety).
      wallNegative: wallTileTypeForBiome(-1),
      fenceNegative: fenceTileTypeForBiome(-1),
      wallWraparound: wallTileTypeForBiome(7), // 7 % 4 === 3, same as castle
    };
  });

  // biome 0=meadow, 1=forest, 2=cave, 3=castle (src/config/biomes.config.ts)
  expect(result.wall).toEqual(['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall_cottage_foundation']);
  expect(result.fence).toEqual(['wooden_fence_picket', 'wooden_fence', 'wooden_fence', 'wooden_fence_split_rail']);
  expect(result.wallNegative).toBe('stone_wall_cottage_foundation'); // -1 mod 4 === 3
  expect(result.fenceNegative).toBe('wooden_fence_split_rail');
  expect(result.wallWraparound).toBe('stone_wall_cottage_foundation');
});

// ─── 2. Material distinctness: chosen materials genuinely look different ───

async function renderMaterialStats(page: Page, tileType: string, variant: string) {
  return page.evaluate(async ({ tileType, variant }) => {
    const [{ getNanoStack }, { drawNanoStack }] = await Promise.all([
      import('/rendering/nano-tile-defs.ts'),
      import('/rendering/nano-tile.ts'),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    const stack = getNanoStack(tileType, variant as any);
    if (!stack) throw new Error(`Missing nano stack for ${tileType}:${variant}`);
    // Same async-image warm-up gotcha as the Slice B.5 wall-material audit.
    drawNanoStack(ctx, stack, 2, 190);
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawNanoStack(ctx, stack, 2, 190);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let inkCount = 0, rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 10) { inkCount++; rSum += img[i]; gSum += img[i + 1]; bSum += img[i + 2]; }
    }
    return {
      inkCount,
      avg: inkCount > 0 ? { r: rSum / inkCount, g: gSum / inkCount, b: bSum / inkCount } : { r: 0, g: 0, b: 0 },
    };
  }, { tileType, variant });
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

test('castle wall material (cottage-foundation) is visually distinct from the default stone_wall', async ({ page }) => {
  await waitForGame(page);
  const plain = await renderMaterialStats(page, 'stone_wall', 'straight-h');
  const castle = await renderMaterialStats(page, 'stone_wall_cottage_foundation', 'straight-h');
  expect(plain.inkCount, 'plain stone_wall must paint visible ink').toBeGreaterThan(0);
  expect(castle.inkCount, 'castle wall material must paint visible ink').toBeGreaterThan(0);
  expect(colorDistance(plain.avg, castle.avg), 'castle wall material must look visibly different from plain stone_wall').toBeGreaterThan(4);
});

test('meadow fence (picket) and castle fence (split-rail) are visually distinct from the default and each other', async ({ page }) => {
  await waitForGame(page);
  const plain = await renderMaterialStats(page, 'wooden_fence', 'straight-h');
  const meadow = await renderMaterialStats(page, 'wooden_fence_picket', 'straight-h');
  const castle = await renderMaterialStats(page, 'wooden_fence_split_rail', 'straight-h');
  for (const [label, stats] of [['plain', plain], ['meadow picket', meadow], ['castle split-rail', castle]] as const) {
    expect(stats.inkCount, `${label} fence must paint visible ink`).toBeGreaterThan(0);
  }
  expect(colorDistance(plain.avg, meadow.avg), 'meadow picket must look different from the default fence').toBeGreaterThan(4);
  expect(colorDistance(plain.avg, castle.avg), 'castle split-rail must look different from the default fence').toBeGreaterThan(4);
  expect(colorDistance(meadow.avg, castle.avg), 'meadow picket and castle split-rail must look different from each other').toBeGreaterThan(4);
});

// ─── 3. Live-engine collision precision for bare 'wall'/'fence' assetKeys ──

test('real generated "wall" and "fence" cells now get exact footprint precision, not a whole-tile block', async ({ page }) => {
  await waitForGame(page);

  // Mirrors iso2-b-asset-nano-kind-completeness.spec.ts's edge-reach proof,
  // but using the REAL bare assetKeys ObstacleSolver.ts actually places
  // ('wall'/'fence', not their resolved tileType), which is exactly the gap
  // this fix closes. Before the fix, ANY point anywhere in these cells was
  // blocked (cell.walkable fallback); after, only the nano band blocks.
  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const defs = debug.getAssetDefs();
    const chunk = state.chunks.get('0,0');
    if (!chunk) throw new Error('Expected origin chunk to be loaded');
    const setCell = (x: number, y: number, assetKey: string, walkable: boolean) => {
      chunk.cells[y][x] = { assetKey, walkable, interactable: false };
    };
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) setCell(x, y, 'grass', defs.grass.walkable);
    }
    // Real assetKeys with real ASSET_DEFS entries (wall.walkable === false).
    setCell(11, 12, 'wall', defs.wall.walkable);
    setCell(15, 12, 'fence', defs.fence.walkable);
    debug.invalidateRenderCaches();

    return {
      wallEdgeReach: debug.isFootprintWalkable(10.9, 12.5) as boolean,
      fenceEdgeReach: debug.isFootprintWalkable(14.9, 12.5) as boolean,
      farGrass: debug.isFootprintWalkable(5.5, 5.5) as boolean,
    };
  });

  expect(result.farGrass, 'control: plain grass far from either cell must be walkable').toBe(true);
  expect(result.wallEdgeReach, 'a corner just reaching into the real "wall" cell (outside its actual footprint) must be walkable -- proves the exact nano check ran').toBe(true);
  expect(result.fenceEdgeReach, 'a corner just reaching into the real "fence" cell (outside its actual footprint) must be walkable -- proves the exact nano check ran').toBe(true);
});

// ─── 4. Full live-pipeline wiring proof: biome actually changes what renders ─

test('the live renderer actually draws different wall materials for different biomes at the same cell', async ({ page }) => {
  await waitForGame(page);

  async function captureWallRegion(biomeId: number) {
    return page.evaluate(async (biomeId) => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk to be loaded');
      chunk.biomeId = biomeId;
      const setCell = (x: number, y: number, assetKey: string, walkable: boolean) => {
        chunk.cells[y][x] = { assetKey, walkable, interactable: false };
      };
      for (let y = 0; y < 25; y++) {
        for (let x = 0; x < 25; x++) setCell(x, y, 'grass', defs.grass.walkable);
      }
      setCell(12, 12, 'wall', defs.wall.walkable);
      // Frame the wall cell dead-center so its extrusion is fully on-screen.
      state.camera.x = 12.5;
      state.camera.y = 12.5;
      state.camera.zoom = 1;
      debug.invalidateRenderCaches();

      // Let the running rAF game loop redraw a few frames with the new chunk state.
      await new Promise((resolve) => setTimeout(resolve, 350));

      const { gridToScreen } = await import('/rendering/projection.ts');
      const pos = gridToScreen(12, 12, state.camera);
      const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      if (!canvas) throw new Error('Main game canvas not found');
      const ctx = canvas.getContext('2d')!;
      // Capture a generous region around + above the tile center (walls extrude upward).
      const w = 140, h = 200;
      const x0 = Math.max(0, Math.round(pos.x - w / 2));
      const y0 = Math.max(0, Math.round(pos.y - h + 40));
      const img = ctx.getImageData(x0, y0, w, h).data;
      let rSum = 0, gSum = 0, bSum = 0, n = 0;
      for (let i = 0; i < img.length; i += 4) {
        rSum += img[i]; gSum += img[i + 1]; bSum += img[i + 2]; n++;
      }
      return { r: rSum / n, g: gSum / n, b: bSum / n };
    }, biomeId);
  }

  const meadow = await captureWallRegion(0); // expect plain stone_wall
  const castle = await captureWallRegion(3); // expect stone_wall_cottage_foundation

  expect(
    colorDistance(meadow, castle),
    'the SAME "wall" cell at the SAME position must render visibly differently when chunk.biomeId differs (0=meadow plain stone vs 3=castle cottage-foundation stone) -- proves render.ts really calls wallTileTypeForBiome, not just that the pure function exists',
  ).toBeGreaterThan(2);
});
