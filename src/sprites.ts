/**
 * sprites.ts - Programmable SVG character sprite system.
 * Creates animated character variations based on color/appearance parameters.
 * Supports 3 facing poses: front (default), back, and side (with flip for left/right).
 * TODO: DOC - facing direction sprite system
 */

/** Player facing direction for sprite selection */
export type FacingPose = 'front' | 'back' | 'side';

/** Expression variants (#102) */
export type Expression = 'happy' | 'neutral' | 'surprised' | 'determined';

/** Head accessory variants (#102) */
export type Accessory = 'none' | 'bow' | 'crown' | 'glasses';

export interface CharacterVariation {
  name: string;
  hairColor: string;
  hairStyle: 'straight' | 'pigtails' | 'wavy' | 'ponytail' | 'braids' | 'spiky';
  dressColor: string;
  skinTone: string;
  accessory?: Accessory;
  expression?: Expression;
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
    accessory: 'none',
    expression: 'happy',
  },
  brunette_green: {
    name: 'Brunette Girl (Green Dress)',
    hairColor: '#8B6F47',
    hairStyle: 'straight',
    dressColor: '#4A9D5F',
    skinTone: '#F4C9B8',
    accessory: 'none',
    expression: 'happy',
  },
  blonde_purple: {
    name: 'Blonde Girl (Purple Dress)',
    hairColor: '#DAA520',
    hairStyle: 'wavy',
    dressColor: '#6A5ACD',
    skinTone: '#F4C9B8',
    accessory: 'none',
    expression: 'happy',
  },
};

// ─── Hair darken helper for subtle shading ──────────────────
function darkenColor(hex: string, amount: number = 0.2): string {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((c >> 16) & 0xff) * (1 - amount)) | 0;
  const g = Math.max(0, ((c >> 8) & 0xff) * (1 - amount)) | 0;
  const b = Math.max(0, (c & 0xff) * (1 - amount)) | 0;
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── Front-facing hair helper ─────────────────────────────────

// ─── Expression SVG helpers (#102) ─────────────────────────────

/** Front-facing face with expression-aware eyes + mouth */
function getFrontFaceSVG(skinTone: string, expression: Expression = 'happy'): string {
  const E: Record<Expression, string> = {
    happy:
      `<circle cx="28" cy="30" r="1.5" fill="#0066CC"/>
       <circle cx="36" cy="30" r="1.5" fill="#0066CC"/>`,
    neutral:
      `<ellipse cx="28" cy="30" rx="1.5" ry="1" fill="#0066CC"/>
       <ellipse cx="36" cy="30" rx="1.5" ry="1" fill="#0066CC"/>`,
    surprised:
      `<circle cx="28" cy="30" r="2" fill="#0066CC"/>
       <circle cx="36" cy="30" r="2" fill="#0066CC"/>`,
    determined:
      `<circle cx="28" cy="30" r="1.5" fill="#0066CC"/>
       <circle cx="36" cy="30" r="1.5" fill="#0066CC"/>
       <line x1="26" y1="27" x2="30" y2="28.5" stroke="#555" stroke-width="1" stroke-linecap="round"/>
       <line x1="38" y1="27" x2="34" y2="28.5" stroke="#555" stroke-width="1" stroke-linecap="round"/>`,
  };
  const M: Record<Expression, string> = {
    happy:      `<path d="M 28 34 Q 32 36, 36 34" stroke="#CC6699" stroke-width="1" fill="none" stroke-linecap="round"/>`,
    neutral:    `<line x1="29" y1="34" x2="35" y2="34" stroke="#CC6699" stroke-width="1" stroke-linecap="round"/>`,
    surprised:  `<ellipse cx="32" cy="35" rx="2" ry="1.8" fill="#CC6699"/>`,
    determined: `<line x1="28" y1="35" x2="36" y2="35" stroke="#CC6699" stroke-width="1.5" stroke-linecap="round"/>`,
  };
  return `
    <circle cx="32" cy="32" r="10" fill="${skinTone}"/>
    ${E[expression] || E.happy}
    ${M[expression] || M.happy}`;
}

