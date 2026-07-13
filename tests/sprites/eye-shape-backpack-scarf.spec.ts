/**
 * eye-shape-backpack-scarf.spec.ts — Vision Alignment Audit Finding #14
 * residual (2026-07-13): #116's own broader Phase 2/3 task list included
 * an eye SHAPE selector (round/almond/wide — independent of eye COLOR,
 * which already existed) plus backpack and scarf accessories, none of
 * which were ever built. Coin-count/streak-length unlock condition types
 * (the OTHER two items from that same residual) were already delivered
 * in an earlier pass (see tests/sprites/cosmetics.spec.ts).
 *
 * Design: backAccessory/neckAccessory are NEW, INDEPENDENT optional
 * fields on CharacterVariation (not additional values merged into the
 * existing single-select head `accessory` enum) — a backpack (back) and
 * a scarf (neck) occupy different body zones from a hat/crown/bow (head),
 * so a player can reasonably wear all three at once. eyeShape is also
 * independent of eyeColor, applying a geometry multiplier on top of each
 * expression's existing base eye radius (see sprites.ts's
 * EYE_SHAPE_MULT/eyeEllipse) — 'round' is a no-op that renders IDENTICAL
 * to the pre-existing (pre-Finding-#14) eye geometry, so nothing already
 * shipped changes appearance by default.
 */
import { test, expect, Page } from '@playwright/test';

const URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__gameState !== undefined, { timeout: 15000 });
}

