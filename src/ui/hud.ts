/**
 * hud.ts — Bottom HUD bar sync (coins, keys, difficulty, LLM dot,
 * time, weather, flashlight).
 *
 * Pure DOM-mutation function. No allocations beyond what `getElementById`
 * already costs. Called every frame from the orchestrator in `ui.ts`.
 *
 * B7.1 — extracted from `ui.ts` (#270) to keep the orchestrator focused
 * on dispatch and the HUD focused on the HUD.
 */
import { WORLD_CONFIG, getDifficulty } from '../config/game.config';
import { isLlmAvailable } from '../engine/llm';
import { getTimeOfDay } from '../rendering/lighting';
import { getWeatherInfo } from '../rendering/weather';
import { isFlashlightOn } from '../rendering/local-lights';
import type { Inventory } from '../game/inventory';

const TIER_EMOJI: Record<number, string> = { 0: '🟢', 1: '🟡', 2: '🟠', 3: '🔴', 4: '💀' };
const TIER_CLASS: Record<number, string> = {
  0: 'tier-safe',
  1: 'tier-easy',
  2: 'tier-medium',
  3: 'tier-hard',
  4: 'tier-extreme',
};

/** Sync the bottom HUD bar (coins, keys, difficulty, time, weather, etc). */
export function syncHUD(inv: Inventory, playerPos: { x: number; y: number }): void {
  const coinEl = document.getElementById('coinStat');
  const keyEl = document.getElementById('keyStat');
  const llmDot = document.getElementById('llmDot');
  const diffEl = document.getElementById('difficultyBadge');
  if (coinEl) coinEl.textContent = `💰 ${inv.countItem('coin')}`;
  if (keyEl) keyEl.textContent = `🔑 ${inv.countItem('key')}`;
  if (diffEl) {
    const chunkSize = WORLD_CONFIG.chunkSize;
    const cx = Math.floor(playerPos.x / chunkSize);
    const cy = Math.floor(playerPos.y / chunkSize);
    const dist = Math.abs(cx) + Math.abs(cy);
    const diff = getDifficulty(dist);
    const emoji = TIER_EMOJI[diff.tier] ?? '🟢';
    const cls = TIER_CLASS[diff.tier] ?? 'tier-safe';
    diffEl.textContent = `${emoji} ${diff.tierName}`;
    diffEl.className = `hud-stat ${cls}`;
  }
  if (llmDot) {
    const ok = isLlmAvailable();
    llmDot.className = ok ? '' : 'off';
    llmDot.id = 'llmDot';
    llmDot.title = ok ? 'LLM: connected' : 'LLM: disconnected';
  }
  // Time of day badge
  const timeEl = document.getElementById('timeBadge');
  if (timeEl) {
    timeEl.textContent = getTimeOfDay();
  }
  // Weather badge
  const weatherEl = document.getElementById('weatherBadge');
  if (weatherEl) {
    const w = getWeatherInfo();
    weatherEl.textContent = `${w.emoji} ${w.label}`;
  }
  // Flashlight badge
  const flashEl = document.getElementById('flashlightBadge');
  if (flashEl) {
    flashEl.textContent = isFlashlightOn() ? '🔦 On' : '🔦 Off';
    flashEl.style.opacity = isFlashlightOn() ? '1' : '0.5';
  }
}
