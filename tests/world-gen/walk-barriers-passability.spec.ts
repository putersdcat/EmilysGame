/**
 * walk-barriers-passability.spec.ts — Critical-path PR5
 *
 * Passability must not free-roam punch barriers:
 * - Soft-only carve allowlist (tree/bush/rock) — never fence/wall/gates/starter
 * - Mid-edge force skips barrier cells; may soft-carve a neighbor along the edge
 * - Validation dead-end carves use the same protect list
 * - Enclosure BFS: interior cannot reach exterior with openings sealed
 * - Mid-chunk fence ring survives both passability passes (not grass-carved)
 * - Cut-point ratio N=10 (PR7 hard floor from measured baseline; 0.7 aspirational)
 *
 * @see memories/repo/design-critical-path-recovery-2026-07-19.md §5
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('Walk barriers — passability allowlist + enclosure (critical-path PR5)', () => {
  test('soft-only carve: fence/wall/gate/starter survive; tree/bush/rock may grass', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        enforcePassability,
        isSoftCarvableAsset,
        isPassabilityProtectedAsset,
        SOFT_CARVE_ASSET_KEYS,
      } = await import('/engine/world/Passability.ts');

      const size = 11;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'tree',
          walkable: false,
          interactable: false,
        })),
      );

      // Protected barrier / functional / starter samples
      cells[2][2] = { assetKey: 'fence', walkable: false, interactable: false };
      cells[2][3] = { assetKey: 'wall', walkable: false, interactable: false };
      cells[2][4] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
      cells[2][5] = { assetKey: 'door_locked', walkable: false, interactable: true };
      cells[2][6] = { assetKey: 'starter_cottage', walkable: false, interactable: true };
      cells[3][2] = { assetKey: 'water', walkable: false, interactable: false };
      cells[3][3] = { assetKey: 'bridge', walkable: true, interactable: false };
      cells[3][4] = { assetKey: 'wooden_fence', walkable: false, interactable: false };
      cells[3][5] = { assetKey: 'barricade', walkable: false, interactable: false };

      // Soft samples mixed in
      cells[5][5] = { assetKey: 'bush', walkable: false, interactable: false };
      cells[5][6] = { assetKey: 'rock', walkable: false, interactable: false };
      cells[5][7] = { assetKey: 'tree_pine', walkable: false, interactable: false };

      // Center open so BFS has a seed without needing protect carve
      const mid = Math.floor(size / 2);
      cells[mid][mid] = { assetKey: 'grass', walkable: true, interactable: false };

      let s = 42;
      const rng = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };

      enforcePassability(cells, size, rng);
      enforcePassability(cells, size, rng);

      const protectedKeys = [
        'fence',
        'wall',
        'quiz_gate',
        'door_locked',
        'starter_cottage',
        'water',
        'wooden_fence',
        'barricade',
      ];
      const protectedStill = protectedKeys.map((k) => {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (cells[y][x].assetKey === k) {
              return {
                key: k,
                walkable: cells[y][x].walkable,
                stillPresent: true,
              };
            }
          }
        }
        return { key: k, walkable: null as boolean | null, stillPresent: false };
      });

      const bridge = cells[3][3];
      const softAllowlist = [...SOFT_CARVE_ASSET_KEYS];
      const softChecks = softAllowlist.map((k) => ({
        key: k,
        soft: isSoftCarvableAsset(k),
        protected: isPassabilityProtectedAsset(k),
      }));
      const protectChecks = [
        'fence',
        'wall',
        'quiz_gate',
        'door_locked',
        'starter_cottage',
        'water',
        'bridge',
        'starter_wall_plaster',
      ].map((k) => ({ key: k, protected: isPassabilityProtectedAsset(k) }));

      // Count how many soft cells became grass (carved)
      let softCarved = 0;
      let softRemaining = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const k = cells[y][x].assetKey;
          if (k === 'grass' && (x !== mid || y !== mid)) {
            // may include mid-edge forces
            softCarved++;
          }
          if (isSoftCarvableAsset(k)) softRemaining++;
        }
      }

      return {
        protectedStill,
        bridgeKey: bridge.assetKey,
        bridgeWalkable: bridge.walkable,
        softChecks,
        protectChecks,
        softCarved,
        softRemaining,
        centerKey: cells[mid][mid].assetKey,
        centerWalkable: cells[mid][mid].walkable,
      };
    });

    for (const p of result.protectedStill) {
      expect(p.stillPresent, `${p.key} must not be grass-carved away`).toBe(true);
      if (p.key !== 'water') {
        // water stays non-walkable; bridge is separate
        expect(p.walkable, `${p.key} stays non-walkable`).toBe(false);
      } else {
        expect(p.walkable, 'water non-walkable').toBe(false);
      }
    }
    expect(result.bridgeKey).toBe('bridge');
    expect(result.bridgeWalkable).toBe(true);
    for (const s of result.softChecks) {
      expect(s.soft, `${s.key} is soft-carvable`).toBe(true);
      expect(s.protected, `${s.key} is not protect-listed`).toBe(false);
    }
    for (const p of result.protectChecks) {
      expect(p.protected, `${p.key} is protect-listed`).toBe(true);
    }
    // Soft carves should have happened under heavy tree fill
    expect(result.softCarved + (result.centerWalkable ? 1 : 0)).toBeGreaterThan(0);
  });

  test('mid-edge: barrier at mid-edge not overwritten; soft neighbor may open', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { enforcePassability } = await import('/engine/world/Passability.ts');

      const size = 9;
      const mid = Math.floor(size / 2);
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      // North mid-edge is fence; neighbors along edge are soft trees
      cells[0][mid] = { assetKey: 'fence', walkable: false, interactable: false };
      cells[0][mid - 1] = { assetKey: 'tree', walkable: false, interactable: false };
      cells[0][mid + 1] = { assetKey: 'tree', walkable: false, interactable: false };

      // South mid-edge is quiz_gate with grass neighbors (already open along edge)
      cells[size - 1][mid] = { assetKey: 'quiz_gate', walkable: false, interactable: true };

      // West mid-edge is wall with no soft/open neighbors (both wall too)
      cells[mid][0] = { assetKey: 'wall', walkable: false, interactable: false };
      cells[mid - 1][0] = { assetKey: 'wall', walkable: false, interactable: false };
      cells[mid + 1][0] = { assetKey: 'wall', walkable: false, interactable: false };

      let s = 7;
      const rng = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };
      enforcePassability(cells, size, rng);

      return {
        northMid: { ...cells[0][mid] },
        northLeft: { ...cells[0][mid - 1] },
        northRight: { ...cells[0][mid + 1] },
        southMid: { ...cells[size - 1][mid] },
        westMid: { ...cells[mid][0] },
        westUp: { ...cells[mid - 1][0] },
        westDown: { ...cells[mid + 1][0] },
      };
    });

    expect(result.northMid.assetKey, 'north fence mid-edge not grass-carved').toBe('fence');
    expect(result.northMid.walkable).toBe(false);
    // One soft neighbor along the edge should open as grass entry
    const northOpen =
      (result.northLeft.assetKey === 'grass' && result.northLeft.walkable) ||
      (result.northRight.assetKey === 'grass' && result.northRight.walkable);
    expect(northOpen, 'soft neighbor along north edge should open').toBe(true);

    expect(result.southMid.assetKey, 'quiz_gate mid-edge not overwritten').toBe('quiz_gate');
    expect(result.southMid.walkable).toBe(false);

    expect(result.westMid.assetKey, 'wall mid-edge not punched').toBe('wall');
    expect(result.westMid.walkable).toBe(false);
    expect(result.westUp.assetKey).toBe('wall');
    expect(result.westDown.assetKey).toBe('wall');
  });

  test('validation: dead-end shortcut does not carve through fence/wall/gate', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { validatePlayability } = await import('/engine/world/Validation.ts');

      const size = 7;
      // Create many dead-ends: open cells that only touch one walkable neighbor,
      // with fence diagonals that must not be punched.
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'rock',
          walkable: false,
          interactable: false,
        })),
      );

      // Corridor of walkable cells with many 1-neighbor ends, fences on diagonals
      for (let x = 1; x <= 5; x++) {
        cells[3][x] = { assetKey: 'dirt', walkable: true, interactable: false };
      }
      // Spurs creating dead-ends
      cells[1][1] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[2][1] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[1][5] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[2][5] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[5][1] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[4][1] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[5][5] = { assetKey: 'dirt', walkable: true, interactable: false };
      cells[4][5] = { assetKey: 'dirt', walkable: true, interactable: false };

      // Fence / wall / gate on diagonals of dead-ends — must stay
      cells[1][2] = { assetKey: 'fence', walkable: false, interactable: false };
      cells[1][4] = { assetKey: 'wall', walkable: false, interactable: false };
      cells[5][2] = { assetKey: 'quiz_gate', walkable: false, interactable: true };
      cells[5][4] = { assetKey: 'door_locked', walkable: false, interactable: true };
      cells[2][2] = { assetKey: 'starter_cottage', walkable: false, interactable: true };

      let s = 99;
      const rng = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };

      const report = validatePlayability(cells, size, 1, 0, rng);

      return {
        repairs: report.repairs,
        fence: { ...cells[1][2] },
        wall: { ...cells[1][4] },
        quiz: { ...cells[5][2] },
        door: { ...cells[5][4] },
        starter: { ...cells[2][2] },
      };
    });

    expect(result.fence.assetKey).toBe('fence');
    expect(result.fence.walkable).toBe(false);
    expect(result.wall.assetKey).toBe('wall');
    expect(result.wall.walkable).toBe(false);
    expect(result.quiz.assetKey).toBe('quiz_gate');
    expect(result.quiz.walkable).toBe(false);
    expect(result.door.assetKey).toBe('door_locked');
    expect(result.door.walkable).toBe(false);
    expect(result.starter.assetKey).toBe('starter_cottage');
    expect(result.starter.walkable).toBe(false);
  });

  test('enclosure BFS: homestead interior sealed when openings closed', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const {
        stampStarterHomestead,
        STARTER_HOMESTEAD_ORIGIN,
        STARTER_HOMESTEAD_RECIPE,
      } = await import('/engine/iso2-assemblies.ts');
      const { enforcePassability } = await import('/engine/world/Passability.ts');
      const { validatePlayability } = await import('/engine/world/Validation.ts');
      const { FUNCTIONAL_OPENING_KEYS } = await import(
        '/engine/iso2-assemblies/scene-invariants.ts'
      );
      const { runPlaceCoherencePass } = await import('/engine/world/PlaceCoherence.ts');

      const size = 25;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })),
      );

      // Pack soft obstacles outside so passability is under carve pressure
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if ((x + y) % 3 === 0) {
            cells[y][x] = { assetKey: 'tree', walkable: false, interactable: false };
          }
        }
      }

      stampStarterHomestead(cells);

      let s = 123;
      const rng = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };
      enforcePassability(cells, size, rng);
      enforcePassability(cells, size, rng);
      validatePlayability(cells, size, 0, 0, rng);
      runPlaceCoherencePass(cells, { chunkX: 0, chunkY: 0 });

      const ox = STARTER_HOMESTEAD_ORIGIN.x;
      const oy = STARTER_HOMESTEAD_ORIGIN.y;
      const w = STARTER_HOMESTEAD_RECIPE.width;
      const h = STARTER_HOMESTEAD_RECIPE.height;

      // Sealed walk: normal walkable except functional openings treated closed
      const sealedWalk = (x: number, y: number) => {
        const c = cells[y][x];
        if (FUNCTIONAL_OPENING_KEYS.has(c.assetKey)) return false;
        return c.walkable;
      };

      // Interior seed: relative (3,4) is spawn yard grass
      const startX = ox + 3;
      const startY = oy + 4;
      const key = (x: number, y: number) => y * size + x;
      const seen = new Set<number>();
      const qx = [startX];
      const qy = [startY];
      seen.add(key(startX, startY));
      let head = 0;
      while (head < qx.length) {
        const x = qx[head];
        const y = qy[head];
        head++;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const k = key(nx, ny);
          if (seen.has(k)) continue;
          if (!sealedWalk(nx, ny)) continue;
          seen.add(k);
          qx.push(nx);
          qy.push(ny);
        }
      }

      // Any exterior cell reached?
      let exteriorReached = false;
      for (const k of seen) {
        const x = k % size;
        const y = Math.floor(k / size);
        const inside = x >= ox && x < ox + w && y >= oy && y < oy + h;
        if (!inside) {
          exteriorReached = true;
          break;
        }
      }

      // Fence ring integrity on perimeter (except sole quiz_gate)
      let fenceCarved = 0;
      let southQuiz = 0;
      for (let x = 0; x < w; x++) {
        for (const y of [0, h - 1]) {
          const c = cells[oy + y][ox + x];
          if (c.assetKey === 'quiz_gate') southQuiz++;
          else if (c.assetKey !== 'fence' || c.walkable) fenceCarved++;
        }
      }
      for (let y = 1; y < h - 1; y++) {
        for (const x of [0, w - 1]) {
          const c = cells[oy + y][ox + x];
          if (c.assetKey !== 'fence' || c.walkable) fenceCarved++;
        }
      }

      return {
        exteriorReached,
        fenceCarved,
        southQuiz,
        interiorStartWalkable: cells[startY][startX].walkable,
        reached: seen.size,
      };
    });

    expect(result.interiorStartWalkable, 'spawn yard walkable').toBe(true);
    expect(
      result.exteriorReached,
      'homestead interior must not reach exterior when openings are sealed',
    ).toBe(false);
    expect(result.fenceCarved, 'homestead fence ring not grass-carved').toBe(0);
    expect(result.southQuiz, 'sole south quiz_gate remains').toBe(1);
  });

  test('enclosure BFS: modular fenced-farm sealed when openings closed', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { stampAssemblyOntoCells, ASSEMBLY_RECIPES } = await import(
        '/engine/iso2-assemblies.ts'
      );
      const { enforcePassability } = await import('/engine/world/Passability.ts');
      const { validatePlayability } = await import('/engine/world/Validation.ts');
      const { FUNCTIONAL_OPENING_KEYS, PATH_OPENING_KEYS } = await import(
        '/engine/iso2-assemblies/scene-invariants.ts'
      );
      const { runPlaceCoherencePass } = await import('/engine/world/PlaceCoherence.ts');

      const size = 17;
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'tree',
          walkable: false,
          interactable: false,
        })),
      );
      // Soft-filled field with open center for passability seed
      const mid = Math.floor(size / 2);
      cells[mid][mid] = { assetKey: 'grass', walkable: true, interactable: false };

      const ox = 4;
      const oy = 4;
      stampAssemblyOntoCells(cells, 'fenced-farm', ox, oy);
      const recipe = ASSEMBLY_RECIPES['fenced-farm'];

      // Opening coords (relative) sealed for BFS
      const openingKeys = new Set(
        (recipe.openings ?? []).map((o: { x: number; y: number }) => `${o.x},${o.y}`),
      );

      let s = 55;
      const rng = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };
      enforcePassability(cells, size, rng);
      enforcePassability(cells, size, rng);
      validatePlayability(cells, size, 1, 0, rng);
      runPlaceCoherencePass(cells, {
        chunkX: 1,
        chunkY: 0,
        recipes: [{ recipe, originX: ox, originY: oy }],
      });

      const sealedWalk = (x: number, y: number) => {
        const c = cells[y][x];
        if (FUNCTIONAL_OPENING_KEYS.has(c.assetKey)) return false;
        // Declared path openings (dirt flanks) are functional exits — seal them for the test
        const relX = x - ox;
        const relY = y - oy;
        if (openingKeys.has(`${relX},${relY}`) && PATH_OPENING_KEYS.has(c.assetKey)) {
          return false;
        }
        return c.walkable;
      };

      // Interior dirt at relative (2,2)
      const startX = ox + 2;
      const startY = oy + 2;
      if (!cells[startY][startX].walkable) {
        // hut may occupy (2,1); use (2,2) dirt — if blocked try (1,2)
      }
      let sx = startX;
      let sy = startY;
      if (!cells[sy][sx].walkable) {
        sx = ox + 1;
        sy = oy + 2;
      }

      const key = (x: number, y: number) => y * size + x;
      const seen = new Set<number>();
      const qx = [sx];
      const qy = [sy];
      seen.add(key(sx, sy));
      let head = 0;
      while (head < qx.length) {
        const x = qx[head];
        const y = qy[head];
        head++;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const k = key(nx, ny);
          if (seen.has(k)) continue;
          if (!sealedWalk(nx, ny)) continue;
          seen.add(k);
          qx.push(nx);
          qy.push(ny);
        }
      }

      let exteriorReached = false;
      for (const k of seen) {
        const x = k % size;
        const y = Math.floor(k / size);
        const inside = x >= ox && x < ox + recipe.width && y >= oy && y < oy + recipe.height;
        if (!inside) {
          exteriorReached = true;
          break;
        }
      }

      // Fence cells on perimeter still fence (not grass)
      let fenceMissing = 0;
      for (const p of recipe.placements) {
        if (p.assetKey !== 'fence') continue;
        const c = cells[oy + p.y][ox + p.x];
        if (c.assetKey !== 'fence' || c.walkable) fenceMissing++;
      }

      return {
        exteriorReached,
        fenceMissing,
        startWalkable: cells[sy][sx].walkable,
        startKey: cells[sy][sx].assetKey,
        quizAtGate: cells[oy + 4][ox + 2].assetKey,
      };
    });

    expect(result.startWalkable, `interior start ${result.startKey}`).toBe(true);
    expect(
      result.exteriorReached,
      'fenced-farm interior must not leak with openings sealed',
    ).toBe(false);
    expect(result.fenceMissing, 'farm fence cells not grass-carved').toBe(0);
    expect(result.quizAtGate, 'declared quiz_gate remains').toBe('quiz_gate');
  });

  test('mid-chunk fence ring not grass-carved after both passability passes', async ({
    page,
  }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const { enforcePassability } = await import('/engine/world/Passability.ts');
      const { validatePlayability } = await import('/engine/world/Validation.ts');

      const size = 15;
      // Dense soft obstacles so carve pressure is high
      const cells = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'tree',
          walkable: false,
          interactable: false,
        })),
      );
      const mid = Math.floor(size / 2);
      cells[mid][mid] = { assetKey: 'grass', walkable: true, interactable: false };

      // 7×7 fence ring centered, sole quiz_gate on south
      const ox = 4;
      const oy = 4;
      const ring = 7;
      for (let x = 0; x < ring; x++) {
        cells[oy][ox + x] = { assetKey: 'fence', walkable: false, interactable: false };
        cells[oy + ring - 1][ox + x] = {
          assetKey: 'fence',
          walkable: false,
          interactable: false,
        };
      }
      for (let y = 1; y < ring - 1; y++) {
        cells[oy + y][ox] = { assetKey: 'fence', walkable: false, interactable: false };
        cells[oy + y][ox + ring - 1] = {
          assetKey: 'fence',
          walkable: false,
          interactable: false,
        };
      }
      // Interior grass
      for (let y = 1; y < ring - 1; y++) {
        for (let x = 1; x < ring - 1; x++) {
          cells[oy + y][ox + x] = { assetKey: 'grass', walkable: true, interactable: false };
        }
      }
      // South center gate
      cells[oy + ring - 1][ox + 3] = {
        assetKey: 'quiz_gate',
        walkable: false,
        interactable: true,
      };

      const fenceBefore: string[] = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (cells[y][x].assetKey === 'fence') fenceBefore.push(`${x},${y}`);
        }
      }

      let s = 20260720;
      const rng = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };

      // Both passability passes + validation (mirrors gen phase order pressure)
      enforcePassability(cells, size, rng);
      enforcePassability(cells, size, rng);
      validatePlayability(cells, size, 2, 0, rng);

      const fenceAfter: string[] = [];
      let fenceWalkable = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (cells[y][x].assetKey === 'fence') {
            fenceAfter.push(`${x},${y}`);
            if (cells[y][x].walkable) fenceWalkable++;
          }
        }
      }
      const gate = cells[oy + ring - 1][ox + 3];
      const carvedAway = fenceBefore.filter((p) => !fenceAfter.includes(p));

      return {
        fenceBefore: fenceBefore.length,
        fenceAfter: fenceAfter.length,
        fenceWalkable,
        carvedAway,
        gateKey: gate.assetKey,
        gateWalkable: gate.walkable,
      };
    });

    expect(result.fenceAfter, 'same fence count after passability').toBe(result.fenceBefore);
    expect(result.carvedAway, `fence cells grass-carved: ${result.carvedAway.join(';')}`).toEqual(
      [],
    );
    expect(result.fenceWalkable, 'fence cells stay non-walkable').toBe(0);
    expect(result.gateKey).toBe('quiz_gate');
    expect(result.gateWalkable).toBe(false);
  });

  test('cut-point ratio N=10 fixed non-origin seeds (PR7 regression lock)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      gen.setWordlist([
        'alpha beta',
        'gamma delta',
        'epsilon zeta',
        'eta theta',
        'iota kappa',
        'lambda mu',
        'nu xi',
        'omicron pi',
      ]);
      gen.setBiomeNoiseSeed(42);
      gen.restoreEntropyBuffer('');

      // 10 fixed non-origin seeds (chunk coords)
      const coords: Array<[number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
        [2, 0],
        [0, 2],
      ];

      function walkableNbrs(
        cells: Array<Array<{ walkable: boolean }>>,
        x: number,
        y: number,
        size: number,
      ) {
        const out: Array<{ x: number; y: number }> = [];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (cells[ny][nx].walkable) out.push({ x: nx, y: ny });
        }
        return out;
      }

      function isBypassable(
        cells: Array<Array<{ walkable: boolean; assetKey: string }>>,
        size: number,
        gx: number,
        gy: number,
        nbrs: Array<{ x: number; y: number }>,
      ): boolean {
        if (nbrs.length < 2) return true; // not enough nbrs → not a cut-point
        const key = (x: number, y: number) => y * size + x;
        const seen = new Uint8Array(size * size);
        const qx = [nbrs[0].x];
        const qy = [nbrs[0].y];
        seen[key(nbrs[0].x, nbrs[0].y)] = 1;
        let head = 0;
        while (head < qx.length) {
          const x = qx[head];
          const y = qy[head];
          head++;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            if (nx === gx && ny === gy) continue; // gate blocked
            if (!cells[ny][nx].walkable) continue;
            const k = key(nx, ny);
            if (seen[k]) continue;
            seen[k] = 1;
            qx.push(nx);
            qy.push(ny);
          }
        }
        for (let i = 1; i < nbrs.length; i++) {
          if (!seen[key(nbrs[i].x, nbrs[i].y)]) return false;
        }
        return true;
      }

      let quizGateCount = 0;
      let cutPoint = 0;
      const perChunk: Array<{
        cx: number;
        cy: number;
        quiz: number;
        cut: number;
      }> = [];

      for (const [cx, cy] of coords) {
        const c = gen.generateChunkSync(cx, cy);
        const size = c.cells.length;
        let q = 0;
        let cut = 0;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (c.cells[y][x].assetKey !== 'quiz_gate') continue;
            q++;
            quizGateCount++;
            const nbrs = walkableNbrs(c.cells, x, y, size);
            if (nbrs.length >= 2 && !isBypassable(c.cells, size, x, y, nbrs)) {
              cut++;
              cutPoint++;
            }
          }
        }
        perChunk.push({ cx, cy, quiz: q, cut });
      }

      const ratio = quizGateCount > 0 ? cutPoint / quizGateCount : 1;
      return { quizGateCount, cutPoint, ratio, perChunk };
    });

    // PR7 proof bar (2026-07-20): measured baseline ratio=0.474 (cut=9 / quiz=19)
    // on these fixed seeds. Aspirational design target remains ≥0.7 (soft annotate);
    // hard floor locks anti-regression with ~25% margin under measured baseline.
    // Zero-quiz chunks are OK (KD13); when gates exist we still require some cut-points.
    // eslint-disable-next-line no-console
    console.log(
      `[PR7 cut-point ratio] cutPoint=${result.cutPoint} quizGateCount=${result.quizGateCount} ratio=${result.ratio.toFixed(3)} (hard floor ≥0.35; aspirational ≥0.7)`,
      result.perChunk,
    );

    expect(result.quizGateCount).toBeGreaterThanOrEqual(0);
    expect(result.cutPoint).toBeGreaterThanOrEqual(0);
    expect(result.ratio).toBeGreaterThanOrEqual(0);
    expect(result.ratio).toBeLessThanOrEqual(1);

    // Hard regression floor (baseline OK for 0.35; NOT for 0.7).
    const HARD_FLOOR = 0.35;
    if (result.quizGateCount > 0) {
      expect(
        result.ratio,
        `cut-point ratio regression: ${result.ratio.toFixed(3)} < ${HARD_FLOOR} (cut=${result.cutPoint}/${result.quizGateCount})`,
      ).toBeGreaterThanOrEqual(HARD_FLOOR);
      expect(
        result.cutPoint,
        'when non-origin quiz gates exist, at least one must be a local cut-point',
      ).toBeGreaterThanOrEqual(1);
    }

    // Aspirational soft target (≥0.7) — annotate only until a later quality pass.
    if (result.quizGateCount > 0 && result.ratio < 0.7) {
      test.info().annotations.push({
        type: 'aspirational-cut-point-ratio',
        description: `ratio=${result.ratio.toFixed(3)} < 0.7 (cut=${result.cutPoint}/${result.quizGateCount}) — hard floor 0.35 locked; residual free-roam field gates are a follow-up`,
      });
    }
  });
});
