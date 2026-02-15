/**
 * config/wildlife.config.ts - Wildlife species definitions and spawn tables.
 * Drives the deterministic wildlife layer (#68).
 * Species are grouped by time-of-day preference and habitat type.
 * TODO: DOC - wildlife species table, spawn rules
 */

// ─── Types ──────────────────────────────────────────────────

export type TimeSlot = 'day' | 'dusk' | 'night';
export type Habitat = 'land' | 'water_adjacent';

export interface SpeciesDef {
  id: string;
  emoji: string;
  name: string;
  /** Which biomes this species appears in (empty = all) */
  biomes: string[];
  /** Time-of-day preference */
  time: TimeSlot[];
  /** Habitat requirement */
  habitat: Habitat;
  /** Scale factor for rendering (0.4 - 0.8 typical) */
  scale: number;
  /** Spawn weight within its group (higher = more common) */
  weight: number;
  /** Whether player can interact with this creature */
  interactable: boolean;
  /** Fun fact / educational text for inspection */
  fact: string;
  /** Quiz category association for educational hooks */
  quizCategory?: string;
  /** Idle animation style */
  animStyle: 'bob' | 'hop' | 'sway' | 'swim' | 'flutter' | 'still';
  /** Movement speed (grid units per frame, 0 = stationary) */
  wanderSpeed: number;
  /** Flee distance threshold (grid units from player) */
  fleeRadius: number;
  /** Flip rule for directionality (#80):
   *  'movement' = face travel direction, 'random' = random per spawn, 'none' = never flip */
  flipRule: 'movement' | 'random' | 'none';
}

// ─── Species Table ──────────────────────────────────────────

