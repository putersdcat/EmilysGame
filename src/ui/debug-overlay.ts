/**
 * debug-overlay.ts — F3-toggle debug overlay (FPS, pos, chunk, entropy, etc).
 *
 * Renders a small block of one-line status indicators at the top of
 * the screen. Pulls from many subsystems (terrain cache, LLM TPS,
 * entropy, perf, particles, streak, water, lock-key DAG).
 *
 * B7.3 — extracted from `ui.ts` (#270).
 */
import { WORLD_CONFIG } from '../config/game.config';
import { getTerrainCacheSize, getTerrainCacheMemoryMB } from '../rendering/terrain-cache';
import { getLlmTps, isTpsCutoverActive } from '../engine/llm';
import { getEntropyStats, getWaterDebugInfo, getLockKeyDebugInfo } from '../engine/gen';
import { perfStats } from '../engine/perf';
import { getParticleStats } from '../rendering/particles';
import { getShadowDebugInfo } from '../rendering/shadows';
import { getBlendIntensity } from '../rendering/terrain-cache';

/** Sync the F3 debug overlay. */
export function syncDebug(show: boolean, pos: { x: number; y: number }, fps: number): void {
  const el = document.getElementById('debugOverlay');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (!show) return;
  const cs = WORLD_CONFIG.chunkSize;
  const ws = WORLD_CONFIG.worldUnitSize;
  const cx = Math.floor(pos.x / cs);
  const cy = Math.floor(pos.y / cs);
  // World unit within chunk
  const localX = ((pos.x % cs) + cs) % cs;
  const localY = ((pos.y % cs) + cs) % cs;
  const wux = Math.floor(localX / ws);
  const wuy = Math.floor(localY / ws);

  const tps = getLlmTps();
  const cutover = isTpsCutoverActive();
  const tpsLabel = tps > 0
    ? `LLM TPS: ${tps}${cutover ? ' ⚠ CUTOVER' : ''}`
    : 'LLM TPS: —';

  const entropy = getEntropyStats();
  const entropyLabel = `Entropy: ${entropy.poolSize}ch/${entropy.feedCount}feeds`;

  el.innerHTML = [
    `FPS: ${fps}`,
    `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}`,
    `Chunk: ${cx},${cy}`,
    `WU: ${wux},${wuy}`,
    `Cache: ${getTerrainCacheSize()} chunks (${getTerrainCacheMemoryMB().toFixed(1)}MB)`,
    tpsLabel,
    entropyLabel,
    `Perf: R:${perfStats.render.toFixed(1)} P:${perfStats.particles.toFixed(1)} Wi:${perfStats.wildlife.toFixed(1)} L:${perfStats.lighting.toFixed(1)} Wx:${perfStats.weather.toFixed(1)} U:${perfStats.update.toFixed(1)} T:${perfStats.total.toFixed(1)}ms`,
    getShadowDebugInfo(),
    `Blend: intensity=${getBlendIntensity().toFixed(2)}`,
    (() => { const ps = getParticleStats(); return `Particles: ${ps.total} (\u{1F98B}${ps.butterfly} \u{2728}${ps.sparkle} \u{1F343}${ps.leaf} \u{1F426}${ps.bird})`; })(),
    // Streak debug (#103) — read from __gameDebug if available
    (() => {
      const dbg = (window as any).__gameDebug;
      if (!dbg?.getStreakDebug) return '';
      const s = dbg.getStreakDebug();
      return `Streak: ${s.zone} cc:${s.consecutiveCorrect} cw:${s.consecutiveWrong} wr:${isNaN(s.windowRate) ? '-' : (s.windowRate * 100).toFixed(0) + '%'} [${s.lastReason}]`;
    })(),
    // Water/bridge debug (#100)
    (() => {
      const w = getWaterDebugInfo();
      return w.waterCells > 0 ? `Water: ${w.waterCells}💧 ${w.bridgeCells}🌉 ${w.leaks > 0 ? `⚠${w.leaks} leaks` : '✓'}` : '';
    })(),
    // Lock-Key DAG debug (#98)
    (() => {
      const d = getLockKeyDebugInfo();
      if (d.chunksValidated === 0) return '';
      const status = d.dagValid ? '✓' : `⚠${d.locksRemoved}rm`;
      return `DAG: ${d.totalLocks}🔒 ${d.keysPlaced}🔑 L${d.layers} ${d.chunksValidated}ch ${status}`;
    })(),
  ].filter(Boolean).map((l) => `<span>${l}</span>`).join('');
}
