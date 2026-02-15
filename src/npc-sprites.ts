/**
 * npc-sprites.ts — Paper-cut style SVG sprites for human NPCs (#85).
 * Simple geometric shapes, bold outlines, flat colors.
 * Direction-aware facing + dialog mouth animation hook.
 * TODO: DOC - NPC sprite system, paper-cut style, archetypes
 */

// ─── Types ───────────────────────────────────────────────────

/** NPC visual appearance definition */
export interface NpcAppearance {
  bodyColor: string;      // Outfit/body color
  bodyAccent: string;     // Belt, collar, trim
  skinTone: string;       // Face/hands
  hairColor: string;      // Hair
  hairStyle: 'short' | 'long' | 'bald';
  hat?: 'wizard' | 'helmet' | 'hood' | 'straw' | 'beekeeper' | 'miner' | 'crown';
  accessory?: string;     // Held item emoji or SVG path snippet
  outlineColor: string;   // Bold paper-cut outline
}

/** Direction an NPC is facing */
export type NpcFacing = 'south' | 'north' | 'east' | 'west';

/** Mouth state for dialog animation */
export type MouthState = 'closed' | 'open' | 'wide';

// ─── Archetype Appearances ──────────────────────────────────

/** Visual presets per NPC asset key. Only human NPCs get paper-cut sprites. */
export const NPC_APPEARANCES: Record<string, NpcAppearance> = {
  npc_merchant: {
    bodyColor: '#6B4C8A',    // Purple robe
    bodyAccent: '#DAA520',   // Gold belt
    skinTone: '#8BC34A',     // Green-ish (goblin-like per persona)
    hairColor: '#4A4A4A',
    hairStyle: 'bald',
    hat: 'wizard',
    accessory: '💰',
    outlineColor: '#2D1B4E',
  },
  npc_villager: {
    bodyColor: '#5B8C3E',    // Green tunic
    bodyAccent: '#8B6F47',   // Brown belt
    skinTone: '#F4C9B8',
    hairColor: '#8B6F47',
    hairStyle: 'short',
    outlineColor: '#2D3B1E',
  },
  npc_guardian: {
    bodyColor: '#708090',    // Slate armor
    bodyAccent: '#C0C0C0',   // Silver trim
    skinTone: '#D4A574',
    hairColor: '#4A4A4A',
    hairStyle: 'short',
    hat: 'helmet',
    accessory: '🛡️',
    outlineColor: '#2F4F4F',
  },
  npc_farmer: {
    bodyColor: '#8B7355',    // Brown overalls
    bodyAccent: '#CD853F',   // Tan shirt
    skinTone: '#D4A574',
    hairColor: '#8B6F47',
    hairStyle: 'short',
    hat: 'straw',
    outlineColor: '#3E2F1E',
  },
  npc_beekeeper: {
    bodyColor: '#FFFDD0',    // White suit
    bodyAccent: '#DAA520',   // Gold trim
    skinTone: '#F4C9B8',
    hairColor: '#8B6F47',
    hairStyle: 'short',
    hat: 'beekeeper',
    accessory: '🐝',
    outlineColor: '#666644',
  },
  npc_ranger: {
    bodyColor: '#2E7D32',    // Forest green
    bodyAccent: '#5D4037',   // Brown
    skinTone: '#D4A574',
    hairColor: '#4A2800',
    hairStyle: 'long',
    hat: 'hood',
    outlineColor: '#1B4B1E',
  },
  npc_hermit: {
    bodyColor: '#795548',    // Brown robes
    bodyAccent: '#4E342E',   // Dark trim
    skinTone: '#D4A574',
    hairColor: '#9E9E9E',    // Grey
    hairStyle: 'long',
    hat: 'hood',
    outlineColor: '#3E2723',
  },
  npc_miner: {
    bodyColor: '#455A64',    // Dark work clothes
    bodyAccent: '#FF8F00',   // Orange vest
    skinTone: '#D4A574',
    hairColor: '#4A4A4A',
    hairStyle: 'short',
    hat: 'miner',
    accessory: '⛏️',
    outlineColor: '#1B2D36',
  },
  npc_knight: {
    bodyColor: '#546E7A',    // Steel blue armor
    bodyAccent: '#B71C1C',   // Red tabard
    skinTone: '#F4C9B8',
    hairColor: '#6D4C2C',
    hairStyle: 'short',
    hat: 'helmet',
    accessory: '⚔️',
    outlineColor: '#263238',
  },
  // Ghost is non-human, stays emoji
  // Cats stay emoji
};

