/**
 * customizer.ts - Player sprite customizer overlay.
 * Lets players pick hair style, hair color, outfit color, skin tone.
 * Shows live SVG preview. Returns a CharacterVariation for the game to use.
 * TODO: DOC - customizer UI spec
 */

import type { CharacterVariation } from './sprites';
import { generateIdleCharacterSVG, generateWalkingCharacterSVG } from './sprites';

// ─── Preset Options ──────────────────────────────────────────

export const HAIR_COLORS = [
  { name: 'Blonde',    hex: '#D4A574' },
  { name: 'Golden',    hex: '#DAA520' },
  { name: 'Brunette',  hex: '#8B6F47' },
  { name: 'Auburn',    hex: '#A0522D' },
  { name: 'Black',     hex: '#2C2C2C' },
  { name: 'Red',       hex: '#CC4444' },
  { name: 'Pink',      hex: '#E87BA8' },
  { name: 'Blue',      hex: '#5588CC' },
  { name: 'Purple',    hex: '#8866BB' },
  { name: 'Silver',    hex: '#B0B0B0' },
];

export const OUTFIT_COLORS = [
  { name: 'Pink',      hex: '#C84E89' },
  { name: 'Green',     hex: '#4A9D5F' },
  { name: 'Purple',    hex: '#6A5ACD' },
  { name: 'Blue',      hex: '#4488CC' },
  { name: 'Red',       hex: '#CC4444' },
  { name: 'Orange',    hex: '#DD8844' },
  { name: 'Yellow',    hex: '#CCAA33' },
  { name: 'Teal',      hex: '#44AAAA' },
  { name: 'Navy',      hex: '#334477' },
  { name: 'Black',     hex: '#333333' },
];

export const SKIN_TONES = [
  { name: 'Light',       hex: '#FCEBD5' },
  { name: 'Fair',        hex: '#F4C9B8' },
  { name: 'Medium',      hex: '#D4A574' },
  { name: 'Tan',         hex: '#C68642' },
  { name: 'Brown',       hex: '#8D5524' },
  { name: 'Dark',        hex: '#5C3A1E' },
];

export const HAIR_STYLES: { name: string; value: CharacterVariation['hairStyle'] }[] = [
  { name: '✂️ Straight',  value: 'straight' },
  { name: '🎀 Pigtails',  value: 'pigtails' },
  { name: '🌊 Wavy',      value: 'wavy' },
];

// ─── Default Variation ───────────────────────────────────────

export function createDefaultVariation(): CharacterVariation {
  return {
    name: 'custom',
    hairColor: '#D4A574',
    hairStyle: 'pigtails',
    dressColor: '#C84E89',
    skinTone: '#F4C9B8',
  };
}

// ─── Preview Rendering ──────────────────────────────────────

let previewAnimFrame = 0;
let previewAnimTimer: ReturnType<typeof setInterval> | null = null;

function renderPreview(variation: CharacterVariation): void {
  const container = document.getElementById('customizerPreview');
  if (!container) return;

  // Show idle + walking preview
  const idleSvg = generateIdleCharacterSVG(variation);
  const walkSvg = generateWalkingCharacterSVG(variation, previewAnimFrame);

  container.innerHTML = `
    <div class="cust-preview-pair">
      <div class="cust-preview-sprite">${idleSvg}</div>
      <div class="cust-preview-sprite">${walkSvg}</div>
    </div>
    <div class="cust-preview-labels">
      <span>Idle</span><span>Walking</span>
    </div>
  `;
}

function startPreviewAnimation(variation: CharacterVariation): void {
  stopPreviewAnimation();
  previewAnimFrame = 0;
  previewAnimTimer = setInterval(() => {
    previewAnimFrame = (previewAnimFrame + 1) % 6;
    renderPreview(variation);
  }, 180);
}

function stopPreviewAnimation(): void {
  if (previewAnimTimer !== null) {
    clearInterval(previewAnimTimer);
    previewAnimTimer = null;
  }
}

// ─── Swatch Rendering ────────────────────────────────────────

