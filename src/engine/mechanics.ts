/**
 * mechanics.ts - Interaction, collision, and obstacle resolution logic.
 * Handles player ↔ world interactions: collect items, unlock doors,
 * talk to NPCs, trigger quizzes.
 * TODO: DOC - interaction flowchart
 */

import { ASSET_DEFS, OBSTACLE_TEMPLATES, QUIZ_GATE_ASSET, type ObstacleTemplate } from '../config/assets.config';
import { NPC_DEFS } from '../config/npc.config';
import { facingTowardPlayer } from '../asset-pipeline/npc-sprites';
import type { CellData, ChunkData } from '../types/game.types';
import { WORLD_CONFIG, PLAYER_CONFIG } from '../config/game.config';
import type { Inventory } from '../game/inventory';
import { invalidateObjectCache } from '../rendering/render';
import { isPointWalkableInTile } from '../rendering/nano-tile-svgs';
import { getNanoStack } from '../rendering/nano-tile-defs';
import { sameFeatureNeighbor, variantFromConnections } from '../rendering/tile-variants';

// ─── Types ───────────────────────────────────────────────────

export type InteractionResult =
  | { type: 'none' }
  | { type: 'collect'; itemId: string; message: string }
  | { type: 'obstacle'; template: ObstacleTemplate; resolved: boolean; message: string }
  | { type: 'npc'; npcId: string; greeting: string }
  | { type: 'sign'; message: string }
  | { type: 'chest'; items: string[]; message: string }
  | { type: 'quiz_gate'; chunkKey: string; lx: number; ly: number; message: string }
  | { type: 'shop'; message: string; shopAsset: string }
  | { type: 'campfire'; message: string }
  | { type: 'outhouse'; message: string }
  | { type: 'stream_drink'; message: string }
  | { type: 'eat_worms'; message: string }
  | { type: 'structure'; assetKey: string; message: string };

// ─── Collision Check ─────────────────────────────────────────

/**
 * Player sprite Y-offset (px, negative = higher on screen) used while
 * `state.player.spawnEscape` is true (2026-07-09 fix for a live-reported
 * bug: with real LLM entropy enabled, a resumed save can regenerate its
 * chunk slightly differently than when it was saved, occasionally
 * dropping an obstacle exactly on the player's last position). Comfortably
 * clears a typical extruded wall's rendered height
 * (`NANO_Z_SCALE=12 * zOffset`, `MIN_NANO_HEIGHT=16` in nano-tile.ts) so
 * the player reads as standing ON TOP of the obstruction rather than
 * clipped inside it, until they step onto genuinely walkable ground.
 */
export const SPAWN_ESCAPE_RISE_PX = -40;

/**
 * Check if a grid position is walkable in the loaded chunks.
 */
export function isWalkable(
  gx: number,
  gy: number,
  chunks: Map<string, ChunkData>,
): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(gx / size);
  const cy = Math.floor(gy / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk) return true; // Unloaded chunks are walkable (will gen on entry)

  const lx = Math.floor(gx - cx * size);
  const ly = Math.floor(gy - cy * size);
  if (lx < 0 || lx >= size || ly < 0 || ly >= size) return true;

  return chunk.cells[ly][lx].walkable;
}

/**
 * Check if the player's collision footprint (axis-aligned rectangle) is fully
 * walkable at position (px, py). Samples all four corners of the footprint
 * to prevent walk-through on any approach direction (#151, #180).
 * Enhanced for Iso 2.0: uses exact point walk for nano features (walls, fences, rivers, gates)
 * to allow sliding along partial footprints and respect conditional/negative Z.
 */
export function isFootprintWalkable(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
  conditions: Map<string, 'locked' | 'unlocked'> = new Map(),
): boolean {
  const hw = PLAYER_CONFIG.collisionHalfW;
  const hh = PLAYER_CONFIG.collisionHalfH;
  // Check all four corners of the collision rectangle using enhanced position check
  return (
    isPositionWalkable(px - hw, py - hh, chunks, conditions) &&
    isPositionWalkable(px + hw, py - hh, chunks, conditions) &&
    isPositionWalkable(px - hw, py + hh, chunks, conditions) &&
    isPositionWalkable(px + hw, py + hh, chunks, conditions)
  );
}

