/**
 * config/game.config.ts - Master game configuration.
 * Central place for all tunable game parameters.
 * Organized by system. Tweak values here to change game behavior.
 */

// ─── Rendering ───────────────────────────────────────────────
export const RENDER_CONFIG = {
  canvasWidth: 800,
  canvasHeight: 600,
  tileWidth: 256,       // Iso 2.0 diamond width in px (144px source micro tile)
  tileHeight: 128,      // Iso 2.0 diamond height in px (2:1 projection)
  targetFPS: 60,
  renderScale: 1.0,   // Internal render resolution (0.5=half, 1.0=full).
  maxDrawCmds: 400,    // Max draw commands per frame (graceful degradation beyond this)
  baseColor: '#1a5c1a', // Ground fill color
  useWasmRenderer: false, // Disabled: JS path with object cache is faster (no marshal overhead)
  shadowAlpha: 0.5,
  shadowScale: { width: 22, height: 12 },
  emojiSize: 32,        // Base emoji font size
  spriteSize: 48,       // Base SVG sprite render size
  emojiBrightness: 1.15,
  emojiSaturation: 1.25,
  /** Source pixel size of micro-tile SVGs fed into the isometric transform.
   *  Iso 2.0 uses 144 so the nano sub-grid divides cleanly into 3×48px cells. */
  microTileSize: 144,
};  // Mutable: canvasWidth/canvasHeight updated on viewport resize

// ─── Grid / World ────────────────────────────────────────────
export const WORLD_CONFIG = {
  chunkSize: 25,        // Cells per chunk side (25x25 = 5×5 world units)
  worldUnitSize: 5,     // Cells per world unit side
  cellPixels: 128,      // Logical cell size in px
  viewportBuffer: 1,    // Extra chunks rendered off-screen (0 = tight, 1 = smooth)

  /** Density thresholds for procedural gen (0-100 from hash) */
  density: {
    terrain: { min: 0, max: 78 },   // 0-78 = open terrain (was 70; more open world)
    obstacle: { min: 78, max: 92 },  // 78-92 = obstacles (14% vs 18%)
    feature: { min: 92, max: 100 },  // 92-100 = features (8% vs 12%)
  },

  /** Target passability ratio (BFS will inject paths if below) */
  passabilityTarget: 0.5,

  /** Biome type count (modulo from hash) */
  biomeCount: 4, // 0=Meadow, 1=Forest, 2=Cave, 3=Castle
} as const;

// ─── Player / Ego ────────────────────────────────────────────
export const PLAYER_CONFIG = {
  // 0.05 (~3 cells/s @60fps) felt leisurely/grindy for short sessions;
  // 0.08 (~4.8 cells/s) keeps control while making explore→gate loops viable.
  speed: 0.08,          // Grid units per frame
  startPosition: { x: 12.5, y: 12.5 }, // Center of cell at chunk midpoint (avoids footprint overlap with adjacent walls)
  height: 3,
  scale: 1.0,
  defaultVariation: 'blonde_pink',
  animationFrames: 6,   // Walking animation frame count
  /** Collision footprint half-extents in grid units (centered on player position).
   *  Tight rectangle prevents walk-through on all approach directions (#151, #180). */
  collisionHalfW: 0.3,  // X half-width (grid units)
  collisionHalfH: 0.3,  // Y half-height (grid units)
} as const;

// ─── LLM / Entropy ──────────────────────────────────────────
export const LLM_CONFIG = {
  /** Local OpenAI-style API endpoint (CPU default) */
  endpoint: import.meta.env.VITE_LLM_ENDPOINT || '/api/llm',
  /** Proxied in dev via vite.config.ts; set VITE_LLM_ENDPOINT for production */
  fallbackEndpoints: [] as string[],
  /** Local API key used for Authorization: Bearer <key> */
  apiKey: import.meta.env.VITE_LLM_API_KEY || 'local-secret',
  model: import.meta.env.VITE_LLM_MODEL || 'BitNet',
  completionsPath: '/v1/completions',
  codeCompletionsPath: '/v1/code/completions',
  chatPath: '/v1/chat/completions',
  healthPath: '/health',
  historyPath: '/ui/history',
  sessionsPath: '/v1/sessions',

  /** Max tokens for various prompt types */
  maxTokens: {
    wordlist: 300,    // Initial 50 verb-noun pairs
    entropy: 80,      // Chunk generation nonsense sentence
    npcChat: 100,     // NPC response
    quizWrap: 80,     // Quiz question rephrasing
  },

  /** Timeout before falling back to RNG (ms) */
  timeoutMs: 15000,

  /** Temperature (higher = more creative/random) */
  temperature: 1.2,

  /** Initial wordlist size */
  wordlistSize: 50,

  /** Minimum letter count per verb-noun pair */
  minPairLetters: 10,
} as const;

