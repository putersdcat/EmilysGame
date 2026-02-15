"""
apply-fire-primitives.py -- Issue #81: Animated Fire Primitive Set
"""
import sys

def patch(filepath, old, new, label=""):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        print(f"  FAIL: '{label}' not found in {filepath}")
        return False
    content = content.replace(old, new, 1)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  OK: {label}")
    return True

def insert_after(filepath, anchor, insertion, label=""):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if anchor not in content:
        print(f"  FAIL: anchor '{label}' not found in {filepath}")
        return False
    content = content.replace(anchor, anchor + insertion, 1)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  OK: {label}")
    return True

errors = 0

# ==================================================
# 1. Create fire.config.ts
# ==================================================
print("\n=== 1. Create fire.config.ts ===")
fire_config = """/**
 * config/fire.config.ts - Fire variant definitions and animation config.
 * Issue #81: Animated Fire Primitive Set
 * TODO: DOC - fire variant system, animation phases, safe-zone rules
 */

export interface FireVariant {
  /** Asset key in ASSET_DEFS */
  assetKey: string;
  /** Light radius in pixels */
  lightRadius: number;
  /** Light color RGB */
  lightColor: [number, number, number];
  /** Light intensity 0-1 */
  lightIntensity: number;
  /** Scale pulse amplitude (0 = no pulse) */
  scalePulse: number;
  /** Scale pulse speed multiplier */
  pulseSpeed: number;
  /** Vertical wobble amplitude in pixels */
  wobbleY: number;
  /** Emoji variants to cycle through for animation */
  emojis: string[];
  /** Animation frame duration in game frames */
  frameDuration: number;
}

/** All fire variants with their visual and lighting properties */
export const FIRE_VARIANTS: Record<string, FireVariant> = {
  bonfire: {
    assetKey: 'bonfire',
    lightRadius: 110,
    lightColor: [255, 180, 60],
    lightIntensity: 0.85,
    scalePulse: 0.08,
    pulseSpeed: 1.0,
    wobbleY: 1.5,
    emojis: ['\\u{1F525}'],  // fire emoji
    frameDuration: 8,
  },
  campfire: {
    assetKey: 'campfire',
    lightRadius: 70,
    lightColor: [255, 160, 40],
    lightIntensity: 0.60,
    scalePulse: 0.06,
    pulseSpeed: 1.3,
    wobbleY: 1.0,
    emojis: ['\\u{1F525}'],
    frameDuration: 10,
  },
  biomass_fire: {
    assetKey: 'biomass_fire',
    lightRadius: 90,
    lightColor: [200, 220, 80],
    lightIntensity: 0.70,
    scalePulse: 0.10,
    pulseSpeed: 0.7,
    wobbleY: 2.0,
    emojis: ['\\u{1F525}'],
    frameDuration: 12,
  },
};

/** Set of asset keys that are fire types (for quick lookup) */
export const FIRE_ASSET_KEYS = new Set(Object.values(FIRE_VARIANTS).map(v => v.assetKey));

/**
 * Get fire animation offsets for a given fire variant at a world position.
 * Uses deterministic phase from position so multiple fires desync naturally.
 * @param variant Fire variant config
 * @param gx World grid X
 * @param gy World grid Y
 * @param frameCount Global frame counter
 * @returns { scaleMultiplier, dyOffset } for render-time application
 */
export function getFireAnimation(
  variant: FireVariant,
  gx: number,
  gy: number,
  frameCount: number,
): { scaleMultiplier: number; dyOffset: number } {
  // Phase offset from world position (desyncs multiple fires)
  const phase = gx * 13.7 + gy * 29.3;
  const t = frameCount * 0.12 * variant.pulseSpeed + phase;
  // Multi-frequency scale pulse (same algorithm as light flicker)
  const pulse = variant.scalePulse * (
    0.5 * Math.sin(t) +
    0.3 * Math.sin(t * 2.7 + 1.3) +
    0.2 * Math.sin(t * 4.1 + 2.9)
  );
  // Vertical wobble
  const wobble = variant.wobbleY * Math.sin(t * 1.5 + 0.7);
  return {
    scaleMultiplier: 1.0 + pulse,
    dyOffset: wobble,
  };
}
"""
with open('src/config/fire.config.ts', 'w', encoding='utf-8') as f:
    f.write(fire_config)
print("  OK: created fire.config.ts")

