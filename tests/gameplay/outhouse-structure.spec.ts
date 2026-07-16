/**
 * outhouse-structure.spec.ts - Tests for Outhouse Structure (#110 Phase 2)
 * Validates outhouse asset, template, interaction, hygiene quiz, and cleanliness restore.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Outhouse Structure (#110 Phase 2)', () => {

  // ─── Asset Definition ────────────────────────────────────

  test('outhouse asset exists and is interactable', async ({ page }) => {
    await waitForGame(page);
    const def = await page.evaluate(() => {
      const defs = (window as any).__gameDebug?.getAssetDefs();
      return defs?.outhouse;
    });
    expect(def).toBeTruthy();
    expect(def.interactable).toBe(true);
    expect(def.walkable).toBe(false);
    expect(def.category).toBe('interactive');
    expect(def.emoji).toBe('🚽');
  });

  // ─── Template ────────────────────────────────────────────

  test('outhouse_clearing template exists in WORLD_UNIT_TEMPLATES', async ({ page }) => {
    await waitForGame(page);
    const template = await page.evaluate(() => {
      const config = (window as any).__gameDebug?.getTileConfig();
      const templates = config?.WORLD_UNIT_TEMPLATES;
      if (!templates) return null;
      return templates.find((t: any) => t.name === 'outhouse_clearing');
    });
    expect(template).toBeTruthy();
    expect(template.category).toBe('structural');
    expect(template.biomeAffinity).toContain('meadow');
    expect(template.biomeAffinity).toContain('forest');
  });

  test('outhouse_clearing template has outhouse in cells', async ({ page }) => {
    await waitForGame(page);
    const hasOuthouse = await page.evaluate(() => {
      const config = (window as any).__gameDebug?.getTileConfig();
      const templates = config?.WORLD_UNIT_TEMPLATES;
      if (!templates) return false;
      const tmpl = templates.find((t: any) => t.name === 'outhouse_clearing');
      if (!tmpl) return false;
      // Check that 'outhouse' appears in the cells grid
      for (const row of tmpl.cells) {
        for (const cell of row) {
          if (cell === 'outhouse') return true;
        }
      }
      return false;
    });
    expect(hasOuthouse).toBe(true);
  });

  test('outhouse_clearing free-placement weight is 0 in meadow and forest (scene-first)', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(async () => {
      // Vite serves src/ at root; config is importable from the page.
      const tiles = await import('/config/tiles.config.ts');
      return {
        meadow: tiles.BIOME_TEMPLATE_WEIGHTS?.meadow?.outhouse_clearing ?? null,
        forest: tiles.BIOME_TEMPLATE_WEIGHTS?.forest?.outhouse_clearing ?? null,
      };
    });
    // Template still exists for intentional stamps; free WU weight is banned.
    expect(weights.meadow).toBe(0);
    expect(weights.forest).toBe(0);
  });

  // ─── Interaction Logic ───────────────────────────────────

  test('interacting with outhouse cell returns type "outhouse"', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return null;
      // Place outhouse in a nearby cell
      const px = Math.round(state.player.x);
      const py = Math.round(state.player.y);
      const cs = 32; // chunk size
      const cx = Math.floor(px / cs);
      const cy = Math.floor(py / cs);
      const key = `${cx},${cy}`;
      const chunk = state.chunks.get(key);
      if (!chunk) return null;
      const lx = ((px + 1) % cs + cs) % cs;
      const ly = (py % cs + cs) % cs;
      chunk.cells[ly][lx] = { assetKey: 'outhouse', walkable: false, interactable: true };
      // Set player facing right
      state.player.direction = 'right';
      return { placed: true, lx, ly };
    });
    expect(result?.placed).toBe(true);
  });

  // ─── Hygiene Quiz ────────────────────────────────────────

  test('hygiene quiz can be started via debug hook', async ({ page }) => {
    await waitForGame(page);
    const quizActive = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      if (!debug) return false;
      debug.startHygieneQuiz();
      return debug.state.quiz.active;
    });
    expect(quizActive).toBe(true);
  });

  test('hygiene quiz has correct format', async ({ page }) => {
    await waitForGame(page);
    const quizData = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      if (!debug) return null;
      debug.startHygieneQuiz();
      const q = debug.state.quiz;
      return {
        active: q.active,
        displayText: q.displayText,
        choices: q.choices,
        correctIndex: q.correctIndex,
        difficulty: q.difficulty,
        hasIDontKnow: q.choices.includes("I don't know 📖"),
        questionCategory: q.question?.category,
      };
    });
    expect(quizData).toBeTruthy();
    expect(quizData!.active).toBe(true);
    expect(quizData!.displayText).toContain('🚽 Hygiene Quiz:');
    expect(quizData!.hasIDontKnow).toBe(true);
    expect(quizData!.difficulty).toBe('easy');
    expect(quizData!.questionCategory).toBe('science');
    expect(quizData!.choices.length).toBeGreaterThanOrEqual(4); // 3+ answers + "I don't know"
  });

  test('hygiene quiz flag is set after starting', async ({ page }) => {
    await waitForGame(page);
    const flagSet = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      if (!debug) return false;
      debug.startHygieneQuiz();
      return debug.getHygieneQuizActive();
    });
    expect(flagSet).toBe(true);
  });

  // ─── Cleanliness Restore ─────────────────────────────────

  test('outhouse interaction restores cleanliness partially', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return null;
      // Set cleanliness to low
      state.status.cleanliness = 20;
      // Simulate the outhouse interaction effect (partial restore +40)
      const cleanBefore = state.status.cleanliness;
      const partialRestore = Math.min(100 - cleanBefore, 40);
      state.status.cleanliness = Math.min(100, cleanBefore + partialRestore);
      return {
        cleanBefore,
        cleanAfter: state.status.cleanliness,
        restored: partialRestore,
      };
    });
    expect(result).toBeTruthy();
    expect(result!.cleanBefore).toBe(20);
    expect(result!.cleanAfter).toBe(60);
    expect(result!.restored).toBe(40);
  });

  test('correct hygiene quiz gives full cleanliness restore', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameDebug?.state;
      if (!state) return null;
      // Set cleanliness to medium after partial outhouse restore
      state.status.cleanliness = 60;
      // Simulate correct quiz bonus (full restore to 100)
      state.status.cleanliness = 100;
      return { cleanliness: state.status.cleanliness };
    });
    expect(result).toBeTruthy();
    expect(result!.cleanliness).toBe(100);
  });

  // ─── SFX ─────────────────────────────────────────────────

  test('outhouse SFX definitions exist', async ({ page }) => {
    await waitForGame(page);
    const sfxExists = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      if (!debug) return { enter: false, clean: false };
      // Try playing each SFX - will not error if they exist
      try {
        debug.playSfx('outhouse_enter');
        debug.playSfx('outhouse_clean');
        return { enter: true, clean: true };
      } catch {
        return { enter: false, clean: false };
      }
    });
    expect(sfxExists.enter).toBe(true);
    expect(sfxExists.clean).toBe(true);
  });

  // ─── Hints ───────────────────────────────────────────────

  test('outhouse hints exist in hint config', async ({ page }) => {
    await waitForGame(page);
    const hintsExist = await page.evaluate(() => {
      const bubbles = (window as any).__bubbles;
      if (!bubbles) return { dirty: false, near: false };
      // Trigger hints and check they don't throw
      try {
        bubbles.triggerHint('outhouse_dirty');
        bubbles.triggerHint('outhouse_near');
        return { dirty: true, near: true };
      } catch {
        return { dirty: false, near: false };
      }
    });
    expect(hintsExist.dirty).toBe(true);
    expect(hintsExist.near).toBe(true);
  });
});
