/**
 * status-bars.ts — Survival status bars (#70) in the sidebar +
 * mini meters shown when sidebar is collapsed (#138).
 *
 * Energy, hydration, cleanliness. Throttled to every 12th call
 * (~5fps at 60fps) since these change slowly.
 *
 * B7.5 — extracted from `ui.ts` (#270).
 */
import type { PlayerStatus } from '../game/status';
import type { InjuryState } from '../game/injury';
import { getDebuffs } from '../game/status';

let lastStatusSyncFrame = 0;

/** Sync survival status bars in sidebar. Call from game loop. */
export function syncStatusBars(status: PlayerStatus, injury?: InjuryState): void {
  // Throttle to every 12th call
  lastStatusSyncFrame++;
  if (lastStatusSyncFrame % 12 !== 0) return;

  const bars: Array<{ id: string; valId: string; value: number }> = [
    { id: 'sbEnergy', valId: 'sbEnergyVal', value: status.energy },
    { id: 'sbHydration', valId: 'sbHydrationVal', value: status.hydration },
    { id: 'sbCleanliness', valId: 'sbCleanlinessVal', value: status.cleanliness },
  ];

  for (const bar of bars) {
    const fill = document.getElementById(bar.id);
    const val = document.getElementById(bar.valId);
    if (fill) {
      fill.style.width = `${Math.max(0, Math.min(100, bar.value))}%`;
      // Add warning classes
      fill.classList.toggle('critical', bar.value <= 15);
      fill.classList.toggle('low', bar.value > 15 && bar.value <= 30);
    }
    if (val) val.textContent = String(Math.round(bar.value));
  }

  // Debuff list (includes injury indicator #109)
  const debuffs = getDebuffs(status);
  const allDebuffs = [...debuffs.activeDebuffs];
  if (injury?.injured) allDebuffs.push('🩹 Injured');
  const debuffEl = document.getElementById('sbDebuffs');
  if (debuffEl) {
    debuffEl.textContent = allDebuffs.length > 0
      ? allDebuffs.join(' · ')
      : '';
  }

  // Mini status meters (#138 — sync when sidebar collapsed)
  const miniMeters: Array<{ id: string; valId: string; value: number }> = [
    { id: 'miniEnergy', valId: 'miniEnergyVal', value: status.energy },
    { id: 'miniHydration', valId: 'miniHydrationVal', value: status.hydration },
    { id: 'miniCleanliness', valId: 'miniCleanlinessVal', value: status.cleanliness },
  ];
  for (const m of miniMeters) {
    const fill = document.getElementById(m.id);
    const val = document.getElementById(m.valId);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, m.value))}%`;
    if (val) val.textContent = String(Math.round(m.value));
  }
}
