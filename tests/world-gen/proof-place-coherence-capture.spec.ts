/**
 * proof-place-coherence-capture.spec.ts — Place Coherence PR6 proof bar
 *
 * Captures live screenshots that lock the place-coherence campaign:
 *   - proof-place-coherence-homestead.png — closed south fence + sole quiz_gate
 *   - proof-place-coherence-recipe.png    — one PR5 catalog recipe (fenced-garden-quiz)
 *   - proof-place-coherence-explore.png   — early-world intentional place language
 *
 * Place coherence pass is law: gen stamp + walk SSOT + draw gate priority agree.
 * Homestead closed south remains regression-locked.
 *
 * Run:
 *   npx playwright test tests/world-gen/proof-place-coherence-capture.spec.ts --reporter=line
 *
 * @see memories/repo/design-place-coherence-epic-2026-07-19.md (PR6)
 * @see tests/world-gen/proof-scene-law-capture.spec.ts (scene-first pattern)
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT_DIR = path.join('tests', 'screenshots');
const HOMESTEAD_SHOT = path.join(SHOT_DIR, 'proof-place-coherence-homestead.png');
const RECIPE_SHOT = path.join(SHOT_DIR, 'proof-place-coherence-recipe.png');
const EXPLORE_SHOT = path.join(SHOT_DIR, 'proof-place-coherence-explore.png');
/** Critical-path PR6: spawn viewport with multi-cell cottage north of player. */
const CRITICAL_PATH_SPAWN_SHOT = path.join(SHOT_DIR, 'proof-critical-path-spawn.png');

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state?.chunks?.size, undefined, {
    timeout: 20000,
  });
  await page.evaluate(() => {
    localStorage.setItem('emilys_game_first_run', '1');
    const splash = document.getElementById('welcomeSplash');
    if (splash) {
      splash.style.display = 'none';
      (splash as HTMLElement).style.pointerEvents = 'none';
    }
    const d = (window as any).__gameDebug;
    if (d?.state) d.state.paused = false;
  });
  // Let a few frames paint after unpause
  await page.waitForTimeout(800);
}