/** Side-facing face with expression-aware eye + mouth */
function getSideFaceSVG(skinTone: string, expression: Expression = 'happy'): string {
  const E: Record<Expression, string> = {
    happy:      `<circle cx="42" cy="28" r="1.5" fill="#0066CC"/>`,
    neutral:    `<ellipse cx="42" cy="28" rx="1.5" ry="1" fill="#0066CC"/>`,
    surprised:  `<circle cx="42" cy="28" r="2" fill="#0066CC"/>`,
    determined: `<circle cx="42" cy="28" r="1.5" fill="#0066CC"/>
                 <line x1="40" y1="26" x2="44" y2="27" stroke="#555" stroke-width="1" stroke-linecap="round"/>`,
  };
  const M: Record<Expression, string> = {
    happy:      `<path d="M 41 34 Q 43 35 44 34" stroke="#CC6699" stroke-width="1" fill="none" stroke-linecap="round"/>`,
    neutral:    `<line x1="41" y1="34" x2="44" y2="34" stroke="#CC6699" stroke-width="1" stroke-linecap="round"/>`,
    surprised:  `<ellipse cx="43" cy="35" rx="1.5" ry="1.3" fill="#CC6699"/>`,
    determined: `<line x1="41" y1="35" x2="44" y2="35" stroke="#CC6699" stroke-width="1.5" stroke-linecap="round"/>`,
  };
  return `
    <circle cx="36" cy="30" r="10" fill="${skinTone}"/>
    ${E[expression] || E.happy}
    <path d="M 44 30 L 46 32 L 44 33" fill="${skinTone}" stroke="${skinTone}" stroke-width="1"/>
    ${M[expression] || M.happy}`;
}

// ─── Accessory SVG helpers (#102) ──────────────────────────────

/** Front-facing accessory, rendered above hair */
function getFrontAccessorySVG(accessory: Accessory = 'none'): string {
  switch (accessory) {
    case 'bow':
      return `<path d="M 27 20 Q 24 16 29 18 L 32 20 L 35 18 Q 40 16 37 20 Z" fill="#FF69B4" stroke="#FF1493" stroke-width="0.5"/>`;
    case 'crown':
      return `<path d="M 24 22 L 26 17 L 29 20 L 32 15 L 35 20 L 38 17 L 40 22 Z" fill="#FFD700" stroke="#DAA520" stroke-width="0.5"/>
              <line x1="24" y1="22" x2="40" y2="22" stroke="#DAA520" stroke-width="1"/>`;
    case 'glasses':
      return `<circle cx="28" cy="30" r="3.5" fill="none" stroke="#555" stroke-width="0.8"/>
              <circle cx="36" cy="30" r="3.5" fill="none" stroke="#555" stroke-width="0.8"/>
              <line x1="31.5" y1="30" x2="32.5" y2="30" stroke="#555" stroke-width="0.8"/>
              <line x1="24.5" y1="30" x2="22" y2="28" stroke="#555" stroke-width="0.6"/>
              <line x1="39.5" y1="30" x2="42" y2="28" stroke="#555" stroke-width="0.6"/>`;
    default: return '';
  }
}

/** Side-facing accessory */
function getSideAccessorySVG(accessory: Accessory = 'none'): string {
  switch (accessory) {
    case 'bow':
      return `<path d="M 30 20 Q 28 16 33 18 L 35 20 Q 38 18 36 22 Z" fill="#FF69B4" stroke="#FF1493" stroke-width="0.5"/>`;
    case 'crown':
      return `<path d="M 28 22 L 30 17 L 33 20 L 36 15 L 38 22 Z" fill="#FFD700" stroke="#DAA520" stroke-width="0.5"/>
              <line x1="28" y1="22" x2="38" y2="22" stroke="#DAA520" stroke-width="1"/>`;
    case 'glasses':
      return `<circle cx="42" cy="28" r="3" fill="none" stroke="#555" stroke-width="0.8"/>
              <line x1="39" y1="28" x2="36" y2="26" stroke="#555" stroke-width="0.6"/>`;
    default: return '';
  }
}

/** Back-facing accessory (only accessories visible from behind) */
function getBackAccessorySVG(accessory: Accessory = 'none'): string {
  switch (accessory) {
    case 'bow':
      return `<path d="M 27 20 Q 24 16 29 18 L 32 20 L 35 18 Q 40 16 37 20 Z" fill="#FF69B4" stroke="#FF1493" stroke-width="0.5"/>`;
    case 'crown':
      return `<path d="M 24 22 L 26 17 L 29 20 L 32 15 L 35 20 L 38 17 L 40 22 Z" fill="#FFD700" stroke="#DAA520" stroke-width="0.5"/>
              <line x1="24" y1="22" x2="40" y2="22" stroke="#DAA520" stroke-width="1"/>`;
    case 'glasses': return ''; // not visible from behind
    default: return '';
  }
}

// ─── Front-facing hair helper ─────────────────────────────────
// (original code follows below)

