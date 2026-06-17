/**
 * age-selection.ts — Age band selection overlay (#92).
 *
 * B5 micro-slice 11.12 (#268): extracted from main.ts. The age-band
 * selector is shown once on first launch and lets the player pick
 * an age band (3-5, 5-7, 7-9, 9-12+) to scope the quiz content
 * difficulty and presentation. Resolves when the player confirms a
 * choice or skips (skip = no preference, show everything).
 *
 * Pure DOM overlay; no module-level state, no callbacks. The function
 * mutates the passed `AgeProfile` in place via `setAgeBand` and
 * resolves once the overlay closes.
 *
 * @see issue #92 — Age-Banded Content Selection
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { AGE_BANDS, setAgeBand, type AgeProfile } from './age-profile';
import { type AgeBand } from '../types/content-pack.types';

/**
 * Show the age band selection overlay.
 *
 * If required DOM elements aren't present (e.g. on a build of the
 * game without age gating), the promise resolves immediately so
 * the caller proceeds normally.
 *
 * @param profile - the AgeProfile to mutate via setAgeBand() on confirm
 * @returns Promise that resolves when the overlay is dismissed
 */
export function showAgeSelection(profile: AgeProfile): Promise<void> {
  return new Promise(resolve => {
    const overlay = document.getElementById('ageOverlay');
    if (!overlay) { resolve(); return; }

    const list = document.getElementById('ageBandList');
    const confirmBtn = document.getElementById('ageConfirm') as HTMLButtonElement;
    const skipBtn = document.getElementById('ageSkip');

    if (!list || !confirmBtn) { resolve(); return; }

    let selected: AgeBand | null = null;

    function renderOptions(): void {
      list!.innerHTML = AGE_BANDS.map(b => {
        const sel = selected === b.id;
        return `<div class="age-band-option ${sel ? 'selected' : ''}" data-band="${b.id}">
          <span class="age-band-icon">${b.icon}</span>
          <div class="age-band-info">
            <span class="age-band-label">${b.label}</span>
            <span class="age-band-range">${b.range}</span>
          </div>
        </div>`;
      }).join('');

      // Wire option clicks
      list!.querySelectorAll('.age-band-option').forEach(el => {
        el.addEventListener('click', () => {
          selected = (el as HTMLElement).dataset.band as AgeBand;
          confirmBtn.disabled = false;
          renderOptions();
        });
      });
    }

    renderOptions();
    overlay.style.display = 'flex';

    const onConfirm = () => {
      if (selected) setAgeBand(profile, selected);
      overlay.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      skipBtn?.removeEventListener('click', onSkip);
      resolve();
    };

    const onSkip = () => {
      // Skip = no age band, show everything
      overlay.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      skipBtn?.removeEventListener('click', onSkip);
      resolve();
    };

    confirmBtn.addEventListener('click', onConfirm);
    skipBtn?.addEventListener('click', onSkip);
  });
}