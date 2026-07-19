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
import { invalidateChunkTerrain } from '../rendering/terrain-cache';
// Walkability SSOT lives in walkability-query.ts (cell.walkable only; no render imports).
// Re-export so existing `from '../engine/mechanics'` call sites keep working.
export {
  isWalkable,
  isPositionWalkable,
  isFootprintWalkable,
} from './walkability-query';

// ─── Types ───────────────────────────────────────────────────

export type InteractionResult =
  | { type: 'none' }
  | { type: 'collect'; itemId: string; message: string }
  /** Standing on a collectible but bag cannot accept it (item left on ground). */
  | { type: 'inventory_full'; itemId: string }
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

// ─── Collision (re-exported from walkability-query.ts) ───────
// Runtime authority = stamped cell.walkable. See walkability-query.ts.
// SPAWN_ESCAPE visual offset stays here (motor / state-init consumers).

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
    const GATE_LINES = [
      'A mystical barrier hums: "Prove you know a thing!"',
      'The gate yawns: "One clever answer, please."',
      'Sparkles form a wall. Knowledge is the key here!',
      'A glowing lock waits for a brainy password.',
    ];
    return {
      type: 'quiz_gate',
      chunkKey,
      lx,
      ly,
      message: GATE_LINES[Math.floor(Math.random() * GATE_LINES.length)],
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
      invalidateChunkTerrain(chunkKey);
      const successMsg =
        template.obstacleAsset === 'door_locked'
          ? '🔑 Click! The door swings open. Onward!'
          : template.obstacleAsset === 'barricade'
            ? '🛠️ Crowbar go *pry*! Path cleared!'
            : template.obstacleAsset === 'toll_gate'
              ? '💰 Toll paid! The keeper waves you through.'
              : `Used ${template.requiredItem} — ${template.description}!`;
      return {
        type: 'obstacle',
        template,
        resolved: true,
        message: successMsg,
      };
    } else {
      return {
        type: 'obstacle',
        template,
        resolved: false,
        message: template.coinCost
          ? `Need ${template.coinCost} coins to pass! (you have ${inventory.countItem('coin')})`
          : template.requiredItem === 'key'
            ? 'Need a key! Find one, buy one, or win one from quizzes.'
            : template.requiredItem === 'crowbar'
              ? 'Need a crowbar! Buy one from a merchant or win one from harder quizzes.'
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
  if (cell.assetKey === 'campfire' || cell.assetKey === 'bonfire' || cell.assetKey === 'biomass_fire') {
    return { type: 'campfire', message: 'You rest by the warm fire...' };
  }

  // --- House / Hut / structure flavor (#77) ---
  const STRUCTURE_FLAVOR: Record<string, string> = {
    house: '🏠 A cozy cottage. Someone left the kettle on (probably).',
    hut: '🛖 A tiny hut. Smells like adventures and damp socks.',
    starter_cottage: '🏡 Home base! Your very own not-so-secret headquarters.',
    fence: 'A sturdy fence. Manners say: walk around, not through.',
    wooden_fence: 'Wooden rails. Good for leaning, bad for walking through.',
    wall: 'Solid wall. Even heroic elbows bounce off.',
    rock: '🪨 A rock. It wins the staring contest.',
    barricade: '🪵 Barricade! Crowbar optional, bravery not.',
    tree: '🌳 A friendly tree. It does not give high-fives.',
    tree_pine: '🌲 Pine! Instant forest vibes.',
    bush: '🌿 A bush. Possibly hiding a coin. Possibly just a bush.',
  };
  if (STRUCTURE_FLAVOR[cell.assetKey]) {
    return { type: 'structure', assetKey: cell.assetKey, message: STRUCTURE_FLAVOR[cell.assetKey] };
  }

  return { type: 'none' };
}

/**
 * Auto-collect: check if player is standing on a collectible cell.
 * Call each frame while idle or moving so stop-on-coin still picks up.
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

  // Prefer a successful collect over full-bag feedback when one sample can
  // take an item and another cannot.
  let blockedItemId: string | undefined;

  for (const [sx, sy] of samples) {
    const hit = getCellAt(Math.floor(sx), Math.floor(sy), chunks);
    if (!hit || !hit.cell.itemId) continue;

    const def = ASSET_DEFS[hit.cell.itemId];
    if (!def?.walkable) continue; // Only auto-collect walkable items (coins, keys)

    const id = hit.cell.itemId;
    // Leave on ground if bag can't take it — still signal for rate-limited toast
    if (!inventory.canAddItem(id, 1)) {
      if (!blockedItemId) blockedItemId = id;
      continue;
    }

    const chunk = chunks.get(hit.chunkKey)!;
    chunk.cells[hit.ly][hit.lx].itemId = undefined;
    invalidateObjectCache(hit.chunkKey);

    const FLOWER_PICK = [
      '🌸 A wildflower for bravery!',
      '🌼 Pocket posy acquired!',
      '🌷 Nature high-five!',
    ];
    let message: string;
    if (id === 'key') message = '🔑 Key collected!';
    else if (id === 'crowbar') message = '🛠️ Crowbar collected!';
    else if (id === 'coin') message = '💰 Coin!';
    else if (id.startsWith('flower') || id === 'tulip' || id === 'sunflower') {
      message = FLOWER_PICK[Math.floor(Math.random() * FLOWER_PICK.length)];
    } else if (id === 'mushroom') message = '🍄 A mushroom! (Not for tossing at friends.)';
    else message = `+1 ${def.description || id}`;
    return { type: 'collect', itemId: id, message };
  }
  if (blockedItemId) return { type: 'inventory_full', itemId: blockedItemId };
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
  // Terrain bake may composite obstacles into the chunk canvas — force rebuild
  // so the open door is visible immediately after a correct quiz answer.
  invalidateChunkTerrain(chunkKeyStr);
}
