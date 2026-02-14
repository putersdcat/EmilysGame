/**
 * sprites.ts - Programmable SVG character sprite system.
 * Creates animated character variations based on color/appearance parameters.
 */

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

/**
 * Cache for generated SVG images.
 */
export const spriteCache: Map<string, HTMLImageElement> = new Map();

/**
 * Load a character sprite SVG asynchronously as an image element.
 * Caches results to avoid regeneration.
 * For compatibility, we return a simple placeholder until async loading completes.
 */
export async function loadCharacterSpriteAsync(
  variation: CharacterVariation,
  frame: number = 0,
  isWalking: boolean = false
): Promise<HTMLImageElement> {
  const cacheKey = `${variation.name}_f${frame}_${isWalking ? 'walk' : 'idle'}`;

  if (spriteCache.has(cacheKey)) {
    return spriteCache.get(cacheKey)!;
  }

  const svgString = isWalking
    ? generateWalkingCharacterSVG(variation, frame)
    : generateIdleCharacterSVG(variation);

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
 */
export function loadCharacterSprite(
  variation: CharacterVariation,
  frame: number = 0,
  isWalking: boolean = false
): HTMLImageElement {
  const cacheKey = `${variation.name}_f${frame}_${isWalking ? 'walk' : 'idle'}`;

  if (spriteCache.has(cacheKey)) {
    return spriteCache.get(cacheKey)!;
  }

  const svgString = isWalking
    ? generateWalkingCharacterSVG(variation, frame)
    : generateIdleCharacterSVG(variation);

  const svg = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svg);

  const img = new Image();
  img.src = url;

  spriteCache.set(cacheKey, img);
  return img;
}
