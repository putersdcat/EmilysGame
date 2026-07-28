/**
 * iso2-systems-showcase.spec.ts — broad main-engine Iso2 port proof.
 *
 * Renders water topologies, bridges, wall material families, fence/gate styles,
 * and authored structures through getNanoStack() + drawNanoStack(). This keeps
 * the port-back goal visible: not just cottage art, but the primary game engine
 * handling the Iso 2.0 feature families together.
 */
import { test, expect, Page } from '@playwright/test';
import { writePngDataUrl } from './canvas-capture';

const BASE_URL = 'http://localhost:5173/?test=1';
const SHOT = 'tests/screenshots/iso2-systems-showcase.png';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('main engine Iso2 systems showcase: water, bridge, walls, fences, authored structures', async ({ page }) => {
  await waitForGame(page);

  const summary = await page.evaluate(async () => {
    const [{ getNanoStack }, { drawNanoStack }] = await Promise.all([
      import('/rendering/nano-tile-defs.ts'),
      import('/rendering/nano-tile.ts'),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 1120;
    canvas.height = 760;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#49a855';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawBaseDiamond = (x: number, y: number, fill = '#6bbd61') => {
      const cx = x + 128;
      const cy = y + 64;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 64);
      ctx.lineTo(cx + 128, cy);
      ctx.lineTo(cx, cy + 64);
      ctx.lineTo(cx - 128, cy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(32,55,30,0.22)';
      ctx.stroke();
    };
    const drawStack = (tileType: string, variant: any, x: number, y: number, base = '#6bbd61') => {
      drawBaseDiamond(x, y, base);
      const stack = getNanoStack(tileType, variant);
      if (!stack) throw new Error(`Missing stack ${tileType}`);
      drawNanoStack(ctx, stack, x, y);
      return stack[0]?.kind;
    };

    const seen: Record<string, string | undefined> = {};

    // Water topology cluster: end, straight, corner, tee, cross plus bridge.
    const waterY = 70;
    seen.waterEnd = drawStack('water_clear_river', 'end-r', 40, waterY, '#5eaa5c');
    seen.waterStraight = drawStack('water_clear_river', 'straight-h', 220, waterY, '#5eaa5c');
    seen.waterCorner = drawStack('water_muddy_creek', 'corner-br', 400, waterY, '#5eaa5c');
    seen.waterTee = drawStack('water_marsh_water', 'tee-t', 580, waterY, '#5eaa5c');
    seen.waterCross = drawStack('water_deep_pond', 'cross', 760, waterY, '#5eaa5c');
    seen.bridge = drawStack('bridge', 'straight-v', 940, waterY, '#5eaa5c');

    // Wall material families and variants.
    const wallY = 270;
    seen.stoneWall = drawStack('stone_wall', 'corner-br', 70, wallY, '#9d9585');
    seen.redWall = drawStack('stone_wall_red_clinker', 'straight-h', 250, wallY, '#9d9585');
    seen.mudWall = drawStack('stone_wall_mud_brick', 'tee-t', 430, wallY, '#9d9585');
    seen.sandWall = drawStack('stone_wall_sandstone', 'end-r', 610, wallY, '#9d9585');
    seen.homeWall = drawStack('homestead_wall_plaster', 'corner-tr', 790, wallY, '#9d9585');
    seen.cathedralWall = drawStack('cathedral_wall', 'straight-v', 970, wallY, '#9d9585');

    // Fence/gate styles.
    const fenceY = 470;
    seen.fence = drawStack('wooden_fence', 'corner-br', 70, fenceY, '#70b966');
    seen.splitRail = drawStack('wooden_fence_split_rail', 'straight-h', 250, fenceY, '#70b966');
    seen.picket = drawStack('wooden_fence_picket', 'tee-t', 430, fenceY, '#70b966');
    seen.wattle = drawStack('wooden_fence_wattle', 'end-r', 610, fenceY, '#70b966');
    seen.quizGate = drawStack('quiz_gate', 'straight-h', 790, fenceY, '#70b966');
    seen.trollBridge = drawStack('troll_bridge', 'straight-h', 970, fenceY, '#5eaa5c');

    // Authored structures using same nano stack path.
    const structY = 610;
    seen.cottage = drawStack('starter_cottage', undefined, 180, structY, '#9d9585');
    seen.keep = drawStack('castle_keep', undefined, 450, structY, '#9d9585');
    seen.chapel = drawStack('cathedral_chapel', undefined, 720, structY, '#9d9585');

    return { dataUrl: canvas.toDataURL('image/png'), seen };
  });

  await writePngDataUrl(SHOT, summary.dataUrl);

  expect(summary.seen).toMatchObject({
    waterEnd: 'river',
    waterStraight: 'river',
    waterCorner: 'river',
    waterTee: 'river',
    waterCross: 'river',
    bridge: 'bridge',
    stoneWall: 'stone-wall',
    redWall: 'stone-wall',
    mudWall: 'stone-wall',
    sandWall: 'stone-wall',
    homeWall: 'homestead-wall',
    cathedralWall: 'cathedral-wall',
    fence: 'fence',
    splitRail: 'fence',
    picket: 'fence',
    wattle: 'fence',
    quizGate: 'gate',
    trollBridge: 'troll-bridge',
    cottage: 'starter-cottage',
    keep: 'castle-keep',
    chapel: 'cathedral-chapel',
  });
});