/** Generate front-facing hair SVG. Shared by idle + walk. */
function getFrontHairSVG(hairStyle: string, hairColor: string): string {
  const shadow = darkenColor(hairColor, 0.15);
  if (hairStyle === 'pigtails') {
    return `
      <!-- Left pigtail -->
      <circle cx="20" cy="18" r="8" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <ellipse cx="18" cy="25" rx="6" ry="8" fill="${hairColor}"/>
      <!-- Right pigtail -->
      <circle cx="44" cy="18" r="8" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <ellipse cx="46" cy="25" rx="6" ry="8" fill="${hairColor}"/>
      <!-- Main head -->
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
    `;
  } else if (hairStyle === 'straight') {
    return `
      <!-- Straight hair -->
      <path d="M 18 24 Q 18 10, 32 8 Q 46 10, 46 24" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
      <!-- Subtle fringe detail -->
      <path d="M 22 20 Q 27 17 32 18 Q 37 17 42 20" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.4"/>
    `;
  } else if (hairStyle === 'ponytail') {
    return `
      <!-- Ponytail - hair cap with pulled-back shape -->
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
      <!-- Lifted crown (hair pulled back) -->
      <path d="M 20 22 Q 22 10, 32 9 Q 42 10, 44 22" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Ponytail tail behind head -->
      <ellipse cx="32" cy="38" rx="5" ry="10" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Bow at base of ponytail -->
      <path d="M 26 28 Q 29 26 32 28 Q 35 26 38 28" fill="#E84393" stroke="#C0392B" stroke-width="0.5"/>
      <circle cx="32" cy="27" r="1.5" fill="#E84393"/>
    `;
  } else if (hairStyle === 'braids') {
    return `
      <!-- Braids - two thick braids with bands -->
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
      <!-- Left braid -->
      <path d="M 20 26 Q 18 32 17 38 Q 16 44 18 50" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M 20 28 L 17 32 L 20 36 L 17 40 L 20 44 L 17 48" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.5"/>
      <!-- Left braid bands -->
      <rect x="15" y="30" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <rect x="14" y="42" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <!-- Right braid -->
      <path d="M 44 26 Q 46 32 47 38 Q 48 44 46 50" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M 44 28 L 47 32 L 44 36 L 47 40 L 44 44 L 47 48" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.5"/>
      <!-- Right braid bands -->
      <rect x="43" y="30" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <rect x="44" y="42" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <!-- Fringe -->
      <path d="M 22 18 Q 27 15 32 16 Q 37 15 42 18" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.4"/>
    `;
  } else if (hairStyle === 'spiky') {
    return `
      <!-- Spiky hair - angular messy punk look -->
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
      <!-- Spikes pointing up -->
      <path d="M 20 20 L 18 8 L 24 16" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 26 18 L 26 6 L 32 14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 32 16 L 34 4 L 38 14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 38 18 L 42 6 L 44 16" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 42 20 L 48 10 L 46 20" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Side tufts -->
      <path d="M 18 24 L 12 18 L 18 22" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 46 24 L 52 18 L 46 22" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
    `;
  } else {
    // wavy
    return `
      <!-- Wavy hair -->
      <path d="M 18 24 Q 15 10, 32 8 Q 49 10, 46 24" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <circle cx="32" cy="24" r="14" fill="${hairColor}"/>
      <!-- Wave details -->
      <path d="M 20 22 Q 24 19 28 22 Q 32 19 36 22 Q 40 19 44 22" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.4"/>
    `;
  }
}

/**
 * Generate SVG for idle (standing) character pose.
 */
