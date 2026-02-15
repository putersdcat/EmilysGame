/**
 * thought-bubbles.ts - Contextual thought/speech bubble hint system.
 * Manages a priority queue of hints, cooldown tracking, and DOM sync.
 * Bubbles appear near the player's screen position as DOM overlays.
 * TODO: DOC - bubble system architecture
 */

import { HINTS, MAX_BUBBLE_QUEUE, MIN_BUBBLE_GAP, type HintDef, type BubbleType } from './config/hints.config';

// ─── Types ───────────────────────────────────────────────────

interface QueuedBubble {
  hint: HintDef;
  /** When this bubble was queued (ms). */
  queuedAt: number;
}

interface ActiveBubble {
  hint: HintDef;
  /** When the bubble started showing (ms). */
  startedAt: number;
  /** When it expires (ms). */
  expiresAt: number;
}

interface BubbleState {
  queue: QueuedBubble[];
  active: ActiveBubble | null;
  /** Per-hint-ID cooldown expiry timestamps. */
  cooldowns: Map<string, number>;
  /** Last time any bubble was shown (ms). */
  lastShownAt: number;
  /** Whether bubbles are enabled. */
  enabled: boolean;
  /** Screen coords for positioning (updated from main). */
  screenX: number;
  screenY: number;
}

// ─── Module State ────────────────────────────────────────────

const state: BubbleState = {
  queue: [],
  active: null,
  cooldowns: new Map(),
  lastShownAt: 0,
  enabled: true,
  screenX: 0,
  screenY: 0,
};

// DOM refs (cached on first use)
let bubbleEl: HTMLElement | null = null;
let bubbleTextEl: HTMLElement | null = null;
let bubbleEmojiEl: HTMLElement | null = null;

function ensureDom(): void {
  if (bubbleEl) return;
  bubbleEl = document.getElementById('thoughtBubble');
  bubbleTextEl = document.getElementById('bubbleText');
  bubbleEmojiEl = document.getElementById('bubbleEmoji');
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Try to queue a hint by ID. Respects cooldowns, priority, and queue limits.
 * If the hint is on cooldown or already queued, this is a no-op.
 */
export function triggerHint(hintId: string): void {
  if (!state.enabled) return;
  const hint = HINTS[hintId];
  if (!hint) return;

  const now = Date.now();

  // Check cooldown
  const cooldownExpiry = state.cooldowns.get(hintId) ?? 0;
  if (now < cooldownExpiry) return;

  // Already in queue?
  if (state.queue.some(q => q.hint.id === hintId)) return;

  // Already showing this hint?
  if (state.active?.hint.id === hintId) return;

  // Add to queue
  state.queue.push({ hint, queuedAt: now });

  // Sort by priority descending (highest first)
  state.queue.sort((a, b) => b.hint.priority - a.hint.priority);

  // Trim queue to max size (drop lowest priority)
  if (state.queue.length > MAX_BUBBLE_QUEUE) {
    state.queue.length = MAX_BUBBLE_QUEUE;
  }
}

/**
 * Trigger a hint with custom text (for dynamic messages).
 * Creates a transient hint def — not tracked in HINTS.
 */
export function triggerCustomHint(
  id: string,
  text: string,
  type: BubbleType = 'thought',
  priority = 3,
  duration = 3000,
  cooldown = 30000,
  emoji?: string,
): void {
  if (!state.enabled) return;
  const now = Date.now();

  const cooldownExpiry = state.cooldowns.get(id) ?? 0;
  if (now < cooldownExpiry) return;
  if (state.queue.some(q => q.hint.id === id)) return;
  if (state.active?.hint.id === id) return;

  const hint: HintDef = { id, text, type, priority, duration, cooldown, emoji };
  state.queue.push({ hint, queuedAt: now });
  state.queue.sort((a, b) => b.hint.priority - a.hint.priority);
  if (state.queue.length > MAX_BUBBLE_QUEUE) {
    state.queue.length = MAX_BUBBLE_QUEUE;
  }
}

/**
 * Update bubble screen position (call from render loop with player screen coords).
 */
export function updateBubblePosition(screenX: number, screenY: number): void {
  state.screenX = screenX;
  state.screenY = screenY;
}

/**
 * Tick the bubble system. Call from game loop (throttled, not every frame).
 * Promotes queued hints to active, expires old bubbles, syncs DOM.
 */
export function tickBubbles(): void {
  ensureDom();
  const now = Date.now();

  // Expire active bubble
  if (state.active && now >= state.active.expiresAt) {
    state.active = null;
  }

  // Promote next queued bubble if nothing active and gap elapsed
  if (!state.active && state.queue.length > 0 && now - state.lastShownAt >= MIN_BUBBLE_GAP) {
    const next = state.queue.shift()!;
    state.active = {
      hint: next.hint,
      startedAt: now,
      expiresAt: now + next.hint.duration,
    };
    state.lastShownAt = now;
    // Set cooldown
    state.cooldowns.set(next.hint.id, now + next.hint.cooldown);
  }

  // Expire stale queue entries (>10s old without being shown)
  const staleThreshold = 10000;
  state.queue = state.queue.filter(q => now - q.queuedAt < staleThreshold);

  // Sync to DOM
  syncBubbleDom(now);
}

/**
 * Force-dismiss any active bubble.
 */
export function dismissBubble(): void {
  state.active = null;
  syncBubbleDom(Date.now());
}

/**
 * Clear all bubbles and queue.
 */
export function clearBubbles(): void {
  state.queue = [];
  state.active = null;
  state.lastShownAt = 0; // Reset gap timer so next bubble can show immediately
  syncBubbleDom(Date.now());
}

/**
 * Enable/disable bubbles.
 */
export function setBubblesEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) clearBubbles();
}

