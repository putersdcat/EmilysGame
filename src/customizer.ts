/**
 * customizer.ts - Player sprite customizer overlay.
 * Lets players pick hair style, hair color, outfit color, skin tone.
 * Shows live SVG preview. Returns a CharacterVariation for the game to use.
 * Supports progression-gated locked cosmetics (#66).
 * TODO: DOC - customizer UI spec
 */

import type { CharacterVariation, Accessory, Expression, OutfitPattern } from './asset-pipeline/sprites';
import { generateIdleCharacterSVG, generateWalkingCharacterSVG, generateSideIdleCharacterSVG, generateSideWalkingCharacterSVG } from './asset-pipeline/sprites';
import { getUnlockablesForCategory } from './config/cosmetics.config';

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
  { name: '🎀 Ponytail',  value: 'ponytail' },
  { name: '🪢 Braids',    value: 'braids' },
  { name: '⚡ Spiky',     value: 'spiky' },
];

export const ACCESSORIES: { name: string; value: Accessory }[] = [
  { name: '❌ None',         value: 'none' },
  { name: '🎀 Bow',         value: 'bow' },
  { name: '👑 Crown',       value: 'crown' },
  { name: '👓 Glasses',     value: 'glasses' },
  { name: '🤠 Cowboy Hat',  value: 'cowboy_hat' },
  { name: '🧙 Wizard Hat',  value: 'wizard_hat' },
  { name: '🌸 Flower Crown',value: 'flower_crown' },
];

export const OUTFIT_PATTERNS: { name: string; value: OutfitPattern }[] = [
  { name: '⬜ Plain',    value: 'plain' },
  { name: '🌺 Floral',   value: 'floral' },
  { name: '📏 Striped',  value: 'striped' },
  { name: '⭐ Starry',   value: 'starry' },
];

export const EYE_COLORS: { name: string; hex: string }[] = [
  { name: '💙 Blue',    hex: '#0066CC' },
  { name: '💚 Green',   hex: '#228B22' },
  { name: '🤎 Brown',   hex: '#8B4513' },
  { name: '🧡 Hazel',   hex: '#8E7618' },
  { name: '🔶 Amber',   hex: '#CC7722' },
];

export const EXPRESSIONS: { name: string; value: Expression }[] = [
  { name: '😊 Happy',       value: 'happy' },
  { name: '😐 Neutral',     value: 'neutral' },
  { name: '😮 Surprised',   value: 'surprised' },
  { name: '😤 Determined',  value: 'determined' },
];

// ─── Default Variation ───────────────────────────────────────

export function createDefaultVariation(): CharacterVariation {
  return {
    name: 'custom',
    hairColor: '#D4A574',
    hairStyle: 'pigtails',
    dressColor: '#C84E89',
    skinTone: '#F4C9B8',
    accessory: 'none',
    expression: 'happy',
    eyeColor: '#0066CC',
    outfitPattern: 'plain',
  };
}

// ─── Preview Rendering ──────────────────────────────────────

let previewAnimFrame = 0;
let previewAnimTimer: ReturnType<typeof setInterval> | null = null;

