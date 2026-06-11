/**
 * wildlife.ts - Time-of-day deterministic wildlife system (#68).
 * Spawns ambient creatures per chunk based on biome, time-of-day, and water adjacency.
 * Creatures have simple behaviors (idle, wander, flee) and can trigger educational prompts.
 * TODO: DOC - wildlife system overview, spawn algorithm, interaction hooks
 */

import { WORLD_CONFIG } from '../config/game.config';
import {
  SPECIES, type SpeciesDef, type TimeSlot, type BehaviorWeights,
  MAX_WILDLIFE_PER_CHUNK, INTERACT_RANGE, BIOME_DENSITY,
  getSpecies,
} from '../config/wildlife.config';
import type { ChunkData } from '../engine/gen';
import { getCycleProgress } from '../rendering/lighting';
import type { Camera } from '../rendering/render';

// ─── Types ──────────────────────────────────────────────────

export interface WildlifeEntity {
  speciesId: string;
  /** World-space grid position (fractional for smooth movement) */
  worldX: number;
  worldY: number;
  /** Home position (spawn point, wanders near this) */
  homeX: number;
  homeY: number;
  /** Behavior state (#142: added sit, groom, sprint) */
  behavior: 'idle' | 'wander' | 'flee' | 'sit' | 'groom' | 'sprint';
  /** Animation phase accumulator */
  animPhase: number;
  /** Wander angle (radians) */
  wanderAngle: number;
  /** Flee cooldown (frames remaining) */
  fleeCooldown: number;
  /** Behavior duration timer (frames remaining for sit/groom/sprint) */
  behaviorTimer: number;
  /** True if hidden (fled offscreen or despawned by time change) */
  hidden: boolean;
  /** Chunk key this entity belongs to */
  chunkKey: string;
  /** Unique ID within chunk for interaction tracking */
  localId: number;
  /** Facing direction: 1 = right (default), -1 = left/flipped (#80) */
  facingDir: 1 | -1;
}

/** Per-chunk wildlife cache */
interface ChunkWildlifeCache {
  entities: WildlifeEntity[];
  timeSlot: TimeSlot;
  biomeName: string;
}

// ─── State ──────────────────────────────────────────────────

const wildlifeCache = new Map<string, ChunkWildlifeCache>();
let _lastTimeSlot: TimeSlot = 'day';

// Discovered species tracking (for Book of Knowledge hooks)
const discoveredSpecies = new Set<string>();

// ─── Seeded RNG (simple, deterministic) ─────────────────────

function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };
}

function fastHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ─── Time Slot Resolution ───────────────────────────────────

/** Map cycle progress (0..1) to a coarser time slot for wildlife spawning */
export function getTimeSlot(): TimeSlot {
  const t = getCycleProgress();
  // dawn(0-0.08) morning(0.08-0.15) day(0.15-0.55) afternoon(0.55-0.65) 
  // dusk(0.65-0.73) evening(0.73-0.80) night(0.80-0.92) lateNight(0.92-1.0)
  if (t < 0.65) return 'day';
  if (t < 0.80) return 'dusk';
  return 'night';
}

// ─── Water Adjacency Scanner ────────────────────────────────

/** Find cells adjacent to water in a chunk. Returns list of {x, y} walkable cells near water. */
function findWaterAdjacentCells(chunk: ChunkData): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  const size = WORLD_CONFIG.chunkSize;
  const cells = chunk.cells;

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (!cells[y][x].walkable) continue;
      // Check 4 neighbors for water
      if (
        cells[y - 1][x].assetKey === 'water' ||
        cells[y + 1][x].assetKey === 'water' ||
        cells[y][x - 1].assetKey === 'water' ||
        cells[y][x + 1].assetKey === 'water'
      ) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

