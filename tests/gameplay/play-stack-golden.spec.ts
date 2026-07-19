/**
 * play-stack-golden.spec.ts — PR7 golden play-loop proof.
 *
 * Stitches play-stack foundations into one regression net so a broken layer
 * cannot land alone while the others stay green:
 *
 *   PR1 L0  injectDtMs hitch clamp (no multi-cell teleport)
 *   PR2 L1  screenIntentToGrid movement directions (+ live key hold)
 *   PR4 L3  embed recovery legal (never water, leaves solid)
 *   PR5 L2  post-modal locomotion after gate/dialog/quiz close
 *   M1      starter homestead quiz_gate fail → retry → open → walkable
 *
 * ── Manual matrix (what a human playtester checks in ~5 min) ─────────────
 *
 * | # | Action                                      | Pass criterion                          |
 * |---|---------------------------------------------|-----------------------------------------|
 * | 1 | Boot spawn in courtyard                     | On walkable grass; not inside cottage   |
 * | 2 | Hold W / A / S / D for ~1s each             | Moves along iso map (see intent table)  |
 * | 3 | Force hitch (tab away 500ms) while holding D | No multi-cell dash; smooth resume       |
 * | 4 | Face south gate, Space → dialog → quiz      | Modal blocks move; stack owns pause     |
 * | 5 | Wrong answer                                | Re-deal quiz; still at gate; no walk-in |
 * | 6 | Correct answer                              | Gate → door_open; cell walkable         |
 * | 7 | Walk through opened gate                    | Footprint legal mid-gate; leave yard    |
 * | 8 | (Debug) place inside cottage wall           | ≤1 recovery → legal grass; never water  |
 * | 9 | Close any modal (Esc / finish)              | locomotionAllowed; WASD works again     |
 *
 * Intent table (screen → grid, law: dx=sdx+sdy, dy=-sdx+sdy):
 *   W/Up (0,-1) → NW  (−,−)    S/Down (0,+1) → SE (+,+)
 *   A/Left (−1,0) → SW (−,+)   D/Right (+1,0) → NE (+,−)
 *
 * Detailed unit coverage remains in:
 *   tests/core/play-stack-input-matrix.spec.ts
 *   tests/gameplay/play-stack-time-clamp.spec.ts
 *   tests/gameplay/play-stack-motor-recovery.spec.ts
 *   tests/gameplay/play-stack-mode-ownership.spec.ts
 *   tests/gameplay/playability-m1-core-loop.spec.ts
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (PR7)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Homestead ORIGIN (9,8) + gate offset (3,6) = world cell (12,14) */
const GATE = { x: 12, y: 14 };

/** Open courtyard north of cottage — deterministic walkable for hitch / move */
const COURTYARD = { x: 11.5, y: 10.5 };

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state?.chunks?.size, undefined, {
    timeout: 15000,
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
    d?.resetPlayMode?.();
  });
}

async function pressSpace(page: Page) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(200);
  await page.keyboard.up(' ');
  await page.waitForTimeout(300);
}

// ─── PR2: movement directions ─────────────────────────────────────────────