/** Check if an NPC asset key has a paper-cut sprite */
export function hasNpcSprite(assetKey: string): boolean {
  return assetKey in NPC_APPEARANCES;
}

// ─── SVG Generation ─────────────────────────────────────────
// Viewbox: 64x64, centered at 32,32. Paper-cut = bold outlines, flat shapes.

const SVG_W = 64;
const SVG_H = 64;
const OL = 1.5; // outline width

function svgWrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" width="${SVG_W}" height="${SVG_H}">${inner}</svg>`;
}

// Darken helper
function darken(hex: string, amt = 0.2): string {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((c >> 16) & 0xff) * (1 - amt)) | 0;
  const g = Math.max(0, ((c >> 8) & 0xff) * (1 - amt)) | 0;
  const b = Math.max(0, (c & 0xff) * (1 - amt)) | 0;
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── Hat SVG snippets ───────────────────────────────────────

function getHatSVG(hat: string | undefined, facing: NpcFacing, ol: string): string {
  if (!hat) return '';
  switch (hat) {
    case 'wizard':
      return facing === 'north'
        ? `<polygon points="32,0 24,16 40,16" fill="#6B4C8A" stroke="${ol}" stroke-width="${OL}"/>
           <path d="M 26 16 Q 32 13, 38 16" fill="#DAA520" stroke="none"/>`
        : `<polygon points="32,0 22,16 42,16" fill="#6B4C8A" stroke="${ol}" stroke-width="${OL}"/>
           <ellipse cx="32" cy="16" rx="12" ry="3" fill="#DAA520" stroke="${ol}" stroke-width="0.5"/>
           <circle cx="32" cy="1" r="2" fill="#FFD700"/>`;
    case 'helmet':
      return `<path d="M 22 18 Q 22 6, 32 4 Q 42 6, 42 18" fill="#708090" stroke="${ol}" stroke-width="${OL}"/>
              <rect x="22" y="16" width="20" height="3" rx="1" fill="#C0C0C0" stroke="${ol}" stroke-width="0.5"/>`;
    case 'hood':
      return `<path d="M 20 22 Q 18 8, 32 4 Q 46 8, 44 22" fill="#2E7D32" stroke="${ol}" stroke-width="${OL}" opacity="0.9"/>`;
    case 'straw':
      return `<ellipse cx="32" cy="14" rx="16" ry="4" fill="#DAA520" stroke="${ol}" stroke-width="${OL}"/>
              <ellipse cx="32" cy="12" rx="10" ry="6" fill="#F4D03F" stroke="${ol}" stroke-width="0.5"/>`;
    case 'beekeeper':
      return `<rect x="22" y="6" width="20" height="14" rx="3" fill="#FFFDD0" stroke="${ol}" stroke-width="${OL}"/>
              <rect x="24" y="18" width="16" height="6" rx="1" fill="#FFFDD0" stroke="${ol}" stroke-width="0.5" opacity="0.6"/>`;
    case 'miner':
      return `<path d="M 22 16 Q 22 8, 32 6 Q 42 8, 42 16" fill="#FF8F00" stroke="${ol}" stroke-width="${OL}"/>
              <circle cx="32" cy="8" r="3" fill="#FFEB3B" stroke="${ol}" stroke-width="0.5"/>`;
    case 'crown':
      return `<path d="M 22 16 L 24 8 L 28 14 L 32 6 L 36 14 L 40 8 L 42 16 Z" fill="#FFD700" stroke="${ol}" stroke-width="${OL}"/>`;
    default:
      return '';
  }
}

// ─── Mouth SVG ──────────────────────────────────────────────

function getMouthSVG(mouth: MouthState): string {
  switch (mouth) {
    case 'open':
      return `<ellipse cx="32" cy="30" rx="2.5" ry="2" fill="#333"/>`;
    case 'wide':
      return `<ellipse cx="32" cy="30" rx="3" ry="3" fill="#333"/>
              <ellipse cx="32" cy="31" rx="2" ry="1.5" fill="#C0392B"/>`;
    default: // closed
      return `<line x1="29" y1="30" x2="35" y2="30" stroke="#333" stroke-width="1" stroke-linecap="round"/>`;
  }
}

