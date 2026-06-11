/**
 * age-profile.ts - Player age band profile + content filtering.
 * Captures player age range and filters quiz/book content accordingly.
 * Falls back gracefully when filtered pools are too sparse.
 *
 * TODO: DOC - Age profile system and content filtering
 */

import type { AgeBand } from './types/content-pack.types';
import { contentPackLoader } from './asset-pipeline/content-loader';

// ─── Constants ──────────────────────────────────────────────

export const AGE_BANDS: { id: AgeBand; label: string; icon: string; range: string }[] = [
  { id: '5-7',   label: 'Explorer',     icon: '🌱', range: 'Ages 5–7' },
  { id: '8-10',  label: 'Adventurer',   icon: '⭐', range: 'Ages 8–10' },
  { id: '11-12+', label: 'Scholar',     icon: '🎓', range: 'Ages 11+' },
];

/** Minimum questions needed before we accept a filtered pool */
const MIN_QUIZ_POOL = 5;

// ─── State ──────────────────────────────────────────────────

export interface AgeProfile {
  /** Selected age band (null = not yet chosen, content unfiltered) */
  ageBand: AgeBand | null;
  /** Whether the player has completed age selection */
  profileSet: boolean;
}

export function createAgeProfile(): AgeProfile {
  return {
    ageBand: null,
    profileSet: false,
  };
}

// ─── Age Band Selection ─────────────────────────────────────

export function setAgeBand(profile: AgeProfile, band: AgeBand): void {
  profile.ageBand = band;
  profile.profileSet = true;
}

// ─── Age Range Helpers ──────────────────────────────────────

/** Get min/max age values for a given band */
function getAgeRange(band: AgeBand): { minAge: number; maxAge: number | null } {
  switch (band) {
    case '5-7':    return { minAge: 5, maxAge: 7 };
    case '8-10':   return { minAge: 8, maxAge: 10 };
    case '11-12+': return { minAge: 11, maxAge: null };
  }
}

// ─── Content Filtering ──────────────────────────────────────

/**
 * Filter pack quiz questions by age band with fallback.
 * Returns age-filtered pool if large enough, otherwise expands range.
 */
function getAgeFilteredQuizCount(band: AgeBand | null): {
  filtered: number;
  total: number;
  usedFallback: boolean;
} {
  if (!band || !contentPackLoader.isLoaded()) {
    return { filtered: 0, total: 0, usedFallback: false };
  }

  const total = contentPackLoader.getQuizzes().length;
  const range = getAgeRange(band);
  const filtered = contentPackLoader.filterQuizzes({
    minAge: range.minAge,
    maxAge: range.maxAge ?? undefined,
  });

  if (filtered.length >= MIN_QUIZ_POOL) {
    return { filtered: filtered.length, total, usedFallback: false };
  }

  // Fallback: expand age range by ±2 years
  const expanded = contentPackLoader.filterQuizzes({
    minAge: Math.max(5, range.minAge - 2),
    maxAge: range.maxAge !== null ? range.maxAge + 2 : undefined,
  });
  return { filtered: expanded.length, total, usedFallback: true };
}

// ─── Debug Stats ────────────────────────────────────────────

export function getAgeProfileDebug(profile: AgeProfile): {
  ageBand: AgeBand | null;
  profileSet: boolean;
  quizStats: { filtered: number; total: number; usedFallback: boolean };
} {
  return {
    ageBand: profile.ageBand,
    profileSet: profile.profileSet,
    quizStats: getAgeFilteredQuizCount(profile.ageBand),
  };
}