test.describe('PR7 golden: movement directions (PR2 L1)', () => {
  test('screenIntentToGrid cardinal matrix + live W hold matches law', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { InputManager } = await import('/game/input.ts');
      const { screenIntentToGrid } = await import('/game/play-kernel/input-map.ts');

      const cases = [
        { name: 'W', sdx: 0, sdy: -1 },
        { name: 'S', sdx: 0, sdy: 1 },
        { name: 'A', sdx: -1, sdy: 0 },
        { name: 'D', sdx: 1, sdy: 0 },
      ] as const;

      const pure = cases.map((c) => {
        const { dx, dy } = screenIntentToGrid(c.sdx, c.sdy);
        return {
          name: c.name,
          dx,
          dy,
          lawDx: c.sdx + c.sdy,
          lawDy: -c.sdx + c.sdy,
        };
      });

      // Live hold: W → screen (0,-1) → grid NW after normalize
      const im = new InputManager();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
      const v = im.getMovementVector();
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
      im.endFrame();

      return {
        pure,
        live: { dx: v.dx, dy: v.dy, screenDx: v.screenDx, screenDy: v.screenDy },
      };
    });

    for (const row of result.pure) {
      expect(row.dx, `${row.name} dx`).toBe(row.lawDx);
      expect(row.dy, `${row.name} dy`).toBe(row.lawDy);
    }
    // Cardinals: W→(−1,−1), S→(+1,+1), A→(−1,+1), D→(+1,−1)
    expect(result.pure.map((r) => [r.dx, r.dy])).toEqual([
      [-1, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
    ]);

    expect(result.live.screenDx).toBe(0);
    expect(result.live.screenDy).toBe(-1);
    expect(result.live.dx).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(result.live.dy).toBeCloseTo(-Math.SQRT1_2, 10);
  });
});

// ─── PR1: hitch inject clamp ──────────────────────────────────────────────

test.describe('PR7 golden: hitch inject clamp (PR1 L0)', () => {
  test('injectDtMs 500ms: clamp metrics + no multi-cell teleport', async ({ page }) => {
    await waitForGame(page);

    const setup = await page.evaluate((pos) => {
      const d = (window as any).__gameDebug;
      if (typeof d.injectDtMs !== 'function' || typeof d.getDtClampedCount !== 'function') {
        return { ok: false as const, reason: 'injectDtMs / getDtClampedCount missing' };
      }
      const tc = d.getTimeContract();
      d.setPlayerPosition(pos.x, pos.y);
      d.state.player.spawnEscape = false;
      d.state.player.sinkDepth = 0;
      d.state.paused = false;
      d.state.camera.x = pos.x;
      d.state.camera.y = pos.y;
      return {
        ok: true as const,
        walkable: d.isFootprintWalkable(pos.x, pos.y) as boolean,
        speed: d.state.player.speed as number,
        moveStepMs: tc.moveStepMs as number,
        moveMaxCatchupMs: tc.moveMaxCatchupMs as number,
      };
    }, COURTYARD);

    expect(setup.ok, setup.ok === false ? setup.reason : 'debug API ready').toBe(true);
    if (!setup.ok) return;
    expect(setup.walkable, 'courtyard must be walkable').toBe(true);

    const maxClampedCells = setup.speed * (setup.moveMaxCatchupMs / setup.moveStepMs);
    const unclamped500Cells = setup.speed * (500 / setup.moveStepMs);

    await page.keyboard.down('d');
    await page.waitForTimeout(50);

    const clampedBefore = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      d.state.paused = false;
      d.state.player.spawnEscape = false;
      const before = d.getDtClampedCount() as number;
      d.injectDtMs(500);
      return before;
    });

    await page.waitForFunction(
      (c0) => {
        const d = (window as any).__gameDebug;
        const tc = d.getTimeContract();
        return d.getDtClampedCount() > c0 && tc.lastInject && tc.lastInject.rawMs >= 500;
      },
      clampedBefore,
      { timeout: 3000 },
    );

    const latch = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const tc = d.getTimeContract();
      return {
        clamped: d.getDtClampedCount() as number,
        inject: tc.lastInject as { rawMs: number; clampedMs: number; displacement: number },
        pendingInject: tc.pendingInject as boolean,
      };
    });

    await page.keyboard.up('d');

    expect(latch.clamped).toBeGreaterThan(clampedBefore);
    expect(latch.inject.rawMs).toBeGreaterThanOrEqual(500);
    expect(latch.inject.clampedMs).toBeLessThanOrEqual(setup.moveMaxCatchupMs + 1e-6);
    expect(latch.pendingInject).toBe(false);

    const maxWithEscapeStep = maxClampedCells + setup.speed + 1e-3;
    expect(latch.inject.displacement).toBeLessThanOrEqual(maxWithEscapeStep);
    expect(latch.inject.displacement).toBeLessThan(unclamped500Cells * 0.5);
  });
});