export const SPECIES: SpeciesDef[] = [
  // ─── Day Land Creatures ───
  {
    id: 'rabbit', emoji: '🐇', name: 'Rabbit',
    biomes: ['meadow', 'forest'], time: ['day'], habitat: 'land',
    scale: 0.5, weight: 3, interactable: true,
    fact: 'Rabbits can rotate their ears 270° to detect sounds from any direction!',
    quizCategory: 'science', animStyle: 'hop', wanderSpeed: 0.02, fleeRadius: 3,
    flipRule: 'movement',
  },
  {
    id: 'squirrel', emoji: '🐿️', name: 'Squirrel',
    biomes: ['forest', 'meadow'], time: ['day'], habitat: 'land',
    scale: 0.45, weight: 2, interactable: true,
    fact: 'Squirrels plant thousands of trees each year by forgetting where they buried their acorns!',
    quizCategory: 'science', animStyle: 'hop', wanderSpeed: 0.03, fleeRadius: 4,
    flipRule: 'movement',
  },
  {
    id: 'deer', emoji: '🦌', name: 'Deer',
    biomes: ['meadow', 'forest'], time: ['day', 'dusk'], habitat: 'land',
    scale: 0.7, weight: 1, interactable: true,
    fact: 'Deer can jump up to 10 feet high and 30 feet in a single bound!',
    quizCategory: 'science', animStyle: 'sway', wanderSpeed: 0.01, fleeRadius: 5,
    flipRule: 'movement',
  },
  {
    id: 'hedgehog', emoji: '🦔', name: 'Hedgehog',
    biomes: ['meadow', 'forest'], time: ['day', 'dusk'], habitat: 'land',
    scale: 0.4, weight: 2, interactable: true,
    fact: 'Hedgehogs have about 5,000 to 7,000 spines on their back!',
    quizCategory: 'science', animStyle: 'bob', wanderSpeed: 0.005, fleeRadius: 2,
    flipRule: 'movement',
  },

  // ─── Dusk/Dawn Creatures ───
  {
    id: 'fox', emoji: '🦊', name: 'Fox',
    biomes: ['forest', 'meadow'], time: ['dusk'], habitat: 'land',
    scale: 0.55, weight: 2, interactable: true,
    fact: 'A fox\'s tail helps them balance and keeps them warm in winter like a blanket!',
    quizCategory: 'science', animStyle: 'sway', wanderSpeed: 0.015, fleeRadius: 5,
    flipRule: 'movement',
  },
  {
    id: 'raccoon', emoji: '🦝', name: 'Raccoon',
    biomes: ['forest'], time: ['dusk', 'night'], habitat: 'land',
    scale: 0.5, weight: 2, interactable: true,
    fact: 'Raccoons wash their food before eating it — their name means "one who washes" in Algonquian!',
    quizCategory: 'history', animStyle: 'bob', wanderSpeed: 0.01, fleeRadius: 3,
    flipRule: 'movement',
  },

  // ─── Night Creatures ───
  {
    id: 'owl', emoji: '🦉', name: 'Owl',
    biomes: ['forest', 'cave'], time: ['night'], habitat: 'land',
    scale: 0.55, weight: 3, interactable: true,
    fact: 'Owls can rotate their heads up to 270° because they can\'t move their eyeballs!',
    quizCategory: 'science', animStyle: 'sway', wanderSpeed: 0, fleeRadius: 6,
    flipRule: 'random',
  },
  {
    id: 'bat', emoji: '🦇', name: 'Bat',
    biomes: ['cave', 'forest', 'castle'], time: ['night', 'dusk'], habitat: 'land',
    scale: 0.4, weight: 3, interactable: true,
    fact: 'Bats are the only mammals that can truly fly — and they eat thousands of insects each night!',
    quizCategory: 'science', animStyle: 'flutter', wanderSpeed: 0.025, fleeRadius: 4,
    flipRule: 'movement',
  },
  {
    id: 'wolf', emoji: '🐺', name: 'Wolf',
    biomes: ['forest'], time: ['night'], habitat: 'land',
    scale: 0.6, weight: 1, interactable: true,
    fact: 'Wolves howl to communicate with each other over distances of up to 10 miles!',
    quizCategory: 'science', animStyle: 'still', wanderSpeed: 0.008, fleeRadius: 6,
    flipRule: 'movement',
  },

  // ─── Water-Adjacent Creatures ───
  {
    id: 'frog', emoji: '🐸', name: 'Frog',
    biomes: ['meadow', 'forest'], time: ['day', 'dusk', 'night'], habitat: 'water_adjacent',
    scale: 0.4, weight: 4, interactable: true,
    fact: 'Some frogs can freeze solid in winter and thaw back to life in spring!',
    quizCategory: 'science', animStyle: 'hop', wanderSpeed: 0.01, fleeRadius: 3,
    flipRule: 'movement',
  },
  {
    id: 'turtle', emoji: '🐢', name: 'Turtle',
    biomes: ['meadow', 'forest'], time: ['day'], habitat: 'water_adjacent',
    scale: 0.5, weight: 2, interactable: true,
    fact: 'Some turtles can breathe through their butts — it\'s called cloacal respiration!',
    quizCategory: 'science', animStyle: 'bob', wanderSpeed: 0.003, fleeRadius: 2,
    flipRule: 'movement',
  },
  {
    id: 'duck', emoji: '🦆', name: 'Duck',
    biomes: ['meadow', 'forest'], time: ['day', 'dusk'], habitat: 'water_adjacent',
    scale: 0.5, weight: 3, interactable: true,
    fact: 'Ducks have waterproof feathers — even when they dive underwater, their inner down stays dry!',
    quizCategory: 'science', animStyle: 'swim', wanderSpeed: 0.008, fleeRadius: 3,
    flipRule: 'movement',
  },
  {
    id: 'heron', emoji: '🪿', name: 'Heron',
    biomes: ['meadow', 'forest'], time: ['day', 'dusk'], habitat: 'water_adjacent',
    scale: 0.6, weight: 1, interactable: true,
    fact: 'Herons stand perfectly still while fishing — they can wait for hours without moving!',
    quizCategory: 'science', animStyle: 'still', wanderSpeed: 0, fleeRadius: 5,
    flipRule: 'random',
  },
  {
    id: 'fish', emoji: '🐟', name: 'Fish',
    biomes: [], time: ['day', 'dusk', 'night'], habitat: 'water_adjacent',
    scale: 0.35, weight: 3, interactable: false,
    fact: 'Fish have been on Earth for more than 500 million years!',
    animStyle: 'swim', wanderSpeed: 0.015, fleeRadius: 4,
    flipRule: 'movement',
  },

  // ─── Cave/Castle Specials ───
  {
    id: 'spider', emoji: '🕷️', name: 'Spider',
    biomes: ['cave', 'castle'], time: ['day', 'dusk', 'night'], habitat: 'land',
    scale: 0.35, weight: 3, interactable: true,
    fact: 'Spiders recycle their webs by eating them and spinning new ones!',
    quizCategory: 'science', animStyle: 'still', wanderSpeed: 0.005, fleeRadius: 2,
    flipRule: 'random',
  },
  {
    id: 'rat', emoji: '🐀', name: 'Rat',
    biomes: ['cave', 'castle'], time: ['day', 'dusk', 'night'], habitat: 'land',
    scale: 0.35, weight: 2, interactable: true,
    fact: 'Rats can laugh when they\'re tickled — scientists discovered this using ultrasonic detectors!',
    quizCategory: 'science', animStyle: 'hop', wanderSpeed: 0.02, fleeRadius: 3,
    flipRule: 'movement',
  },
];

// ─── Lookup Helpers ─────────────────────────────────────────

const _speciesById = new Map<string, SpeciesDef>();
for (const s of SPECIES) _speciesById.set(s.id, s);

export function getSpecies(id: string): SpeciesDef | undefined {
  return _speciesById.get(id);
}

/** Max wildlife entities per chunk (keeps perf bounded) */
export const MAX_WILDLIFE_PER_CHUNK = 6;

/** How close player must be to interact (grid units) */
export const INTERACT_RANGE = 1.8;

/** Spawn density by biome (multiplier on base count). Unlisted biomes use 1.0 */
export const BIOME_DENSITY: Record<string, number> = {
  meadow: 1.2,
  forest: 1.0,
  cave: 0.6,
  castle: 0.4,
};
