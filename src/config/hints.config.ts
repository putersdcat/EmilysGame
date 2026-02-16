/**
 * hints.config.ts - Hint template definitions for thought/speech bubbles.
 * Each hint has a unique ID, display text, type, priority, cooldown, and trigger conditions.
 * TODO: DOC - hint config schema
 */

export type BubbleType = 'thought' | 'speech';

export interface HintDef {
  id: string;
  text: string;
  type: BubbleType;
  /** Higher = shown over lower priority. Range 0-10. */
  priority: number;
  /** How long the bubble stays visible (ms). */
  duration: number;
  /** Minimum ms before this hint can fire again. */
  cooldown: number;
  /** Optional emoji prefix for the bubble text. */
  emoji?: string;
}

// ─── Hint Templates ──────────────────────────────────────────

export const HINTS: Record<string, HintDef> = {
  // ── Low resource warnings ──
  low_coins: {
    id: 'low_coins',
    text: 'I should look for more coins...',
    type: 'thought',
    priority: 3,
    duration: 3000,
    cooldown: 45000,
    emoji: '💰',
  },
  no_keys: {
    id: 'no_keys',
    text: 'I need a key to open locked gates!',
    type: 'thought',
    priority: 4,
    duration: 3500,
    cooldown: 60000,
    emoji: '🔑',
  },

  // ── Status-aware triggers (#111) ──
  low_energy: {
    id: 'low_energy',
    text: 'Getting hungry... need a snack!',
    type: 'thought',
    priority: 5,
    duration: 3500,
    cooldown: 45000,
    emoji: '🍎',
  },
  critical_energy: {
    id: 'critical_energy',
    text: 'Stomach growling — not eating worms yet!',
    type: 'thought',
    priority: 7,
    duration: 4000,
    cooldown: 30000,
    emoji: '😫',
  },
  low_hydration: {
    id: 'low_hydration',
    text: 'So thirsty... is there water nearby?',
    type: 'thought',
    priority: 5,
    duration: 3500,
    cooldown: 45000,
    emoji: '💧',
  },
  critical_hydration: {
    id: 'critical_hydration',
    text: 'Need water! Throat is so dry...',
    type: 'thought',
    priority: 7,
    duration: 4000,
    cooldown: 30000,
    emoji: '🏜️',
  },
  low_cleanliness: {
    id: 'low_cleanliness',
    text: 'Starting to feel grimy... soap would help!',
    type: 'thought',
    priority: 4,
    duration: 3500,
    cooldown: 60000,
    emoji: '🧼',
  },
  critical_cleanliness: {
    id: 'critical_cleanliness',
    text: 'Flies are buzzing... need to get clean!',
    type: 'thought',
    priority: 6,
    duration: 4000,
    cooldown: 30000,
    emoji: '🪰',
  },
  status_combo_bad: {
    id: 'status_combo_bad',
    text: 'Tired, hungry, AND dirty? What a day!',
    type: 'thought',
    priority: 8,
    duration: 4000,
    cooldown: 60000,
    emoji: '😵',
  },

  // ── Shop/merchant proximity (#111) ──
  near_shop: {
    id: 'near_shop',
    text: 'That shop might have snacks!',
    type: 'thought',
    priority: 4,
    duration: 3000,
    cooldown: 45000,
    emoji: '🛍️',
  },

  // ── Nearby interactive prompts ──
  near_npc: {
    id: 'near_npc',
    text: 'Someone\'s nearby... maybe I should talk to them?',
    type: 'thought',
    priority: 5,
    duration: 3000,
    cooldown: 30000,
    emoji: '💬',
  },
  near_gate: {
    id: 'near_gate',
    text: 'A gate! I wonder what\'s behind it...',
    type: 'thought',
    priority: 5,
    duration: 3000,
    cooldown: 30000,
    emoji: '🚪',
  },
  near_chest: {
    id: 'near_chest',
    text: 'Ooh, a treasure chest!',
    type: 'speech',
    priority: 6,
    duration: 2500,
    cooldown: 20000,
    emoji: '📦',
  },

  // ── Wildlife reactions ──
  wildlife_spotted: {
    id: 'wildlife_spotted',
    text: 'Look, a little creature!',
    type: 'speech',
    priority: 2,
    duration: 2500,
    cooldown: 40000,
    emoji: '🐾',
  },

  // ── Biome transitions ──
  biome_forest: {
    id: 'biome_forest',
    text: 'The trees are getting thicker here...',
    type: 'thought',
    priority: 4,
    duration: 3500,
    cooldown: 120000,
    emoji: '🌲',
  },
  biome_cave: {
    id: 'biome_cave',
    text: 'It\'s dark in here. Better be careful!',
    type: 'thought',
    priority: 5,
    duration: 3500,
    cooldown: 120000,
    emoji: '🕯️',
  },
  biome_castle: {
    id: 'biome_castle',
    text: 'Whoa, a castle! This looks important...',
    type: 'speech',
    priority: 6,
    duration: 3500,
    cooldown: 120000,
    emoji: '🏰',
  },

  // ── Quiz encouragement ──
  quiz_streak: {
    id: 'quiz_streak',
    text: 'I\'m on a roll! Keep it up!',
    type: 'speech',
    priority: 3,
    duration: 2500,
    cooldown: 60000,
    emoji: '🌟',
  },
  quiz_wrong: {
    id: 'quiz_wrong',
    text: 'Hmm, I should check the Book for that...',
    type: 'thought',
    priority: 3,
    duration: 3000,
    cooldown: 30000,
    emoji: '📖',
  },

  // ── Time of day ──
  nightfall: {
    id: 'nightfall',
    text: 'It\'s getting dark... the nocturnal creatures are waking up!',
    type: 'thought',
    priority: 4,
    duration: 4000,
    cooldown: 300000,
    emoji: '🌙',
  },
  dawn: {
    id: 'dawn',
    text: 'The sun is rising! A new day of adventure!',
    type: 'speech',
    priority: 3,
    duration: 3500,
    cooldown: 300000,
    emoji: '🌅',
  },

  // ── Exploration nudges ──
  explore_new_area: {
    id: 'explore_new_area',
    text: 'I haven\'t been here before. Let\'s explore!',
    type: 'thought',
    priority: 2,
    duration: 3000,
    cooldown: 60000,
    emoji: '🗺️',
  },
  far_from_spawn: {
    id: 'far_from_spawn',
    text: 'I\'ve come a long way from where I started!',
    type: 'thought',
    priority: 1,
    duration: 3000,
    cooldown: 180000,
    emoji: '🚶',
  },

  // ── Difficulty warnings ──
  danger_zone: {
    id: 'danger_zone',
    text: 'This area feels dangerous... the quizzes will be harder here!',
    type: 'thought',
    priority: 7,
    duration: 4000,
    cooldown: 120000,
    emoji: '⚠️',
  },

  // ── Flashlight hints ──
  dark_no_flashlight: {
    id: 'dark_no_flashlight',
    text: 'It\'s so dark! I should try pressing F for my flashlight.',
    type: 'thought',
    priority: 6,
    duration: 4000,
    cooldown: 90000,
    emoji: '🔦',
  },
};

/** Maximum number of bubbles that can be queued at once. */
export const MAX_BUBBLE_QUEUE = 4;

/** Minimum gap between any two bubbles (ms). */
export const MIN_BUBBLE_GAP = 2000;
