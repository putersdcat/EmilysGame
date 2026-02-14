/**
 * mechanics.ts - Interaction, collision, and obstacle resolution logic.
 * Handles player ↔ world interactions: collect items, unlock doors,
 * talk to NPCs, trigger quizzes.
 * TODO: DOC - interaction flowchart
 */

import { ASSET_DEFS, OBSTACLE_TEMPLATES, type ObstacleTemplate } from './config/assets.config';
import { NPC_DEFS } from './config/npc.config';
import type { CellData, ChunkData } from './gen';
import { WORLD_CONFIG } from './config/game.config';
import type { Inventory } from './inventory';
import { invalidateObjectCache } from './render';

// ─── Types ───────────────────────────────────────────────────

export type InteractionResult =
  | { type: 'none' }
  | { type: 'collect'; itemId: string; message: string }
  | { type: 'obstacle'; template: ObstacleTemplate; resolved: boolean; message: string }
  | { type: 'npc'; npcId: string; greeting: string }
  | { type: 'sign'; message: string }
  | { type: 'chest'; items: string[]; message: string };

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
    };
    invalidateObjectCache(chunkKey);
    return { type: 'chest', items: loot, message: 'Opened chest! Found coins and a potion!' };
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