// Maps a v1 assetKey to its Iso2 nano `kind` string, enabling the exact
// footprint-based walkability check (isPointWalkableInTile) instead of the
// blunt whole-tile cell.walkable fallback below. Scoped deliberately to
// CONTINUOUS STRUCTURAL FEATURES (wall/fence/water material variants) that
// are unconditionally WALKABLE_NEVER with no lock/gate state -- adding them
// can only improve footprint precision, never change locked/unlocked
// semantics. Deliberately excludes door_gate/toll_gate/roof/structure kinds:
// those interact with the OBSTACLE_TEMPLATES direct-cell-mutation unlock
// system (see the obstacle-resolution block below), and routing them
// through the nano path here would swap their intentional full-tile block
// for a narrow structural footprint -- a real gameplay behavior change, not
// just a completeness fix. See tests/rendering/iso2-b-asset-nano-kind-completeness.spec.ts.
const assetToNanoKind: Record<string, string> = {
  // Bare, unresolved assetKeys placed directly by real generation (see
  // ObstacleSolver.ts's weightedPick(biome.obstacleWeights, ...)) -- 'wall'
  // and 'fence' were the two remaining gaps in this table: water/bridge
  // already had their bare forms covered, but wall/fence did not, so every
  // real biome-obstacle-weighted wall/fence fell through to the blunt
  // cell.walkable full-tile block instead of the precise nano footprint
  // (Slice E finding, 2026-07). Requires matching 'wall'/'fence' cases in
  // nano-tile-defs.ts's getNanoStack() to actually resolve (added alongside).
  'wall': 'stone-wall',
  'fence': 'fence',
  'stone_wall': 'stone-wall',
  'stone_wall_red_clinker': 'stone-wall',
  'stone_wall_mud_brick': 'stone-wall',
  'stone_wall_sandstone': 'stone-wall',
  'stone_wall_cottage_foundation': 'stone-wall',
  'homestead_wall': 'homestead-wall',
  'homestead_wall_plaster': 'homestead-wall',
  'starter_homestead_wall_plaster': 'homestead-wall',
  'homestead_wall_planks': 'homestead-wall',
  'cathedral_wall': 'cathedral-wall',
  'wooden_fence': 'fence',
  'wooden_fence_split_rail': 'fence',
  'wooden_fence_picket': 'fence',
  'wooden_fence_wattle': 'fence',
  'barricade': 'fence',
  'quiz_gate': 'gate',
  'door_locked': 'gate',
  'water': 'river',
  'water_clear_river': 'river',
  'water_muddy_creek': 'river',
  'water_deep_pond': 'river',
  'water_marsh_water': 'river',
  'bridge': 'bridge',
  'troll_bridge': 'troll-bridge',
};

export function getNanoKindForAsset(assetKey: string): string | null {
  return assetToNanoKind[assetKey] || null;
}

function isPositionWalkable(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
  conditions: Map<string, 'locked' | 'unlocked'> = new Map(),
): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(px / size);
  const cy = Math.floor(py / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk) return true;

  const lx = Math.floor(px - cx * size);
  const ly = Math.floor(py - cy * size);
  if (lx < 0 || lx >= size || ly < 0 || ly >= size) return true;

  const cell = chunk.cells[ly][lx];
  const nanoKind = getNanoKindForAsset(cell.assetKey);
  if (nanoKind) {
    // Infer variant using the same family-aware, cross-chunk-boundary-safe
    // neighbor logic the render path uses (tile-variants.ts). A strict
    // same-assetKey-only check (the old local logic here) always resolved
    // gates (door_gate/quiz_gate) to 'isolated', since a gate's assetKey never
    // matches its wall/fence neighbors' assetKey -- collapsing a locked gate's
    // blocking footprint from a full wall/fence run down to a ~18-48px center
    // post and leaving the rest of the tile freely walkable around it.
    const variant = variantFromConnections(
      sameFeatureNeighbor(chunks, chunk, lx, ly - 1, cell.assetKey),
      sameFeatureNeighbor(chunks, chunk, lx + 1, ly, cell.assetKey),
      sameFeatureNeighbor(chunks, chunk, lx, ly + 1, cell.assetKey),
      sameFeatureNeighbor(chunks, chunk, lx - 1, ly, cell.assetKey),
    );
    const stack = getNanoStack(cell.assetKey as any, variant);
    if (stack && stack.length > 0) {
      const localColFrac = px - Math.floor(px);
      const localRowFrac = py - Math.floor(py);
      return isPointWalkableInTile(stack, conditions, localColFrac, localRowFrac);
    }
  }
  return cell.walkable;
}

/**
 * Get the cell at a world grid position.
 */
export function getCellAt(
  gx: number,
  gy: number,
  chunks: Map<string, ChunkData>,
): { cell: CellData; chunkKey: string; lx: number; ly: number } | null {
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(gx / size);
  const cy = Math.floor(gy / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk) return null;

  const lx = Math.floor(gx - cx * size);
  const ly = Math.floor(gy - cy * size);
  if (lx < 0 || lx >= size || ly < 0 || ly >= size) return null;

  return { cell: chunk.cells[ly][lx], chunkKey: key, lx, ly };
}