function renderSwatches(
  containerId: string,
  options: { name: string; hex: string }[],
  selectedHex: string,
  onSelect: (hex: string) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = options.map(opt => {
    const selected = opt.hex.toLowerCase() === selectedHex.toLowerCase();
    return `<button class="cust-swatch${selected ? ' selected' : ''}" 
              data-hex="${opt.hex}" 
              title="${opt.name}" 
              style="background:${opt.hex}">
              ${selected ? '✓' : ''}
            </button>`;
  }).join('');

  container.querySelectorAll('.cust-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const hex = (btn as HTMLElement).dataset.hex!;
      onSelect(hex);
    });
  });
}

function renderHairStyleButtons(
  containerId: string,
  selectedStyle: CharacterVariation['hairStyle'],
  onSelect: (style: CharacterVariation['hairStyle']) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = HAIR_STYLES.map(hs => {
    const selected = hs.value === selectedStyle;
    return `<button class="cust-style-btn${selected ? ' selected' : ''}" 
              data-style="${hs.value}">
              ${hs.name}
            </button>`;
  }).join('');

  container.querySelectorAll('.cust-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const style = (btn as HTMLElement).dataset.style as CharacterVariation['hairStyle'];
      onSelect(style);
    });
  });
}

// ─── Main Customizer ────────────────────────────────────────

/**
 * Show the character customizer overlay.
 * Returns a Promise that resolves with the chosen CharacterVariation.
 */
export function showCustomizer(initial?: CharacterVariation): Promise<CharacterVariation> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customizerOverlay');
    if (!overlay) {
      resolve(initial ?? createDefaultVariation());
      return;
    }

    const variation: CharacterVariation = { ...(initial ?? createDefaultVariation()) };

    // Helper to refresh all UI
    const refreshAll = () => {
      renderPreview(variation);
      renderSwatches('custHairColors', HAIR_COLORS, variation.hairColor, (hex) => {
        variation.hairColor = hex;
        refreshAll();
      });
      renderSwatches('custOutfitColors', OUTFIT_COLORS, variation.dressColor, (hex) => {
        variation.dressColor = hex;
        refreshAll();
      });
      renderSwatches('custSkinTones', SKIN_TONES, variation.skinTone, (hex) => {
        variation.skinTone = hex;
        refreshAll();
      });
      renderHairStyleButtons('custHairStyles', variation.hairStyle, (style) => {
        variation.hairStyle = style;
        refreshAll();
      });
    };

    // Show overlay
    overlay.style.display = 'flex';
    refreshAll();
    startPreviewAnimation(variation);

    // Wire confirm button
    const confirmBtn = document.getElementById('customizerConfirm');
    const handler = () => {
      stopPreviewAnimation();
      overlay.style.display = 'none';
      confirmBtn?.removeEventListener('click', handler);
      resolve(variation);
    };
    confirmBtn?.addEventListener('click', handler);

    // Wire randomize button
    const randomBtn = document.getElementById('customizerRandom');
    const randomHandler = () => {
      variation.hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].hex;
      variation.dressColor = OUTFIT_COLORS[Math.floor(Math.random() * OUTFIT_COLORS.length)].hex;
      variation.skinTone = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)].hex;
      variation.hairStyle = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)].value;
      refreshAll();
      startPreviewAnimation(variation);
    };
    randomBtn?.addEventListener('click', randomHandler);

    // Cleanup randomize handler when confirmed
    const origHandler = handler;
    const wrappedHandler = () => {
      randomBtn?.removeEventListener('click', randomHandler);
      origHandler();
    };
    confirmBtn?.removeEventListener('click', handler);
    confirmBtn?.addEventListener('click', wrappedHandler);
  });
}

// ─── Serialization ───────────────────────────────────────────

export interface SerializedVariation {
  hairColor: string;
  hairStyle: string;
  dressColor: string;
  skinTone: string;
}

export function serializeVariation(v: CharacterVariation): SerializedVariation {
  return {
    hairColor: v.hairColor,
    hairStyle: v.hairStyle,
    dressColor: v.dressColor,
    skinTone: v.skinTone,
  };
}

export function deserializeVariation(data: SerializedVariation): CharacterVariation {
  return {
    name: 'custom',
    hairColor: data.hairColor,
    hairStyle: (data.hairStyle as CharacterVariation['hairStyle']) || 'pigtails',
    dressColor: data.dressColor,
    skinTone: data.skinTone,
  };
}