# ==================================================
# 2. Add biomass_fire asset to assets.config.ts
# ==================================================
print("\n=== 2. Add biomass_fire asset ===")
ok = patch(
    'src/config/assets.config.ts',
    """  campfire: {
    emoji: '\\u{1F525}', category: 'interactive', height: 2, layer: 'mid',
    scale: 0.7, shadow: true, walkable: false, interactable: true,
    description: 'Small campfire',
  },""",
    """  campfire: {
    emoji: '\\u{1F525}', category: 'interactive', height: 2, layer: 'mid',
    scale: 0.7, shadow: true, walkable: false, interactable: true,
    description: 'Small campfire',
  },
  biomass_fire: {
    emoji: '\\u{1F525}', category: 'interactive', height: 3, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: false,
    description: 'Smoldering biomass pile (greenish glow)',
  },""",
    "biomass_fire asset"
)
if not ok: errors += 1

# ==================================================
# 3. Update placeBonfires() to also place fire variants
# ==================================================
print("\n=== 3. Update fire placement in gen.ts ===")

# First import FIRE_ASSET_KEYS
ok = patch(
    'src/gen.ts',
    "import type { TileType } from './tiles';",
    "import type { TileType } from './tiles';\nimport { FIRE_ASSET_KEYS } from './config/fire.config';",
    "import FIRE_ASSET_KEYS in gen.ts"
)
if not ok: errors += 1

# Rename and enhance placeBonfires to place fire variants with safe-zone rules
ok = patch(
    'src/gen.ts',
    """function placeBonfires(
  cells: CellData[][],
  size: number,
  _biome: BiomeDef,
  rng: () => number,
): void {
  const target = 1 + Math.floor(rng() * 3); // 1-3 per chunk
  const MIN_SPACING = 6; // Minimum grid distance between bonfires
  const placed: Array<{ x: number; y: number }> = [];

  // Collect candidate walkable cells away from edges
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 3; y < size - 3; y++) {
    for (let x = 3; x < size - 3; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      // Prefer non-terrain ground (grass/dirt) but allow any walkable
      if (cell.assetKey === 'water' || cell.assetKey === 'bridge') continue;
      // Check that surrounding cells have at least 3 walkable neighbors (open area)
      let walkableNeighbors = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (ny >= 0 && ny < size && nx >= 0 && nx < size && cells[ny][nx].walkable) {
          walkableNeighbors++;
        }
      }
      if (walkableNeighbors >= 3) candidates.push({ x, y });
    }
  }

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Place bonfires with spacing constraint
  for (const c of candidates) {
    if (placed.length >= target) break;
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < MIN_SPACING
    );
    if (tooClose) continue;

    cells[c.y][c.x] = {
      assetKey: 'bonfire',
      walkable: false,
      interactable: false,
    };
    placed.push(c);
  }
}""",
    """function placeBonfires(
  cells: CellData[][],
  size: number,
  _biome: BiomeDef,
  rng: () => number,
): void {
  const target = 1 + Math.floor(rng() * 3); // 1-3 per chunk
  const MIN_SPACING = 6; // Minimum grid distance between bonfires
  const placed: Array<{ x: number; y: number }> = [];

  // Fire variant selection weights by biome (#81)
  const FIRE_WEIGHTS: Record<string, Array<{ key: string; weight: number }>> = {
    meadow:  [{ key: 'bonfire', weight: 0.5 }, { key: 'campfire', weight: 0.4 }, { key: 'biomass_fire', weight: 0.1 }],
    forest:  [{ key: 'bonfire', weight: 0.3 }, { key: 'campfire', weight: 0.3 }, { key: 'biomass_fire', weight: 0.4 }],
    cave:    [{ key: 'bonfire', weight: 0.6 }, { key: 'campfire', weight: 0.3 }, { key: 'biomass_fire', weight: 0.1 }],
    castle:  [{ key: 'bonfire', weight: 0.7 }, { key: 'campfire', weight: 0.2 }, { key: 'biomass_fire', weight: 0.1 }],
  };

  function pickFireVariant(): string {
    const weights = FIRE_WEIGHTS[_biome.name] || FIRE_WEIGHTS.meadow;
    const r = rng();
    let cumulative = 0;
    for (const w of weights) {
      cumulative += w.weight;
      if (r < cumulative) return w.key;
    }
    return 'bonfire';
  }

  // Safe-zone check: fire must be near a structure or NPC (#81)
  function isNearStructure(cx: number, cy: number): boolean {
    const radius = 4;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const ak = cells[ny][nx].assetKey;
        if (ak === 'house' || ak === 'hut' || ak === 'shop' || ak === 'fence' ||
            cells[ny][nx].npcId) return true;
      }
    }
    return false;
  }

  // Collect candidate walkable cells away from edges
  const candidates: Array<{ x: number; y: number; nearStructure: boolean }> = [];
  for (let y = 3; y < size - 3; y++) {
    for (let x = 3; x < size - 3; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.assetKey === 'water' || cell.assetKey === 'bridge') continue;
      let walkableNeighbors = 0;
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nx = x + ddx, ny = y + ddy;
        if (ny >= 0 && ny < size && nx >= 0 && nx < size && cells[ny][nx].walkable) {
          walkableNeighbors++;
        }
      }
      if (walkableNeighbors >= 3) {
        candidates.push({ x, y, nearStructure: isNearStructure(x, y) });
      }
    }
  }

  // Sort: prefer structure-adjacent candidates first (#81 safe-zone rule)
  candidates.sort((a, b) => (b.nearStructure ? 1 : 0) - (a.nearStructure ? 1 : 0));

  // Shuffle within each group (structure-adjacent first, then non-adjacent)
  const split = candidates.findIndex(c => !c.nearStructure);
  const structureCands = split === -1 ? candidates : candidates.slice(0, split);
  const openCands = split === -1 ? [] : candidates.slice(split);
  for (const group of [structureCands, openCands]) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }
  const sortedCandidates = [...structureCands, ...openCands];

  // Place fires with spacing constraint
  for (const c of sortedCandidates) {
    if (placed.length >= target) break;
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < MIN_SPACING
    );
    if (tooClose) continue;

    const fireKey = pickFireVariant();
    cells[c.y][c.x] = {
      assetKey: fireKey,
      walkable: false,
      interactable: fireKey === 'campfire', // campfires are interactable
    };
    placed.push(c);
  }
}""",
    "enhanced placeBonfires with variants and safe-zone"
)
if not ok: errors += 1