export function generateIdleCharacterSVG(variation: CharacterVariation): string {
  const { hairColor, hairStyle, dressColor, skinTone, accessory, expression } = variation;
  const hairSVG = getFrontHairSVG(hairStyle, hairColor);

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Head -->
      ${hairSVG}
      
      <!-- Face -->
      ${getFrontFaceSVG(skinTone, expression)}
      
      <!-- Accessory -->
      ${getFrontAccessorySVG(accessory)}
      
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
  const { hairColor, hairStyle, dressColor, skinTone, accessory, expression } = variation;

  // Calculate leg and arm positions based on animation frame
  const legOffset = [0, -4, -6, -4, 0, 4][frame] || 0;
  const otherLegOffset = [0, 4, 6, 4, 0, -4][frame] || 0;
  const armSwing = [0, -3, -5, -3, 0, 3][frame] || 0;
  // Subtle vertical bounce for natural walking motion (1-2px)
  const bodyBounce = [0, -1, -2, -1, 0, -1][frame] || 0;

  const hairSVG = getFrontHairSVG(hairStyle, hairColor);

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Upper body group with walking bounce -->
      <g transform="translate(0, ${bodyBounce})">
        <!-- Head -->
        ${hairSVG}
        
        <!-- Face -->
        ${getFrontFaceSVG(skinTone, expression)}
        
        <!-- Accessory -->
        ${getFrontAccessorySVG(accessory)}
        
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
  const shadow = darkenColor(hairColor, 0.15);
  if (hairStyle === 'pigtails') {
    return `
      <!-- Back pigtails - visible from behind -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <ellipse cx="18" cy="28" rx="7" ry="10" fill="${hairColor}"/>
      <ellipse cx="46" cy="28" rx="7" ry="10" fill="${hairColor}"/>
    `;
  } else if (hairStyle === 'straight') {
    return `
      <!-- Back straight hair - flows down -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <rect x="18" y="24" width="28" height="20" rx="4" fill="${hairColor}"/>
      <!-- Subtle strand lines -->
      <path d="M 24 28 L 24 42 M 32 28 L 32 44 M 40 28 L 40 42" stroke="${shadow}" stroke-width="0.6" opacity="0.3"/>
    `;
  } else if (hairStyle === 'ponytail') {
    return `
      <!-- Back view ponytail - prominent tail hanging down -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Ponytail bundle hanging down center of back -->
      <ellipse cx="32" cy="42" rx="6" ry="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <ellipse cx="32" cy="52" rx="4" ry="6" fill="${hairColor}"/>
      <!-- Bow at base of cap  -->
      <path d="M 25 28 Q 28.5 24 32 28 Q 35.5 24 39 28" fill="#E84393" stroke="#C0392B" stroke-width="0.5"/>
      <circle cx="32" cy="27" r="2" fill="#E84393"/>
      <!-- Tail strand detail -->
      <path d="M 32 34 L 32 52" stroke="${shadow}" stroke-width="0.6" opacity="0.3"/>
    `;
  } else if (hairStyle === 'braids') {
    return `
      <!-- Back braids - two prominent braids down the back -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Left braid -->
      <path d="M 22 28 Q 20 36 19 44 Q 18 50 20 56" stroke="${hairColor}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M 22 30 L 19 34 L 22 38 L 19 42 L 22 46 L 19 50 L 22 54" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.5"/>
      <rect x="17" y="34" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <rect x="16" y="46" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <!-- Right braid -->
      <path d="M 42 28 Q 44 36 45 44 Q 46 50 44 56" stroke="${hairColor}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M 42 30 L 45 34 L 42 38 L 45 42 L 42 46 L 45 50 L 42 54" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.5"/>
      <rect x="41" y="34" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
      <rect x="42" y="46" width="6" height="2.5" rx="1" fill="#E84393" opacity="0.8"/>
    `;
  } else if (hairStyle === 'spiky') {
    return `
      <!-- Back spiky hair -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Spikes visible from behind -->
      <path d="M 22 18 L 18 6 L 26 14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 28 16 L 28 4 L 34 12" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 34 16 L 36 2 L 40 12" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 40 18 L 46 6 L 44 16" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Side tufts -->
      <path d="M 18 22 L 10 16 L 18 20" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 46 22 L 54 16 L 46 20" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
    `;
  } else {
    // wavy
    return `
      <!-- Back wavy hair - flowing waves -->
      <circle cx="32" cy="24" r="15" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 18 28 Q 20 38 18 44 M 25 30 Q 27 40 25 46 M 32 30 Q 34 42 32 48 M 39 30 Q 41 40 39 46 M 46 28 Q 44 38 46 44" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="18" y="24" width="28" height="18" rx="4" fill="${hairColor}"/>
      <!-- Wave highlights -->
      <path d="M 22 30 Q 24 28 26 30 M 34 30 Q 36 28 38 30" stroke="${shadow}" stroke-width="0.7" opacity="0.3" fill="none"/>
    `;
  }
}

/**
 * Generate SVG for idle back-facing character.
 * Shows back of head (hair), dress from behind, no face features.
 */
