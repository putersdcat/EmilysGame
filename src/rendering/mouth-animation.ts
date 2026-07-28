/**
 * mouth-animation.ts — NPC mouth-flap + head-bob animation (#113).
 *
 * Module-level state — zero allocation in hot path.
 * When an NPC is in dialog, their mouth cycles through
 * closed → open → wide → open at MOUTH_FRAME_MS intervals,
 * and their head bobs ±1.5px on a sine wave.
 *
 * Extracted from `render.ts` in B6.4 (#269) to keep render.ts
 * focused on the per-frame draw pipeline.
 */
import type { MouthState } from '../asset-pipeline/npc-sprites';

const MOUTH_CYCLE: MouthState[] = ['closed', 'open', 'wide', 'open'];
const MOUTH_FRAME_MS = 180; // ms per mouth frame
const HEAD_BOB_AMPLITUDE = 1.5; // ± pixels
const HEAD_BOB_STEP = 0.05; // radians per render call

let _dialogNpcId: string | null = null;    // npcId of NPC currently in dialog
let _mouthCycleIdx = 0;                     // index into MOUTH_CYCLE
let _mouthLastTick = 0;                     // timestamp of last mouth advance
let _headBobPhase = 0;                      // head bob oscillation phase (radians)

/** Set the NPC currently speaking (pass null when dialog closes). */
export function setDialogNpc(npcId: string | null): void {
  _dialogNpcId = npcId;
  _mouthCycleIdx = 0;
  _mouthLastTick = performance.now();
  _headBobPhase = 0;
}

/** Get current mouth state for the given NPC cell (hot path — no alloc). */
export function getNpcMouthState(cellNpcId: string | undefined): MouthState {
  if (!cellNpcId || cellNpcId !== _dialogNpcId) return 'closed';
  // Advance mouth cycle based on elapsed time
  const now = performance.now();
  const elapsed = now - _mouthLastTick;
  if (elapsed >= MOUTH_FRAME_MS) {
    const steps = Math.floor(elapsed / MOUTH_FRAME_MS);
    _mouthCycleIdx = (_mouthCycleIdx + steps) % MOUTH_CYCLE.length;
    _mouthLastTick = now - (elapsed % MOUTH_FRAME_MS); // keep remainder
  }
  return MOUTH_CYCLE[_mouthCycleIdx];
}

/** Get head bob Y offset for speaking NPC (1-2px vertical oscillation). */
export function getHeadBob(cellNpcId: string | undefined): number {
  if (!cellNpcId || cellNpcId !== _dialogNpcId) return 0;
  _headBobPhase += HEAD_BOB_STEP; // advance per render call
  return Math.sin(_headBobPhase) * HEAD_BOB_AMPLITUDE; // ±1.5px
}