# ==================================================
# 4. Update main.ts bonfire cache to detect all fire types
# ==================================================
print("\n=== 4. Update fire light registration in main.ts ===")

# Import fire config
ok = patch(
    'src/main.ts',
    "import { clearLights, addPointLight, addFlashlight, renderLocalLights } from './local-lights';",
    "import { clearLights, addPointLight, addFlashlight, renderLocalLights } from './local-lights';\nimport { FIRE_VARIANTS, FIRE_ASSET_KEYS, getFireAnimation } from './config/fire.config';",
    "import fire config in main.ts"
)
if not ok: errors += 1

# Update the bonfire cache to detect all fire types and register their specific light config
ok = patch(
    'src/main.ts',
    """  // Local lights: bonfire positions cached per chunk to avoid 5625+ cell scans every frame (#79)
  clearLights();
  const cs2 = WORLD_CONFIG.chunkSize;
  for (const [, chunk] of state.chunks) {
    if (!chunk.generated) continue;
    // lazily cache bonfire positions per chunk
    let bonfires = (chunk as any)._bonfireCache as { gx: number; gy: number }[] | undefined;
    if (bonfires === undefined) {
      bonfires = [];
      const baseGX = chunk.chunkX * cs2;
      const baseGY = chunk.chunkY * cs2;
      for (let cy = 0; cy < cs2; cy++) {
        for (let cx = 0; cx < cs2; cx++) {
          if (chunk.cells[cy][cx].assetKey === 'bonfire') {
            bonfires.push({ gx: baseGX + cx, gy: baseGY + cy });
          }
        }
      }
      (chunk as any)._bonfireCache = bonfires;
    }
    for (let i = 0; i < bonfires.length; i++) {
      addPointLight(bonfires[i].gx, bonfires[i].gy);
    }
  }""",
    """  // Local lights: fire positions cached per chunk to avoid 5625+ cell scans every frame (#79, #81)
  clearLights();
  const cs2 = WORLD_CONFIG.chunkSize;
  for (const [, chunk] of state.chunks) {
    if (!chunk.generated) continue;
    // lazily cache fire positions per chunk (bonfire, campfire, biomass_fire)
    let fires = (chunk as any)._fireCache as { gx: number; gy: number; key: string }[] | undefined;
    if (fires === undefined) {
      fires = [];
      const baseGX = chunk.chunkX * cs2;
      const baseGY = chunk.chunkY * cs2;
      for (let cy = 0; cy < cs2; cy++) {
        for (let cx = 0; cx < cs2; cx++) {
          const ak = chunk.cells[cy][cx].assetKey;
          if (FIRE_ASSET_KEYS.has(ak)) {
            fires.push({ gx: baseGX + cx, gy: baseGY + cy, key: ak });
          }
        }
      }
      (chunk as any)._fireCache = fires;
    }
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      const variant = FIRE_VARIANTS[f.key];
      if (variant) {
        addPointLight(f.gx, f.gy, {
          radius: variant.lightRadius,
          color: variant.lightColor,
          intensity: variant.lightIntensity,
        });
      } else {
        addPointLight(f.gx, f.gy);
      }
    }
  }""",
    "fire cache and variant-aware light registration"
)
if not ok: errors += 1