/**
 * Get current bubble state for testing.
 */
export function getBubbleState(): {
  active: { id: string; text: string; type: BubbleType } | null;
  queueLength: number;
  enabled: boolean;
} {
  return {
    active: state.active ? {
      id: state.active.hint.id,
      text: state.active.hint.text,
      type: state.active.hint.type,
    } : null,
    queueLength: state.queue.length,
    enabled: state.enabled,
  };
}

/**
 * Reset cooldowns (useful for testing).
 */
export function resetCooldowns(): void {
  state.cooldowns.clear();
}

// ─── DOM Sync ────────────────────────────────────────────────

function syncBubbleDom(now: number): void {
  if (!bubbleEl) return;

  if (!state.active) {
    bubbleEl.style.display = 'none';
    return;
  }

  const { hint, startedAt, expiresAt } = state.active;
  const elapsed = now - startedAt;
  const remaining = expiresAt - now;

  // Fade in/out timing
  const fadeInMs = 300;
  const fadeOutMs = 500;
  let opacity = 1;
  if (elapsed < fadeInMs) {
    opacity = elapsed / fadeInMs;
  } else if (remaining < fadeOutMs) {
    opacity = Math.max(0, remaining / fadeOutMs);
  }

  // Position: above player, clamped to viewport
  const gameContainer = document.getElementById('gameContainer');
  const containerRect = gameContainer?.getBoundingClientRect();
  const containerW = containerRect?.width ?? window.innerWidth;
  const containerH = containerRect?.height ?? window.innerHeight;

  // Bubble positioned above player sprite
  const bubbleW = 220;
  const bubbleH = 60; // approximate
  let bx = state.screenX - bubbleW / 2;
  let by = state.screenY - 80; // above player head

  // Clamp to container bounds
  bx = Math.max(8, Math.min(bx, containerW - bubbleW - 8));
  by = Math.max(8, Math.min(by, containerH - bubbleH - 8));

  // Show and position
  bubbleEl.style.display = 'block';
  bubbleEl.style.left = `${bx}px`;
  bubbleEl.style.top = `${by}px`;
  bubbleEl.style.opacity = String(opacity);

  // Type styling
  bubbleEl.className = `thought-bubble bubble-${hint.type}`;

  // Content
  if (bubbleEmojiEl) {
    bubbleEmojiEl.textContent = hint.emoji ?? (hint.type === 'thought' ? '💭' : '💬');
  }
  if (bubbleTextEl) {
    bubbleTextEl.textContent = hint.text;
  }
}
