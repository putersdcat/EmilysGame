/**
 * config/entropy.config.ts - LLM entropy system configuration.
 * Defines verb/noun lookup tables for directional input mapping,
 * prompt templates, and fallback wordlists.
 */

// ─── Directional Verb/Noun Mapping ──────────────────────────
// When the player crosses a chunk edge, their movement direction
// selects a random verb + noun from these tables. This pair is
// then sent to the LLM for entropy generation.

export interface DirectionWordTable {
  verbs: string[];
  nouns: string[];
}

export const DIRECTION_WORDS: Record<string, DirectionWordTable> = {
  up: {
    verbs: ['ascend', 'soar', 'propel', 'illuminate', 'transcend', 'catapult', 'elevate'],
    nouns: ['flux', 'zenith', 'vortex', 'aurora', 'pinnacle', 'constellation', 'nebula'],
  },
  down: {
    verbs: ['descend', 'plunge', 'retreat', 'excavate', 'dissolve', 'submerge', 'crumble'],
    nouns: ['abyss', 'void', 'echo', 'cavern', 'labyrinth', 'phantom', 'sinkhole'],
  },
  left: {
    verbs: ['deviate', 'wander', 'branch', 'fracture', 'unravel', 'oscillate', 'spiral'],
    nouns: ['shadow', 'maze', 'whisper', 'mirage', 'paradox', 'riddle', 'shimmer'],
  },
  right: {
    verbs: ['advance', 'charge', 'forge', 'ignite', 'accelerate', 'conquer', 'blaze'],
    nouns: ['horizon', 'forge', 'dawn', 'tempest', 'frontier', 'catalyst', 'beacon'],
  },
};

// ─── Prompt Templates ────────────────────────────────────────
// String templates for LLM calls. Use {placeholders} for injection.

export const ENTROPY_PROMPTS = {
  /**
   * Wordlist generation (game start) — tuned for speed.
   * Shorter prompt, clear format, stop at 51 to limit output.
   * ~200 tokens expected output for 50 pairs.
   */
  wordlistInit: `List 50 random verb-noun pairs (10+ letters each). Surreal and unrelated. Format: "1. verb noun" per line.\n1.`,

  /** Entropy sentence from a verb-noun pair (chunk generation) */
  entropyExpand: `Elaborate wildly on "{pair}" in 1-2 absurd, surreal sentences. Make it completely nonsensical. Do not explain, just write the sentences.`,

  /** Chained entropy (includes prior context) */
  entropyChained: `Build on this previous thought: "{previous}". Now elaborate wildly on "{pair}" in 1-2 absurd sentences. Make it surreal and disconnected from reality.`,

  /** NPC chat system prompt wrapper */
  npcChat: `{persona}\n\nThe player says: "{playerInput}"\n\nRespond in character, keeping it under 2 sentences.`,

  /** Quiz question rephrasing */
  quizRephrase: `As a wise and quirky owl in a fantasy adventure, rephrase this question in a fun, rhyming or playful way. Keep the same meaning:\n\nOriginal: "{question}"\n\nRephrased:`,
} as const;

// ─── Fallback Wordlist ───────────────────────────────────────
// Used when LLM is unavailable or times out.
// 50 pre-generated verb-noun pairs.

export const FALLBACK_WORDLIST: string[] = [
  'obliterate quasar',
  'fabricate nebula',
  'concatenate whirlpool',
  'disintegrate mammoth',
  'evaporate thunderclap',
  'illuminate spaghetti',
  'transfigure rhinoceros',
  'amalgamate kaleidoscope',
  'perpetuate dragonfly',
  'crystallize earthquake',
  'defenestrate porcupine',
  'extrapolate marshmallow',
  'hallucinate spacecraft',
  'metamorphose blueberry',
  'procrastinate avalanche',
  'recalibrate dinosaur',
  'teleportate watermelon',
  'ventriloquize telescope',
  'circumnavigate jellyfish',
  'deconstruct harmonica',
  'extemporize flamingo',
  'hyperbolize snorkeling',
  'incapacitate bubblegum',
  'juxtaposing catapult',
  'legitimatize rollercoaster',
  'miniaturize trampoline',
  'obliterating chandelier',
  'procrastinate fireworks',
  'resuscitating labyrinth',
  'sophisticate pineapple',
  'orchestrating marmalade',
  'decompartment spaceship',
  'interstellar honeycomb',
  'electrifying mushroom',
  'unscrambling fishstick',
  'hallucinated bumblebee',
  'reconstitute xylophone',
  'discombobulate pigeonhole',
  'serendipitous thunderbolt',
  'phantasmagoric sombrero',
  'discombobulate hamburger',
  'transcontinental penguin',
  'electromagical dandelion',
  'recombobulate avalanche',
  'phosphorescent butterfly',
  'discombobulate lampshade',
  'quintessential cucumber',
  'phantasmagoric jellybean',
  'anthropomorphize starfish',
  'uncharacteristic bluebird',
];