# ==================================================
# 5. Add fire animation to render pipeline
# ==================================================
print("\n=== 5. Add fire animation to render.ts ===")

# Import fire config
ok = patch(
    'src/render.ts',
    "import { cellJitter } from './utils';",
    "import { cellJitter } from './utils';\nimport { FIRE_VARIANTS, getFireAnimation } from './config/fire.config';",
    "import fire config in render.ts"
)
if not ok: errors += 1

# Add frameCount parameter to renderFrame or use a module-level counter
# Actually, render.ts already has a frameCount concept — let me add it
# Let me check if render.ts has a frame counter... it doesn't. I'll add one.
ok = patch(
    'src/render.ts',
    "const objectCellCache = new Map<string, ObjectCellRef[]>();",
    "let _renderFrameCount = 0;\nconst objectCellCache = new Map<string, ObjectCellRef[]>();",
    "add render frame counter"
)
if not ok: errors += 1

# Increment frame counter in renderFrame
ok = patch(
    'src/render.ts',
    """    const size = WORLD_CONFIG.chunkSize;
    const maxCmds = RENDER_CONFIG.maxDrawCmds; // draw call budget for graceful degradation""",
    """    _renderFrameCount++;
    const size = WORLD_CONFIG.chunkSize;
    const maxCmds = RENDER_CONFIG.maxDrawCmds; // draw call budget for graceful degradation""",
    "increment frame counter"
)
if not ok: errors += 1

# Apply fire animation in the emoji/shadow draw command creation
# When creating draw commands for fire assets, apply scale pulse and wobble
ok = patch(
    'src/render.ts',
    """          // Draw elevated (non-base) objects
          if (!isBase) {
            const depthKey = gy + def.height * 0.1;
            if (def.tileType) {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey; cmd.type = CMD_TILE; cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = jsy; cmd.scale = def.scale; cmd.tint = biome.tintHue;
              cmd.tileType = def.tileType; cmd.shadow = def.shadow;
            } else {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey;
              cmd.type = def.shadow ? CMD_SHADOW_EMOJI : CMD_EMOJI;
              cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = jsy; cmd.scale = def.scale; cmd.tint = biome.tintHue;
              cmd.shadow = def.shadow;
            }
          }""",
    """          // Draw elevated (non-base) objects
          if (!isBase) {
            const depthKey = gy + def.height * 0.1;
            // Fire animation: scale pulse + vertical wobble (#81)
            const fireVariant = FIRE_VARIANTS[cell.assetKey];
            let drawScale = def.scale;
            let drawSy = jsy;
            if (fireVariant) {
              const fa = getFireAnimation(fireVariant, gx, gy, _renderFrameCount);
              drawScale *= fa.scaleMultiplier;
              drawSy += fa.dyOffset;
            }
            if (def.tileType) {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey; cmd.type = CMD_TILE; cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = drawSy; cmd.scale = drawScale; cmd.tint = biome.tintHue;
              cmd.tileType = def.tileType; cmd.shadow = def.shadow;
            } else {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey;
              cmd.type = def.shadow ? CMD_SHADOW_EMOJI : CMD_EMOJI;
              cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = drawSy; cmd.scale = drawScale; cmd.tint = biome.tintHue;
              cmd.shadow = def.shadow;
            }
          }""",
    "fire animation in render commands"
)
if not ok: errors += 1

# ==================================================
# 6. Add campfire interaction fallback (already exists, verify)
# ==================================================
print("\n=== 6. Verify campfire fields ===")
# campfire is already interactable and handled in mechanics.ts - no changes needed
print("  SKIP: campfire interaction already exists in mechanics.ts")

# ==================================================
# 7. Add biomass_fire to biome obstacle weights
# ==================================================
print("\n=== 7. Add biomass_fire to biome obstacle weights ===")
ok = patch(
    'src/config/biomes.config.ts',
    "obstacleWeights: { tree: 0.25, tree_pine: 0.25, bush: 0.2, rock: 0.1, barricade: 0.05, quiz_gate: 0.05, hut: 0.05, campfire: 0.05 },",
    "obstacleWeights: { tree: 0.25, tree_pine: 0.25, bush: 0.2, rock: 0.1, barricade: 0.05, quiz_gate: 0.05, hut: 0.05, campfire: 0.04, biomass_fire: 0.01 },",
    "biomass_fire in forest biome"
)
if not ok: errors += 1

print(f"\n{'='*50}")
if errors == 0:
    print("ALL PATCHES APPLIED SUCCESSFULLY")
else:
    print(f"COMPLETED WITH {errors} ERROR(S)")
sys.exit(errors)