export function generateBackIdleCharacterSVG(variation: CharacterVariation): string {
  const { hairColor, hairStyle, dressColor, skinTone, accessory } = variation;
  const backHair = getBackHairSVG(hairStyle, hairColor);

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Hair (back of head) -->
      ${backHair}

      <!-- Accessory -->
      ${getBackAccessorySVG(accessory)}

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
  const { hairColor, hairStyle, dressColor, skinTone, accessory } = variation;
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

        <!-- Accessory -->
        ${getBackAccessorySVG(accessory)}

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
  const shadow = darkenColor(hairColor, 0.15);
  if (hairStyle === 'pigtails') {
    return `
      <!-- Side pigtail (visible one behind head) -->
      <ellipse cx="22" cy="28" rx="6" ry="9" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Main hair cap -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
    `;
  } else if (hairStyle === 'straight') {
    return `
      <!-- Side straight hair flows behind -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <rect x="18" y="22" width="16" height="18" rx="4" fill="${hairColor}"/>
      <!-- Strand detail -->
      <path d="M 22 26 L 22 38 M 28 26 L 28 40" stroke="${shadow}" stroke-width="0.6" opacity="0.3"/>
    `;
  } else if (hairStyle === 'ponytail') {
    return `
      <!-- Side view ponytail - tail extending behind head -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Ponytail hanging behind - prominent flowing shape -->
      <path d="M 24 26 Q 18 30 16 40 Q 15 48 18 52" stroke="${hairColor}" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M 24 26 Q 18 30 16 40 Q 15 48 18 52" stroke="${shadow}" stroke-width="1" fill="none" opacity="0.3" stroke-linecap="round"/>
      <!-- Bow at tie point -->
      <path d="M 21 26 Q 23 23 25 26 Q 27 23 29 26" fill="#E84393" stroke="#C0392B" stroke-width="0.5"/>
      <circle cx="25" cy="25" r="1.5" fill="#E84393"/>
    `;
  } else if (hairStyle === 'braids') {
    return `
      <!-- Side view braids - one braid visible hanging -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Visible braid hanging from side -->
      <path d="M 22 26 Q 18 34 16 42 Q 15 48 17 54" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M 22 28 L 18 32 L 22 36 L 18 40 L 22 44 L 18 48 L 22 52" stroke="${shadow}" stroke-width="0.8" fill="none" opacity="0.5"/>
      <!-- Braid bands -->
      <rect x="15" y="32" width="5" height="2" rx="1" fill="#E84393" opacity="0.8"/>
      <rect x="14" y="44" width="5" height="2" rx="1" fill="#E84393" opacity="0.8"/>
    `;
  } else if (hairStyle === 'spiky') {
    return `
      <!-- Side view spiky hair -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Spikes from side profile -->
      <path d="M 24 18 L 20 6 L 28 14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 30 16 L 30 4 L 36 12" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 36 16 L 40 4 L 40 14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 40 18 L 48 8 L 44 18" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <!-- Back tuft -->
      <path d="M 20 22 L 12 14 L 18 20" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
    `;
  } else {
    // wavy
    return `
      <!-- Side wavy hair -->
      <circle cx="32" cy="22" r="14" fill="${hairColor}" stroke="${shadow}" stroke-width="0.5"/>
      <path d="M 20 26 Q 18 36 20 42 M 26 28 Q 24 38 26 44" stroke="${hairColor}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="18" y="22" width="16" height="14" rx="4" fill="${hairColor}"/>
      <!-- Wave accents -->
      <path d="M 21 28 Q 23 26 25 28" stroke="${shadow}" stroke-width="0.7" opacity="0.3" fill="none"/>
    `;
  }
}

/**
 * Generate SVG for idle side-facing character (faces right; flipX for left).
 * Profile view showing one eye, profile nose, narrower body.
 */
export function generateSideIdleCharacterSVG(variation: CharacterVariation): string {
  const { hairColor, hairStyle, dressColor, skinTone, accessory, expression } = variation;
  const sideHair = getSideHairSVG(hairStyle, hairColor);

  return `
    <svg viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
      <!-- Hair -->
      ${sideHair}

      <!-- Face (profile) -->
      ${getSideFaceSVG(skinTone, expression)}

      <!-- Accessory -->
      ${getSideAccessorySVG(accessory)}

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
  const { hairColor, hairStyle, dressColor, skinTone, accessory, expression } = variation;
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
        ${getSideFaceSVG(skinTone, expression)}

        <!-- Accessory -->
        ${getSideAccessorySVG(accessory)}

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
  const acc = variation.accessory ?? 'none';
  const expr = variation.expression ?? 'happy';
  const cacheKey = `${variation.name}_${acc}_${expr}_f${frame}_${isWalking ? 'walk' : 'idle'}_${pose}`;

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
  const acc = variation.accessory ?? 'none';
  const expr = variation.expression ?? 'happy';
  const cacheKey = `${variation.name}_${acc}_${expr}_f${frame}_${isWalking ? 'walk' : 'idle'}_${pose}`;

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
