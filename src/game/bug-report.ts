/**
 * bug-report.ts — Capture canvas + state snapshot as a downloadable JSON.
 *
 * B5 micro-slice 11.23 (#268): extracted from src/main.ts.
 * When the player submits a bug report, this function:
 *   1. Captures the current canvas as a base64 PNG
 *   2. Snapshots relevant game state (position, biome, status, inventory)
 *   3. Bundles everything into a JSON file with embedded screenshot
 *   4. Triggers a browser download of the file
 *
 * The download prompt is initiated via a hidden <a download> element
 * which is cleaned up immediately after click. Uses URL.createObjectURL
 * + revokeObjectURL for zero-leak blob handling.
 *
 * @see issue #117 (Bug Report Capture)
 */

import { WORLD_CONFIG } from '../config/game.config';
import { getCycleProgress } from '../rendering/lighting';
import type { GameState } from './game-state';

/**
 * Capture a bug report and trigger a browser download.
 * @param state  Current game state (player, inventory, status, etc.)
 * @param description  Player-supplied bug description
 */
export function captureBugReport(state: GameState, description: string): void {
  // Capture canvas screenshot
  const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement | null;
  const screenshotDataUrl = canvas ? canvas.toDataURL('image/png') : '';

  // Build metadata
  const cs = WORLD_CONFIG.chunkSize;
  const cKey = `${Math.floor(state.player.x / cs)},${Math.floor(state.player.y / cs)}`;
  const chunk = state.chunks.get(cKey);
  const metadata = {
    timestamp: new Date().toISOString(),
    description,
    player: {
      x: Math.round(state.player.x * 100) / 100,
      y: Math.round(state.player.y * 100) / 100,
      biome: chunk?.biomeName ?? 'unknown',
      biomeId: chunk?.biomeId ?? -1,
    },
    status: { ...state.status },
    inventory: state.inventory.serialize().map((s) => ({ id: s.itemId, qty: s.quantity })),
    timeOfDay: getCycleProgress(),
    frameCount: state.frameCount,
    platform: navigator.userAgent,
  };

  // Bundle into a downloadable JSON + embedded screenshot
  const report = {
    version: '1.0',
    ...metadata,
    screenshot: screenshotDataUrl,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bug-report-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