// ─── PR5: post-modal movement ─────────────────────────────────────────────

test.describe('PR7 golden: post-modal movement (PR5 L2)', () => {
  test('dialog → exit → locomotionAllowed; quiz → exit → free move', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      d.resetPlayMode();

      // Dialog open → no locomotion
      d.openTestDialog('golden_proof', ['Hello!']);
      const duringDialog = {
        locomotion: d.locomotionAllowed(),
        top: d.getPlayMode().top,
      };

      d.exitModal('dialog');
      const afterDialog = {
        locomotion: d.locomotionAllowed(),
        paused: state.paused,
        stackLen: state.playMode.stack.length,
      };

      // Quiz open → no locomotion → exit → free
      d.startHygieneQuiz();
      const duringQuiz = {
        locomotion: d.locomotionAllowed(),
        top: d.getPlayMode().top,
        quizActive: state.quiz.active,
      };
      state.quiz.active = false;
      d.exitModal('quiz');
      const afterQuiz = {
        locomotion: d.locomotionAllowed(),
        paused: state.paused,
        stackLen: state.playMode.stack.length,
      };

      return { duringDialog, afterDialog, duringQuiz, afterQuiz };
    });

    expect(result.duringDialog.locomotion).toBe(false);
    expect(result.duringDialog.top).toEqual(expect.objectContaining({ kind: 'dialog' }));
    expect(result.afterDialog.locomotion).toBe(true);
    expect(result.afterDialog.paused).toBe(false);
    expect(result.afterDialog.stackLen).toBe(0);

    expect(result.duringQuiz.locomotion).toBe(false);
    expect(result.duringQuiz.top).toEqual(expect.objectContaining({ kind: 'quiz' }));
    expect(result.afterQuiz.locomotion).toBe(true);
    expect(result.afterQuiz.paused).toBe(false);
    expect(result.afterQuiz.stackLen).toBe(0);
  });

  test('live gate: after quiz force-close, WASD displacement allowed', async ({ page }) => {
    await waitForGame(page);

    // Position at gate, open interact chain, force-close quiz, hold D
    await page.evaluate((g) => {
      const d = (window as any).__gameDebug;
      d.resetPlayMode();
      d.setPlayerPosition(g.x + 0.5, g.y - 0.5);
      d.state.player.facingDx = 0;
      d.state.player.facingDy = 1;
      d.state.player.isMoving = false;
      d.state.player.spawnEscape = false;
      d.state.camera.x = d.state.player.x;
      d.state.camera.y = d.state.player.y;
      d.state.paused = false;
    }, GATE);

    await pressSpace(page); // dialog
    await pressSpace(page); // start quiz if dialog advanced
    await page.waitForTimeout(400);

    // Force-close whatever modal is up so we exercise post-modal free play
    await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      if (state.quiz.active) {
        state.quiz.active = false;
        d.exitModal('quiz');
      }
      if (state.ui.dialog.active) {
        d.exitModal('dialog');
      }
      // Drain any residual / orphan pause
      d.recoverOrphanPause?.();
      d.resetPlayMode();
      state.paused = false;
    });

    const free = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      return {
        locomotion: d.locomotionAllowed() as boolean,
        paused: d.state.paused as boolean,
        x: d.state.player.x as number,
        y: d.state.player.y as number,
      };
    });
    expect(free.locomotion, 'post-modal must allow locomotion').toBe(true);
    expect(free.paused).toBe(false);

    // Place on open courtyard so D actually moves (gate cell may still block)
    await page.evaluate((pos) => {
      const d = (window as any).__gameDebug;
      d.setPlayerPosition(pos.x, pos.y);
      d.state.camera.x = pos.x;
      d.state.camera.y = pos.y;
      d.state.paused = false;
    }, COURTYARD);

    const before = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state.player;
      return { x: s.x as number, y: s.y as number };
    });

    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    await page.keyboard.up('d');
    await page.waitForTimeout(50);

    const after = await page.evaluate(() => {
      const s = (window as any).__gameDebug.state.player;
      return {
        x: s.x as number,
        y: s.y as number,
        locomotion: (window as any).__gameDebug.locomotionAllowed() as boolean,
      };
    });

    const dist = Math.hypot(after.x - before.x, after.y - before.y);
    expect(after.locomotion).toBe(true);
    expect(dist, `post-modal hold D should move (Δ=${dist.toFixed(3)})`).toBeGreaterThan(0.05);
  });
});