/** Find walkable land cells suitable for land wildlife (avoid edges, obstacles) */
function findLandCells(chunk: ChunkData): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  const size = WORLD_CONFIG.chunkSize;
  const cells = chunk.cells;

  // Sample every 3rd cell for perf (wildlife doesn't need pixel-perfect placement)
  for (let y = 2; y < size - 2; y += 3) {
    for (let x = 2; x < size - 2; x += 3) {
      if (cells[y][x].walkable && !cells[y][x].npcId && !cells[y][x].itemId) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

// ─── Species Selection ──────────────────────────────────────

/** Get species eligible for a given biome + time + habitat */
function getEligibleSpecies(biomeName: string, timeSlot: TimeSlot, habitat: 'land' | 'water_adjacent'): SpeciesDef[] {
  return SPECIES.filter(s => {
    if (!s.time.includes(timeSlot)) return false;
    if (s.habitat !== habitat) return false;
    if (s.biomes.length > 0 && !s.biomes.includes(biomeName)) return false;
    return true;
  });
}

/** Weighted random pick from eligible species */
function pickSpecies(eligible: SpeciesDef[], rng: () => number): SpeciesDef | null {
  if (eligible.length === 0) return null;
  const totalWeight = eligible.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng() * totalWeight;
  for (const s of eligible) {
    roll -= s.weight;
    if (roll <= 0) return s;
  }
  return eligible[eligible.length - 1];
}

// ─── Spawn Logic ────────────────────────────────────────────

/** Deterministically spawn wildlife entities for a chunk at a given time slot */
function spawnChunkWildlife(chunk: ChunkData, timeSlot: TimeSlot): WildlifeEntity[] {
  const key = `${chunk.chunkX},${chunk.chunkY}`;
  const biomeName = chunk.biomeName;
  
  // Deterministic seed from chunk coords + time slot
  const seedStr = `wildlife_${chunk.chunkX}_${chunk.chunkY}_${timeSlot}_${chunk.seed.slice(0, 8)}`;
  const rng = seededRng(fastHash(seedStr));

  const densityMul = BIOME_DENSITY[biomeName] ?? 1.0;
  const baseCount = Math.floor(MAX_WILDLIFE_PER_CHUNK * densityMul);
  // Slight randomization: maybe ±1 creature
  const count = Math.max(1, baseCount + (rng() > 0.5 ? 1 : 0) - (rng() > 0.7 ? 1 : 0));

  const waterCells = findWaterAdjacentCells(chunk);
  const landCells = findLandCells(chunk);

  const entities: WildlifeEntity[] = [];
  const size = WORLD_CONFIG.chunkSize;

  // Allocate some slots for water creatures if water is present
  const waterSlots = waterCells.length > 0 ? Math.min(Math.ceil(count * 0.4), waterCells.length) : 0;
  const landSlots = count - waterSlots;

  // Spawn water creatures
  const waterSpecies = getEligibleSpecies(biomeName, timeSlot, 'water_adjacent');
  for (let i = 0; i < waterSlots && waterCells.length > 0; i++) {
    const species = pickSpecies(waterSpecies, rng);
    if (!species) continue;
    const cellIdx = Math.floor(rng() * waterCells.length);
    const cell = waterCells[cellIdx];
    // Remove used cell to avoid stacking
    waterCells.splice(cellIdx, 1);

    const worldX = chunk.chunkX * size + cell.x + (rng() - 0.5) * 0.6;
    const worldY = chunk.chunkY * size + cell.y + (rng() - 0.5) * 0.6;

    entities.push({
      speciesId: species.id,
      worldX, worldY,
      homeX: worldX, homeY: worldY,
      behavior: 'idle',
      animPhase: rng() * Math.PI * 2,
      wanderAngle: rng() * Math.PI * 2,
      fleeCooldown: 0,
      behaviorTimer: 0,
      hidden: false,
      chunkKey: key,
      localId: i,
      facingDir: (species.flipRule === 'random' ? (rng() < 0.5 ? -1 : 1) : 1) as 1 | -1,
    });
  }

  // Spawn land creatures
  const landSpecies = getEligibleSpecies(biomeName, timeSlot, 'land');
  for (let i = 0; i < landSlots && landCells.length > 0; i++) {
    const species = pickSpecies(landSpecies, rng);
    if (!species) continue;
    const cellIdx = Math.floor(rng() * landCells.length);
    const cell = landCells[cellIdx];
    landCells.splice(cellIdx, 1);

    const worldX = chunk.chunkX * size + cell.x + (rng() - 0.5) * 0.4;
    const worldY = chunk.chunkY * size + cell.y + (rng() - 0.5) * 0.4;

    entities.push({
      speciesId: species.id,
      worldX, worldY,
      homeX: worldX, homeY: worldY,
      behavior: 'idle',
      animPhase: rng() * Math.PI * 2,
      wanderAngle: rng() * Math.PI * 2,
      fleeCooldown: 0,
      behaviorTimer: 0,
      hidden: false,
      chunkKey: key,
      localId: waterSlots + i,
      facingDir: (species.flipRule === 'random' ? (rng() < 0.5 ? -1 : 1) : 1) as 1 | -1,
    });
  }

  return entities;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Update wildlife system: re-spawn on time change, tick behaviors.
 * Call once per frame from game loop.
 */
export function updateWildlife(
  chunks: Map<string, ChunkData>,
  playerX: number,
  playerY: number,
): void {
  const currentSlot = getTimeSlot();
  const timeChanged = currentSlot !== _lastTimeSlot;
  _lastTimeSlot = currentSlot;

  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(playerX / size);
  const pcy = Math.floor(playerY / size);
  const buf = WORLD_CONFIG.viewportBuffer;

  // Ensure wildlife exists for all visible chunks
  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      const key = `${pcx + dx},${pcy + dy}`;
      const chunk = chunks.get(key);
      if (!chunk || !chunk.generated) continue;

      const cached = wildlifeCache.get(key);
      if (!cached || (timeChanged && cached.timeSlot !== currentSlot)) {
        // Spawn (or re-spawn on time change)
        const entities = spawnChunkWildlife(chunk, currentSlot);
        wildlifeCache.set(key, {
          entities,
          timeSlot: currentSlot,
          biomeName: chunk.biomeName,
        });
      }
    }
  }

  // Prune far-away chunks from cache
  for (const [key] of wildlifeCache) {
    const [cx, cy] = key.split(',').map(Number);
    if (Math.abs(cx - pcx) > buf + 1 || Math.abs(cy - pcy) > buf + 1) {
      wildlifeCache.delete(key);
    }
  }

  // Tick behaviors for visible wildlife
  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      const key = `${pcx + dx},${pcy + dy}`;
      const cached = wildlifeCache.get(key);
      if (!cached) continue;

      for (const entity of cached.entities) {
        if (entity.hidden) continue;
        tickEntity(entity, playerX, playerY, chunks);
      }
    }
  }
}

