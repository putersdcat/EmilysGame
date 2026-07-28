/**
 * game-state.ts — GameState interface + factory function (#268, B5.4).
 *
 * B5 micro-slice 11.4 (#268): extracted from main.ts. The GameState
 * interface is the central state object for the entire game — it holds
 * player position, camera, chunks, inventory, quiz state, UI state, all
 * subsystem states (status, injury, trade, music, sfx, voice, etc.), and
 * transient flags.
 *
 * The factory function `createGameState()` encapsulates the complex
 * initialization logic (loading from save, setting up subsystems,
 * default values) so that `init()` in main.ts becomes a thin bootstrap.
 *
 * This extraction is the **critical milestone** for B5 — it unblocks
 * decomposing the big functions (update, main, renderFrame) because
 * they all take `GameState` as their primary parameter.
 *
 * Public API:
 *   - GameState (interface) — the full game state shape
 *   - createGameState(deps) — factory that builds the initial state
 *
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { WORLD_CONFIG, PLAYER_CONFIG } from '../config/game.config';
import type { CharacterVariation, FacingPose, Expression } from '../asset-pipeline/sprites';
import { type Camera } from '../rendering/render';
import type { ChunkData } from '../types/game.types';
import { type Inventory } from './inventory';
import { type QuizState, type StreakState } from './quiz';
import { type UIState } from '../ui/ui';
import { type KnowledgeState } from './knowledge';
import { type QuizDifficulty, type QuizQuestion } from '../config/quiz.config';
import { type TradeState } from './trading';
import { type PlayerStatus } from './status';
import { type InjuryState } from './injury';
import { type MusicState } from './audio/music';
import { type SfxState } from './audio/sfx';
import { type VoiceState } from './audio/npc-voice';
import { type AgeProfile } from './age-profile';
import { type DiarrheaState } from './illness';
import type { PlayModeState } from './play-mode';

// ─── GameState Interface ────────────────────────────────────

/**
 * The central game state object. Composed of subsystem states (status,
 * injury, trade, music, sfx, voice, illness, etc.) plus core game state
 * (player, camera, chunks, inventory, quiz, UI, knowledge).
 *
 * This interface is large by necessity — it's the single source of truth
 * for all game state. Subsystem-specific state should be composed via
 * the subsystem's own interface (e.g. `state.diarrhea: DiarrheaState`).
 */
export interface GameState {
  player: {
    x: number;
    y: number;
    direction: number;    // 1 = right, -1 = left (sprite flip)
    facingDx: number;     // Last movement dx (-1/0/1)
    facingDy: number;     // Last movement dy (-1/0/1)
    facingPose: FacingPose; // 'front' or 'back' for sprite selection
    speed: number;
    isMoving: boolean;
    animFrame: number;
    sinkDepth?: number; // iso2: neg-Z sink (rivers/gates per #223 walk + AUTONOMOUS_LOOP.md)
    /**
     * Visual / recovery-request only (PR4). Set when footprint is illegal
     * after load/embed so the sprite elevates (`sinkDepth`) above obstruction.
     * **Never** a multi-frame collision bypass — motor only commits legal
     * positions via constrained recovery (ladder / BFS / safe spawn).
     * Cleared when footprint is legal after ladder teleport.
     */
    spawnEscape?: boolean;
  };
  playerVariation: CharacterVariation;
  camera: Camera;
  chunks: Map<string, ChunkData>;
  inventory: Inventory;
  quiz: QuizState;
  ui: UIState;
  knowledge: KnowledgeState;
  quizStats: { answered: number; correct: number };
  egoImg: HTMLImageElement | null;
  frameCount: number;
  fps: number;
  lastFpsTime: number;
  fpsCounter: number;
  /**
   * Derived play freeze for one-release compat.
   * SSOT is `playMode` (stack / controlLock). Written only by play-mode.ts
   * via syncDerivedPaused. Prefer locomotionAllowed() / worldInteractAllowed().
   */
  paused: boolean;
  /** L2 PlayMode ownership — stack + pendingNext + controlLock (PR5). */
  playMode: PlayModeState;
  initialized: boolean;
  // Perf tracking: avoid redundant work
  lastAnimFrame: number;
  lastFacingPose: FacingPose;
  lastChunkX: number;
  lastChunkY: number;
  // Pending quiz triggered by NPC — starts when dialog closes
  // `question` (2026-07-10): pre-picked at pendingQuiz-set time (see
  // interaction-handler.ts/main.ts) so a background rephrase prefetch
  // (prefetchQuizRephrase) can use the dialog-reading window as a head
  // start -- optional because not every pendingQuiz assignment pre-picks.
  pendingQuiz: { difficulty: QuizDifficulty; npcId: string; bias?: Record<string, number>; question?: QuizQuestion | null } | null;
  // Pending quiz triggered by quiz gate — resolves gate cell on correct answer
  pendingGateQuiz: { chunkKey: string; lx: number; ly: number } | null;
  // Active conditions for iso2 conditional walkables (e.g. 'quiz-gate' locked/unlocked per #223 + AUTONOMOUS_LOOP.md)
  activeConditions: Map<string, 'locked' | 'unlocked'>;
  // NPC trading state
  trade: TradeState;
  // Pending trade to open after dialog closes (NPC persona id)
  pendingTrade: string | null;
  // Player survival status (#70)
  status: PlayerStatus;
  // Injury state (#109)
  injury: InjuryState;
  // Unlocked cosmetic IDs (#66)
  unlockedCosmetics: string[];
  // NPC persona ids the player has talked to at least once (WorldEngine-05
  // SS8.5 save-fidelity gap fix -- see Docs/VisionAlignmentAudit.md Finding #10)
  talkedToNpcs: Set<string>;
  // Music state (#74)
  music: MusicState;
  // SFX & ambience state (#75)
  sfx: SfxState;
  // NPC voice state (#76)
  voice: VoiceState;
  // Quiz streak state (#103)
  streak: StreakState;
  // Age band profile (#92)
  ageProfile: AgeProfile;
  // Transient expression override (#102) — reverts after timer expires
  expressionOverride: { expr: Expression; until: number } | null;
  // Base default expression to revert to after transient override (#102)
  _baseExpression: Expression;
  // Diarrhea illness chain (#133) — see DiarrheaState in ./illness.ts
  diarrhea: DiarrheaState;
  // Quiz type flags — tracks which special quiz is active (#109, #110)
  _woundCareQuiz: boolean;
  _hygieneQuiz: boolean;
  _insectQuiz: boolean;
  _pendingInsectQuiz: boolean;
  // Last time-of-day slot for dawn rooster detection (#108)
  _lastTimeSlot: 'day' | 'dusk' | 'night';
}

