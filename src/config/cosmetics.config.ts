/**
 * cosmetics.config.ts - Progression-gated cosmetic unlockables.
 * Defines which customizer options are locked + their unlock conditions.
 * TODO: DOC - cosmetics unlock system
 */

// ─── Unlock Condition Types ─────────────────────────────────

export type UnlockConditionType = 'quiz_correct' | 'wildlife_discovered' | 'quiz_answered';

export interface UnlockCondition {
  type: UnlockConditionType;
  threshold: number;
}

// ─── Unlockable Cosmetic ────────────────────────────────────

export interface UnlockableCosmetic {
  id: string;
  category: 'hairColor' | 'outfitColor' | 'skinTone' | 'hairStyle';
  name: string;
  /** Hex color (for color categories) or style value (for hairStyle) */
  value: string;
  condition: UnlockCondition;
  /** Short hint shown on locked tooltip */
  hint: string;
}

// ─── Unlockable Cosmetics Registry ──────────────────────────

export const UNLOCKABLE_COSMETICS: UnlockableCosmetic[] = [
  // ── Premium Hair Colors ──
  {
    id: 'hair_rainbow',
    category: 'hairColor',
    name: 'Rainbow',
    value: '#FF6B6B',
    condition: { type: 'quiz_correct', threshold: 5 },
    hint: 'Answer 5 quizzes correctly',
  },
  {
    id: 'hair_galaxy',
    category: 'hairColor',
    name: 'Galaxy',
    value: '#6B5FE6',
    condition: { type: 'quiz_correct', threshold: 15 },
    hint: 'Answer 15 quizzes correctly',
  },
  {
    id: 'hair_frost',
    category: 'hairColor',
    name: 'Frost',
    value: '#B8E6FF',
    condition: { type: 'wildlife_discovered', threshold: 5 },
    hint: 'Discover 5 wildlife species',
  },

  // ── Premium Outfit Colors ──
  {
    id: 'outfit_gold',
    category: 'outfitColor',
    name: 'Gold',
    value: '#FFD700',
    condition: { type: 'quiz_correct', threshold: 10 },
    hint: 'Answer 10 quizzes correctly',
  },
  {
    id: 'outfit_starlight',
    category: 'outfitColor',
    name: 'Starlight',
    value: '#E8D8F0',
    condition: { type: 'wildlife_discovered', threshold: 8 },
    hint: 'Discover 8 wildlife species',
  },
  {
    id: 'outfit_emerald',
    category: 'outfitColor',
    name: 'Emerald',
    value: '#50C878',
    condition: { type: 'quiz_correct', threshold: 20 },
    hint: 'Answer 20 quizzes correctly',
  },
];

// ─── Helpers ────────────────────────────────────────────────

/** Get all unlockables for a given category */
export function getUnlockablesForCategory(category: UnlockableCosmetic['category']): UnlockableCosmetic[] {
  return UNLOCKABLE_COSMETICS.filter(c => c.category === category);
}

/** Progression data shape for condition checking */
export interface ProgressionData {
  quizCorrect: number;
  quizAnswered: number;
  wildlifeDiscovered: number;
}

/** Check if a single cosmetic's unlock condition is met */
export function isConditionMet(condition: UnlockCondition, progress: ProgressionData): boolean {
  switch (condition.type) {
    case 'quiz_correct':
      return progress.quizCorrect >= condition.threshold;
    case 'quiz_answered':
      return progress.quizAnswered >= condition.threshold;
    case 'wildlife_discovered':
      return progress.wildlifeDiscovered >= condition.threshold;
    default:
      return false;
  }
}

/**
 * Check all cosmetics against current progression.
 * Returns array of newly unlocked cosmetic IDs (not previously in unlockedSet).
 */
export function checkAllUnlocks(
  progress: ProgressionData,
  alreadyUnlocked: Set<string>,
): string[] {
  const newUnlocks: string[] = [];
  for (const cosmetic of UNLOCKABLE_COSMETICS) {
    if (!alreadyUnlocked.has(cosmetic.id) && isConditionMet(cosmetic.condition, progress)) {
      newUnlocks.push(cosmetic.id);
    }
  }
  return newUnlocks;
}

/** Get cosmetic by ID */
export function getCosmeticById(id: string): UnlockableCosmetic | undefined {
  return UNLOCKABLE_COSMETICS.find(c => c.id === id);
}