// ─── PR4: embed recovery ──────────────────────────────────────────────────

test.describe('PR7 golden: embed recovery (PR4 L3)', () => {
  test('cottage embed → ≤1 recovery → legal footprint, never water', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = debug.state;
      const defs = debug.getAssetDefs();
      const chunk = state.chunks.get('0,0');
      if (!chunk) throw new Error('Expected origin chunk');

      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };

      for (let y = 8; y < 18; y++) {
        for (let x = 8; x < 18; x++) setCell(x, y, 'grass');
      }
      setCell(14, 12, 'starter_cottage');
      setCell(17, 17, 'water');

      debug.resetPlayerMotor();
      debug.setPlayerPosition(14.5, 12.5);
      const beforeWalkable = debug.isFootprintWalkable(14.5, 12.5);
      const embed = debug.resolveEmbedIfNeeded();
      const afterWalkable = debug.isFootprintWalkable(state.player.x, state.player.y);
      const gx = Math.floor(state.player.x);
      const gy = Math.floor(state.player.y);
      const asset = chunk.cells[gy]?.[gx]?.assetKey as string | undefined;
      const onWater = asset === 'water' || asset === 'river';

      return {
        beforeWalkable,
        embed,
        afterWalkable,
        gx,
        gy,
        asset,
        onWater,
        spawnEscape: state.player.spawnEscape as boolean,
      };
    });

    expect(result.beforeWalkable, 'cottage center non-walkable').toBe(false);
    expect(result.embed, 'one recovery call must teleport').toBe('teleported');
    expect(result.afterWalkable, 'footprint legal after recovery').toBe(true);
    expect(result.onWater, 'must never recover onto water').toBe(false);
    expect(result.spawnEscape).toBeFalsy();
    expect(result.gx === 14 && result.gy === 12, 'must leave cottage cell').toBe(false);
  });
});

// ─── M1: core quiz-gate loop ──────────────────────────────────────────────

