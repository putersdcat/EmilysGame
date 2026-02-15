/**
 * sprites.ts - Programmable SVG character sprite system.
 * Creates animated character variations based on color/appearance parameters.
 * Supports 3 facing poses: front (default), back, and side (with flip for left/right).
 * TODO: DOC - facing direction sprite system
 */

/** Player facing direction for sprite selection */
export type FacingPose = 'front' | 'back' | 'side';

export interface CharacterVariation {
  name: string;
  hairColor: string;
  hairStyle: 'straight' | 'pigtails' | 'wavy';
  dressColor: string;
  skinTone: string;
}

/**
 * Character variations inspired by the pixel art examples.
 */
export const characterVariations: Record<string, CharacterVariation> = {
  blonde_pink: {
    name: 'Blonde Girl (Pink Dress)',
    hairColor: '#D4A574',
    hairStyle: 'pigtails',
    dressColor: '#C84E89',
    skinTone: '#F4C9B8',
  },
  brunette_green: {
    name: 'Brunette Girl (Green Dress)',
    hairColor: '#8B6F47',
    hairStyle: 'straight',
    dressColor: '#4A9D5F',
    skinTone: '#F4C9B8',
  },
  blonde_purple: {
    name: 'Blonde Girl (Purple Dress)',
    hairColor: '#DAA520',
    hairStyle: 'wavy',
    dressColor: '#6A5ACD',
    skinTone: '#F4C9B8',
  },
};

/**
 * Generate SVG for idle (standing) character pose.
 */