// ─── Front-Facing (South) ───────────────────────────────────

function generateNpcFrontSVG(app: NpcAppearance, mouth: MouthState = 'closed'): string {
  const ol = app.outlineColor;
  const bodyDark = darken(app.bodyColor, 0.15);

  let hair = '';
  switch (app.hairStyle) {
    case 'short':
      hair = `<path d="M 22 20 Q 22 12, 32 10 Q 42 12, 42 20" fill="${app.hairColor}" stroke="${ol}" stroke-width="${OL}"/>`;
      break;
    case 'long':
      hair = `<path d="M 20 20 Q 18 10, 32 8 Q 46 10, 44 20" fill="${app.hairColor}" stroke="${ol}" stroke-width="${OL}"/>
              <rect x="20" y="20" width="6" height="14" rx="3" fill="${app.hairColor}" opacity="0.8"/>
              <rect x="38" y="20" width="6" height="14" rx="3" fill="${app.hairColor}" opacity="0.8"/>`;
      break;
    case 'bald':
      hair = `<path d="M 24 20 Q 24 14, 32 13 Q 40 14, 40 20" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>`;
      break;
  }

  return svgWrap(`
    <!-- Body (simple rectangle torso) -->
    <rect x="24" y="32" width="16" height="20" rx="3" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Belt/accent -->
    <rect x="24" y="40" width="16" height="3" fill="${app.bodyAccent}" stroke="${ol}" stroke-width="0.5"/>
    <!-- Arms -->
    <rect x="16" y="34" width="8" height="4" rx="2" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="40" y="34" width="8" height="4" rx="2" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Hands -->
    <circle cx="16" cy="36" r="3" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>
    <circle cx="48" cy="36" r="3" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>
    <!-- Legs -->
    <rect x="26" y="50" width="5" height="8" rx="2" fill="${bodyDark}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="33" y="50" width="5" height="8" rx="2" fill="${bodyDark}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Feet -->
    <ellipse cx="28" cy="58" rx="4" ry="2" fill="#5D4037" stroke="${ol}" stroke-width="0.5"/>
    <ellipse cx="36" cy="58" rx="4" ry="2" fill="#5D4037" stroke="${ol}" stroke-width="0.5"/>
    <!-- Head -->
    <circle cx="32" cy="22" r="10" fill="${app.skinTone}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Hair -->
    ${hair}
    <!-- Eyes -->
    <circle cx="28" cy="22" r="1.5" fill="#333"/>
    <circle cx="36" cy="22" r="1.5" fill="#333"/>
    <circle cx="28.5" cy="21.5" r="0.5" fill="#fff"/>
    <circle cx="36.5" cy="21.5" r="0.5" fill="#fff"/>
    <!-- Mouth -->
    ${getMouthSVG(mouth)}
    <!-- Hat -->
    ${getHatSVG(app.hat, 'south', ol)}
  `);
}

// ─── Back-Facing (North) ────────────────────────────────────

function generateNpcBackSVG(app: NpcAppearance): string {
  const ol = app.outlineColor;
  const bodyDark = darken(app.bodyColor, 0.15);

  let hair = '';
  switch (app.hairStyle) {
    case 'short':
      hair = `<path d="M 20 22 Q 20 10, 32 8 Q 44 10, 44 22" fill="${app.hairColor}" stroke="${ol}" stroke-width="${OL}"/>`;
      break;
    case 'long':
      hair = `<path d="M 18 22 Q 16 8, 32 6 Q 48 8, 46 22" fill="${app.hairColor}" stroke="${ol}" stroke-width="${OL}"/>
              <rect x="22" y="22" width="20" height="16" rx="4" fill="${app.hairColor}" opacity="0.85"/>`;
      break;
    case 'bald':
      hair = `<path d="M 22 22 Q 22 12, 32 10 Q 42 12, 42 22" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>`;
      break;
  }

  return svgWrap(`
    <!-- Body -->
    <rect x="24" y="32" width="16" height="20" rx="3" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="24" y="40" width="16" height="3" fill="${app.bodyAccent}" stroke="${ol}" stroke-width="0.5"/>
    <!-- Arms -->
    <rect x="16" y="34" width="8" height="4" rx="2" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="40" y="34" width="8" height="4" rx="2" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Hands -->
    <circle cx="16" cy="36" r="3" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>
    <circle cx="48" cy="36" r="3" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>
    <!-- Legs -->
    <rect x="26" y="50" width="5" height="8" rx="2" fill="${bodyDark}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="33" y="50" width="5" height="8" rx="2" fill="${bodyDark}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Feet -->
    <ellipse cx="28" cy="58" rx="4" ry="2" fill="#5D4037" stroke="${ol}" stroke-width="0.5"/>
    <ellipse cx="36" cy="58" rx="4" ry="2" fill="#5D4037" stroke="${ol}" stroke-width="0.5"/>
    <!-- Head (back) -->
    <circle cx="32" cy="22" r="10" fill="${app.skinTone}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Hair covers back of head -->
    ${hair}
    <!-- Hat -->
    ${getHatSVG(app.hat, 'north', ol)}
  `);
}

