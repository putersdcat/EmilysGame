/**
 * utils.ts - Shared utility functions.
 * SHA-256 hashing, Perlin noise, BFS pathfinding, and helpers.
 */

// ─── SHA-256 Hashing ─────────────────────────────────────────

/**
 * Compute SHA-256 hash of a string.
 * Uses Web Crypto API (available in all modern browsers).
 * Returns hex string.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous fallback hash using simple djb2 variant.
 * Not cryptographic - for fast local seeding only.
 */
export function fastHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // Ensure unsigned 32-bit
}

/**
 * Convert hex string chunk to integer (0-maxVal).
 */
export function hexToInt(hex: string, maxVal: number): number {
  const n = parseInt(hex, 16);
  return isNaN(n) ? 0 : n % (maxVal + 1);
}

/**
 * Sum ASCII char codes of a string, modulo a value.
 */
export function asciiModulo(text: string, mod: number): number {
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    sum += text.charCodeAt(i);
  }
  return sum % mod;
}

// ─── Seeded Random Number Generator ─────────────────────────

/**
 * Simple seedable PRNG (Mulberry32).
 * Returns a function that produces 0-1 floats from a seed.
 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Deterministic Cell Jitter (#82) ────────────────────────

/**
 * Compute per-cell deterministic sub-tile offset for placement jitter.
 * Returns pixel offsets (dx, dy) based on world-space cell coords and jitter range.
 * Isometric: dy range is half of dx range for visual consistency.
 * @param gx Global cell X
 * @param gy Global cell Y
 * @param jitterRange 0-1 fraction of half-tile-width for max offset
 * @param halfTW Half tile width in pixels (default 32)
 * @param halfTH Half tile height in pixels (default 16)
 */
export function cellJitter(
  gx: number, gy: number, jitterRange: number,
  halfTW = 32, halfTH = 16
): { dx: number; dy: number } {
  if (jitterRange <= 0) return { dx: 0, dy: 0 };
  // Two independent hashes for X and Y axes
  const hx = ((gx * 374761393 + gy * 668265263) >>> 0) / 4294967296; // 0-1
  const hy = ((gx * 1274126177 + gy * 1103515245) >>> 0) / 4294967296; // 0-1
  return {
    dx: (hx * 2 - 1) * jitterRange * halfTW,  // ±jitterRange * halfTW pixels
    dy: (hy * 2 - 1) * jitterRange * halfTH,  // ±jitterRange * halfTH pixels
  };
}

// ─── Perlin Noise (2D) ──────────────────────────────────────

/**
 * 2D Perlin noise implementation.
 * Seeded via permutation table shuffle.
 */
export class PerlinNoise {
  private perm: number[];

  constructor(seed: number) {
    const rng = seededRandom(seed);
    // Build permutation table
    const base = Array.from({ length: 256 }, (_, i) => i);
    // Fisher-Yates shuffle with seeded RNG
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    this.perm = [...base, ...base]; // Double for overflow
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Get noise value at (x, y). Returns -1 to 1.
   */
  public noise(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];

    return this.lerp(
      this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  /**
   * Get normalized noise value at (x, y). Returns 0-100.
   */
  public noise100(x: number, y: number): number {
    return Math.round(((this.noise(x, y) + 1) / 2) * 100);
  }
}

// ─── BFS Pathfinding ─────────────────────────────────────────

export interface GridPos {
  x: number;
  y: number;
}

/**
 * BFS flood fill from a start position.
 * Returns set of all reachable positions.
 * @param walkableCheck - function that returns true if cell is walkable
 * @param width - grid width
 * @param height - grid height
 * @param start - starting position
 */
export function bfsFloodFill(
  walkableCheck: (x: number, y: number) => boolean,
  width: number,
  height: number,
  start: GridPos,
): Set<string> {
  const visited = new Set<string>();
  const queue: GridPos[] = [start];
  const key = (x: number, y: number) => `${x},${y}`;

  visited.add(key(start.x, start.y));

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors: GridPos[] = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      const k = key(n.x, n.y);
      if (visited.has(k)) continue;
      if (!walkableCheck(n.x, n.y)) continue;
      visited.add(k);
      queue.push(n);
    }
  }

  return visited;
}

/**
 * BFS shortest path from start to goal.
 * Returns path array (including start and goal) or null if no path.
 */
export function bfsPath(
  walkableCheck: (x: number, y: number) => boolean,
  width: number,
  height: number,
  start: GridPos,
  goal: GridPos,
): GridPos[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const cameFrom = new Map<string, GridPos | null>();
  const queue: GridPos[] = [start];
  cameFrom.set(key(start.x, start.y), null);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path: GridPos[] = [];
      let node: GridPos | null = current;
      while (node) {
        path.unshift(node);
        node = cameFrom.get(key(node.x, node.y)) ?? null;
      }
      return path;
    }

    const neighbors: GridPos[] = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      const k = key(n.x, n.y);
      if (cameFrom.has(k)) continue;
      if (!walkableCheck(n.x, n.y) && !(n.x === goal.x && n.y === goal.y)) continue;
      cameFrom.set(k, current);
      queue.push(n);
    }
  }

  return null; // No path found
}

// ─── Weighted Random Selection ───────────────────────────────

/**
 * Pick a key from a weights object using a 0-1 random value.
 * Weights don't need to sum to 1 - they're normalized internally.
 */
export function weightedPick(
  weights: Record<string, number>,
  randomValue: number,
): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let cumulative = 0;
  const target = randomValue * total;

  for (const [key, weight] of entries) {
    cumulative += weight;
    if (target <= cumulative) return key;
  }

  // Fallback to last entry
  return entries[entries.length - 1][0];
}

/**
 * Shuffle an array in place using Fisher-Yates.
 * Returns the same array reference.
 */
export function shuffle<T>(array: T[], rng: () => number = Math.random): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
