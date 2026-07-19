/**
 * play-stack-input-matrix.spec.ts — PR2 / L1 input map verification.
 *
 * Pure `screenIntentToGrid(sdx, sdy)` is the single source of truth for
 * screen-intent → grid motion. Assume axes may be inverted until proven;
 * this table codifies the **current intentional law** from input.ts:
 *
 *   dx = sdx + sdy
 *   dy = -sdx + sdy
 *   (getMovementVector normalizes after transform)
 *
 * Physical keys → screen intent (sdx, sdy):
 *   W / ArrowUp    → ( 0, -1)   // screen up
 *   S / ArrowDown  → ( 0, +1)   // screen down
 *   A / ArrowLeft  → (-1,  0)   // screen left
 *   D / ArrowRight → (+1,  0)   // screen right
 *
 * Projection check (src/rendering/projection.ts):
 *   screenX ∝ (rx − ry),  screenY ∝ (rx + ry)
 * so grid (−1,−1) paints "up", (+1,+1) "down", etc.
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md PR2 / L1
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

/** Expected unnormalized grid signs for cardinals + diagonals. */
const INTENT_MATRIX: Array<{
  name: string;
  sdx: number;
  sdy: number;
  /** Expected sign of grid dx (-1 | 0 | 1) after transform (before norm). */
  expectDxSign: -1 | 0 | 1;
  /** Expected sign of grid dy (-1 | 0 | 1) after transform (before norm). */
  expectDySign: -1 | 0 | 1;
  /** After normalize: unit vector components (exact for these 8 + zero). */
  normDx: number;
  normDy: number;
}> = [
  // Cardinals
  { name: 'W/Up screen', sdx: 0, sdy: -1, expectDxSign: -1, expectDySign: -1, normDx: -Math.SQRT1_2, normDy: -Math.SQRT1_2 },
  { name: 'S/Down screen', sdx: 0, sdy: 1, expectDxSign: 1, expectDySign: 1, normDx: Math.SQRT1_2, normDy: Math.SQRT1_2 },
  { name: 'A/Left screen', sdx: -1, sdy: 0, expectDxSign: -1, expectDySign: 1, normDx: -Math.SQRT1_2, normDy: Math.SQRT1_2 },
  { name: 'D/Right screen', sdx: 1, sdy: 0, expectDxSign: 1, expectDySign: -1, normDx: Math.SQRT1_2, normDy: -Math.SQRT1_2 },
  // Diagonals (screen diagonals collapse onto a single grid axis after 45°)
  { name: 'W+D up-right', sdx: 1, sdy: -1, expectDxSign: 0, expectDySign: -1, normDx: 0, normDy: -1 },
  { name: 'W+A up-left', sdx: -1, sdy: -1, expectDxSign: -1, expectDySign: 0, normDx: -1, normDy: 0 },
  { name: 'S+D down-right', sdx: 1, sdy: 1, expectDxSign: 1, expectDySign: 0, normDx: 1, normDy: 0 },
  { name: 'S+A down-left', sdx: -1, sdy: 1, expectDxSign: 0, expectDySign: 1, normDx: 0, normDy: 1 },
  // Idle
  { name: 'idle', sdx: 0, sdy: 0, expectDxSign: 0, expectDySign: 0, normDx: 0, normDy: 0 },
];

function sign(n: number): -1 | 0 | 1 {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

test.describe('Play-stack L1 input map (screenIntentToGrid)', () => {
  test('matrix: physical screen intent → grid dx/dy signs + normalize', async ({ page }) => {
    await waitForGame(page);

    const results = await page.evaluate((cases) => {
      // Dynamic import keeps this a pure module-level unit check (no InputManager DOM).
      return import('/game/input.ts').then(({ screenIntentToGrid }) => {
        return cases.map((c) => {
          const { dx, dy } = screenIntentToGrid(c.sdx, c.sdy);
          const mag = Math.sqrt(dx * dx + dy * dy);
          const normDx = mag > 0 ? dx / mag : 0;
          const normDy = mag > 0 ? dy / mag : 0;
          return {
            name: c.name,
            sdx: c.sdx,
            sdy: c.sdy,
            dx,
            dy,
            dxSign: dx > 0 ? 1 : dx < 0 ? -1 : 0,
            dySign: dy > 0 ? 1 : dy < 0 ? -1 : 0,
            normDx,
            normDy,
            // Law check: reconstruct raw components
            lawDx: c.sdx + c.sdy,
            lawDy: -c.sdx + c.sdy,
          };
        });
      });
    }, INTENT_MATRIX.map(({ name, sdx, sdy }) => ({ name, sdx, sdy })));

    expect(results.length).toBe(INTENT_MATRIX.length);

    for (let i = 0; i < INTENT_MATRIX.length; i++) {
      const expected = INTENT_MATRIX[i]!;
      const got = results[i]!;

      // Exact pure law (not just signs)
      expect(got.dx, `${expected.name} law dx`).toBe(got.lawDx);
      expect(got.dy, `${expected.name} law dy`).toBe(got.lawDy);
      expect(got.dx, `${expected.name} dx == sdx+sdy`).toBe(expected.sdx + expected.sdy);
      expect(got.dy, `${expected.name} dy == -sdx+sdy`).toBe(-expected.sdx + expected.sdy);

      // Sign matrix (cardinals + diagonals)
      expect(got.dxSign, `${expected.name} dx sign`).toBe(expected.expectDxSign);
      expect(got.dySign, `${expected.name} dy sign`).toBe(expected.expectDySign);
      expect(sign(got.dx)).toBe(expected.expectDxSign);
      expect(sign(got.dy)).toBe(expected.expectDySign);

      // Normalized direction (same law getMovementVector applies after transform)
      expect(got.normDx, `${expected.name} norm dx`).toBeCloseTo(expected.normDx, 10);
      expect(got.normDy, `${expected.name} norm dy`).toBeCloseTo(expected.normDy, 10);
    }
  });

  test('getMovementVector uses screenIntentToGrid then normalizes', async ({ page }) => {
    await waitForGame(page);

    // Digital W only: screen (0,-1) → grid (-1,-1) → norm (-√½, -√½)
    const moved = await page.evaluate(async () => {
      const { InputManager, screenIntentToGrid } = await import('/game/input.ts');
      const im = new InputManager();
      // Simulate held W via keydown path
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
      const v = im.getMovementVector();
      const pure = screenIntentToGrid(0, -1);
      const mag = Math.sqrt(pure.dx * pure.dx + pure.dy * pure.dy);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
      im.endFrame();
      return {
        dx: v.dx,
        dy: v.dy,
        screenDx: v.screenDx,
        screenDy: v.screenDy,
        pureDx: pure.dx / mag,
        pureDy: pure.dy / mag,
      };
    });

    expect(moved.screenDx).toBe(0);
    expect(moved.screenDy).toBe(-1);
    expect(moved.dx).toBeCloseTo(moved.pureDx, 10);
    expect(moved.dy).toBeCloseTo(moved.pureDy, 10);
    expect(moved.dx).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(moved.dy).toBeCloseTo(-Math.SQRT1_2, 10);
  });
});