test.describe('PR7 golden: M1 core loop', () => {
  test('starter gate: collision, fail, retry, open, walkable mid-gate', async ({ page }) => {
    await waitForGame(page);

    const setup = await page.evaluate((g) => {
      const d = (window as any).__gameDebug;
      const ch = d.state.chunks.get('0,0');
      if (!ch) return { ok: false as const, reason: 'no chunk' };
      const cell = ch.cells[g.y]?.[g.x];
      d.setPlayerPosition(g.x + 0.5, g.y - 0.5);
      d.state.player.facingDx = 0;
      d.state.player.facingDy = 1;
      d.state.player.isMoving = false;
      d.state.camera.x = d.state.player.x;
      d.state.camera.y = d.state.player.y;
      d.state.paused = false;
      d.resetPlayMode?.();
      return {
        ok: true as const,
        assetKey: cell?.assetKey as string,
        walkable: cell?.walkable as boolean,
        midBlocked: !d.isFootprintWalkable(g.x + 0.5, g.y + 0.5),
      };
    }, GATE);

    expect(setup.ok, 'origin chunk loaded').toBe(true);
    if (!setup.ok) return;
    expect(setup.assetKey, 'starter homestead quiz_gate').toBe('quiz_gate');
    expect(setup.walkable).toBe(false);
    expect(setup.midBlocked, 'locked gate full-tile block').toBe(true);

    await pressSpace(page); // dialog
    await pressSpace(page); // start quiz
    await page.waitForTimeout(500);

    let quiz = await page.evaluate(() => {
      const q = (window as any).__gameDebug.state.quiz;
      return {
        active: q.active as boolean,
        correctIndex: q.correctIndex as number,
        choicesLen: q.choices.length as number,
        result: q.result as string,
      };
    });
    expect(quiz.active, 'quiz must start from homestead gate').toBe(true);
    expect(quiz.choicesLen).toBeGreaterThan(1);

    // Wrong → re-deal
    const wrongIndex = [...Array(quiz.choicesLen).keys()].find(
      (i) => i !== quiz.correctIndex && i !== quiz.choicesLen - 1,
    )!;
    await page.evaluate((idx) => (window as any).__gameDebug.quizSelectIndex(idx), wrongIndex);
    await pressSpace(page);
    await pressSpace(page);
    await page.waitForTimeout(500);

    quiz = await page.evaluate(() => {
      const q = (window as any).__gameDebug.state.quiz;
      return {
        active: q.active as boolean,
        correctIndex: q.correctIndex as number,
        choicesLen: q.choices.length as number,
        result: q.result as string,
      };
    });
    expect(quiz.active, 'wrong answer re-deals').toBe(true);
    expect(quiz.result).toBe('pending');

    const stillGate = await page.evaluate((g) => {
      const ch = (window as any).__gameDebug.state.chunks.get('0,0');
      return ch.cells[g.y][g.x].assetKey as string;
    }, GATE);
    expect(stillGate).toBe('quiz_gate');

    // Correct → open
    await page.evaluate((idx) => (window as any).__gameDebug.quizSelectIndex(idx), quiz.correctIndex);
    await pressSpace(page);
    await pressSpace(page);
    await page.waitForTimeout(300);

    const opened = await page.evaluate((g) => {
      const d = (window as any).__gameDebug;
      const ch = d.state.chunks.get('0,0');
      const cell = ch.cells[g.y][g.x];
      return {
        assetKey: cell.assetKey as string,
        walkable: cell.walkable as boolean,
        midOpen: d.isFootprintWalkable(g.x + 0.5, g.y + 0.5) as boolean,
        locomotion: d.locomotionAllowed() as boolean,
      };
    }, GATE);

    expect(opened.assetKey).toBe('door_open');
    expect(opened.walkable).toBe(true);
    expect(opened.midOpen, 'opened gate walkable').toBe(true);
    expect(opened.locomotion, 'post-open free play').toBe(true);
  });
});

// ─── Stack stitch: one session touches all layers ─────────────────────────