export function generateIdleCharacterSVG(variation: CharacterVariation): string {
  const { hairColor, hairStyle, dressColor, skinTone } = variation;

  // Hair positioning based on style
  let hairSVG = '';
  if (hairStyle === 'pigtails') {
    hairSVG = `
      <!-- Left pigtail -->
      <circle cx="20" cy="18" r="8" fill="${hairColor}"/>
      <ellipse cx="18" cy="25" rx="6" ry="8" fill="${hairColor}"/>
      <!-- Right pigtail -->
      <circle cx="44" cy="18" r="8" fill="${hairColor}"/>
      <ellipse cx="46" cy="25" rx="6" ry="8" fill="${hairColor}"/>
      <!-- Main head -->
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  } else if (hairStyle === 'straight') {
    hairSVG = `
      <!-- Main hair -->
      <path d="M 18 24 Q 18 10, 32 8 Q 46 10, 46 24" fill="${hairColor}"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  } else {
    hairSVG = `
      <!-- Wavy hair -->
      <path d="M 18 24 Q 15 10, 32 8 Q 49 10, 46 24" fill="${hairColor}"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  }

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Head -->
      ${hairSVG}
      
      <!-- Face -->
      <circle cx="32" cy="32" r="10" fill="${skinTone}"/>
      
      <!-- Eyes -->
      <circle cx="28" cy="30" r="1.5" fill="#0066CC"/>
      <circle cx="36" cy="30" r="1.5" fill="#0066CC"/>
      
      <!-- Mouth -->
      <path d="M 28 34 Q 32 36, 36 34" stroke="#CC6699" stroke-width="1" fill="none" stroke-linecap="round"/>
      
      <!-- Body - Dress -->
      <rect x="22" y="42" width="20" height="28" rx="3" fill="${dressColor}"/>
      
      <!-- Dress trim -->
      <line x1="22" y1="48" x2="42" y2="48" stroke="#FFF" stroke-width="1" opacity="0.6"/>
      
      <!-- Arms -->
      <rect x="15" y="44" width="8" height="20" rx="2" fill="${skinTone}"/>
      <rect x="41" y="44" width="8" height="20" rx="2" fill="${skinTone}"/>
      
      <!-- Legs -->
      <rect x="26" y="70" width="5" height="20" fill="${skinTone}"/>
      <rect x="33" y="70" width="5" height="20" fill="${skinTone}"/>
      
      <!-- Shoes -->
      <ellipse cx="28.5" cy="90" rx="3" ry="4" fill="#333"/>
      <ellipse cx="35.5" cy="90" rx="3" ry="4" fill="#333"/>
    </svg>
  `;
}

/**
 * Generate SVG for walking animation frame.
 * Frame: 0-5 (6 total frames)
 */
export function generateWalkingCharacterSVG(variation: CharacterVariation, frame: number): string {
  const { hairColor, hairStyle, dressColor, skinTone } = variation;

  // Calculate leg and arm positions based on animation frame
  const legOffset = [0, -4, -6, -4, 0, 4][frame] || 0;
  const otherLegOffset = [0, 4, 6, 4, 0, -4][frame] || 0;
  const armSwing = [0, -3, -5, -3, 0, 3][frame] || 0;
  // Subtle vertical bounce for natural walking motion (1-2px)
  const bodyBounce = [0, -1, -2, -1, 0, -1][frame] || 0;

  // Hair positioning based on style
  let hairSVG = '';
  if (hairStyle === 'pigtails') {
    hairSVG = `
      <circle cx="20" cy="18" r="8" fill="${hairColor}"/>
      <ellipse cx="18" cy="25" rx="6" ry="8" fill="${hairColor}"/>
      <circle cx="44" cy="18" r="8" fill="${hairColor}"/>
      <ellipse cx="46" cy="25" rx="6" ry="8" fill="${hairColor}"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  } else if (hairStyle === 'straight') {
    hairSVG = `
      <path d="M 18 24 Q 18 10, 32 8 Q 46 10, 46 24" fill="${hairColor}"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  } else {
    hairSVG = `
      <path d="M 18 24 Q 15 10, 32 8 Q 49 10, 46 24" fill="${hairColor}"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  }

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Upper body group with walking bounce -->
      <g transform="translate(0, ${bodyBounce})">
        <!-- Head -->
        ${hairSVG}
        
        <!-- Face -->
        <circle cx="32" cy="32" r="10" fill="${skinTone}"/>
        
        <!-- Eyes (with movement for walking) -->
        <circle cx="28" cy="30" r="1.5" fill="#0066CC"/>
        <circle cx="36" cy="30" r="1.5" fill="#0066CC"/>
        
        <!-- Mouth -->
        <path d="M 28 34 Q 32 36, 36 34" stroke="#CC6699" stroke-width="1" fill="none" stroke-linecap="round"/>
        
        <!-- Body - Dress -->
        <rect x="22" y="42" width="20" height="28" rx="3" fill="${dressColor}"/>
        
        <!-- Dress trim -->
        <line x1="22" y1="48" x2="42" y2="48" stroke="#FFF" stroke-width="1" opacity="0.6"/>
        
        <!-- Left arm (swinging - pivots from shoulder at body edge) -->
        <g transform="translate(23, 44)">
          <rect x="-8" y="0" width="8" height="20" rx="2" fill="${skinTone}" transform="rotate(${armSwing})"/>
        </g>
        
        <!-- Right arm (opposite swing - pivots from shoulder at body edge) -->
        <g transform="translate(41, 44)">
          <rect x="0" y="0" width="8" height="20" rx="2" fill="${skinTone}" transform="rotate(${-armSwing})"/>
        </g>
      </g>
      
      <!-- Left leg (marching) -->
      <g transform="translate(26, 70)">
        <rect x="0" y="${legOffset}" width="5" height="20" fill="${skinTone}"/>
        <ellipse cx="2.5" cy="${20 + legOffset}" rx="3" ry="4" fill="#333"/>
      </g>
      
      <!-- Right leg (opposite march) -->
      <g transform="translate(33, 70)">
        <rect x="0" y="${otherLegOffset}" width="5" height="20" fill="${skinTone}"/>
        <ellipse cx="2.5" cy="${20 + otherLegOffset}" rx="3" ry="4" fill="#333"/>
      </g>
    </svg>
  `;
}

// ─── Back-Facing Sprites (player moving away from camera) ────

/**
 * Generate back-facing hair SVG based on style.
 * Back view shows fuller hair coverage (no face visible).
 */
function getBackHairSVG(hairStyle: string, hairColor: string): string {
  if (hairStyle === 'pigtails') {
    return `
      <!-- Back pigtails - visible from behind -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}"/>
      <ellipse cx="18" cy="28" rx="7" ry="10" fill="${hairColor}"/>
      <ellipse cx="46" cy="28" rx="7" ry="10" fill="${hairColor}"/>
    `;
  } else if (hairStyle === 'straight') {
    return `
      <!-- Back straight hair - flows down -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}"/>
      <rect x="18" y="24" width="28" height="20" rx="4" fill="${hairColor}"/>
    `;
  } else {
    // wavy
    return `
      <!-- Back wavy hair - flowing waves -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}"/>
      <path d="M 18 28 Q 20 38 18 44 M 25 30 Q 27 40 25 46 M 32 30 Q 34 42 32 48 M 39 30 Q 41 40 39 46 M 46 28 Q 44 38 46 44" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="18" y="24" width="28" height="18" rx="4" fill="${hairColor}"/>
    `;
  }
}

/**
 * Generate SVG for idle back-facing character.
 * Shows back of head (hair), dress from behind, no face features.
 */
export function generateBackIdleCharacterSVG(variation: CharacterVariation): string {
  const { hairColor, hairStyle, dressColor, skinTone } = variation;
  const backHair = getBackHairSVG(hairStyle, hairColor);

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Hair (back of head) -->
      ${backHair}

      <!-- Neck/skin peek -->
      <rect x="28" y="38" width="8" height="6" fill="${skinTone}"/>

      <!-- Body - Dress (back, with center seam) -->
      <rect x="22" y="42" width="20" height="28" rx="3" fill="${dressColor}"/>
      <line x1="32" y1="44" x2="32" y2="68" stroke="#000" stroke-width="0.5" opacity="0.15"/>

      <!-- Dress trim (back) -->
      <line x1="22" y1="48" x2="42" y2="48" stroke="#FFF" stroke-width="1" opacity="0.4"/>

      <!-- Arms (back view — slightly inward) -->
      <rect x="16" y="44" width="7" height="20" rx="2" fill="${skinTone}"/>
      <rect x="41" y="44" width="7" height="20" rx="2" fill="${skinTone}"/>

      <!-- Legs -->
      <rect x="26" y="70" width="5" height="20" fill="${skinTone}"/>
      <rect x="33" y="70" width="5" height="20" fill="${skinTone}"/>

      <!-- Shoes -->
      <ellipse cx="28.5" cy="90" rx="3" ry="4" fill="#333"/>
      <ellipse cx="35.5" cy="90" rx="3" ry="4" fill="#333"/>
    </svg>
  `;
}

/**
 * Generate SVG for back-facing walking animation.
 * Same leg/arm cycle as front, but shows back of character.
 */
export function generateBackWalkingCharacterSVG(variation: CharacterVariation, frame: number): string {
  const { hairColor, hairStyle, dressColor, skinTone } = variation;
  const backHair = getBackHairSVG(hairStyle, hairColor);

  const legOffset = [0, -4, -6, -4, 0, 4][frame] || 0;
  const otherLegOffset = [0, 4, 6, 4, 0, -4][frame] || 0;
  const armSwing = [0, -3, -5, -3, 0, 3][frame] || 0;
  const bodyBounce = [0, -1, -2, -1, 0, -1][frame] || 0;

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Upper body with bounce -->
      <g transform="translate(0, ${bodyBounce})">
        <!-- Hair (back of head) -->
        ${backHair}

        <!-- Neck/skin peek -->
        <rect x="28" y="38" width="8" height="6" fill="${skinTone}"/>

        <!-- Body - Dress (back) -->
        <rect x="22" y="42" width="20" height="28" rx="3" fill="${dressColor}"/>
        <line x1="32" y1="44" x2="32" y2="68" stroke="#000" stroke-width="0.5" opacity="0.15"/>

        <!-- Dress trim -->
        <line x1="22" y1="48" x2="42" y2="48" stroke="#FFF" stroke-width="1" opacity="0.4"/>

        <!-- Left arm (swinging from shoulder) -->
        <g transform="translate(23, 44)">
          <rect x="-7" y="0" width="7" height="20" rx="2" fill="${skinTone}" transform="rotate(${armSwing})"/>
        </g>

        <!-- Right arm (opposite swing) -->
        <g transform="translate(41, 44)">
          <rect x="0" y="0" width="7" height="20" rx="2" fill="${skinTone}" transform="rotate(${-armSwing})"/>
        </g>
      </g>

      <!-- Left leg (marching) -->
      <g transform="translate(26, 70)">
        <rect x="0" y="${legOffset}" width="5" height="20" fill="${skinTone}"/>
        <ellipse cx="2.5" cy="${20 + legOffset}" rx="3" ry="4" fill="#333"/>
      </g>

      <!-- Right leg (opposite march) -->
      <g transform="translate(33, 70)">
        <rect x="0" y="${otherLegOffset}" width="5" height="20" fill="${skinTone}"/>
        <ellipse cx="2.5" cy="${20 + otherLegOffset}" rx="3" ry="4" fill="#333"/>
      </g>
    </svg>
  `;
}

// ─── Side-Facing Sprites (player moving left/right on screen) ────

/**
 * Generate side-facing hair SVG based on style.
 * Profile view — hair flows behind (to the left, character faces right).
 */
function getSideHairSVG(hairStyle: string, hairColor: string): string {
  if (hairStyle === 'pigtails') {
    return `
      <!-- Side pigtail (visible one behind head) -->
      <ellipse cx="22" cy="28" rx="6" ry="9" fill="${hairColor}"/>
      <!-- Main hair cap -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}"/>
    `;
  } else if (hairStyle === 'straight') {
    return `
      <!-- Side straight hair flows behind -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}"/>
      <rect x="18" y="22" width="16" height="18" rx="4" fill="${hairColor}"/>
    `;
  } else {
    // wavy
    return `
      <!-- Side wavy hair -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}"/>
      <path d="M 20 26 Q 18 36 20 42 M 26 28 Q 24 38 26 44" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="18" y="22" width="16" height="14" rx="4" fill="${hairColor}"/>
    `;
  }
}

/**
 * Generate SVG for idle side-facing character (faces right; flipX for left).
 * Profile view showing one eye, profile nose, narrower body.
 */
export function generateSideIdleCharacterSVG(variation: CharacterVariation): string {
  const { hairColor, hairStyle, dressColor, skinTone } = variation;
  const sideHair = getSideHairSVG(hairStyle, hairColor);

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Hair -->
      ${sideHair}

      <!-- Face (profile) -->
      <circle cx="36" cy="30" r="10" fill="${skinTone}"/>

      <!-- Eye (one visible) -->
      <circle cx="42" cy="28" r="1.5" fill="#0066CC"/>

      <!-- Nose (profile bump) -->
      <path d="M 44 30 L 46 32 L 44 33" fill="${skinTone}" stroke="${skinTone}" stroke-width="1"/>

      <!-- Mouth -->
      <path d="M 41 34 Q 43 35 44 34" stroke="#CC6699" stroke-width="1" fill="none" stroke-linecap="round"/>

      <!-- Neck -->
      <rect x="30" y="38" width="8" height="6" fill="${skinTone}"/>

      <!-- Body - Dress (side view, narrower) -->
      <rect x="25" y="42" width="16" height="28" rx="3" fill="${dressColor}"/>

      <!-- Dress trim -->
      <line x1="25" y1="48" x2="41" y2="48" stroke="#FFF" stroke-width="1" opacity="0.5"/>

      <!-- Back arm (behind body, partially visible) -->
      <rect x="22" y="44" width="6" height="18" rx="2" fill="${skinTone}" opacity="0.6"/>

      <!-- Front arm -->
      <rect x="38" y="44" width="6" height="18" rx="2" fill="${skinTone}"/>

      <!-- Back leg -->
      <rect x="28" y="70" width="5" height="20" fill="${skinTone}" opacity="0.7"/>

      <!-- Front leg -->
      <rect x="33" y="70" width="5" height="20" fill="${skinTone}"/>

      <!-- Shoes -->
      <ellipse cx="30.5" cy="90" rx="3" ry="4" fill="#333" opacity="0.7"/>
      <ellipse cx="35.5" cy="90" rx="3" ry="4" fill="#333"/>
    </svg>
  `;
}

/**
 * Generate SVG for side-facing walking animation.
 * Profile stride with clear leg separation and arm swing.
 */
export function generateSideWalkingCharacterSVG(variation: CharacterVariation, frame: number): string {
  const { hairColor, hairStyle, dressColor, skinTone } = variation;
  const sideHair = getSideHairSVG(hairStyle, hairColor);

  const legOffset = [0, -4, -6, -4, 0, 4][frame] || 0;
  const otherLegOffset = [0, 4, 6, 4, 0, -4][frame] || 0;
  const armSwing = [0, -5, -8, -5, 0, 5][frame] || 0;
  const bodyBounce = [0, -1, -2, -1, 0, -1][frame] || 0;

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Upper body with bounce -->
      <g transform="translate(0, ${bodyBounce})">
        <!-- Hair -->
        ${sideHair}

        <!-- Face (profile) -->
        <circle cx="36" cy="30" r="10" fill="${skinTone}"/>

        <!-- Eye -->
        <circle cx="42" cy="28" r="1.5" fill="#0066CC"/>

        <!-- Nose -->
        <path d="M 44 30 L 46 32 L 44 33" fill="${skinTone}" stroke="${skinTone}" stroke-width="1"/>

        <!-- Mouth -->
        <path d="M 41 34 Q 43 35 44 34" stroke="#CC6699" stroke-width="1" fill="none" stroke-linecap="round"/>

        <!-- Neck -->
        <rect x="30" y="38" width="8" height="6" fill="${skinTone}"/>

        <!-- Body - Dress (side, narrower) -->
        <rect x="25" y="42" width="16" height="28" rx="3" fill="${dressColor}"/>

        <!-- Dress trim -->
        <line x1="25" y1="48" x2="41" y2="48" stroke="#FFF" stroke-width="1" opacity="0.5"/>

        <!-- Back arm (swinging, behind body) -->
        <g transform="translate(25, 44)">
          <rect x="-3" y="0" width="6" height="18" rx="2" fill="${skinTone}" opacity="0.6" transform="rotate(${-armSwing})"/>
        </g>

        <!-- Front arm (swinging, in front) -->
        <g transform="translate(41, 44)">
          <rect x="-3" y="0" width="6" height="18" rx="2" fill="${skinTone}" transform="rotate(${armSwing})"/>
        </g>
      </g>

      <!-- Back leg (striding) -->
      <g transform="translate(28, 70)">
        <rect x="0" y="${otherLegOffset}" width="5" height="20" fill="${skinTone}" opacity="0.7"/>
        <ellipse cx="2.5" cy="${20 + otherLegOffset}" rx="3" ry="4" fill="#333" opacity="0.7"/>
      </g>

      <!-- Front leg (striding) -->
      <g transform="translate(33, 70)">
        <rect x="0" y="${legOffset}" width="5" height="20" fill="${skinTone}"/>
        <ellipse cx="2.5" cy="${20 + legOffset}" rx="3" ry="4" fill="#333"/>
      </g>
    </svg>
  `;
}

/**
 * Cache for generated SVG images.
 */
export const spriteCache: Map<string, HTMLImageElement> = new Map();

/**
 * Clear cached sprites for a specific variation name (e.g. 'custom').
 * Called when player changes appearance via customizer.
 */
export function clearVariationCache(variationName: string): void {
  for (const key of spriteCache.keys()) {
    if (key.startsWith(variationName + '_')) {
      spriteCache.delete(key);
    }
  }
}

/** Select the correct SVG generator based on pose and state */
function getSVGForPose(
  variation: CharacterVariation,
  frame: number,
  isWalking: boolean,
  pose: FacingPose,
): string {
  if (pose === 'back') {
    return isWalking
      ? generateBackWalkingCharacterSVG(variation, frame)
      : generateBackIdleCharacterSVG(variation);
  }
  if (pose === 'side') {
    return isWalking
      ? generateSideWalkingCharacterSVG(variation, frame)
      : generateSideIdleCharacterSVG(variation);
  }
  // 'front' pose (default)
  return isWalking
    ? generateWalkingCharacterSVG(variation, frame)
    : generateIdleCharacterSVG(variation);
}

/**
 * Load a character sprite SVG asynchronously as an image element.
 * Caches results to avoid regeneration.
 */
export async function loadCharacterSpriteAsync(
  variation: CharacterVariation,
  frame: number = 0,
  isWalking: boolean = false,
  pose: FacingPose = 'front',
): Promise<HTMLImageElement> {
  const cacheKey = `${variation.name}_f${frame}_${isWalking ? 'walk' : 'idle'}_${pose}`;

  if (spriteCache.has(cacheKey)) {
    return spriteCache.get(cacheKey)!;
  }

  const svgString = getSVGForPose(variation, frame, isWalking, pose);

  const svg = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svg);

  const img = new Image();

  return new Promise((resolve) => {
    img.onload = () => {
      spriteCache.set(cacheKey, img);
      resolve(img);
    };
    img.onerror = () => {
      console.error(`Failed to load sprite: ${cacheKey}`);
      resolve(img); // Still resolve with the image even if it fails
    };
    img.src = url;
  });
}

/**
 * Load a character sprite SVG synchronously (for immediate use).
 * Note: Image will load asynchronously in background.
 * @param pose - 'front' (default/side view) or 'back' (walking away from camera)
 */
export function loadCharacterSprite(
  variation: CharacterVariation,
  frame: number = 0,
  isWalking: boolean = false,
  pose: FacingPose = 'front',
): HTMLImageElement {
  const cacheKey = `${variation.name}_f${frame}_${isWalking ? 'walk' : 'idle'}_${pose}`;

  if (spriteCache.has(cacheKey)) {
    return spriteCache.get(cacheKey)!;
  }

  const svgString = getSVGForPose(variation, frame, isWalking, pose);

  const svg = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svg);

  const img = new Image();
  img.src = url;

  spriteCache.set(cacheKey, img);
  return img;
}