// ─── Factory Dependencies ────────────────────────────────────

/**
 * Dependencies needed to build a GameState. These are subsystem factories
 * and the initial player position/variation. Extracted as a separate
 * type so the factory signature is clean and the dependencies are
 * explicit.
 */
export interface CreateGameStateDeps {
  playerVariation: CharacterVariation;
  egoImg: HTMLImageElement | null;
  startX: number;
  startY: number;
  quizStats: { answered: number; correct: number };
  unlockedCosmetics: string[];
  // Subsystem factories (passed in to avoid circular imports)
  createInventory: () => Inventory;
  createQuizState: () => QuizState;
  createUIState: () => UIState;
  createKnowledgeState: () => KnowledgeState;
  createTradeState: () => TradeState;
  createPlayerStatus: () => PlayerStatus;
  createInjuryState: () => InjuryState;
  createMusicState: () => MusicState;
  createSfxState: () => SfxState;
  createVoiceState: () => VoiceState;
  createStreakState: () => StreakState;
  createAgeProfile: () => AgeProfile;
  createInitialDiarrheaState: () => DiarrheaState;
}

// ─── Factory Function ────────────────────────────────────────

/**
 * Build the initial GameState. Called from `init()` in main.ts after
 * LLM health check, canvas setup, and asset preloading complete.
 *
 * The factory does NOT restore from save — that's handled separately
 * by `init()` after the state is created (see restoreFromSave below).
 * Keeping restore-from-save separate makes the factory easier to test
 * and avoids coupling it to the SaveData type.
 */
export function createGameState(deps: CreateGameStateDeps): GameState {
  const size = WORLD_CONFIG.chunkSize;
  const startX = deps.startX;
  const startY = deps.startY;

  return {
    player: {
      x: startX,
      y: startY,
      direction: 1, // Default to facing right; restored from save by init()
      facingDx: 1,
      facingDy: 0,
      facingPose: 'front' as FacingPose,
      speed: PLAYER_CONFIG.speed,
      isMoving: false,
      animFrame: 0,
      sinkDepth: 0, // iso2: for negative Z (rivers) from walk integration
      spawnEscape: false,
    },
    playerVariation: deps.playerVariation,
    camera: {
      x: startX,
      y: startY,
    },
    chunks: new Map(),
    inventory: deps.createInventory(),
    quiz: deps.createQuizState(),
    ui: deps.createUIState(),
    knowledge: deps.createKnowledgeState(),
    quizStats: deps.quizStats,
    egoImg: deps.egoImg,
    frameCount: 0,
    fps: 0,
    lastFpsTime: performance.now(),
    fpsCounter: 0,
    paused: false,
    playMode: { stack: [], pendingNext: [], controlLock: null },
    initialized: true,
    lastAnimFrame: -1,
    lastFacingPose: 'front' as FacingPose,
    lastChunkX: Math.floor(startX / size),
    lastChunkY: Math.floor(startY / size),
    pendingQuiz: null,
    pendingGateQuiz: null,
    activeConditions: new Map([['quiz-gate', 'locked' as const]]),
    trade: deps.createTradeState(),
    pendingTrade: null,
    status: deps.createPlayerStatus(),
    injury: deps.createInjuryState(),
    unlockedCosmetics: deps.unlockedCosmetics,
    talkedToNpcs: new Set(),
    music: deps.createMusicState(),
    sfx: deps.createSfxState(),
    voice: deps.createVoiceState(),
    streak: deps.createStreakState(),
    ageProfile: deps.createAgeProfile(),
    expressionOverride: null,
    _baseExpression: deps.playerVariation.expression ?? 'happy',
    // Diarrhea illness chain (#133) — B5.2: state factory extracted to illness.ts
    diarrhea: deps.createInitialDiarrheaState(),
    // Quiz type flags (#109, #110)
    _woundCareQuiz: false,
    _hygieneQuiz: false,
    _insectQuiz: false,
    _pendingInsectQuiz: false,
    _lastTimeSlot: 'day',
  };
}
