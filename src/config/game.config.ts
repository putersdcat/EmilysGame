/**
 * config/game.config.ts - Master game configuration.
 * Central place for all tunable game parameters.
 * Organized by system. Tweak values here to change game behavior.
 */

// ─── Rendering ───────────────────────────────────────────────
export const RENDER_CONFIG = {
  canvasWidth: 800,
  canvasHeight: 600,
  tileWidth: 64,        // Isometric tile width in px
  tileHeight: 32,       // Isometric tile height in px (squished Y)
  targetFPS: 60,
  baseColor: '#1a5c1a', // Ground fill color
  shadowAlpha: 0.5,
  shadowScale: { width: 22, height: 12 },
  emojiSize: 32,        // Base emoji font size
  spriteSize: 48,       // Base SVG sprite render size
  emojiBrightness: 1.15,
  emojiSaturation: 1.25,
} as const;

// ─── Grid / World ────────────────────────────────────────────
export const WORLD_CONFIG = {
  chunkSize: 32,        // Cells per chunk side (32x32)
  cellPixels: 128,      // Logical cell size in px
  viewportBuffer: 1,    // Extra chunks rendered off-screen

  /** Density thresholds for procedural gen (0-100 from hash) */
  density: {
    terrain: { min: 0, max: 70 },   // 0-70 = open terrain
    obstacle: { min: 70, max: 88 },  // 70-88 = obstacles
    feature: { min: 88, max: 100 },  // 88-100 = features (NPC, chest, etc.)
  },

  /** Target passability ratio (BFS will inject paths if below) */
  passabilityTarget: 0.5,

  /** Biome type count (modulo from hash) */
  biomeCount: 4, // 0=Meadow, 1=Forest, 2=Cave, 3=Castle
} as const;

// ─── Player / Ego ────────────────────────────────────────────
export const PLAYER_CONFIG = {
  speed: 0.05,          // Grid units per frame
  startPosition: { x: 16, y: 16 }, // Center of first chunk (32/2)
  height: 3,
  scale: 1.0,
  defaultVariation: 'blonde_pink',
  animationFrames: 6,   // Walking animation frame count
} as const;

// ─── LLM / Entropy ──────────────────────────────────────────
export const LLM_CONFIG = {
  /** Local BitNet API endpoint */
  endpoint: 'http://127.0.0.1:8002',
  model: 'bitnet-b1.58',
  completionsPath: '/v1/completions',
  codeCompletionsPath: '/v1/code/completions',
  chatPath: '/v1/chat/completions',
  healthPath: '/health',
  historyPath: '/v1/_history',
  sessionsPath: '/v1/sessions',

  /** Max tokens for various prompt types */
  maxTokens: {
    wordlist: 300,    // Initial 50 verb-noun pairs
    entropy: 80,      // Chunk generation nonsense sentence
    npcChat: 100,     // NPC response
    quizWrap: 80,     // Quiz question rephrasing
  },

  /** Timeout before falling back to RNG (ms) */
  timeoutMs: 2000,

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
