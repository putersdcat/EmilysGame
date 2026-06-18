/**
 * render-frame.ts — Per-frame render orchestration.
 *
 * B5 micro-slice 11.27 (#268): extracted from src/main.ts.
 * Composes the 7 rendering passes (world → particles → wildlife → debuff-VFX →
 * lighting → weather → UI overlay) into a single function call. Owns the
 * per-pass perf tracking (render, particles, wildlife, lighting, weather).
 *
 * Render pass order matters:
 *   1. World (terrain + objects + player) - base layer
 *   2. Particles (butterflies, sparkles, leaves, birds) - ambient VFX
 *   3. Wildlife (creatures rendered between objects and lighting)
 *   4. Debuff VFX (flies, blur, injury flash, diarrhea overlay, poop)
 *   5. Lighting (local lights + night desaturation)
 *   6. Weather (rain, fog, clouds, lightning)
 *   7. UI overlay (status bars, minimap, book, quiz)
 *
 * @see issue #4 (Performance optimizations)
 * @see issue #47 (Terrain cache)
 * @see issue #114 (Night desaturation + fog)
 * @see issue #133 (Diarrhea poop markers + burst)
 * @see issue #136 (Pause-aware day/night cycle)
 */

import { WORLD_CONFIG } from '../config/game.config';
import { getBiome } from '../config/biomes.config';
import { getCycleProgress } from './lighting';
import { FIRE_VARIANTS, FIRE_ASSET_KEYS } from '../config/fire.config';
import { DIARRHEA_CONFIG } from '../game/illness';
import { perfSmooth, type PerfStats } from '../engine/perf';
import type { IsometricRenderer } from './render';
import { renderFog } from './fog';
import { renderWildlife } from '../game/wildlife-render';
import {
  renderUI, syncStatusBars, syncMusicUI, syncSfxUI, syncVoiceUI,
} from '../ui/ui';
import { syncTradeDOM } from '../game/trading';
import { updateMidiProgress } from '../game/audio/music';
import { renderMinimap } from './minimap';
import { syncBookUI } from '../game/knowledge';
import {
  updateFlies, updateBlurOverlay, updateInjuryFlash,
  updateDiarrheaOverlay, renderFlies, updateAndRenderPoopParticles, spawnPoopBurst,
  renderPoopMarkers,
} from './debuff-visuals';
import { updateAndRenderParticles } from './particles';
import { tickLighting } from './lighting';
import { clearLights, addPointLight, addFlashlight, renderLocalLights } from './local-lights';
import { updateAndRenderWeather, didLightningStrike } from './weather';
import { playSfx } from '../game/audio/sfx';
import { startDucking, stopDucking } from '../game/audio/music';
import { updateBubblePosition } from '../ui/thought-bubbles';
import { getPendingPoopBurst, setPendingPoopBurst } from '../game/interaction-handler';
import type { GameState } from '../game/game-state';

/**
 * Render one frame to the canvas. Composes all 7 rendering passes and
 * tracks per-pass performance stats.
 */