test.describe('Eye Shape, Backpack & Scarf (Vision Alignment Audit Finding #14 residual)', () => {

  // ─── Config-level ──────────────────────────────────────────

  test('EYE_SHAPES array has 3 entries: round, almond, wide', async ({ page }) => {
    await waitForGame(page);
    const shapes = await page.evaluate(() => (window as any).__gameDebug.getEyeShapes());
    expect(Array.isArray(shapes)).toBe(true);
    expect(shapes.length).toBe(3);
    const values = shapes.map((s: any) => s.value);
    expect(values).toContain('round');
    expect(values).toContain('almond');
    expect(values).toContain('wide');
  });

  test('BACK_ACCESSORIES array has none + backpack', async ({ page }) => {
    await waitForGame(page);
    const opts = await page.evaluate(() => (window as any).__gameDebug.getBackAccessories());
    expect(opts.length).toBe(2);
    const values = opts.map((o: any) => o.value);
    expect(values).toContain('none');
    expect(values).toContain('backpack');
  });

  test('NECK_ACCESSORIES array has none + scarf', async ({ page }) => {
    await waitForGame(page);
    const opts = await page.evaluate(() => (window as any).__gameDebug.getNeckAccessories());
    expect(opts.length).toBe(2);
    const values = opts.map((o: any) => o.value);
    expect(values).toContain('none');
    expect(values).toContain('scarf');
  });

  test('default variation includes eyeShape=round, backAccessory=none, neckAccessory=none', async ({ page }) => {
    await waitForGame(page);
    const variation = await page.evaluate(() => (window as any).__gameState.playerVariation);
    expect(variation.eyeShape ?? 'round').toBe('round');
    expect(variation.backAccessory ?? 'none').toBe('none');
    expect(variation.neckAccessory ?? 'none').toBe('none');
  });

  // ─── Customizer UI ─────────────────────────────────────────

  test('customizer overlay has eye shape, backpack, and scarf sections', async ({ page }) => {
    await waitForGame(page);
    const ids = await page.evaluate(() => ({
      eyeShapes: document.getElementById('custEyeShapes') !== null,
      backAccessories: document.getElementById('custBackAccessories') !== null,
      neckAccessories: document.getElementById('custNeckAccessories') !== null,
    }));
    expect(ids.eyeShapes).toBe(true);
    expect(ids.backAccessories).toBe(true);
    expect(ids.neckAccessories).toBe(true);
  });

  test('eye shape buttons render when customizer opened', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const btnCount = await page.evaluate(() => {
      const container = document.getElementById('custEyeShapes');
      return container ? container.querySelectorAll('.cust-style-btn').length : 0;
    });
    expect(btnCount).toBe(3);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('backpack + scarf buttons render when customizer opened', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const counts = await page.evaluate(() => {
      const back = document.getElementById('custBackAccessories');
      const neck = document.getElementById('custNeckAccessories');
      return {
        back: back ? back.querySelectorAll('.cust-style-btn').length : 0,
        neck: neck ? neck.querySelectorAll('.cust-style-btn').length : 0,
      };
    });
    expect(counts.back).toBe(2);
    expect(counts.neck).toBe(2);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('clicking almond eye shape selects it', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    const clicked = await page.evaluate(() => {
      const container = document.getElementById('custEyeShapes');
      const btns = container?.querySelectorAll('.cust-style-btn') ?? [];
      for (const b of btns) {
        if ((b as HTMLElement).dataset.val === 'almond') {
          (b as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    expect(clicked).toBe(true);

    await page.waitForTimeout(300);
    const selected = await page.evaluate(() => {
      const container = document.getElementById('custEyeShapes');
      const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
      return sel?.dataset.val;
    });
    expect(selected).toBe('almond');

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('clicking backpack selects it', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const container = document.getElementById('custBackAccessories');
      const btns = container?.querySelectorAll('.cust-style-btn') ?? [];
      for (const b of btns) {
        if ((b as HTMLElement).dataset.val === 'backpack') { (b as HTMLElement).click(); break; }
      }
    });
    await page.waitForTimeout(300);
    const selected = await page.evaluate(() => {
      const container = document.getElementById('custBackAccessories');
      const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
      return sel?.dataset.val;
    });
    expect(selected).toBe('backpack');

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  test('clicking scarf selects it', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const container = document.getElementById('custNeckAccessories');
      const btns = container?.querySelectorAll('.cust-style-btn') ?? [];
      for (const b of btns) {
        if ((b as HTMLElement).dataset.val === 'scarf') { (b as HTMLElement).click(); break; }
      }
    });
    await page.waitForTimeout(300);
    const selected = await page.evaluate(() => {
      const container = document.getElementById('custNeckAccessories');
      const sel = container?.querySelector('.cust-style-btn.selected') as HTMLElement;
      return sel?.dataset.val;
    });
    expect(selected).toBe('scarf');

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });

  // ─── SVG rendering: eye shape actually changes geometry ────

  test('eyeShape=round renders IDENTICAL geometry to the pre-existing (no eyeShape) default', async ({ page }) => {
    await waitForGame(page);
    const same = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8', eyeColor: '#0066CC', expression: 'happy' };
      const withoutShape = debug.generateIdleCharacterSVG(base);
      const withRoundShape = debug.generateIdleCharacterSVG({ ...base, eyeShape: 'round' });
      return withoutShape === withRoundShape;
    });
    expect(same, 'round must be a true no-op vs. the pre-existing default eye geometry').toBe(true);
  });

  test('eyeShape=almond and eyeShape=wide produce different eye geometry than round, for every expression', async ({ page }) => {
    await waitForGame(page);
    const results = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const expressions = ['happy', 'neutral', 'surprised', 'determined'];
      const out: Record<string, { roundVsAlmond: boolean; roundVsWide: boolean }> = {};
      for (const expression of expressions) {
        const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8', eyeColor: '#0066CC', expression };
        const round = debug.generateIdleCharacterSVG({ ...base, eyeShape: 'round' });
        const almond = debug.generateIdleCharacterSVG({ ...base, eyeShape: 'almond' });
        const wide = debug.generateIdleCharacterSVG({ ...base, eyeShape: 'wide' });
        out[expression] = { roundVsAlmond: round !== almond, roundVsWide: round !== wide };
      }
      return out;
    });
    for (const [expression, r] of Object.entries(results)) {
      expect(r.roundVsAlmond, `${expression}: almond must differ from round`).toBe(true);
      expect(r.roundVsWide, `${expression}: wide must differ from round`).toBe(true);
    }
  });

  test('eyeShape also changes side-view (profile) eye geometry', async ({ page }) => {
    await waitForGame(page);
    const differs = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8', eyeColor: '#0066CC', expression: 'happy' };
      const round = debug.generateSideIdleCharacterSVG({ ...base, eyeShape: 'round' });
      const almond = debug.generateSideIdleCharacterSVG({ ...base, eyeShape: 'almond' });
      return round !== almond;
    });
    expect(differs).toBe(true);
  });

  // ─── SVG rendering: backpack ────────────────────────────────

  test('backAccessory=none renders IDENTICAL to the pre-existing default in all 3 poses', async ({ page }) => {
    await waitForGame(page);
    const same = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8' };
      return {
        front: debug.generateIdleCharacterSVG(base) === debug.generateIdleCharacterSVG({ ...base, backAccessory: 'none' }),
        side: debug.generateSideIdleCharacterSVG(base) === debug.generateSideIdleCharacterSVG({ ...base, backAccessory: 'none' }),
        back: debug.generateBackIdleCharacterSVG(base) === debug.generateBackIdleCharacterSVG({ ...base, backAccessory: 'none' }),
      };
    });
    expect(same.front, 'front view must be unchanged when backAccessory is none').toBe(true);
    expect(same.side, 'side view must be unchanged when backAccessory is none').toBe(true);
    expect(same.back, 'back view must be unchanged when backAccessory is none').toBe(true);
  });

  test('backAccessory=backpack renders visibly in back, side, and front (strap-hint) views', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8', backAccessory: 'backpack' };
      return {
        backSvg: debug.generateBackIdleCharacterSVG(base) as string,
        sideSvg: debug.generateSideIdleCharacterSVG(base) as string,
        frontSvg: debug.generateIdleCharacterSVG(base) as string,
        backWalkSvg: debug.generateBackWalkingCharacterSVG(base, 0) as string,
      };
    });
    // Backpack's fixed brown fill color must appear in the back (main
    // depiction), side (strap hint), and back-walking views.
    expect(result.backSvg).toContain('#6B4226');
    expect(result.sideSvg).toContain('#6B4226');
    expect(result.backWalkSvg).toContain('#6B4226');
    // Front view only shows strap hints (dark stroke), not the pack body fill.
    expect(result.frontSvg).not.toContain('#6B4226');
    expect(result.frontSvg).toContain('#4A2E1A');
  });

  test('backpack does not appear when backAccessory is unset in any pose', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8' };
      return {
        backSvg: debug.generateBackIdleCharacterSVG(base) as string,
        sideSvg: debug.generateSideIdleCharacterSVG(base) as string,
      };
    });
    expect(result.backSvg).not.toContain('#6B4226');
    expect(result.sideSvg).not.toContain('#6B4226');
  });

  // ─── SVG rendering: scarf ───────────────────────────────────

  test('neckAccessory=none renders IDENTICAL to the pre-existing default in all 3 poses', async ({ page }) => {
    await waitForGame(page);
    const same = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8' };
      return {
        front: debug.generateIdleCharacterSVG(base) === debug.generateIdleCharacterSVG({ ...base, neckAccessory: 'none' }),
        side: debug.generateSideIdleCharacterSVG(base) === debug.generateSideIdleCharacterSVG({ ...base, neckAccessory: 'none' }),
        back: debug.generateBackIdleCharacterSVG(base) === debug.generateBackIdleCharacterSVG({ ...base, neckAccessory: 'none' }),
      };
    });
    expect(same.front).toBe(true);
    expect(same.side).toBe(true);
    expect(same.back).toBe(true);
  });

  test('neckAccessory=scarf renders visibly in front, side, and back views', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8', neckAccessory: 'scarf' };
      return {
        frontSvg: debug.generateIdleCharacterSVG(base) as string,
        sideSvg: debug.generateSideIdleCharacterSVG(base) as string,
        backSvg: debug.generateBackIdleCharacterSVG(base) as string,
      };
    });
    // Scarf's fixed red fill color must appear in all 3 poses.
    expect(result.frontSvg).toContain('#CC4444');
    expect(result.sideSvg).toContain('#CC4444');
    expect(result.backSvg).toContain('#CC4444');
  });

  test('scarf does not appear when neckAccessory is unset in any pose', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const base = { name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8' };
      return {
        frontSvg: debug.generateIdleCharacterSVG(base) as string,
        sideSvg: debug.generateSideIdleCharacterSVG(base) as string,
        backSvg: debug.generateBackIdleCharacterSVG(base) as string,
      };
    });
    expect(result.frontSvg).not.toContain('#CC4444');
    expect(result.sideSvg).not.toContain('#CC4444');
    expect(result.backSvg).not.toContain('#CC4444');
  });

  // ─── Independence from head Accessory ──────────────────────

  test('backpack and scarf can be worn simultaneously with a head accessory (independent slots)', async ({ page }) => {
    await waitForGame(page);
    const svg = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const variation = {
        name: 'v', hairColor: '#D4A574', hairStyle: 'pigtails', dressColor: '#C84E89', skinTone: '#F4C9B8',
        accessory: 'wizard_hat', backAccessory: 'backpack', neckAccessory: 'scarf',
      };
      return debug.generateBackIdleCharacterSVG(variation) as string;
    });
    // Wizard hat fill + backpack fill must BOTH be present -- proves the
    // three slots (head/back/neck) are independent, not mutually exclusive.
    expect(svg).toContain('#4B0082'); // wizard hat purple
    expect(svg).toContain('#6B4226'); // backpack brown
  });

  // ─── Randomize includes the new fields ─────────────────────

  test('randomize button sets eyeShape/backAccessory/neckAccessory to a valid option', async ({ page }) => {
    await waitForGame(page);
    page.evaluate(() => (window as any).__gameDebug.showCustomizer());
    await page.waitForTimeout(800);

    await page.evaluate(() => document.getElementById('customizerRandom')?.click());
    await page.waitForTimeout(300);

    const selected = await page.evaluate(() => {
      const get = (id: string) => (document.getElementById(id)?.querySelector('.cust-style-btn.selected') as HTMLElement)?.dataset.val;
      return {
        eyeShape: get('custEyeShapes'),
        backAccessory: get('custBackAccessories'),
        neckAccessory: get('custNeckAccessories'),
      };
    });
    expect(['round', 'almond', 'wide']).toContain(selected.eyeShape);
    expect(['none', 'backpack']).toContain(selected.backAccessory);
    expect(['none', 'scarf']).toContain(selected.neckAccessory);

    await page.evaluate(() => document.getElementById('customizerConfirm')?.click());
  });
});
