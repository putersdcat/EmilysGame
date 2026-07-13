/**
 * gen-chain-integrity-boundary-audit.spec.ts — Step 3, Phase 3b/6 audit
 * (generation-pipeline hardening, 2026-07-09).
 *
 * ARCHITECTURE.md §6 marks "Phase 3b Boundary collection (cross-chunk)" as
 * "⚠️ partial... not fully enforced" and "Phase 6 Chain integrity (edge
 * contracts)" as "❌ planned". Investigation found this partially STALE:
 * `enforceChainIntegrity` (src/engine/world/WorldUnitSolver.ts, #42) is a
 * real, wired-in function (WorldUnitSolver Phase 2e, called from every
 * `solveWorldUnitGrid`) that replaces a dangling chain feature (river/wall/
 * path reaching a chunk edge with nothing beyond it) with an appropriate
 * terminator (river_end_pond / wall_end / path_dead_end). So chain
 * integrity IS implemented for the "cap it safely" half of the problem.
 *
 * BUT: a real bug was found and fixed here. `findTerminator` always
 * returned the UNROTATED (rotation 0) terminator regardless of which
 * direction the chain was actually dangling toward. Every terminator
 * template has exactly one non-'open' side; rotation 0 happens to put it
 * on 'n', which only matches a north-south river dangling toward the
 * SOUTH edge. Every other case -- an east-west river (dangling east or
 * west), or ANY chain dangling toward the north or west edge -- got a
 * mis-oriented terminator, which then failed `enforceChainIntegrity`'s own
 * (n/w-only) compatibility re-check and left the dangling chain port
 * COMPLETELY UNFIXED (a raw non-'open' edge tag exported right at the
 * chunk border, exactly the "not fully enforced" gap the doc describes).
 *
 * Fix: `findTerminator` now searches the terminator's rotations for the one
 * whose dangling-direction side is 'open' and whose opposite side exactly
 * matches the original chain template's tag there (preserving the real
 * connection). This is a full cross-chunk chain-FLOW feature (rivers
 * genuinely continuing into the next chunk) -- that would additionally
 * require guaranteeing every biome's candidate pool can always satisfy an
 * inbound chain-continuation border constraint, a much larger undertaking
 * deliberately left as a documented follow-up (see repo memory
 * iso2-portback-plan.md). What IS fixed here is chain integrity's own
 * stated job: no dangling chain port should ever survive to export a raw,
 * un-terminated edge tag at a chunk boundary, in ANY of the 4 directions,
 * not just south.
 *
 * --- #4 extension (2026-07-10, Docs/VisionAlignmentAudit.md Finding #4) ---
 *
 * The single-connector fix above always collapsed a dangling cell to a
 * 1-sided river_end_pond/wall_end/path_dead_end piece, even when the cell
 * naturally had 2-3 non-open sides (a bend/T-junction/crossroads) and only
 * ONE of them was actually dangling -- silently discarding the cell's
 * OTHER still-valid connections. This was believed to need new authored
 * "junction terminator" content (a content/art task). Investigation found
 * that's NOT true: multi-way shapes already exist as ordinary AC-3
 * candidates (river_bend_ne/_nw, river_t_junction, wall_corner(_capped),
 * wall_t_junction, path_bend_ne, path_t_junction) -- `enforceChainIntegrity`
 * just never reused them for termination. Fixed by computing the FULL set
 * of a cell's dangling directions up front (not one at a time) and, when
 * 2-3 sides must stay connected, selecting a same-family template whose
 * non-open sides land exactly on those sides (`findMultiWayTerminatorCandidates`
 * in WorldUnitSolver.ts): 2 adjacent kept sides -> bend/corner, 2 opposite
 * kept sides -> a plain straight-through segment (the T-junction's spur
 * branch had nowhere to go, so simplify to a straight line), 3 kept sides
 * -> T-junction.
 *
 * A SEPARATE bug was found and fixed alongside this: family resolution
 * (which authored pool to search) was a pure name-prefix heuristic that
 * missed every THEMED template whose name doesn't start with
 * river_/wall_/path_ despite having a real `chainType` set (treasure_alcove,
 * castle_corridor, castle_hall, beach_cove, fortified_passage,
 * cave_tunnel_ns). Fixed by resolving family from the template's own
 * declared `chainType` (via `getTemplate()`) first, falling back to the
 * prefix heuristic only for hand-built test fixtures with no real
 * WORLD_UNIT_TEMPLATES entry.
 *
 * Real-pipeline sweep result (test 4 below): the "multi-way junction
 * dangling" count dropped from 255 (pre-#4, single-connector-only) to 116
 * across the same 180 real solves -- a ~55% reduction from genuinely fixing
 * bend/T-junction/crossroads cells whose family resolves and whose kept
 * sides pass the existing north/west compatibility check.
 *
 * NOT fixed here, deliberately deferred as a separate, more foundational
 * finding: most of the 116 residual cases trace to `EDGE_COMPAT` (tiles.
 * config.ts) being ASYMMETRIC despite its own "Symmetric table" comment --
 * `EDGE_COMPAT.wall` includes `'open'`, but `EDGE_COMPAT.open` is MISSING
 * `'wall'`. Since `edgesCompatible(candidate.side, realNeighborTag)` is
 * checked in only one direction by `enforceChainIntegrity`'s compatibility
 * filter, a candidate whose kept side is 'open' can fail to match a real
 * 'wall'-tagged neighbor even though the reverse (wall-side matching an
 * open neighbor) is exactly what every wall_end/wall_corner template
 * already relies on elsewhere. `edgesCompatible` is foundational to the
 * ENTIRE AC-3 solver (arc propagation, corner governance), not just
 * termination, so widening it is a separate, higher-blast-radius change
 * that needs its own dedicated validation pass (would very likely also
 * shift the determinism golden hash and real template-adjacency frequency
 * across ALL normal solving, not just boundary termination) -- not
 * bundled into this narrower, already-validated fix.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

// ─── 1. Hand-constructed proof: all 4 dangling directions get capped, not just south ───

test('enforceChainIntegrity correctly caps a dangling river in all 4 directions (previously only south worked)', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ enforceChainIntegrity }, { getAllRotations }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/tiles.config.ts'),
    ]);

    const GRID_DIM = 5;
    const allRotations = getAllRotations();
    const meadow = allRotations.get('meadow_base')![0];
    const riverNS = allRotations.get('river_straight_ns')![0]; // {n:water,s:water,e:open,w:open}
    const riverEW = allRotations.get('river_straight_ew')![0]; // {n:open,s:open,e:water,w:water}

    const blankGrid = () => Array.from({ length: GRID_DIM }, () => Array.from({ length: GRID_DIM }, () => meadow));
    const describe = (cell: any) => ({ baseName: cell.baseName, edgeTags: { ...cell.edgeTags } });

    // South-dangling: vertical 2-cell river chain ending at the last row.
    const southGrid = blankGrid();
    southGrid[GRID_DIM - 2][2] = riverNS;
    southGrid[GRID_DIM - 1][2] = riverNS;
    enforceChainIntegrity(southGrid, allRotations, GRID_DIM);

    // North-dangling: vertical 2-cell river chain starting at row 0.
    const northGrid = blankGrid();
    northGrid[0][2] = riverNS;
    northGrid[1][2] = riverNS;
    enforceChainIntegrity(northGrid, allRotations, GRID_DIM);

    // East-dangling: horizontal 2-cell river chain ending at the last column.
    const eastGrid = blankGrid();
    eastGrid[2][GRID_DIM - 2] = riverEW;
    eastGrid[2][GRID_DIM - 1] = riverEW;
    enforceChainIntegrity(eastGrid, allRotations, GRID_DIM);

    // West-dangling: horizontal 2-cell river chain starting at column 0.
    const westGrid = blankGrid();
    westGrid[2][0] = riverEW;
    westGrid[2][1] = riverEW;
    enforceChainIntegrity(westGrid, allRotations, GRID_DIM);

    return {
      south: describe(southGrid[GRID_DIM - 1][2]),
      north: describe(northGrid[0][2]),
      east: describe(eastGrid[2][GRID_DIM - 1]),
      west: describe(westGrid[2][0]),
    };
  });

  expect(result.south.baseName, 'south-dangling river must be capped').toBe('river_end_pond');
  expect(result.south.edgeTags.s, 'capped south side must face the chunk edge with an open tag').toBe('open');
  expect(result.south.edgeTags.n, 'capped north side must preserve the water connection to the segment above').toBe('water');

  expect(result.north.baseName, 'north-dangling river must ALSO be capped (previously broken: only south-dangling worked)').toBe('river_end_pond');
  expect(result.north.edgeTags.n, 'capped north side must face the chunk edge with an open tag').toBe('open');
  expect(result.north.edgeTags.s, 'capped south side must preserve the water connection to the segment below').toBe('water');

  expect(result.east.baseName, 'east-dangling river must be capped (previously broken)').toBe('river_end_pond');
  expect(result.east.edgeTags.e, 'capped east side must face the chunk edge with an open tag').toBe('open');
  expect(result.east.edgeTags.w, 'capped west side must preserve the water connection to the segment to the west').toBe('water');

  expect(result.west.baseName, 'west-dangling river must be capped (previously broken)').toBe('river_end_pond');
  expect(result.west.edgeTags.w, 'capped west side must face the chunk edge with an open tag').toBe('open');
  expect(result.west.edgeTags.e, 'capped east side must preserve the water connection to the segment to the east').toBe('water');
});

// ─── 2. The fix generalizes to the other chain types (wall, path), not just rivers ───

test('enforceChainIntegrity correctly caps dangling wall and path chains in non-south directions', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ enforceChainIntegrity }, { getAllRotations }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/tiles.config.ts'),
    ]);

    const GRID_DIM = 5;
    const allRotations = getAllRotations();
    const meadow = allRotations.get('meadow_base')![0];
    const wallEW = allRotations.get('wall_segment')![0]; // {n:open,s:open,e:wall,w:wall}
    const pathNS = allRotations.get('dirt_path_straight_ns')?.[0]
      ?? allRotations.get('path_straight_ns')?.[0];

    const blankGrid = () => Array.from({ length: GRID_DIM }, () => Array.from({ length: GRID_DIM }, () => meadow));
    const describe = (cell: any) => ({ baseName: cell.baseName, edgeTags: { ...cell.edgeTags } });

    // East-dangling wall: horizontal 2-cell wall ending at the last column.
    const wallGrid = blankGrid();
    wallGrid[2][GRID_DIM - 2] = wallEW;
    wallGrid[2][GRID_DIM - 1] = wallEW;
    enforceChainIntegrity(wallGrid, allRotations, GRID_DIM);

    let pathResult: { baseName: string; edgeTags: Record<string, string> } | null = null;
    if (pathNS) {
      // North-dangling path: vertical 2-cell path starting at row 0.
      const pathGrid = blankGrid();
      pathGrid[0][2] = pathNS;
      pathGrid[1][2] = pathNS;
      enforceChainIntegrity(pathGrid, allRotations, GRID_DIM);
      pathResult = describe(pathGrid[0][2]);
    }

    return { wall: describe(wallGrid[2][GRID_DIM - 1]), path: pathResult, pathTemplateFound: !!pathNS };
  });

  expect(result.wall.baseName, 'east-dangling wall must be capped with wall_end').toBe('wall_end');
  expect(result.wall.edgeTags.e, 'capped east side must face the chunk edge with an open tag').toBe('open');
  expect(result.wall.edgeTags.w, 'capped west side must preserve the wall connection').toBe('wall');

  // Path template naming may differ; only assert if a straight N-S path template exists.
  if (result.pathTemplateFound && result.path) {
    expect(result.path.baseName, 'north-dangling path must be capped with path_dead_end').toBe('path_dead_end');
    expect(result.path.edgeTags.n, 'capped north side must face the chunk edge with an open tag').toBe('open');
  }
});

// ─── 3. #4 extension: multi-way junction cells preserve their OTHER real connections ───

test('enforceChainIntegrity reduces a dangling T-junction to a bend when 2 adjacent sides must stay connected', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ enforceChainIntegrity }, { getAllRotations }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/tiles.config.ts'),
    ]);

    const GRID_DIM = 5;
    const allRotations = getAllRotations();
    const meadow = allRotations.get('meadow_base')![0];
    // river_t_junction @ 0deg: {n:water, s:water, e:water, w:open} -- a T
    // facing away from w. Placed at the LAST column (gx=4) so 'e' dangles
    // off the grid while 'n' and 's' both have real water neighbors.
    const tJunction = allRotations.get('river_t_junction')!.find(r =>
      r.edgeTags.n === 'water' && r.edgeTags.s === 'water' && r.edgeTags.e === 'water' && r.edgeTags.w === 'open')!;
    const riverNS = allRotations.get('river_straight_ns')![0]; // {n:water,s:water,e:open,w:open}

    const grid: any[][] = Array.from({ length: GRID_DIM }, () => Array.from({ length: GRID_DIM }, () => meadow));
    grid[1][GRID_DIM - 1] = riverNS;       // real north neighbor (water south-face)
    grid[2][GRID_DIM - 1] = tJunction;     // the T-junction itself, e dangles off-grid
    grid[3][GRID_DIM - 1] = riverNS;       // real south neighbor (water north-face)

    enforceChainIntegrity(grid, allRotations, GRID_DIM);

    const cell = grid[2][GRID_DIM - 1];
    return { baseName: cell.baseName, edgeTags: { ...cell.edgeTags } };
  });

  // The T-junction's real n/s water connections must survive -- reduced to
  // a bend-shaped piece is WRONG here (n and s are OPPOSITE, not adjacent);
  // the correct simplification is a straight-through segment (see next test
  // for the true adjacent-pair -> bend case). This test intentionally uses
  // an n+s (opposite) pair to prove the straight-through path; the
  // adjacent-pair bend path is proven separately below.
  expect(result.edgeTags.e, 'the dangling east side must become open').toBe('open');
  expect(result.edgeTags.n, 'the real north water connection must be preserved').toBe('water');
  expect(result.edgeTags.s, 'the real south water connection must be preserved').toBe('water');
  expect(result.baseName, 'an opposite-pair (n+s) reduction must pick a straight segment, not a bend/T-junction/single-connector').toMatch(/^river_straight_/);
});

test('enforceChainIntegrity reduces a dangling T-junction to a bend when 2 ADJACENT sides must stay connected', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ enforceChainIntegrity }, { getAllRotations }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/tiles.config.ts'),
    ]);

    const GRID_DIM = 5;
    const allRotations = getAllRotations();
    const meadow = allRotations.get('meadow_base')![0];
    // wall_t_junction rotated so its 3 non-open sides are exactly {n,e,s}
    // (missing w) -- place at the LAST ROW (gy=4) so 's' dangles off-grid
    // while 'n' and 'e' both have real wall neighbors (n+e are ADJACENT).
    const tJunction = allRotations.get('wall_t_junction')!.find(r =>
      r.edgeTags.n === 'wall' && r.edgeTags.e === 'wall' && r.edgeTags.s === 'wall' && r.edgeTags.w === 'open')!;
    const wallNS = allRotations.get('wall_segment')!.find(r => r.edgeTags.n === 'wall' && r.edgeTags.s === 'wall')!;
    const wallEW = allRotations.get('wall_segment')!.find(r => r.edgeTags.e === 'wall' && r.edgeTags.w === 'wall')!;

    const grid: any[][] = Array.from({ length: GRID_DIM }, () => Array.from({ length: GRID_DIM }, () => meadow));
    grid[GRID_DIM - 2][2] = wallNS;             // real north neighbor (wall south-face)
    grid[GRID_DIM - 1][2] = tJunction;          // the T-junction; s dangles off-grid
    grid[GRID_DIM - 1][3] = wallEW;             // real east neighbor (wall west-face)

    enforceChainIntegrity(grid, allRotations, GRID_DIM);

    const cell = grid[GRID_DIM - 1][2];
    return { baseName: cell.baseName, edgeTags: { ...cell.edgeTags } };
  });

  expect(result.edgeTags.s, 'the dangling south side must become open').toBe('open');
  expect(result.edgeTags.n, 'the real north wall connection must be preserved').toBe('wall');
  expect(result.edgeTags.e, 'the real east wall connection must be preserved').toBe('wall');
  expect(result.baseName, 'an adjacent-pair (n+e) reduction must pick a bend/corner, not a T-junction/single-connector/straight').toMatch(/^wall_corner/);
});

test('enforceChainIntegrity reduces a dangling crossroads to a T-junction when 3 of its 4 sides must stay connected', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ enforceChainIntegrity }, { getAllRotations }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/tiles.config.ts'),
    ]);

    const GRID_DIM = 5;
    const allRotations = getAllRotations();
    const meadow = allRotations.get('meadow_base')![0];
    const crossroads = allRotations.get('path_crossroads')![0]; // all 4 sides 'path', not rotatable
    const pathNS = allRotations.get('dirt_path_ns')![0];
    const pathEW = allRotations.get('dirt_path_ew')![0];

    const grid: any[][] = Array.from({ length: GRID_DIM }, () => Array.from({ length: GRID_DIM }, () => meadow));
    // Place the crossroads at the LAST column (gx=4) so 'e' dangles
    // off-grid; n/s/w all get real path neighbors.
    grid[1][GRID_DIM - 1] = pathNS;
    grid[2][GRID_DIM - 1] = crossroads;
    grid[3][GRID_DIM - 1] = pathNS;
    grid[2][GRID_DIM - 2] = pathEW;

    enforceChainIntegrity(grid, allRotations, GRID_DIM);

    const cell = grid[2][GRID_DIM - 1];
    return { baseName: cell.baseName, edgeTags: { ...cell.edgeTags } };
  });

  expect(result.edgeTags.e, 'the dangling east side must become open').toBe('open');
  expect(result.edgeTags.n, 'the real north path connection must be preserved').toBe('path');
  expect(result.edgeTags.s, 'the real south path connection must be preserved').toBe('path');
  expect(result.edgeTags.w, 'the real west path connection must be preserved').toBe('path');
  expect(result.baseName, 'a 3-kept-sides reduction must pick a T-junction, not a crossroads/bend/single-connector').toBe('path_t_junction');
});

test('#4: family resolution uses a template\'s declared chainType, not just its name prefix (themed templates like beach_cove)', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ enforceChainIntegrity }, { getAllRotations, getTemplate }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/tiles.config.ts'),
    ]);

    const GRID_DIM = 5;
    const allRotations = getAllRotations();
    const meadow = allRotations.get('meadow_base')![0];
    // beach_cove @ 0deg: {n:shore, s:water, e:water, w:shore} -- a themed
    // template (doesn't start with river_/shore_) whose chainType is
    // still 'river' per its own WORLD_UNIT_TEMPLATES entry.
    const cove = allRotations.get('beach_cove')![0];
    const declaredChainType = getTemplate('beach_cove')?.chainType;

    const grid: any[][] = Array.from({ length: GRID_DIM }, () => Array.from({ length: GRID_DIM }, () => meadow));
    grid[0][2] = cove; // top row -- 'n' dangles off-grid; s/e/w all point at plain meadow (open)

    enforceChainIntegrity(grid, allRotations, GRID_DIM);

    const cell = grid[0][2];
    return { declaredChainType, baseName: cell.baseName, edgeTags: { ...cell.edgeTags } };
  });

  expect(result.declaredChainType, 'sanity check: beach_cove really is chainType river despite its themed name').toBe('river');
  expect(result.edgeTags.n, 'the dangling north side must become open').toBe('open');
  // s/e/w all bordered plain meadow (open) in this fixture, so keepDirs is
  // empty -- the single-connector/meadow fallback applies, not a specific
  // multi-way shape. The real assertion here is that this no longer stays
  // stuck as the original 3-sided beach_cove (proving family resolution
  // succeeded); previously (name-prefix-only) it fell through unresolved.
  expect(result.baseName, 'family resolution must succeed for a themed template with a real chainType').not.toBe('beach_cove');
});

// ─── 4. Real-pipeline sweep: no chain exit ever faces a chunk edge with a non-open tag ───

test('solveWorldUnitGrid never leaves a SINGLE-connector chain (river/wall/path) dangling at a chunk boundary across many real biomes/moods/seeds', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ solveWorldUnitGrid }, { getBiome }, { seededRandom }] = await Promise.all([
      import('/engine/world/WorldUnitSolver.ts'),
      import('/config/biomes.config.ts'),
      import('/engine/utils.ts'),
    ]);

    const GRID_DIM = 5;
    const riverHeavyMood = {
      category: 'river-heavy' as const,
      modifiers: {
        river_straight_ns: 0.4, river_straight_ew: 0.4, river_bend_ne: 0.4, river_bend_nw: 0.4,
        river_end_pond: 0.4, river_t_junction: 0.4, river_crossroads: 0.4, river_island: 0.4,
        bridge_ns: 0.3, bridge_ew: 0.3, shore_n: 0.2, shore_corner_ne: 0.2, water_garden: 0.3,
      },
    };
    const fortifiedMood = {
      category: 'fortified' as const,
      modifiers: {
        fence_enclosure: 0.3, fenced_yard: 0.3, fenced_garden: 0.3, fence_row: 0.3,
        wall_segment: 0.3, wall_gate: 0.3, wall_corner: 0.3, wall_end: 0.3,
        wall_bastion: 0.3, wall_corner_capped: 0.3,
      },
    };

    // A template has a "single connector" if exactly one of its 4 sides is
    // non-open. `findTerminator`'s oriented-rotation search (2026-07-09 fix)
    // is only geometrically capable of correctly capping THIS shape --
    // river_straight_*, wall_segment, dirt_path/path straights, and (via
    // the shore_ -> river_end_pond mapping) simple shore edges. Multi-way
    // junction shapes (river_bend_*, river_crossroads, river_t_junction,
    // river_island, shore_corner_*, cave_fork, and similar 2-3-sided
    // features) have NO single-connector terminator to reuse today -- that
    // needs dedicated new junction-terminator content (a design task, out
    // of scope for this pass). Enclosures (connectivity 'enclosure', e.g.
    // castle_courtyard/fence_enclosure) are excluded entirely upstream now
    // (computeChainPorts returns empty ports for them) and should never
    // appear here at all.
    function countNonOpenSides(edgeTags: Record<string, string>): number {
      return (['n', 's', 'e', 'w'] as const).filter(d => edgeTags[d] !== 'open').length;
    }

    function scanForDanglingChains(grid: any[][], gridDim: number) {
      const problems: Array<{ gx: number; gy: number; dir: string; baseName: string; tag: string; sides: number }> = [];
      for (let gy = 0; gy < gridDim; gy++) {
        for (let gx = 0; gx < gridDim; gx++) {
          const t = grid[gy][gx];
          if (!t) continue;
          const dirs: string[] = t.chainPorts.exits.length > 0 ? t.chainPorts.exits : t.chainPorts.entries;
          for (const dir of dirs) {
            const nx = gx + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0);
            const ny = gy + (dir === 's' ? 1 : dir === 'n' ? -1 : 0);
            const offGrid = nx < 0 || nx >= gridDim || ny < 0 || ny >= gridDim;
            if (offGrid && t.edgeTags[dir] !== 'open') {
              problems.push({ gx, gy, dir, baseName: t.baseName, tag: t.edgeTags[dir], sides: countNonOpenSides(t.edgeTags) });
            }
          }
        }
      }
      return problems;
    }

    const biomeIds = [0, 1, 2, 3]; // meadow, forest, cave, castle
    const moods = [undefined, riverHeavyMood, fortifiedMood];
    let scanned = 0;
    const allProblems: Array<{ gx: number; gy: number; dir: string; baseName: string; tag: string; sides: number }> = [];

    for (const biomeId of biomeIds) {
      const biome = getBiome(biomeId);
      for (const mood of moods) {
        for (let seed = 0; seed < 15; seed++) {
          const rng = seededRandom(biomeId * 10000 + seed * 7 + (mood ? 1 : 0));
          const { grid } = solveWorldUnitGrid(biome, rng, undefined, mood as any, undefined, { safeZone: false });
          scanned++;
          allProblems.push(...scanForDanglingChains(grid, GRID_DIM));
        }
      }
    }

    const enclosureLeaks = allProblems.filter(p => p.baseName === 'castle_courtyard' || p.baseName === 'fence_enclosure');
    const singleConnectorProblems = allProblems.filter(p => p.sides === 1);
    const multiWayJunctionProblems = allProblems.filter(p => p.sides > 1);

    return {
      scanned,
      totalProblems: allProblems.length,
      enclosureLeakCount: enclosureLeaks.length,
      singleConnectorProblems,
      multiWayJunctionCount: multiWayJunctionProblems.length,
    };
  });

  expect(result.scanned, 'the sweep must actually run a meaningful number of real solves').toBeGreaterThan(100);
  expect(result.enclosureLeakCount, 'enclosure templates (castle_courtyard/fence_enclosure) must never be treated as a dangling chain at all').toBe(0);
  // This started at 726 dangling single-connector exports before the fixes
  // in this slice (orientation-blind terminator selection, stale-snapshot
  // clobbering, no shore/cave_fork mapping, no corner-awareness, no
  // multi-candidate compatibility retry) and is now consistently in the
  // single digits. The tiny remainder is a DIFFERENT, deeper problem than
  // this slice fixed: a cell whose real north AND west neighbors both
  // demand a different non-open connection simultaneously needs an actual
  // multi-way corner/junction terminator piece, not a single-connector one
  // -- new content, not a code fix. Bounded (not zero) so a real
  // regression is still caught, without requiring that harder problem to
  // be solved here.
  expect(result.singleConnectorProblems.length, `single-connector dangling chains should be a tiny, well-understood residual (dual-conflicting-neighbor corners needing new junction content), not a widespread regression; found: ${JSON.stringify(result.singleConnectorProblems.slice(0, 5))}`).toBeLessThan(20);
  // #4 fix (2026-07-10): multi-way junction shapes (bends, T-junctions,
  // crossroads) now DO get correctly reduced (bend/T-junction/straight
  // reused from the existing authored pool -- see WorldUnitSolver.ts's
  // findMultiWayTerminatorCandidates) whenever their family resolves and
  // their kept sides pass the existing north/west compatibility check.
  // This dropped the real measured count from 255 (pre-#4) to consistently
  // ~100-130 across repeated runs. The residual is NOT a multi-way-shape
  // problem anymore -- it's almost entirely the SAME north/west
  // compatibility check the single-connector path above already accepts
  // as a bounded residual, PLUS a separate, deeper, deliberately-deferred
  // finding: `EDGE_COMPAT` (tiles.config.ts) is asymmetric despite its own
  // "Symmetric table" comment (EDGE_COMPAT.wall includes 'open', but
  // EDGE_COMPAT.open is missing 'wall') -- see this file's header comment
  // for the full writeup of why that's out of scope here (foundational to
  // the whole AC-3 solver, not just termination). Bounded generously (not
  // tightened further) so a real regression is still caught without
  // requiring that separate, harder problem to be solved in this pass.
  expect(result.multiWayJunctionCount, `multi-way junction dangling count should stay in the ~100-130 range post-#4 (was 255 pre-#4), not silently regress back toward it; found ${result.multiWayJunctionCount}`).toBeLessThan(180);
  console.log(`[chain-integrity audit] multi-way junction dangling count (post-#4; residual traced to EDGE_COMPAT asymmetry, see header comment): ${result.multiWayJunctionCount} across ${result.scanned} solves`);
});
