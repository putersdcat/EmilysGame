/**
 * mechanics.ts - Interaction, collision, and obstacle resolution logic.
 * Handles player ↔ world interactions: collect items, unlock doors,
 * talk to NPCs, trigger quizzes.
 * TODO: DOC - interaction flowchart
 */

import { ASSET_DEFS, OBSTACLE_TEMPLATES, QUIZ_GATE_ASSET, type ObstacleTemplate } from './config/assets.config';
import { NPC_DEFS } from './config/npc.config';
import { facingTowardPlayer } from './npc-sprites';
import type { CellData, ChunkData } from './gen';
import { WORLD_CONFIG, PLAYER_CONFIG } from './config/game.config';
import type { Inventory } from './inventory';
import { invalidateObjectCache } from './render';

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
 */
export function isFootprintWalkable(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
): boolean {
  const hw = PLAYER_CONFIG.collisionHalfW;
  const hh = PLAYER_CONFIG.collisionHalfH;
  // Check all four corners of the collision rectangle
  return (
    isWalkable(Math.floor(px - hw), Math.floor(py - hh), chunks) &&
    isWalkable(Math.floor(px + hw), Math.floor(py - hh), chunks) &&
    isWalkable(Math.floor(px - hw), Math.floor(py + hh), chunks) &&
    isWalkable(Math.floor(px + hw), Math.floor(py + hh), chunks)
  );
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
  // Target cell is 1 tile in facing direction
  const tx = Math.round(playerX + facingDir.dx);
  const ty = Math.round(playerY + facingDir.dy);

  const hit = getCellAt(tx, ty, chunks);
  if (!hit) return { type: 'none' };

  const { cell, chunkKey, lx, ly } = hit;
  const def = ASSET_DEFS[cell.assetKey];

  // --- Stream drinking: water tiles are interactable from adjacent (#110 Phase 3) ---
  if (cell.assetKey === 'water') {
    return { type: 'stream_drink', message: 'You scoop up some water from the stream...' };
  }

  if (!def?.interactable && !cell.itemId) return { type: 'none' };

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
    return { type: 'sign', message: 'A weathered sign reads: "Adventure awaits beyond the trees..."' };
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
  const hit = getCellAt(Math.round(playerX), Math.round(playerY), chunks);
  if (!hit || !hit.cell.itemId) return null;

  const def = ASSET_DEFS[hit.cell.itemId];
  if (!def?.walkable) return null; // Only auto-collect walkable items (coins, flowers)

  const id = hit.cell.itemId;
  const chunk = chunks.get(hit.chunkKey)!;
  chunk.cells[hit.ly][hit.lx].itemId = undefined;
  invalidateObjectCache(hit.chunkKey);
  inventory.addItem(id, 1);

  return {
    type: 'collect',
    itemId: id,
    message: `+1 ${def.description || id}`,
  };
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