/** Pick a weighted transition from idle based on species behaviorWeights (#142) */
function pickIdleBehavior(weights: BehaviorWeights | undefined, rng: number): 'wander' | 'sit' | 'groom' | 'sprint' {
  if (!weights) return 'wander'; // legacy species — wander only
  const w = weights.wander ?? 1.0;
  const s = weights.sit ?? 0;
  const g = weights.groom ?? 0;
  const sp = weights.sprint ?? 0;
  const total = w + s + g + sp;
  if (total <= 0) return 'wander';
  let roll = rng * total;
  roll -= w; if (roll <= 0) return 'wander';
  roll -= s; if (roll <= 0) return 'sit';
  roll -= g; if (roll <= 0) return 'groom';
  return 'sprint';
}

/** Check if a world position is walkable in the given chunks map */
function isWalkable(worldX: number, worldY: number, chunks: Map<string, ChunkData>): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(worldX / size);
  const cy = Math.floor(worldY / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk || !chunk.generated) return false;
  const lx = Math.floor(worldX - cx * size);
  const ly = Math.floor(worldY - cy * size);
  if (lx < 0 || lx >= size || ly < 0 || ly >= size) return false;
  return chunk.cells[ly][lx].walkable;
}

/** Tick a single wildlife entity's behavior (#142: extended state machine) */
function tickEntity(
  entity: WildlifeEntity,
  playerX: number,
  playerY: number,
  chunks: Map<string, ChunkData>,
): void {
  const species = getSpecies(entity.speciesId);  // O(1) Map lookup (#79)
  if (!species) return;

  // Track position for facing direction update (#80, #128)
  const _prevX = entity.worldX;
  const _prevY = entity.worldY;

  // Advance animation phase
  entity.animPhase += 0.05;

  // Distance to player
  const ddx = playerX - entity.worldX;
  const ddy = playerY - entity.worldY;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy);

  // --- Flee logic (highest priority) ---
  if (entity.fleeCooldown > 0) {
    entity.fleeCooldown--;
    if (entity.fleeCooldown <= 0) {
      entity.behavior = 'idle';
      entity.behaviorTimer = 0;
    }
  }

  if (dist < species.fleeRadius && species.fleeRadius > 0) {
    if (entity.behavior !== 'flee') {
      entity.behavior = 'flee';
      entity.fleeCooldown = 120; // ~2 seconds at 60fps
      entity.behaviorTimer = 0;
    }
    // Move away from player
    if (dist > 0.1) {
      const fleeSpeed = species.wanderSpeed * 3;
      const newX = entity.worldX - (ddx / dist) * fleeSpeed;
      const newY = entity.worldY - (ddy / dist) * fleeSpeed;
      // Walkability check (#142)
      if (isWalkable(newX, newY, chunks)) {
        entity.worldX = newX;
        entity.worldY = newY;
      }
    }
  } else if (entity.behavior === 'idle' && species.wanderSpeed > 0) {
    // --- Idle → transition (#142: weighted pick) ---
    if (Math.random() < 0.005) {
      const nextBehavior = pickIdleBehavior(species.behaviorWeights, Math.random());
      entity.behavior = nextBehavior;
      switch (nextBehavior) {
        case 'wander':
          entity.wanderAngle = Math.random() * Math.PI * 2;
          entity.behaviorTimer = 0;
          break;
        case 'sit':
          entity.behaviorTimer = 120 + Math.floor(Math.random() * 180); // 2-5s
          break;
        case 'groom':
          entity.behaviorTimer = 90 + Math.floor(Math.random() * 120); // 1.5-3.5s
          break;
        case 'sprint':
          entity.wanderAngle = Math.random() * Math.PI * 2;
          entity.behaviorTimer = 30 + Math.floor(Math.random() * 40); // 0.5-1.2s
          break;
      }
    }
  }

  // --- Behavior execution ---
  switch (entity.behavior) {
    case 'wander': {
      const newX = entity.worldX + Math.cos(entity.wanderAngle) * species.wanderSpeed;
      const newY = entity.worldY + Math.sin(entity.wanderAngle) * species.wanderSpeed;
      // Walkability check (#142)
      if (isWalkable(newX, newY, chunks)) {
        entity.worldX = newX;
        entity.worldY = newY;
      } else {
        // Bounce: reverse angle and go back to idle
        entity.wanderAngle += Math.PI;
        entity.behavior = 'idle';
        entity.behaviorTimer = 0;
        break;
      }

      // Stay near home position
      const homeDx = entity.homeX - entity.worldX;
      const homeDy = entity.homeY - entity.worldY;
      const homeDist = Math.sqrt(homeDx * homeDx + homeDy * homeDy);
      if (homeDist > 2.5) {
        entity.wanderAngle = Math.atan2(homeDy, homeDx);
      }

      // Random direction changes
      if (Math.random() < 0.02) {
        entity.wanderAngle += (Math.random() - 0.5) * 1.5;
      }

      // Occasionally stop
      if (Math.random() < 0.008) {
        entity.behavior = 'idle';
        entity.behaviorTimer = 0;
      }
      break;
    }
    case 'sit': {
      // Sitting still — timer counts down, then return to idle (#142)
      entity.behaviorTimer--;
      if (entity.behaviorTimer <= 0) {
        entity.behavior = 'idle';
      }
      break;
    }
    case 'groom': {
      // Grooming animation — timer counts down (#142)
      entity.behaviorTimer--;
      if (entity.behaviorTimer <= 0) {
        entity.behavior = 'idle';
      }
      break;
    }
    case 'sprint': {
      // Short speed burst — 2.5x wander speed, with walkability check (#142)
      const sprintSpeed = species.wanderSpeed * 2.5;
      const newX = entity.worldX + Math.cos(entity.wanderAngle) * sprintSpeed;
      const newY = entity.worldY + Math.sin(entity.wanderAngle) * sprintSpeed;
      if (isWalkable(newX, newY, chunks)) {
        entity.worldX = newX;
        entity.worldY = newY;
      } else {
        // Hit a wall — stop sprinting
        entity.behavior = 'idle';
        entity.behaviorTimer = 0;
        break;
      }
      entity.behaviorTimer--;
      if (entity.behaviorTimer <= 0) {
        entity.behavior = 'idle';
      }
      break;
    }
    case 'flee':
      // Flee movement handled above
      break;
    // 'idle' — no movement, just animate
  }

  // Update facing direction from isometric screen-space delta (#80, #128)
  if (species.flipRule === 'movement') {
    const moveDx = entity.worldX - _prevX;
    const moveDy = entity.worldY - _prevY;
    const screenDx = moveDx - moveDy; // isometric horizontal component
    if (Math.abs(screenDx) > 0.005) { // hysteresis prevents jitter at near-zero velocity
      entity.facingDir = screenDx > 0 ? 1 : -1;
    }
  }
}