test.describe('PR7 golden: single-session stack stitch', () => {
  test('input law → hitch clamp ready → embed legal → modal free → M1 open', async ({ page }) => {
    await waitForGame(page);

    // 1) Input law present
    const intent = await page.evaluate(async () => {
      const { screenIntentToGrid } = await import('/game/play-kernel/input-map.ts');
      return screenIntentToGrid(1, 0); // D → NE
    });
    expect(intent.dx).toBe(1);
    expect(intent.dy).toBe(-1);

    // 2) injectDtMs hook present (PR1)
    const hooks = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      return {
        inject: typeof d.injectDtMs === 'function',
        clamp: typeof d.getDtClampedCount === 'function',
        embed: typeof d.resolveEmbedIfNeeded === 'function',
        loco: typeof d.locomotionAllowed === 'function',
        time: typeof d.getTimeContract === 'function',
      };
    });
    expect(hooks).toEqual({
      inject: true,
      clamp: true,
      embed: true,
      loco: true,
      time: true,
    });

    // 3) Embed recovery on fixture (PR4)
    const embed = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const defs = debug.getAssetDefs();
      const chunk = debug.state.chunks.get('0,0');
      const setCell = (x: number, y: number, assetKey: string) => {
        const def = defs[assetKey];
        chunk.cells[y][x] = {
          assetKey,
          walkable: def.walkable,
          interactable: def.interactable ?? false,
        };
      };
      // Local patch only — do not wipe whole chunk (gate still needed below)
      setCell(16, 10, 'grass');
      setCell(16, 11, 'grass');
      setCell(15, 10, 'grass');
      setCell(15, 11, 'grass');
      setCell(17, 10, 'grass');
      setCell(17, 11, 'grass');
      setCell(16, 10, 'starter_cottage');
      setCell(18, 12, 'water');
      debug.resetPlayerMotor();
      debug.setPlayerPosition(16.5, 10.5);
      const r = debug.resolveEmbedIfNeeded();
      const gx = Math.floor(debug.state.player.x);
      const gy = Math.floor(debug.state.player.y);
      const asset = chunk.cells[gy]?.[gx]?.assetKey;
      return {
        r,
        walkable: debug.isFootprintWalkable(debug.state.player.x, debug.state.player.y),
        onWater: asset === 'water' || asset === 'river',
        leftCottage: !(gx === 16 && gy === 10),
      };
    });
    expect(embed.r).toBe('teleported');
    expect(embed.walkable).toBe(true);
    expect(embed.onWater).toBe(false);
    expect(embed.leftCottage).toBe(true);

    // 4) Post-modal free (PR5)
    const modal = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      d.resetPlayMode();
      d.openTestDialog('stitch', ['hi']);
      const mid = d.locomotionAllowed();
      d.exitModal('dialog');
      return { mid, after: d.locomotionAllowed() };
    });
    expect(modal.mid).toBe(false);
    expect(modal.after).toBe(true);

    // 5) M1 gate still stamped (world not destroyed by local embed fixture)
    const gateOk = await page.evaluate((g) => {
      const ch = (window as any).__gameDebug.state.chunks.get('0,0');
      const cell = ch.cells[g.y][g.x];
      return { assetKey: cell.assetKey as string, walkable: cell.walkable as boolean };
    }, GATE);
    expect(gateOk.assetKey).toBe('quiz_gate');
    expect(gateOk.walkable).toBe(false);

    // 6) Hitch inject: one frame clamp (PR1 thin glue in-session)
    // Note: pendingInject may clear before evaluate returns (rAF race); assert latch after consume.
    const hitch = await page.evaluate((pos) => {
      const d = (window as any).__gameDebug;
      d.resetPlayMode();
      d.setPlayerPosition(pos.x, pos.y);
      d.state.player.spawnEscape = false;
      d.state.paused = false;
      const tc = d.getTimeContract();
      const before = d.getDtClampedCount() as number;
      d.injectDtMs(500);
      return {
        before,
        maxCatchup: tc.moveMaxCatchupMs as number,
      };
    }, COURTYARD);

    await page.waitForFunction(
      (c0) => {
        const d = (window as any).__gameDebug;
        const tc = d.getTimeContract();
        return d.getDtClampedCount() > c0 && tc.lastInject && tc.lastInject.rawMs >= 500;
      },
      hitch.before,
      { timeout: 3000 },
    );

    const hitchAfter = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const tc = d.getTimeContract();
      return {
        clamped: d.getDtClampedCount() as number,
        raw: tc.lastInject?.rawMs as number,
        clampedMs: tc.lastInject?.clampedMs as number,
        displacement: tc.lastInject?.displacement as number,
        pending: tc.pendingInject as boolean,
      };
    });

    expect(hitchAfter.clamped).toBeGreaterThan(hitch.before);
    expect(hitchAfter.raw).toBeGreaterThanOrEqual(500);
    expect(hitchAfter.clampedMs).toBeLessThanOrEqual(hitch.maxCatchup + 1e-6);
    expect(hitchAfter.pending).toBe(false);
    // Idle inject (no hold) → displacement near 0; still must not be multi-cell
    expect(hitchAfter.displacement).toBeLessThan(2);
  });
});
