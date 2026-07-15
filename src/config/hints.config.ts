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
    duration: 4500,
    cooldown: 45000,
    emoji: '💰',
  },
  no_keys: {
    id: 'no_keys',
    text: 'I need a key to open locked gates!',
    type: 'thought',
    priority: 4,
    duration: 5250,
    cooldown: 60000,
    emoji: '🔑',
  },

  // ── Status-aware triggers (#111) ──
  low_energy: {
    id: 'low_energy',
    text: 'Getting hungry... need a snack!',
    type: 'thought',
    priority: 5,
    duration: 5250,
    cooldown: 45000,
    emoji: '🍎',
  },
  critical_energy: {
    id: 'critical_energy',
    text: 'Stomach growling — not eating worms yet!',
    type: 'thought',
    priority: 7,
    duration: 6000,
    cooldown: 30000,
    emoji: '😫',
  },
  low_hydration: {
    id: 'low_hydration',
    text: 'So thirsty... is there water nearby?',
    type: 'thought',
    priority: 5,
    duration: 5250,
    cooldown: 45000,
    emoji: '💧',
  },
  critical_hydration: {
    id: 'critical_hydration',
    text: 'Need water! Throat is so dry...',
    type: 'thought',
    priority: 7,
    duration: 6000,
    cooldown: 30000,
    emoji: '🏜️',
  },
  low_cleanliness: {
    id: 'low_cleanliness',
    text: 'Starting to feel grimy... soap would help!',
    type: 'thought',
    priority: 4,
    duration: 5250,
    cooldown: 60000,
    emoji: '🧼',
  },
  critical_cleanliness: {
    id: 'critical_cleanliness',
    text: 'Flies are buzzing... need to get clean!',
    type: 'thought',
    priority: 6,
    duration: 6000,
    cooldown: 30000,
    emoji: '🪰',
  },
  status_combo_bad: {
    id: 'status_combo_bad',
    text: 'Tired, hungry, AND dirty? What a day!',
    type: 'thought',
    priority: 8,
    duration: 6000,
    cooldown: 60000,
    emoji: '😵',
  },

  // ── Shop/merchant proximity (#111) ──
  near_shop: {
    id: 'near_shop',
    text: 'That shop might have snacks!',
    type: 'thought',
    priority: 4,
    duration: 4500,
    cooldown: 45000,
    emoji: '🛍️',
  },

  // ── Injury hints (#109) ──
  ouch_injury: {
    id: 'ouch_injury',
    text: 'Ouch! That really hurt!',
    type: 'speech',
    priority: 8,
    duration: 3750,
    cooldown: 10000,
    emoji: '🤕',
  },
  need_bandaid: {
    id: 'need_bandaid',
    text: 'My knee hurts... I need a bandaid!',
    type: 'thought',
    priority: 6,
    duration: 5250,
    cooldown: 30000,
    emoji: '🩹',
  },
  injury_near_shop: {
    id: 'injury_near_shop',
    text: 'Ouch, knee hurts... that shop might have bandaids!',
    type: 'thought',
    priority: 7,
    duration: 5250,
    cooldown: 45000,
    emoji: '🏪',
  },

  // #110 Outhouse hints
  outhouse_dirty: {
    id: 'outhouse_dirty',
    text: 'Eww, I\'m so dirty... I need an outhouse!',
    type: 'thought',
    priority: 6,
    duration: 4500,
    cooldown: 30000,
    emoji: '🚽',
  },
  outhouse_near: {
    id: 'outhouse_near',
    text: 'An outhouse! I can freshen up in there!',
    type: 'thought',
    priority: 7,
    duration: 4500,
    cooldown: 20000,
    emoji: '🚽',
  },

  // ── Nearby interactive prompts ──
  near_npc: {
    id: 'near_npc',
    text: 'Someone\'s nearby... maybe I should talk to them?',
    type: 'thought',
    priority: 5,
    duration: 4500,
    cooldown: 30000,
    emoji: '💬',
  },
  near_gate: {
    id: 'near_gate',
    text: 'A gate! Press Space to try it!',
    type: 'thought',
    priority: 5,
    duration: 4500,
    cooldown: 30000,
    emoji: '🚪',
  },
  near_chest: {
    id: 'near_chest',
    text: 'Ooh, a treasure chest!',
    type: 'speech',
    priority: 6,
    duration: 3750,
    cooldown: 20000,
    emoji: '📦',
  },

  // ── Wildlife reactions ──
  wildlife_spotted: {
    id: 'wildlife_spotted',
    text: 'Look, a little creature!',
    type: 'speech',
    priority: 2,
    duration: 3750,
    cooldown: 40000,
    emoji: '🐾',
  },

  // ── Biome transitions ──
  biome_forest: {
    id: 'biome_forest',
    text: 'The trees are getting thicker here...',
    type: 'thought',
    priority: 4,
    duration: 5250,
    cooldown: 120000,
    emoji: '🌲',
  },
  biome_cave: {
    id: 'biome_cave',
    text: 'It\'s dark in here. Better be careful!',
    type: 'thought',
    priority: 5,
    duration: 5250,
    cooldown: 120000,
    emoji: '🕯️',
  },
  biome_castle: {
    id: 'biome_castle',
    text: 'Whoa, a castle! This looks important...',
    type: 'speech',
    priority: 6,
    duration: 5250,
    cooldown: 120000,
    emoji: '🏰',
  },

  // ── Quiz encouragement ──
  quiz_streak: {
    id: 'quiz_streak',
    text: 'I\'m on a roll! Keep it up!',
    type: 'speech',
    priority: 3,
    duration: 3750,
    cooldown: 60000,
    emoji: '🌟',
  },
  quiz_wrong: {
    id: 'quiz_wrong',
    text: 'Hmm, I should check the Book for that...',
    type: 'thought',
    priority: 3,
    duration: 4500,
    cooldown: 30000,
    emoji: '📖',
  },

  // ── Time of day ──
  nightfall: {
    id: 'nightfall',
    text: 'It\'s getting dark... the nocturnal creatures are waking up!',
    type: 'thought',
    priority: 4,
    duration: 6000,
    cooldown: 300000,
    emoji: '🌙',
  },
  dawn: {
    id: 'dawn',
    text: 'The sun is rising! A new day of adventure!',
    type: 'speech',
    priority: 3,
    duration: 5250,
    cooldown: 300000,
    emoji: '🌅',
  },

  // ── Exploration nudges ──
  explore_new_area: {
    id: 'explore_new_area',
    text: 'I haven\'t been here before. Let\'s explore!',
    type: 'thought',
    priority: 2,
    duration: 4500,
    cooldown: 60000,
    emoji: '🗺️',
  },
  far_from_spawn: {
    id: 'far_from_spawn',
    text: 'I\'ve come a long way from where I started!',
    type: 'thought',
    priority: 1,
    duration: 4500,
    cooldown: 180000,
    emoji: '🚶',
  },

  // ── Difficulty warnings ──
  danger_zone: {
    id: 'danger_zone',
    text: 'This area feels dangerous... the quizzes will be harder here!',
    type: 'thought',
    priority: 7,
    duration: 6000,
    cooldown: 120000,
    emoji: '⚠️',
  },

  // ── Flashlight hints ──
  dark_no_flashlight: {
    id: 'dark_no_flashlight',
    text: 'It\'s so dark! I should try pressing F for my flashlight.',
    type: 'thought',
    priority: 6,
    duration: 6000,
    cooldown: 90000,
    emoji: '🔦',
  },

  // ── Stream & desperation hints (#110 Phase 3) ──
  near_water: {
    id: 'near_water',
    text: 'Water! I could drink from that stream...',
    type: 'thought',
    priority: 4,
    duration: 4500,
    cooldown: 45000,
    emoji: '💧',
  },
  stream_eww: {
    id: 'stream_eww',
    text: 'Eww... my tummy feels weird. Maybe I drank too much stream water!',
    type: 'speech',
    priority: 8,
    duration: 5250,
    cooldown: 30000,
    emoji: '🤢',
  },
  starving_worms: {
    id: 'starving_worms',
    text: 'SO hungry... I could eat a worm right now! Press Space on the ground...',
    type: 'thought',
    priority: 9,
    duration: 6000,
    cooldown: 20000,
    emoji: '🐛',
  },
};

/** Maximum number of bubbles that can be queued at once. */
export const MAX_BUBBLE_QUEUE = 4;

/** Minimum gap between any two bubbles (ms). */
export const MIN_BUBBLE_GAP = 2500;

/** Maximum number of messages to keep in history (#135). */
export const MAX_HISTORY_SIZE = 5;
