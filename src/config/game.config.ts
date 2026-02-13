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
  speed: 0.05,          // Grid units per frame
  startPosition: { x: 12, y: 12 }, // Center of first chunk (25/2)
  height: 3,
  scale: 1.0,
  defaultVariation: 'blonde_pink',
  animationFrames: 6,   // Walking animation frame count
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