/**
 * Get all visible wildlife entities for rendering.
 * Returns entities sorted by depth (y position) for proper layering.
 */
export function getVisibleWildlife(
  _camera: Camera,
  playerX: number,
  playerY: number,
): WildlifeEntity[] {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(playerX / size);
  const pcy = Math.floor(playerY / size);
  const buf = WORLD_CONFIG.viewportBuffer;

  const visible: WildlifeEntity[] = [];

  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      const key = `${pcx + dx},${pcy + dy}`;
      const cached = wildlifeCache.get(key);
      if (!cached) continue;

      for (const entity of cached.entities) {
        if (entity.hidden) continue;
        visible.push(entity);
      }
    }
  }

  // Sort by Y for depth ordering
  visible.sort((a, b) => a.worldY - b.worldY);
  return visible;
}

/**
 * Try to interact with wildlife near the player.
 * Returns species info if a creature is in range, null otherwise.
 */
export function interactWithWildlife(
  playerX: number,
  playerY: number,
  facingDx: number,
  facingDy: number,
): { species: SpeciesDef; entity: WildlifeEntity } | null {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(playerX / size);
  const pcy = Math.floor(playerY / size);

  // Check facing direction first
  const targetX = playerX + facingDx * 1.2;
  const targetY = playerY + facingDy * 1.2;

  let closestDist = INTERACT_RANGE;
  let closestEntity: WildlifeEntity | null = null;
  let closestSpecies: SpeciesDef | null = null;

  // Check nearby chunks
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = `${pcx + dx},${pcy + dy}`;
      const cached = wildlifeCache.get(key);
      if (!cached) continue;

      for (const entity of cached.entities) {
        if (entity.hidden) continue;
        const species = SPECIES.find(s => s.id === entity.speciesId);
        if (!species || !species.interactable) continue;

        const ex = entity.worldX - targetX;
        const ey = entity.worldY - targetY;
        const dist = Math.sqrt(ex * ex + ey * ey);

        if (dist < closestDist) {
          closestDist = dist;
          closestEntity = entity;
          closestSpecies = species;
        }
      }
    }
  }

  if (closestEntity && closestSpecies) {
    // Mark as discovered
    discoveredSpecies.add(closestSpecies.id);
    return { species: closestSpecies, entity: closestEntity };
  }

  return null;
}