// ─── Interaction ─────────────────────────────────────────────

/**
 * Attempt interaction with the cell the player is facing.
 * Call this when Space is pressed.
 */
export function interact(
  playerX: number,
  playerY: number,
  facingDir: { dx: number; dy: number },
  chunks: Map<string, ChunkData>,
  inventory: Inventory,
): InteractionResult {
  // Target = cell under the player's feet, stepped one cardinal tile in
  // facing direction. MUST use floor(player) + facing — NOT
  // Math.round(player + facing). With the usual cell-center rest position
  // (n.5, n.5), round(n.5 + 1) becomes n+2 and misses the adjacent cell
  // entirely (live MCP repro 2026-07-15: player at 2.5,5.5 facing N toward
  // door_locked at 2,4 → round path targeted 3,5 and returned none).
  const fdx = Math.sign(facingDir.dx);
  const fdy = Math.sign(facingDir.dy);
  const tx = Math.floor(playerX) + fdx;
  const ty = Math.floor(playerY) + fdy;

  const hit = getCellAt(tx, ty, chunks);
  if (!hit) return { type: 'none' };

  const { cell, chunkKey, lx, ly } = hit;
  const def = ASSET_DEFS[cell.assetKey];

  // --- Stream drinking: water tiles are interactable from adjacent (#110 Phase 3) ---
  if (cell.assetKey === 'water') {
    return { type: 'stream_drink', message: 'You scoop up some water from the stream...' };
  }

  // Cell-level interactable flag can be set by gen/stamps even when the
  // static ASSET_DEFS entry is missing or lags behind (quiz_gate stamps, etc.)
  if (!def?.interactable && !cell.interactable && !cell.itemId && !cell.npcId) {
    return { type: 'none' };
  }

  // --- Collectible on ground ---
  if (cell.itemId) {
    const itemDef = ASSET_DEFS[cell.itemId];
    const id = cell.itemId;
    // Remove from world
    const chunk = chunks.get(chunkKey)!;
    chunk.cells[ly][lx].itemId = undefined;
    chunk.cells[ly][lx].interactable = chunk.cells[ly][lx].assetKey !== 'grass';
    invalidateObjectCache(chunkKey);
    return {
      type: 'collect',
      itemId: id,
      message: `Picked up ${itemDef?.description || id}!`,
    };
  }

  // --- NPC ---
  if (cell.npcId) {
    const npcDef = NPC_DEFS[cell.npcId];
    const greeting = npcDef
      ? npcDef.greetings[Math.floor(Math.random() * npcDef.greetings.length)]
      : 'Hello, traveler!';
    // NPC faces toward player on interaction (#85)
    const chunk = chunks.get(chunkKey)!;
    chunk.cells[ly][lx].npcFacing = facingTowardPlayer(tx, ty, playerX, playerY);
    invalidateObjectCache(chunkKey);
    return { type: 'npc', npcId: cell.npcId, greeting };
  }

  // --- Sign ---
  if (cell.assetKey === 'sign') {
    return {
      type: 'sign',
      message:
        'Welcome home! Explore the yard, then walk south to the glowing gate. ' +
        'Press Space at the gate and answer a question to open the way!',
    };
  }

  // --- Chest ---
  if (cell.assetKey === 'chest') {
    // Give random loot
    const loot = ['coin', 'coin', 'potion'];
    const chunk = chunks.get(chunkKey)!;
    chunk.cells[ly][lx] = {
      assetKey: 'grass',
      walkable: true,
      interactable: false,
      resolved: true,
    };
    invalidateObjectCache(chunkKey);
    return { type: 'chest', items: loot, message: 'Opened chest! Found coins and a potion!' };
  }

  // --- Quiz Gate (knowledge-based obstacle, Doc 05 §3.5) ---
  if (cell.assetKey === QUIZ_GATE_ASSET) {
    return {
      type: 'quiz_gate',
      chunkKey,
      lx,
      ly,
      message: 'A mystical barrier blocks your path. Answer a question to pass!',
    };
  }

  // --- Obstacle (door/barricade/toll) ---
  const template = OBSTACLE_TEMPLATES.find((t) => t.obstacleAsset === cell.assetKey);
  if (template) {
    // Check if player has the required item
    const hasItem = template.coinCost
      ? inventory.countItem(template.requiredItem) >= template.coinCost
      : inventory.hasItem(template.requiredItem);

    if (hasItem) {
      // Consume item and resolve obstacle
      if (template.coinCost) {
        inventory.removeItem(template.requiredItem, template.coinCost);
      } else {
        inventory.removeItem(template.requiredItem, 1);
      }
      // Transform cell
      const chunk = chunks.get(chunkKey)!;
      const resolvedDef = ASSET_DEFS[template.resolvedAsset];
      chunk.cells[ly][lx] = {
        assetKey: template.resolvedAsset,
        walkable: resolvedDef?.walkable ?? true,
        interactable: false,
        resolved: true,
      };
      invalidateObjectCache(chunkKey);
      return {
        type: 'obstacle',
        template,
        resolved: true,
        message: `Used ${template.requiredItem} - ${template.description}!`,
      };
    } else {
      return {
        type: 'obstacle',
        template,
        resolved: false,
        message: template.coinCost
          ? `Need ${template.coinCost} ${template.requiredItem}s to pass!`
          : `Need a ${template.requiredItem}!`,
      };
    }
  }

  // --- Shop structure (#77, #112 themed variants) ---
  if (cell.assetKey === 'shop' || cell.assetKey?.startsWith('shop_')) {
    return { type: 'shop', message: 'Welcome! Browse our wares.', shopAsset: cell.assetKey };
  }

  // --- Outhouse interaction (#110 Phase 2) ---
  if (cell.assetKey === 'outhouse') {
    return { type: 'outhouse', message: 'An outhouse! Time to freshen up — but first, a hygiene quiz!' };
  }

  // --- Campfire rest (#77) ---
  if (cell.assetKey === 'campfire') {
    return { type: 'campfire', message: 'You rest by the warm campfire...' };
  }

  // --- House / Hut / structure flavor (#77) ---
  const STRUCTURE_FLAVOR: Record<string, string> = {
    house: 'A cozy cottage. Smoke rises from the chimney.',
    hut: 'A small shelter made of branches and thatch.',
    fence: 'A sturdy fence marking a boundary.',
    wooden_fence: 'A wooden fence. You cannot pass through here.',
    wall: 'A solid wall blocks the way.',
    rock: 'A large rock. Too heavy to move.',
    barricade: 'A barricade blocks the path.',
  };
  if (STRUCTURE_FLAVOR[cell.assetKey]) {
    return { type: 'structure', assetKey: cell.assetKey, message: STRUCTURE_FLAVOR[cell.assetKey] };
  }

  return { type: 'none' };
}