function renderPreview(variation: CharacterVariation): void {
  const container = document.getElementById('customizerPreview');
  if (!container) return;

  // Show idle, walking, and side-view preview
  const idleSvg = generateIdleCharacterSVG(variation);
  const walkSvg = generateWalkingCharacterSVG(variation, previewAnimFrame);
  const sideSvg = generateSideIdleCharacterSVG(variation);
  const sideWalkSvg = generateSideWalkingCharacterSVG(variation, previewAnimFrame);

  container.innerHTML = `
    <div class="cust-preview-pair">
      <div class="cust-preview-sprite">${idleSvg}</div>
      <div class="cust-preview-sprite">${walkSvg}</div>
      <div class="cust-preview-sprite">${sideSvg}</div>
      <div class="cust-preview-sprite" style="transform:scaleX(-1)">${sideWalkSvg}</div>
    </div>
    <div class="cust-preview-labels">
      <span>Front</span><span>Walk</span><span>Side</span><span>Side L</span>
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

/** Set of unlocked cosmetic IDs — managed externally, read by customizer */
let _unlockedCosmeticIds: Set<string> = new Set();

/** Update the set of unlocked cosmetics (called from main.ts) */
export function setUnlockedCosmetics(ids: string[]): void {
  _unlockedCosmeticIds = new Set(ids);
}

/** Get current unlock set (for debug) */
export function getUnlockedCosmetics(): string[] {
  return [..._unlockedCosmeticIds];
}

interface SwatchOption {
  name: string;
  hex: string;
  locked?: boolean;
  lockHint?: string;
}

function buildSwatchOptions(
  baseOptions: { name: string; hex: string }[],
  category: 'hairColor' | 'outfitColor' | 'skinTone',
): SwatchOption[] {
  const unlockables = getUnlockablesForCategory(category);
  const options: SwatchOption[] = baseOptions.map(o => ({ ...o }));

  // Add locked/unlocked premium options
  for (const u of unlockables) {
    const isUnlocked = _unlockedCosmeticIds.has(u.id);
    options.push({
      name: u.name,
      hex: u.value,
      locked: !isUnlocked,
      lockHint: u.hint,
    });
  }
  return options;
}

function renderSwatches(
  containerId: string,
  options: SwatchOption[],
  selectedHex: string,
  onSelect: (hex: string) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = options.map(opt => {
    const selected = opt.hex.toLowerCase() === selectedHex.toLowerCase();
    if (opt.locked) {
      return `<button class="cust-swatch locked" 
                data-hex="${opt.hex}"
                data-locked="true"
                title="🔒 ${opt.name} — ${opt.lockHint}"
                style="background:${opt.hex}" disabled>
                🔒
              </button>`;
    }
    return `<button class="cust-swatch${selected ? ' selected' : ''}" 
              data-hex="${opt.hex}" 
              title="${opt.name}" 
              style="background:${opt.hex}">
              ${selected ? '✓' : ''}
            </button>`;
  }).join('');

  container.querySelectorAll('.cust-swatch:not([data-locked])').forEach(btn => {
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

/** Render accessory toggle buttons */
function renderAccessoryButtons(
  containerId: string,
  selectedAccessory: Accessory,
  onSelect: (a: Accessory) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = ACCESSORIES.map(a => {
    const selected = a.value === selectedAccessory;
    return `<button class="cust-style-btn${selected ? ' selected' : ''}" 
              data-val="${a.value}">
              ${a.name}
            </button>`;
  }).join('');

  container.querySelectorAll('.cust-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect((btn as HTMLElement).dataset.val as Accessory);
    });
  });
}

/** Render expression toggle buttons */
function renderExpressionButtons(
  containerId: string,
  selectedExpression: Expression,
  onSelect: (e: Expression) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = EXPRESSIONS.map(e => {
    const selected = e.value === selectedExpression;
    return `<button class="cust-style-btn${selected ? ' selected' : ''}" 
              data-val="${e.value}">
              ${e.name}
            </button>`;
  }).join('');

  container.querySelectorAll('.cust-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect((btn as HTMLElement).dataset.val as Expression);
    });
  });
}

/** Render outfit pattern toggle buttons (#116 Phase 3) */
function renderPatternButtons(
  containerId: string,
  selectedPattern: OutfitPattern,
  onSelect: (p: OutfitPattern) => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = OUTFIT_PATTERNS.map(p => {
    const selected = p.value === selectedPattern;
    return `<button class="cust-style-btn${selected ? ' selected' : ''}" 
              data-val="${p.value}">
              ${p.name}
            </button>`;
  }).join('');

  container.querySelectorAll('.cust-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect((btn as HTMLElement).dataset.val as OutfitPattern);
    });
  });
}

// ─── Main Customizer ────────────────────────────────────────

/**
 * Show the character customizer overlay.
 * Returns a Promise that resolves with the chosen CharacterVariation,
 * or null if cancelled (only when allowCancel=true).
 */
export function showCustomizer(initial?: CharacterVariation, allowCancel = false): Promise<CharacterVariation | null> {
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
      renderSwatches('custHairColors', buildSwatchOptions(HAIR_COLORS, 'hairColor'), variation.hairColor, (hex) => {
        variation.hairColor = hex;
        refreshAll();
      });
      renderSwatches('custOutfitColors', buildSwatchOptions(OUTFIT_COLORS, 'outfitColor'), variation.dressColor, (hex) => {
        variation.dressColor = hex;
        refreshAll();
      });
      renderSwatches('custSkinTones', buildSwatchOptions(SKIN_TONES, 'skinTone'), variation.skinTone, (hex) => {
        variation.skinTone = hex;
        refreshAll();
      });
      renderHairStyleButtons('custHairStyles', variation.hairStyle, (style) => {
        variation.hairStyle = style;
        refreshAll();
      });
      renderAccessoryButtons('custAccessories', variation.accessory ?? 'none', (a) => {
        variation.accessory = a;
        refreshAll();
      });
      renderExpressionButtons('custExpressions', variation.expression ?? 'happy', (e) => {
        variation.expression = e;
        refreshAll();
      });
      renderSwatches('custEyeColors', EYE_COLORS.map(c => ({ hex: c.hex, name: c.name })), variation.eyeColor ?? '#0066CC', (hex) => {
        variation.eyeColor = hex;
        refreshAll();
      });
      renderPatternButtons('custOutfitPatterns', variation.outfitPattern ?? 'plain', (p) => {
        variation.outfitPattern = p;
        refreshAll();
      });
    };

    // Show overlay
    overlay.style.display = 'flex';
    refreshAll();
    startPreviewAnimation(variation);

    // Cleanup helper — removes all listeners and hides overlay
    const cleanup = () => {
      stopPreviewAnimation();
      overlay.style.display = 'none';
      confirmBtn?.removeEventListener('click', onConfirm);
      randomBtn?.removeEventListener('click', onRandom);
      cancelBtn?.removeEventListener('click', onCancel);
    };

    // Wire confirm button
    const confirmBtn = document.getElementById('customizerConfirm');
    const onConfirm = () => { cleanup(); resolve(variation); };
    confirmBtn?.addEventListener('click', onConfirm);

    // Wire randomize button
    const randomBtn = document.getElementById('customizerRandom');
    const onRandom = () => {
      variation.hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].hex;
      variation.dressColor = OUTFIT_COLORS[Math.floor(Math.random() * OUTFIT_COLORS.length)].hex;
      variation.skinTone = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)].hex;
      variation.hairStyle = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)].value;
      variation.accessory = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)].value;
      variation.expression = EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)].value;
      variation.eyeColor = EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)].hex;
      variation.outfitPattern = OUTFIT_PATTERNS[Math.floor(Math.random() * OUTFIT_PATTERNS.length)].value;
      refreshAll();
      startPreviewAnimation(variation);
    };
    randomBtn?.addEventListener('click', onRandom);

    // Wire cancel button (shown only when allowCancel=true)
    const cancelBtn = document.getElementById('customizerCancel');
    if (cancelBtn) cancelBtn.style.display = allowCancel ? '' : 'none';
    const onCancel = () => { cleanup(); resolve(null); };
    cancelBtn?.addEventListener('click', onCancel);
  });
}

// ─── Serialization ───────────────────────────────────────────

export interface SerializedVariation {
  hairColor: string;
  hairStyle: string;
  dressColor: string;
  skinTone: string;
  accessory?: string;
  expression?: string;
  eyeColor?: string;
  outfitPattern?: string;
}

export function serializeVariation(v: CharacterVariation): SerializedVariation {
  return {
    hairColor: v.hairColor,
    hairStyle: v.hairStyle,
    dressColor: v.dressColor,
    skinTone: v.skinTone,
    accessory: v.accessory ?? 'none',
    expression: v.expression ?? 'happy',
    eyeColor: v.eyeColor ?? '#0066CC',
    outfitPattern: v.outfitPattern ?? 'plain',
  };
}

export function deserializeVariation(data: SerializedVariation): CharacterVariation {
  return {
    name: 'custom',
    hairColor: data.hairColor,
    hairStyle: (data.hairStyle as CharacterVariation['hairStyle']) || 'pigtails',
    dressColor: data.dressColor,
    skinTone: data.skinTone,
    accessory: (data.accessory as Accessory) || 'none',
    expression: (data.expression as Expression) || 'happy',
    eyeColor: data.eyeColor || '#0066CC',
    outfitPattern: (data.outfitPattern as OutfitPattern) || 'plain',
  };
}