test('PR6 place-coherence proof bar: homestead + recipe + explore', async ({ page }) => {
  await waitForGame(page);

  // ── 1. Homestead closed south ──────────────────────────────────────────
  // Yard looking south toward sole quiz_gate at (13,16) on 9×9 footprint
  const homesteadInfo = await page.evaluate(async () => {
    const d = (window as any).__gameDebug;
    const ch = d.state.chunks.get('0,0');
    if (!ch) return { ok: false as const, reason: 'no origin chunk' };

    const { auditHomesteadSouth, HOMESTEAD_SOUTH_GATE_ABS } = await import(
      '/engine/world/PlaceCoherence.ts'
    );
    const {
      STARTER_HOMESTEAD_ORIGIN,
      STARTER_HOMESTEAD_OPENINGS,
      HOMESTEAD_SIZE,
    } = await import('/engine/iso2-assemblies.ts');

    // Spawn cell center — cottage mass reads north of player
    const spawnX = 12.5;
    const spawnY = 12.5;
    d.setPlayerPosition(spawnX, spawnY);
    d.state.player.facingDx = 0;
    d.state.player.facingDy = 1;
    d.state.player.isMoving = false;
    d.state.camera.x = d.state.player.x;
    d.state.camera.y = d.state.player.y;
    d.state.paused = false;

    const p6 = auditHomesteadSouth(ch.cells, STARTER_HOMESTEAD_ORIGIN.x, STARTER_HOMESTEAD_ORIGIN.y);
    const gate = ch.cells[HOMESTEAD_SOUTH_GATE_ABS.y]?.[HOMESTEAD_SOUTH_GATE_ABS.x];
    const ox = STARTER_HOMESTEAD_ORIGIN.x;
    const oy = STARTER_HOMESTEAD_ORIGIN.y;
    // South row relative y=8: fence except quiz_gate at x=4
    const southRow: string[] = [];
    for (let rx = 0; rx < HOMESTEAD_SIZE; rx++) {
      southRow.push(ch.cells[oy + 8]?.[ox + rx]?.assetKey ?? 'missing');
    }
    const flankLeft = ch.cells[oy + 8]?.[ox + 3]?.assetKey;
    const flankRight = ch.cells[oy + 8]?.[ox + 5]?.assetKey;

    // Authored cottage mass abs (12–13,10–11); starter_cottage at (13,11)
    const cottageCell = ch.cells[11]?.[13];
    let cottageInFootprint: string | null = null;
    for (let ry = 0; ry < HOMESTEAD_SIZE; ry++) {
      for (let rx = 0; rx < HOMESTEAD_SIZE; rx++) {
        const k = ch.cells[oy + ry]?.[ox + rx]?.assetKey;
        if (k === 'starter_cottage') cottageInFootprint = k;
      }
    }

    const spawnCell = ch.cells[12]?.[12];
    const cottageMass = [
      ch.cells[10]?.[12]?.assetKey,
      ch.cells[10]?.[13]?.assetKey,
      ch.cells[11]?.[12]?.assetKey,
      ch.cells[11]?.[13]?.assetKey,
    ];

    return {
      ok: true as const,
      gateKey: gate?.assetKey ?? null,
      gateAbs: { ...HOMESTEAD_SOUTH_GATE_ABS },
      gateWalkable: gate?.walkable ?? null,
      p6Violations: p6,
      southRow,
      flankLeft,
      flankRight,
      openingsCount: STARTER_HOMESTEAD_OPENINGS.length,
      cottageKey: cottageCell?.assetKey ?? null,
      cottageInFootprint,
      spawnKey: spawnCell?.assetKey ?? null,
      spawnWalkable: spawnCell?.walkable ?? null,
      cottageMass,
      footprintWalkable: typeof d.isFootprintWalkable === 'function'
        ? d.isFootprintWalkable(spawnX, spawnY)
        : null,
    };
  });

  expect(homesteadInfo.ok, 'origin chunk loaded').toBe(true);
  expect(homesteadInfo.gateKey, 'sole south exit is quiz_gate').toBe('quiz_gate');
  expect(homesteadInfo.gateAbs).toEqual({ x: 13, y: 16 });
  expect(homesteadInfo.flankLeft, 'gate left flank closed (fence)').toBe('fence');
  expect(homesteadInfo.flankRight, 'gate right flank closed (fence)').toBe('fence');
  expect(homesteadInfo.p6Violations, 'P6 homestead audit clean').toEqual([]);
  expect(homesteadInfo.openingsCount, 'one declared homestead opening').toBe(1);
  // South row: 8 fence + 1 quiz_gate, no dirt holes
  const southFences = homesteadInfo.southRow!.filter((k) => k === 'fence').length;
  const southGates = homesteadInfo.southRow!.filter((k) => k === 'quiz_gate').length;
  const southDirt = homesteadInfo.southRow!.filter((k) => k === 'dirt').length;
  expect(southFences, 'south fence count').toBe(8);
  expect(southGates, 'south sole quiz_gate').toBe(1);
  expect(southDirt, 'no dirt flanks on closed south').toBe(0);
  expect(homesteadInfo.spawnWalkable, 'spawn (12,12) walkable').toBe(true);
  expect(homesteadInfo.spawnKey?.startsWith('starter_'), 'spawn not cottage mass').toBe(false);
  expect(homesteadInfo.cottageInFootprint, 'starter_cottage in 9×9 footprint').toBe('starter_cottage');
  expect(homesteadInfo.cottageKey).toBe('starter_cottage');
  expect(
    homesteadInfo.cottageMass!.every((k) => k?.startsWith('starter_')),
    '2×2 cottage mass north of spawn',
  ).toBe(true);
  if (homesteadInfo.footprintWalkable !== null) {
    expect(homesteadInfo.footprintWalkable, 'spawn footprint legal (not embedded)').toBe(true);
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: HOMESTEAD_SHOT, fullPage: false });
  // Critical-path spawn proof (same viewport: player at spawn, cottage north)
  await page.screenshot({ path: CRITICAL_PATH_SPAWN_SHOT, fullPage: false });

  // ── 2. One new catalog recipe (fenced-garden-quiz) ─────────────────────
  // Stamp on a quiet origin meadow east of homestead; grass-pad + cache
  // invalidate so the 4×4 pen (north/side fence + flowers + south gate) paints.
  // Camera slightly north of pen looking south so full fence ring reads.
  const recipeInfo = await page.evaluate(async () => {
    const d = (window as any).__gameDebug;
    const ch = d.state.chunks.get('0,0');
    if (!ch) return { ok: false as const, reason: 'no origin chunk' };

    const {
      stampAssemblyOntoCells,
      validateSceneOpenings,
      ASSEMBLY_RECIPES,
    } = await import('/engine/iso2-assemblies.ts');
    const { auditPlaceCoherence, findIllegalFenceGaps, buildDeclaredOpeningCells } =
      await import('/engine/world/PlaceCoherence.ts');

    const recipeId = 'fenced-garden-quiz';
    const recipe = ASSEMBLY_RECIPES[recipeId];
    // East of homestead (origin 9..15) — quieter grass for a readable pen
    const stampOx = 20;
    const stampOy = 4;

    // Soft grass pad around stamp so neighboring residue doesn't fragment the pen
    for (let y = stampOy - 1; y < stampOy + recipe.height + 1; y++) {
      for (let x = stampOx - 1; x < stampOx + recipe.width + 1; x++) {
        if (!ch.cells[y]?.[x]) continue;
        ch.cells[y][x] = {
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        };
      }
    }
    stampAssemblyOntoCells(ch.cells, recipeId as any, stampOx, stampOy);
    if (typeof d.invalidateRenderCaches === 'function') d.invalidateRenderCaches();

    const validation = validateSceneOpenings(ch.cells, stampOx, stampOy, recipe);
    const recipes = [{ recipe, originX: stampOx, originY: stampOy }];
    // Footprint-scoped: recipe openings + P4 allow-list only for this stamp
    const audit = auditPlaceCoherence(ch.cells, {
      chunkX: 0,
      chunkY: 0,
      recipes,
    });
    const declared = buildDeclaredOpeningCells(recipes);
    // P4 only over a tight bound around the garden (avoid whole-chunk noise)
    const footprintGaps = findIllegalFenceGaps(ch.cells, undefined, declared).filter(
      (v: { x: number; y: number }) =>
        v.x >= stampOx &&
        v.x < stampOx + recipe.width &&
        v.y >= stampOy &&
        v.y < stampOy + recipe.height,
    );
    const p2 = audit.violations.filter(
      (v: { invariant: string; recipeId?: string }) =>
        v.invariant === 'P2' && v.recipeId === recipeId,
    );

    // Camera slightly north of the pen looking south — full north/side fence +
    // south quiz_gate + dirt flank in one frame (readable catalog place).
    const camX = stampOx + recipe.width / 2;
    const camY = stampOy + 0.4;
    d.setPlayerPosition(camX, camY);
    d.state.player.facingDx = 0;
    d.state.player.facingDy = 1;
    d.state.player.isMoving = false;
    d.state.camera.x = d.state.player.x;
    d.state.camera.y = d.state.player.y;
    d.state.paused = false;

    const gateCell = ch.cells[stampOy + 3]?.[stampOx + 2];
    const pathFlank = ch.cells[stampOy + 3]?.[stampOx + 1];
    const flower = ch.cells[stampOy + 1]?.[stampOx + 1];
    const northFence = ch.cells[stampOy]?.[stampOx + 1];

    return {
      ok: true as const,
      recipeId,
      validationOk: validation.ok,
      validationViolations: validation.violations,
      p2Violations: p2,
      footprintGaps,
      gateKey: gateCell?.assetKey ?? null,
      pathFlankKey: pathFlank?.assetKey ?? null,
      flowerKey: flower?.assetKey ?? null,
      northFenceKey: northFence?.assetKey ?? null,
      stampOx,
      stampOy,
      width: recipe.width,
      height: recipe.height,
    };
  });

  expect(recipeInfo.ok, 'recipe stamp on origin').toBe(true);
  expect(recipeInfo.recipeId).toBe('fenced-garden-quiz');
  expect(recipeInfo.validationOk, 'recipe openings validate after stamp').toBe(true);
  expect(recipeInfo.gateKey, 'garden south is quiz_gate').toBe('quiz_gate');
  expect(recipeInfo.pathFlankKey, 'garden path flank is dirt').toBe('dirt');
  expect(recipeInfo.northFenceKey, 'garden north fence ring').toBe('fence');
  expect(
    recipeInfo.flowerKey,
    'garden interior blooms present',
  ).toBe('flower');
  expect(
    recipeInfo.p2Violations,
    `recipe P2 clean: ${JSON.stringify(recipeInfo.p2Violations)}`,
  ).toEqual([]);
  expect(
    recipeInfo.footprintGaps,
    `recipe footprint P4 clean: ${JSON.stringify(recipeInfo.footprintGaps)}`,
  ).toEqual([]);

  // Longer paint settle after cache invalidate so fence/flowers/gate draw
  await page.waitForTimeout(1100);
  await page.screenshot({ path: RECIPE_SHOT, fullPage: false });

  // ── 3. Explore early chunk (intentional place language) ────────────────
  // Fixed-seed generateChunkSync samples prove pass left 0 illegal gaps;
  // live camera paints SE of homestead for the visual bar.
  const exploreInfo = await page.evaluate(async () => {
    const d = (window as any).__gameDebug;
    const gen = await import('/engine/gen.ts');
    const { findIllegalFenceGaps, auditHomesteadSouth } = await import(
      '/engine/world/PlaceCoherence.ts'
    );
    const { STARTER_HOMESTEAD_ORIGIN } = await import('/engine/iso2-assemblies.ts');

    const FIXED_WORDLIST = [
      'alpha beta',
      'gamma delta',
      'epsilon zeta',
      'eta theta',
      'iota kappa',
      'lambda mu',
      'nu xi',
      'omicron pi',
    ];
    gen.setWordlist(FIXED_WORDLIST);
    gen.setBiomeNoiseSeed(42);
    gen.restoreEntropyBuffer('');

    // Fresh fixed-seed samples (not live boot noise) for gap matrix
    const sampleCoords: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [0, 2],
    ];
    let sampleQuizGates = 0;
    let sampleIllegalGaps = 0;
    let freeOuthouses = 0;
    const perChunk: Array<{ key: string; gaps: number; gates: number }> = [];

    for (const [cx, cy] of sampleCoords) {
      const chunk = gen.generateChunkSync(cx, cy);
      let gates = 0;
      for (const row of chunk.cells) {
        for (const cell of row) {
          if (!cell) continue;
          if (cell.assetKey === 'quiz_gate') {
            sampleQuizGates++;
            gates++;
          }
          if (cell.assetKey === 'outhouse') freeOuthouses++;
        }
      }
      const gaps = findIllegalFenceGaps(chunk.cells);
      sampleIllegalGaps += gaps.length;
      perChunk.push({ key: `${cx},${cy}`, gaps: gaps.length, gates });

      // Paint one non-origin sample into live state for the explore screenshot
      if (cx === 0 && cy === 1) {
        d.state.chunks.set('0,1', chunk);
      }
    }

    // Camera just south of homestead onto early path language / chunk edge
    d.setPlayerPosition(12.5, 18.5);
    d.state.camera.x = d.state.player.x;
    d.state.camera.y = d.state.player.y;
    d.state.player.facingDx = 0;
    d.state.player.facingDy = 1;
    d.state.player.isMoving = false;
    d.state.paused = false;

    // Live origin still closed (P6 regression after recipe stamp + explore)
    const origin = d.state.chunks.get('0,0');
    let originP6: unknown[] = [];
    if (origin) {
      originP6 = auditHomesteadSouth(
        origin.cells,
        STARTER_HOMESTEAD_ORIGIN.x,
        STARTER_HOMESTEAD_ORIGIN.y,
      );
    }

    return {
      quizGates: sampleQuizGates,
      freeOuthouses,
      illegalGaps: sampleIllegalGaps,
      chunkCount: sampleCoords.length,
      originP6,
      perChunk,
    };
  });

  expect(exploreInfo.quizGates, 'fixed-seed samples have functional gates').toBeGreaterThan(0);
  expect(exploreInfo.freeOuthouses, 'no free outhouse scatter').toBe(0);
  expect(
    exploreInfo.illegalGaps,
    `illegal fence gaps after place-coherence pass: ${JSON.stringify(exploreInfo.perChunk)}`,
  ).toBe(0);
  expect(exploreInfo.originP6, 'homestead south still closed after explore').toEqual([]);

  await page.waitForTimeout(700);
  await page.screenshot({ path: EXPLORE_SHOT, fullPage: false });

  // Screenshots must exist on disk (checked-in proof bar)
  for (const shot of [HOMESTEAD_SHOT, RECIPE_SHOT, EXPLORE_SHOT]) {
    expect(fs.existsSync(shot), `proof screenshot exists: ${shot}`).toBe(true);
    const stat = fs.statSync(shot);
    expect(stat.size, `non-empty screenshot: ${shot}`).toBeGreaterThan(1000);
  }

  console.log(
    'PR6 place-coherence proof bar:',
    JSON.stringify({
      homesteadInfo,
      recipeInfo,
      exploreInfo: {
        quizGates: exploreInfo.quizGates,
        freeOuthouses: exploreInfo.freeOuthouses,
        illegalGaps: exploreInfo.illegalGaps,
        chunkCount: exploreInfo.chunkCount,
      },
      HOMESTEAD_SHOT,
      RECIPE_SHOT,
      EXPLORE_SHOT,
    }),
  );
});