/**
 * Auto-collect: check if player is standing on a collectible cell.
 * Call each frame during movement.
 */
export function autoCollect(
  playerX: number,
  playerY: number,
  chunks: Map<string, ChunkData>,
  inventory: Inventory,
): InteractionResult | null {
  // Sample the cell under the player center and the four footprint corners so
  // coins/keys near cell edges still pick up (player half-extent is 0.3).
  const hw = PLAYER_CONFIG.collisionHalfW;
  const hh = PLAYER_CONFIG.collisionHalfH;
  const samples: Array<[number, number]> = [
    [playerX, playerY],
    [playerX - hw, playerY - hh],
    [playerX + hw, playerY - hh],
    [playerX - hw, playerY + hh],
    [playerX + hw, playerY + hh],
  ];

  for (const [sx, sy] of samples) {
    const hit = getCellAt(Math.floor(sx), Math.floor(sy), chunks);
    if (!hit || !hit.cell.itemId) continue;

    const def = ASSET_DEFS[hit.cell.itemId];
    if (!def?.walkable) continue; // Only auto-collect walkable items (coins, keys)

    const id = hit.cell.itemId;
    const chunk = chunks.get(hit.chunkKey)!;
    chunk.cells[hit.ly][hit.lx].itemId = undefined;
    invalidateObjectCache(hit.chunkKey);
    inventory.addItem(id, 1);

    const shortName =
      id === 'key' ? 'Key' :
      id === 'crowbar' ? 'Crowbar' :
      id === 'coin' ? 'Coin' :
      (def.description || id);
    return {
      type: 'collect',
      itemId: id,
      message: id === 'key' ? '🔑 Key collected!' :
        id === 'crowbar' ? '🛠️ Crowbar collected!' :
        `+1 ${shortName}`,
    };
  }
  return null;
}

/**
 * Resolve a quiz gate after the player answers correctly.
 * Transforms the gate cell into an open door.
 * TODO: DOC - quiz gate resolution flow
 */
export function resolveQuizGate(
  chunkKeyStr: string,
  lx: number,
  ly: number,
  chunks: Map<string, ChunkData>,
): void {
  const chunk = chunks.get(chunkKeyStr);
  if (!chunk) return;
  const resolvedAsset = 'door_open';
  const def = ASSET_DEFS[resolvedAsset];
  chunk.cells[ly][lx] = {
    assetKey: resolvedAsset,
    walkable: def?.walkable ?? true,
    interactable: false,
    resolved: true,
  };
  invalidateObjectCache(chunkKeyStr);
}