// ─── Inventory ───────────────────────────────────────────────
export const INVENTORY_CONFIG = {
  maxSlots: 12,
} as const;

// ─── Quiz ────────────────────────────────────────────────────
export const QUIZ_CONFIG = {
  questionsPerEncounter: { min: 1, max: 3 },
  hintOnWrong: true,
  rewardCoins: { easy: 5, medium: 10, hard: 20 },
  categories: ['math', 'science', 'history', 'language', 'logic'] as const,
} as const;

// ─── NPC ─────────────────────────────────────────────────────
export const NPC_CONFIG = {
  chatMaxLength: 100,   // Max player input chars
  chatTurns: 3,         // Max conversation turns
  spawnThreshold: 70,   // Density value above which NPC spawns
} as const;

// ─── Audio ───────────────────────────────────────────────────
export const AUDIO_CONFIG = {
  masterVolume: 0.5,
  sfxVolume: 0.7,
  musicVolume: 0.3,
  enabled: true,
} as const;

// ─── Save / Persistence ─────────────────────────────────────
export const SAVE_CONFIG = {
  storageKey: 'emilys_game_save',
  autoSaveOnChunkExit: true,
} as const;

// ─── Difficulty Scaling ──────────────────────────────────────
// Distance-based difficulty increases as the player explores outward.
// Each multiplier scales the base biome value for that category.
// TODO: DOC — difficulty tiers and scaling formulas (WorldEngine-03 §4)

export interface DifficultyProfile {
  /** Tier name for UI display */
  tierName: string;
  /** Tier index (0=safe, 1=easy, 2=medium, 3=hard, 4=extreme) */
  tier: number;
  /** Obstacle density multiplier (1.0 = normal biome value) */
  obstacleDensity: number;
  /** Quiz gate frequency multiplier */
  quizGateFrequency: number;
  /** Collectible spawn rate multiplier (lower = scarcer) */
  collectibleRate: number;
  /** NPC guardian ratio (0-1, higher = more guardians vs merchants) */
  guardianRatio: number;
  /** Key spawn rate multiplier (higher = more keys for more locks) */
  keyRate: number;
  /** Extra obstacles added per chunk (beyond template and Perlin gen) */
  extraObstacles: number;
}

const DIFFICULTY_TIERS: DifficultyProfile[] = [
  // quizGateFrequency was 0.0 in Safe Zone which zeroed placeQuizGates even
  // when biome weight > 0 (effectiveWeight = weight * mult). Small nonzero
  // keeps the teaching loop present in the dist-0..1 ring without flooding.
  { tierName: 'Safe Zone',  tier: 0, obstacleDensity: 0.6, quizGateFrequency: 0.45, collectibleRate: 1.5, guardianRatio: 0.0, keyRate: 0.5, extraObstacles: 0 },
  { tierName: 'Easy',       tier: 1, obstacleDensity: 0.8, quizGateFrequency: 0.85, collectibleRate: 1.2, guardianRatio: 0.2, keyRate: 0.8, extraObstacles: 0 },
  { tierName: 'Medium',     tier: 2, obstacleDensity: 1.0, quizGateFrequency: 1.0, collectibleRate: 1.0, guardianRatio: 0.4, keyRate: 1.0, extraObstacles: 2 },
  { tierName: 'Hard',       tier: 3, obstacleDensity: 1.3, quizGateFrequency: 1.4, collectibleRate: 0.8, guardianRatio: 0.6, keyRate: 1.2, extraObstacles: 4 },
  { tierName: 'Extreme',    tier: 4, obstacleDensity: 1.6, quizGateFrequency: 1.8, collectibleRate: 0.6, guardianRatio: 0.8, keyRate: 1.5, extraObstacles: 6 },
];

/**
 * Get difficulty profile based on chunk distance from origin.
 * Distance tiers: 0-1 = Safe, 2-3 = Easy, 4-5 = Medium, 6-8 = Hard, 9+ = Extreme
 */
export function getDifficulty(chunkDist: number): DifficultyProfile {
  if (chunkDist <= 1) return DIFFICULTY_TIERS[0];
  if (chunkDist <= 3) return DIFFICULTY_TIERS[1];
  if (chunkDist <= 5) return DIFFICULTY_TIERS[2];
  if (chunkDist <= 8) return DIFFICULTY_TIERS[3];
  return DIFFICULTY_TIERS[4];
}