/** Get the animation offset for a wildlife entity (used by renderer) */
export function getAnimationOffset(entity: WildlifeEntity): { dx: number; dy: number } {
  const species = getSpecies(entity.speciesId);  // O(1) Map lookup (#79)
  if (!species) return { dx: 0, dy: 0 };

  const t = entity.animPhase;

  // Behavior-specific animation overrides (#142)
  switch (entity.behavior) {
    case 'sit':
      // Sitting: small gentle bob, visually lower (crouching)
      return { dx: 0, dy: 2 + Math.sin(t * 0.5) * 0.5 };
    case 'groom':
      // Grooming: rhythmic side-to-side licking motion
      return { dx: Math.sin(t * 3) * 1.5, dy: 1 + Math.sin(t * 6) * 0.4 };
    case 'sprint':
      // Sprinting: fast bouncy movement
      return { dx: Math.sin(t * 5) * 0.5, dy: -Math.abs(Math.sin(t * 6)) * 3 };
    // idle/wander/flee use species animStyle below
  }

  switch (species.animStyle) {
    case 'bob':
      return { dx: 0, dy: Math.sin(t * 2) * 2 };
    case 'hop':
      return { dx: 0, dy: -Math.abs(Math.sin(t * 3)) * 4 };
    case 'sway':
      return { dx: Math.sin(t * 1.5) * 1.5, dy: 0 };
    case 'swim':
      return { dx: Math.sin(t * 1.2) * 2, dy: Math.cos(t * 0.8) * 1 };
    case 'flutter':
      return { dx: Math.sin(t * 4) * 2, dy: Math.sin(t * 3) * 3 - 4 };
    case 'prowl':
      // Subtle cat-like stalking: slow horizontal drift, slight crouch bob
      return { dx: Math.sin(t * 0.8) * 1.0, dy: Math.sin(t * 1.6) * 0.5 };
    case 'still':
    default:
      return { dx: 0, dy: 0 };
  }
}

/** Restore discovered species from save data */
export function restoreDiscoveredSpecies(ids: string[]): void {
  discoveredSpecies.clear();
  for (const id of ids) discoveredSpecies.add(id);
}

/** Get discovered species as array for saving */
export function getDiscoveredSpeciesArray(): string[] {
  return Array.from(discoveredSpecies);
}

/** Clear all wildlife caches (e.g. on game reset) */
export function clearWildlife(): void {
  wildlifeCache.clear();
  _lastTimeSlot = 'day';
}

/** Get total wildlife count in cache (for debug/stats) */
export function getWildlifeStats(): { cached: number; discovered: number; timeSlot: TimeSlot } {
  let total = 0;
  for (const [, v] of wildlifeCache) {
    total += v.entities.filter(e => !e.hidden).length;
  }
  return { cached: total, discovered: discoveredSpecies.size, timeSlot: _lastTimeSlot };
}
