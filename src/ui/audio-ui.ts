/**
 * audio-ui.ts — Sync the audio control widgets:
 *   - Music cassette player UI (#107 Phase 2)
 *   - SFX / ambience mute + volume sliders (#75)
 *   - Voice toggle + volume slider (#76)
 *
 * All three are throttled to every 10th call (~6fps at 60fps) since
 * they change slowly. The cassette reel spin is CSS-driven so we only
 * toggle a class here.
 *
 * B7.6 — extracted from `ui.ts` (#270).
 */
import type { MusicState } from '../game/audio/music';
import type { SfxState } from '../game/audio/sfx';
import type { VoiceState } from '../game/audio/npc-voice';

let _lastMusicSyncFrame = 0;
let _cassetteCounter = 0;
let _lastSfxSyncFrame = 0;
let _lastVoiceSyncFrame = 0;

/** Sync the cassette-player UI (#107 Phase 2). */
export function syncMusicUI(music: MusicState): void {
  // Throttle to every 10th call
  if (++_lastMusicSyncFrame % 10 !== 0) return;

  const trackEl = document.getElementById('sbMusicTrack');
  const playBtn = document.getElementById('btnMusicPlayPause');
  const muteBtn = document.getElementById('btnMusicMute');
  const volSlider = document.getElementById('musicVolume') as HTMLInputElement | null;
  const reelL = document.getElementById('cassetteReelL');
  const reelR = document.getElementById('cassetteReelR');
  const progressFill = document.getElementById('cassetteProgress');
  const counterEl = document.getElementById('cassetteCounter');
  const composerEl = document.getElementById('sbMusicComposer');

  const isPlaying = music.playState === 'playing';

  // Reel spin animation
  if (reelL) reelL.classList.toggle('spinning', isPlaying);
  if (reelR) reelR.classList.toggle('spinning', isPlaying);

  // Track info
  if (trackEl) {
    if (music.currentTrackId) {
      const track = music.playlist.find(t => t.id === music.currentTrackId);
      if (track) {
        trackEl.textContent = track.name;
        if (composerEl) {
          composerEl.textContent = track.composer ? `♪ ${track.composer}` : '';
          composerEl.style.display = track.composer ? 'block' : 'none';
        }
      } else {
        trackEl.textContent = music.currentTrackId;
      }
    } else {
      trackEl.textContent = isPlaying ? '—' : '▸ INSERT TAPE ◂';
      if (composerEl) composerEl.style.display = 'none';
    }
  }

  // Progress bar — estimate from noteIndex / melody length
  if (progressFill) {
    const progress = music.trackProgress ?? 0; // 0-1
    progressFill.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
  }

  // Tape counter — simple incrementing counter when playing
  if (counterEl) {
    if (isPlaying) _cassetteCounter = (_cassetteCounter + 1) % 1000;
    counterEl.textContent = String(_cassetteCounter).padStart(3, '0');
  }

  // Play/pause button
  if (playBtn) {
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.classList.toggle('active', isPlaying);
  }

  // Mute button
  if (muteBtn) {
    muteBtn.textContent = music.settings.muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('active', music.settings.muted);
  }

  // Volume slider
  if (volSlider && document.activeElement !== volSlider) {
    volSlider.value = String(Math.round(music.settings.volume * 100));
  }
}

/** Sync SFX + ambience mute/volume widgets (#75). */
export function syncSfxUI(sfx: SfxState): void {
  // Throttle to every 10th call
  if (++_lastSfxSyncFrame % 10 !== 0) return;

  const sfxMuteBtn = document.getElementById('btnSfxMute');
  const ambienceMuteBtn = document.getElementById('btnAmbienceMute');
  const sfxSlider = document.getElementById('sfxVolume') as HTMLInputElement | null;
  const ambSlider = document.getElementById('ambienceVolume') as HTMLInputElement | null;

  if (sfxMuteBtn) {
    sfxMuteBtn.textContent = sfx.settings.sfxMuted ? '🔇' : '🔊';
  }
  if (ambienceMuteBtn) {
    ambienceMuteBtn.textContent = sfx.settings.ambienceMuted ? '🔇' : '🔊';
  }
  if (sfxSlider && document.activeElement !== sfxSlider) {
    sfxSlider.value = String(Math.round(sfx.settings.sfxVolume * 100));
  }
  if (ambSlider && document.activeElement !== ambSlider) {
    ambSlider.value = String(Math.round(sfx.settings.ambienceVolume * 100));
  }
}

/** Sync voice toggle + volume widget (#76). */
export function syncVoiceUI(voice: VoiceState): void {
  if (++_lastVoiceSyncFrame % 10 !== 0) return;

  const toggleBtn = document.getElementById('btnVoiceToggle');
  const volSlider = document.getElementById('voiceVolume') as HTMLInputElement | null;

  if (toggleBtn) {
    toggleBtn.textContent = voice.settings.enabled ? '🗣️' : '🔇';
    toggleBtn.title = voice.settings.enabled ? 'Voice enabled' : 'Voice disabled';
  }
  if (volSlider && document.activeElement !== volSlider) {
    volSlider.value = String(Math.round(voice.settings.volume * 100));
  }

  // If speech not supported, grey out controls
  const section = document.getElementById('sbVoiceSection');
  if (section) {
    section.style.opacity = voice.supported ? '1' : '0.5';
    section.title = voice.supported ? '' : 'Speech synthesis not available';
  }
}