// ─── Side-Facing (East/West) ────────────────────────────────
// East-facing base; flipX for west

function generateNpcSideSVG(app: NpcAppearance, mouth: MouthState = 'closed'): string {
  const ol = app.outlineColor;
  const bodyDark = darken(app.bodyColor, 0.15);

  let hair = '';
  switch (app.hairStyle) {
    case 'short':
      hair = `<path d="M 26 22 Q 26 12, 35 10 Q 40 12, 40 22" fill="${app.hairColor}" stroke="${ol}" stroke-width="${OL}"/>`;
      break;
    case 'long':
      hair = `<path d="M 24 22 Q 22 10, 35 8 Q 42 10, 42 22" fill="${app.hairColor}" stroke="${ol}" stroke-width="${OL}"/>
              <rect x="24" y="22" width="8" height="14" rx="3" fill="${app.hairColor}" opacity="0.8"/>`;
      break;
    case 'bald':
      hair = `<path d="M 28 20 Q 28 14, 34 13 Q 38 14, 38 20" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>`;
      break;
  }

  // Side mouth
  let sideMouth = '';
  switch (mouth) {
    case 'open':
      sideMouth = `<ellipse cx="38" cy="28" rx="2" ry="1.5" fill="#333"/>`;
      break;
    case 'wide':
      sideMouth = `<ellipse cx="38" cy="28" rx="2.5" ry="2.5" fill="#333"/>
                   <ellipse cx="38" cy="29" rx="1.5" ry="1" fill="#C0392B"/>`;
      break;
    default:
      sideMouth = `<line x1="36" y1="28" x2="40" y2="28" stroke="#333" stroke-width="1" stroke-linecap="round"/>`;
  }

  return svgWrap(`
    <!-- Body (side view - narrower) -->
    <rect x="26" y="32" width="12" height="20" rx="3" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="26" y="40" width="12" height="3" fill="${app.bodyAccent}" stroke="${ol}" stroke-width="0.5"/>
    <!-- Arm (visible side only) -->
    <rect x="36" y="34" width="10" height="4" rx="2" fill="${app.bodyColor}" stroke="${ol}" stroke-width="${OL}"/>
    <circle cx="46" cy="36" r="3" fill="${app.skinTone}" stroke="${ol}" stroke-width="0.5"/>
    <!-- Legs (side view) -->
    <rect x="28" y="50" width="5" height="8" rx="2" fill="${bodyDark}" stroke="${ol}" stroke-width="${OL}"/>
    <rect x="33" y="50" width="5" height="8" rx="2" fill="${bodyDark}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Feet -->
    <ellipse cx="30" cy="58" rx="4" ry="2" fill="#5D4037" stroke="${ol}" stroke-width="0.5"/>
    <ellipse cx="36" cy="58" rx="4" ry="2" fill="#5D4037" stroke="${ol}" stroke-width="0.5"/>
    <!-- Head (side profile) -->
    <circle cx="33" cy="22" r="10" fill="${app.skinTone}" stroke="${ol}" stroke-width="${OL}"/>
    <!-- Hair -->
    ${hair}
    <!-- Eye (one visible) -->
    <circle cx="37" cy="22" r="1.5" fill="#333"/>
    <circle cx="37.5" cy="21.5" r="0.5" fill="#fff"/>
    <!-- Nose bump -->
    <path d="M 42 22 Q 44 24 42 26" stroke="${ol}" stroke-width="0.8" fill="none"/>
    <!-- Mouth -->
    ${sideMouth}
    <!-- Hat -->
    ${getHatSVG(app.hat, 'east', ol)}
  `);
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Generate NPC SVG string for a given asset key, facing, and mouth state.
 * Returns null if the NPC type doesn't have a paper-cut sprite.
 */
export function generateNpcSVG(
  assetKey: string,
  facing: NpcFacing = 'south',
  mouth: MouthState = 'closed',
): string | null {
  const app = NPC_APPEARANCES[assetKey];
  if (!app) return null;

  switch (facing) {
    case 'south': return generateNpcFrontSVG(app, mouth);
    case 'north': return generateNpcBackSVG(app);
    case 'east':  return generateNpcSideSVG(app, mouth);
    case 'west':  return generateNpcSideSVG(app, mouth); // caller handles flipX
    default: return generateNpcFrontSVG(app, mouth);
  }
}

// ─── NPC Sprite Cache ───────────────────────────────────────
// Cache rendered HTMLImageElement per (assetKey, facing, mouth) combo.

const npcSpriteCache = new Map<string, HTMLImageElement>();
const npcSpritePending = new Set<string>();

function cacheKey(assetKey: string, facing: NpcFacing, mouth: MouthState): string {
  return `${assetKey}_${facing}_${mouth}`;
}

/**
 * Get a cached NPC sprite image. Returns null if not cached yet (triggers async load).
 * Non-blocking: first call returns null (emoji fallback), subsequent calls return cached image.
 */
export function getNpcSprite(
  assetKey: string,
  facing: NpcFacing = 'south',
  mouth: MouthState = 'closed',
): HTMLImageElement | null {
  const key = cacheKey(assetKey, facing, mouth);
  const cached = npcSpriteCache.get(key);
  if (cached) return cached;

  // Already loading?
  if (npcSpritePending.has(key)) return null;

  // Start async load
  const svg = generateNpcSVG(assetKey, facing, mouth);
  if (!svg) return null;

  npcSpritePending.add(key);
  const img = new Image();
  img.onload = () => {
    npcSpriteCache.set(key, img);
    npcSpritePending.delete(key);
  };
  img.onerror = () => {
    npcSpritePending.delete(key);
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return null; // emoji fallback until loaded
}

/**
 * Synchronous NPC sprite load (blocks on decode — use for testing/preload).
 */
export async function loadNpcSpriteAsync(
  assetKey: string,
  facing: NpcFacing = 'south',
  mouth: MouthState = 'closed',
): Promise<HTMLImageElement | null> {
  const key = cacheKey(assetKey, facing, mouth);
  const cached = npcSpriteCache.get(key);
  if (cached) return cached;

  const svg = generateNpcSVG(assetKey, facing, mouth);
  if (!svg) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      npcSpriteCache.set(key, img);
      npcSpritePending.delete(key);
      resolve(img);
    };
    img.onerror = () => {
      npcSpritePending.delete(key);
      resolve(null);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Preload NPC sprites for all human NPC types and common facings.
 * Call during game init to warm cache.
 */
export function preloadNpcSprites(): void {
  const facings: NpcFacing[] = ['south', 'north', 'east', 'west'];
  for (const assetKey of Object.keys(NPC_APPEARANCES)) {
    for (const facing of facings) {
      getNpcSprite(assetKey, facing, 'closed');
    }
    // Preload open mouth for south (dialog) 
    getNpcSprite(assetKey, 'south', 'open');
  }
}

/** Clear all cached NPC sprites */
export function clearNpcSpriteCache(): void {
  npcSpriteCache.clear();
  npcSpritePending.clear();
}

/**
 * Determine which direction an NPC should face based on player position.
 * Uses isometric grid coordinates. Returns NpcFacing.
 */
export function facingTowardPlayer(
  npcX: number, npcY: number,
  playerX: number, playerY: number,
): NpcFacing {
  const dx = playerX - npcX;
  const dy = playerY - npcY;
  // Use dominant axis for cardinal facing
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'east' : 'west';
  }
  // In isometric: increasing Y = south-east screen, so dy>0 = player is south
  return dy > 0 ? 'south' : 'north';
}