export function renderFrame(
  renderer: IsometricRenderer,
  state: GameState,
  perfStats: PerfStats,
): void {
  const _t0 = performance.now();

  // World render (WASM if available, JS fallback)
  renderer.renderAuto(
    state.chunks,
    state.camera,
    { x: state.player.x, y: state.player.y },
    state.player.direction,
    state.egoImg,
    state.ui.showDebug,
  );

  const _t1 = performance.now();
  perfStats.render = perfSmooth(perfStats.render, _t1 - _t0);

  // Ambient particles (butterflies, sparkles, leaves, birds)
  updateAndRenderParticles(renderer.getCtx(), state.chunks, state.camera);

  const _t2 = performance.now();
  perfStats.particles = perfSmooth(perfStats.particles, _t2 - _t1);

  // Wildlife layer: draw creatures after terrain/objects, before lighting
  renderWildlife(renderer, state);

  const _t3 = performance.now();
  perfStats.wildlife = perfSmooth(perfStats.wildlife, _t3 - _t2);

  // Debuff visual effects (#110): fly particles + dehydration blur
  updateFlies(state.status);
  updateBlurOverlay(state.status);
  updateInjuryFlash(); // (#109 Phase 3) injury red flash
  updateDiarrheaOverlay(); // (#133) green illness overlay
  const playerScreenDbf = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  renderFlies(renderer.getCtx(), playerScreenDbf.x, playerScreenDbf.y);

  // Poop markers in world space (#133)
  const cam = state.camera;
  renderPoopMarkers(
    renderer.getCtx(),
    state.diarrhea.poopMarkers,
    state.frameCount,
    DIARRHEA_CONFIG.MARKER_DURATION_FRAMES,
    (gx: number, gy: number) => renderer.gridToScreen(gx, gy, cam),
  );

  // Poop particle burst (#133): resolve deferred burst with screen coords
  if (getPendingPoopBurst()) {
    setPendingPoopBurst(false);
    spawnPoopBurst(playerScreenDbf.x, playerScreenDbf.y, DIARRHEA_CONFIG.PARTICLE_COUNT);
  }
  updateAndRenderPoopParticles(renderer.getCtx());

  // Fog-of-war overlay: darken unexplored areas (#114)
  renderFog(renderer.getCtx(), state.camera);

  // Update thought bubble position (anchored above player sprite screen position)
  const playerScreen = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  updateBubblePosition(playerScreen.x, playerScreen.y);

  // Day/night cycle: tick the clock (rendering is handled by local-lights with lightmap)
  // Pause-aware: don't advance time when menus/overlays are active (#136)
  tickLighting(state.paused);

  // Local lights: fire positions cached per chunk to avoid 5625+ cell scans every frame (#79, #81)
  clearLights();
  const cs2 = WORLD_CONFIG.chunkSize;
  for (const [, chunk] of state.chunks) {
    if (!chunk.generated) continue;
    // lazily cache fire positions per chunk (bonfire, campfire, biomass_fire)
    let fires = (chunk as any)._fireCache as { gx: number; gy: number; key: string }[] | undefined;
    if (fires === undefined) {
      fires = [];
      const baseGX = chunk.chunkX * cs2;
      const baseGY = chunk.chunkY * cs2;
      for (let cy = 0; cy < cs2; cy++) {
        for (let cx = 0; cx < cs2; cx++) {
          const ak = chunk.cells[cy][cx].assetKey;
          if (FIRE_ASSET_KEYS.has(ak)) {
            fires.push({ gx: baseGX + cx, gy: baseGY + cy, key: ak });
          }
        }
      }
      (chunk as any)._fireCache = fires;
    }
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      const variant = FIRE_VARIANTS[f.key];
      if (variant) {
        addPointLight(f.gx, f.gy, {
          radius: variant.lightRadius,
          color: variant.lightColor,
          intensity: variant.lightIntensity,
        });
      } else {
        addPointLight(f.gx, f.gy);
      }
    }
  }
  addFlashlight(state.player.x, state.player.y, state.player.facingDx, state.player.facingDy);
  // Torch: portable warm light when player has torch in inventory (#99)
  if (state.inventory.hasItem('torch')) {
    addPointLight(state.player.x, state.player.y, {
      radius: 80,
      color: [255, 160, 50],
      intensity: 0.7,
      flicker: true,
    });
  }
  renderLocalLights(renderer.getCtx(), state.camera);

  // Night desaturation: CSS filter on canvas element for GPU-composited grayscale (#114)
  // Smooth ramp: full color during day, desaturated at night
  const cycleT = getCycleProgress();
  let desatFactor = 0; // 0 = full color, 1 = full desaturation
  if (cycleT >= 0.80) {
    desatFactor = 0.75; // Full night: heavy desaturation
  } else if (cycleT >= 0.65) {
    // Dusk transition: 0 → 0.75 over dusk phase
    desatFactor = ((cycleT - 0.65) / 0.15) * 0.75;
  } else if (cycleT < 0.08) {
    // Dawn: fade back 0.75 → 0
    desatFactor = (1 - cycleT / 0.08) * 0.75;
  }
  if (desatFactor > 0.01) {
    const sat = 1 - desatFactor;
    const bright = 1 - desatFactor * 0.15; // slight brightness reduction at night
    renderer.getCanvas().style.filter = `saturate(${sat.toFixed(2)}) brightness(${bright.toFixed(2)})`;
  } else {
    renderer.getCanvas().style.filter = '';
  }

  const _t4 = performance.now();
  perfStats.lighting = perfSmooth(perfStats.lighting, _t4 - _t3);

  // Weather effects (rain, fog, clouds, lightning)
  updateAndRenderWeather(renderer.getCtx());
  // Thunder SFX on lightning strike (#75)
  if (didLightningStrike()) {
    playSfx(state.sfx, 'thunder');
  }

  const _t5 = performance.now();
  perfStats.weather = perfSmooth(perfStats.weather, _t5 - _t4);

  // UI overlay - throttle DOM sync to every 4th frame
  if (state.frameCount % 4 === 0 || state.quiz.active || state.ui.dialog.active || state.trade.active) {
    // Get current biome name from chunk map
    const cs = WORLD_CONFIG.chunkSize;
    const cKey = `${Math.floor(state.player.x / cs)},${Math.floor(state.player.y / cs)}`;
    const currentChunk = state.chunks.get(cKey);
    const biomeName = currentChunk ? getBiome(currentChunk.biomeId).displayName : undefined;

    renderUI(
      renderer.getCtx(),
      state.ui,
      state.inventory,
      state.quiz,
      { x: state.player.x, y: state.player.y },
      state.fps,
      state.quizStats,
      biomeName,
    );

    // Trade panel DOM sync
    if (state.trade.active) {
      syncTradeDOM(state.trade, state.inventory);
    }

    // Status bars (#70, #109)
    syncStatusBars(state.status, state.injury);

    // Music ducking sync (#74) — duck when paused (quiz/dialog active)
    if (state.paused && !state.music.ducking) {
      startDucking(state.music);
    } else if (!state.paused && state.music.ducking) {
      stopDucking(state.music);
    }

    // Music UI sync (#74)
    updateMidiProgress(state.music);
    syncMusicUI(state.music);

    // SFX UI sync (#75)
    syncSfxUI(state.sfx);

    // Voice UI sync (#76)
    syncVoiceUI(state.voice);
  }

  // Minimap (self-throttling to ~6fps)
  renderMinimap(state.chunks, state.player.x, state.player.y);

  // Book of Knowledge overlay (self-throttling)
  syncBookUI(state.knowledge);
}
