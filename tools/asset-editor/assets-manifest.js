// assets-manifest.js — All game SVGs for the asset editor
// TODO: DOC - regenerate this file by running: node scripts/extract-svgs-to-manifest.mjs
// Categories: 'tiles', 'sprites', 'structures', 'plants', 'items'
// viewMode: 'iso-tile' (32x32 → diamond) | 'sprite' (48x48 placed on tile) | 'raw' (as-is)

window.ASSET_MANIFEST = [
  // ─── TILES (32x32) ─────────────────────────────────────────────────────────
  {
    id: 'tile_grass', label: 'Grass', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#98FB98"/>
      <stop offset="1" stop-color="#228B22"/>
    </linearGradient>
    <pattern id="gN" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M0 0 L4 4 M0 4 L4 0" stroke="#006400" stroke-width="0.5" opacity="0.2"/>
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#gG)"/>
  <rect width="32" height="32" fill="url(#gN)" opacity="0.3"/>
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 14 Q8 10 16 14 Q24 18 32 14 M0 18 Q8 14 16 18 Q24 22 32 18 M0 22 Q8 18 16 22 Q24 26 32 22" stroke="#006400" stroke-width="0.8"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`
  },
  {
    id: 'tile_dirt', label: 'Dirt', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="dG" cx="16" cy="16" r="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D"/>
      <stop offset="1" stop-color="#654321"/>
    </radialGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dG)"/>
  <path d="M4 4 L12 12 M8 20 L20 8 M16 24 L28 12 M4 28 L16 16 M6 10 L10 14 M14 18 L18 22 M22 6 L26 10" stroke="#4B3621" stroke-width="0.8" opacity="0.7"/>
  <circle cx="10" cy="10" r="1.5" fill="#654321" opacity="0.5"/>
  <circle cx="22" cy="18" r="1" fill="#654321" opacity="0.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`
  },
  {
    id: 'tile_rock', label: 'Rock', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0"/>
      <stop offset="1" stop-color="#696969"/>
    </linearGradient>
  </defs>
  <path d="M1 3 L7 1 L15 5 L23 1 L29 3 L32 15 L28 23 L20 29 L12 25 L4 29 L0 19 Z" fill="url(#rG)"/>
  <path d="M3 7 L11 11 M7 19 L15 15 M19 9 L27 13 M5 25 L13 21" stroke="#404040" stroke-width="0.8" opacity="0.7"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.25"/>
</svg>`
  },
  {
    id: 'tile_water', label: 'Water', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1E90FF"/>
      <stop offset="1" stop-color="#4169E1"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#wG)"/>
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 18 Q8 14 16 18 Q24 22 32 18 M0 26 Q8 22 16 26 Q24 30 32 26" stroke="#FFF" stroke-width="1.5" opacity="0.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`
  },
  {
    id: 'tile_sand', label: 'Sand', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F4D68C"/>
      <stop offset="1" stop-color="#D2B48C"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sG)"/>
  <circle cx="5" cy="7" r="0.8" fill="#C4A46C" opacity="0.5"/>
  <circle cx="14" cy="4" r="0.6" fill="#BFA06A" opacity="0.4"/>
  <circle cx="24" cy="9" r="0.7" fill="#C4A46C" opacity="0.45"/>
  <circle cx="20" cy="16" r="0.9" fill="#C4A46C" opacity="0.5"/>
  <path d="M2 14 Q10 12 18 14 Q26 16 30 14" stroke="#C4A46C" stroke-width="0.6" opacity="0.3"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.1"/>
</svg>`
  },
  {
    id: 'tile_stone_floor', label: 'Stone Floor', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sfG" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B8B0A0"/>
      <stop offset="1" stop-color="#8A8070"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#sfG)"/>
  <path d="M0 8 H32 M0 16 H32 M0 24 H32 M8 0 V32 M16 0 V32 M24 0 V32" stroke="#706858" stroke-width="0.5" opacity="0.35"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.12"/>
</svg>`
  },
  {
    id: 'tile_stone_wall', label: 'Stone Wall', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="swG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0"/>
      <stop offset="1" stop-color="#808080"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#swG)"/>
  <path d="M0 0 L32 0 M0 6 L32 6 M0 12 L32 12 M0 18 L32 18 M0 24 L32 24 M0 32 L32 32 M4 0 V32 M10 0 V32 M16 0 V32 M22 0 V32 M28 0 V32 M2 2 H30 M2 8 H30 M2 14 H30 M2 20 H30 M2 26 H30" stroke="#696969" stroke-width="0.8" opacity="0.9"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`
  },
  {
    id: 'tile_bridge', label: 'Bridge', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bG" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F"/>
      <stop offset="1" stop-color="#8B4513"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#bG)"/>
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="#654321" stroke-width="2" opacity="0.8"/>
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="1.5"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`
  },
  {
    id: 'tile_quiz_gate', label: 'Quiz Gate (Tile)', category: 'tiles', viewMode: 'iso-tile',
    svg: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="qgG" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7B68EE"/>
      <stop offset="1" stop-color="#483D8B"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(qgG)"/>
  <path d="M2 2 H30 V30 H2 Z" stroke="#9370DB" stroke-width="2" fill="none"/>
  <text x="16" y="20" font-size="14" text-anchor="middle" fill="#FFD700">?</text>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.2"/>
</svg>`
  },

  // ─── PLANTS (48x48) ─────────────────────────────────────────────────────────
  {
    id: 'sprite_tree', label: 'Deciduous Tree 🌳', category: 'plants', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <radialGradient id="tc1" cx="24" cy="18" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#66BB6A"/>
      <stop offset="0.7" stop-color="#2E7D32"/>
      <stop offset="1" stop-color="#1B5E20"/>
    </radialGradient>
  </defs>
  <rect x="21" y="28" width="6" height="18" rx="1" fill="#6D4C41" stroke="#3E2723" stroke-width="1.2"/>
  <circle cx="24" cy="19" r="15" fill="url(#tc1)" stroke="#1B5E20" stroke-width="1.5"/>
  <circle cx="16" cy="17" r="9" fill="#388E3C" opacity="0.7" stroke="#1B5E20" stroke-width="0.8"/>
  <circle cx="32" cy="17" r="9" fill="#388E3C" opacity="0.65" stroke="#1B5E20" stroke-width="0.8"/>
  <circle cx="24" cy="10" r="5" fill="#66BB6A" opacity="0.45"/>
  <ellipse cx="24" cy="32" rx="10" ry="2" fill="#1B5E20" opacity="0.25"/>
</svg>`
  },
  {
    id: 'sprite_tree_pine', label: 'Pine Tree 🌲', category: 'plants', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="pg1" x1="24" y1="2" x2="24" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#43A047"/>
      <stop offset="1" stop-color="#1B5E20"/>
    </linearGradient>
  </defs>
  <rect x="22" y="38" width="4" height="8" fill="#5D4037" stroke="#3E2723" stroke-width="1"/>
  <polygon points="24,2 8,42 40,42" fill="url(#pg1)" stroke="#1B5E20" stroke-width="1.5"/>
  <polygon points="24,8 12,34 36,34" fill="#2E7D32" stroke="#1B5E20" stroke-width="0.8" opacity="0.9"/>
  <polygon points="24,14 16,28 32,28" fill="#388E3C" stroke="#1B5E20" stroke-width="0.8" opacity="0.8"/>
  <polygon points="24,4 20,16 28,16" fill="#4CAF50" opacity="0.5"/>
</svg>`
  },
  {
    id: 'sprite_tree_palm', label: 'Palm Tree 🌴', category: 'plants', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M22 46 Q20 34 22 24 Q24 18 26 14" stroke="#8D6E63" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q36 8 44 12" stroke="#2E7D32" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q34 4 42 2" stroke="#388E3C" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q22 4 14 2" stroke="#388E3C" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M26 14 Q16 8 6 10" stroke="#2E7D32" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <circle cx="25" cy="16" r="1.6" fill="#8D6E63" stroke="#5D4037" stroke-width="0.5"/>
</svg>`
  },
  {
    id: 'sprite_flower', label: 'Flower 🌼', category: 'plants', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="30" x2="24" y2="44" stroke="#4CAF50" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="24" cy="26" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5"/>
  <ellipse cx="24" cy="26" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(72,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(144,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(216,24,26)"/>
  <ellipse cx="24" cy="26" rx="4" ry="5" fill="#FFF" stroke="#E0E0E0" stroke-width="0.5" transform="rotate(288,24,26)"/>
  <circle cx="24" cy="26" r="4.5" fill="#FFD54F" stroke="#F9A825" stroke-width="0.8"/>
</svg>`
  },
  {
    id: 'sprite_tall_plant', label: 'Tall Plant 🪾', category: 'plants', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="24" y1="44" x2="24" y2="14" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M24 18 Q16 14 12 16 Q18 18 24 24Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 24 Q32 20 36 22 Q30 24 24 30Z" fill="#81C784" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 30 Q16 26 12 28 Q18 30 24 36Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="0.6"/>
  <path d="M24 14 Q20 10 18 8" stroke="#43A047" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M24 14 Q28 10 30 8" stroke="#43A047" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>`
  },

  // ─── STRUCTURES (48x48) ─────────────────────────────────────────────────────
  {
    id: 'sprite_house', label: 'House 🏠', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="hrf" x1="24" y1="6" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#EF5350"/>
      <stop offset="1" stop-color="#C62828"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="#5D4037" opacity="0.2"/>
  <rect x="10" y="22" width="28" height="20" fill="#EFEBE9" stroke="#795548" stroke-width="1.5"/>
  <polygon points="4,24 24,6 44,24" fill="url(#hrf)" stroke="#B71C1C" stroke-width="1.5"/>
  <rect x="14" y="28" width="6" height="6" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="28" y="28" width="6" height="6" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="20" y="32" width="8" height="10" rx="1" fill="#8D6E63" stroke="#5D4037" stroke-width="1"/>
  <circle cx="26" cy="37" r="1" fill="#FFD54F"/>
</svg>`
  },
  {
    id: 'sprite_hut', label: 'Hut 🛖', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="htf" x1="24" y1="6" x2="24" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A1887F"/>
      <stop offset="1" stop-color="#6D4C41"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="15" ry="2.5" fill="#5D4037" opacity="0.2"/>
  <rect x="12" y="26" width="24" height="16" fill="#D7CCC8" stroke="#795548" stroke-width="1.2"/>
  <polygon points="2,28 24,6 46,28" fill="url(#htf)" stroke="#5D4037" stroke-width="1.5"/>
  <rect x="20" y="32" width="8" height="10" rx="1" fill="#6D4C41" stroke="#4E342E" stroke-width="1"/>
</svg>`
  },
  {
    id: 'sprite_shop', label: 'Shop 🏪', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="srf" x1="4" y1="12" x2="44" y2="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF7043"/>
      <stop offset="0.5" stop-color="#FFF"/>
      <stop offset="1" stop-color="#FF7043"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="44" rx="16" ry="2.5" fill="#5D4037" opacity="0.2"/>
  <rect x="8" y="18" width="32" height="24" fill="#FFF3E0" stroke="#BF360C" stroke-width="1.2"/>
  <rect x="4" y="12" width="40" height="8" fill="url(#srf)" stroke="#BF360C" stroke-width="1"/>
  <rect x="14" y="24" width="8" height="8" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="26" y="24" width="8" height="8" fill="#81D4FA" stroke="#0288D1" stroke-width="0.8"/>
  <rect x="20" y="34" width="8" height="8" rx="1" fill="#8D6E63" stroke="#5D4037" stroke-width="1"/>
</svg>`
  },
  {
    id: 'sprite_fence', label: 'Fence 🚧', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="4" y="16" width="40" height="4" fill="#D7CCC8" stroke="#8D6E63" stroke-width="1"/>
  <rect x="4" y="30" width="40" height="4" fill="#D7CCC8" stroke="#8D6E63" stroke-width="1"/>
  <rect x="8" y="8" width="4" height="34" fill="#BCAAA4" stroke="#8D6E63" stroke-width="1"/>
  <polygon points="8,8 10,4 12,8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.8"/>
  <rect x="22" y="8" width="4" height="34" fill="#BCAAA4" stroke="#8D6E63" stroke-width="1"/>
  <polygon points="22,8 24,4 26,8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.8"/>
  <rect x="36" y="8" width="4" height="34" fill="#BCAAA4" stroke="#8D6E63" stroke-width="1"/>
  <polygon points="36,8 38,4 40,8" fill="#BCAAA4" stroke="#8D6E63" stroke-width="0.8"/>
</svg>`
  },
  {
    id: 'sprite_quiz_gate', label: 'Quiz Gate ❓', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="4" y="14" width="4" height="30" fill="#7B1FA2" stroke="#4A148C" stroke-width="1"/>
  <rect x="40" y="14" width="4" height="30" fill="#7B1FA2" stroke="#4A148C" stroke-width="1"/>
  <rect x="4" y="10" width="40" height="8" rx="2" fill="#9C27B0" stroke="#6A1B9A" stroke-width="1.2"/>
  <circle cx="24" cy="28" r="10" fill="#CE93D8" stroke="#7B1FA2" stroke-width="1.5"/>
  <text x="24" y="33" text-anchor="middle" font-size="16" font-weight="bold" fill="#4A148C">?</text>
</svg>`
  },
  {
    id: 'sprite_sign', label: 'Sign 🪧', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="44" rx="5" ry="1.5" fill="#5D4037" opacity="0.2"/>
  <rect x="22" y="18" width="4" height="26" fill="#8D6E63" stroke="#5D4037" stroke-width="1"/>
  <rect x="8" y="10" width="32" height="14" rx="2" fill="#D7CCC8" stroke="#795548" stroke-width="1.5"/>
  <line x1="12" y1="15" x2="36" y2="15" stroke="#8D6E63" stroke-width="1" opacity="0.4"/>
  <line x1="12" y1="19" x2="30" y2="19" stroke="#8D6E63" stroke-width="0.8" opacity="0.3"/>
</svg>`
  },
  {
    id: 'sprite_chest', label: 'Chest 📦', category: 'structures', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="chg" x1="8" y1="20" x2="40" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A1887F"/>
      <stop offset="1" stop-color="#6D4C41"/>
    </linearGradient>
  </defs>
  <ellipse cx="24" cy="42" rx="14" ry="2.5" fill="#5D4037" opacity="0.25"/>
  <rect x="8" y="24" width="32" height="16" rx="2" fill="url(#chg)" stroke="#4E342E" stroke-width="1.5"/>
  <path d="M8 24 Q24 18 40 24" fill="#8D6E63" stroke="#4E342E" stroke-width="1.2"/>
  <rect x="22" y="28" width="4" height="6" rx="1" fill="#FFD54F" stroke="#E65100" stroke-width="0.8"/>
  <circle cx="24" cy="31" r="1.2" fill="#E65100"/>
</svg>`
  },

  // ─── ITEMS (48x48) ──────────────────────────────────────────────────────────
  {
    id: 'sprite_torch', label: 'Torch 🔦', category: 'items', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="thg" x1="20" y1="20" x2="28" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8D6E63"/>
      <stop offset="1" stop-color="#5D4037"/>
    </linearGradient>
    <radialGradient id="tfl" cx="24" cy="6" r="10" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF176"/>
      <stop offset="0.4" stop-color="#FFB74D"/>
      <stop offset="0.8" stop-color="#FF7043"/>
      <stop offset="1" stop-color="#E64A19" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="21" y="18" width="6" height="24" rx="1.5" fill="url(#thg)" stroke="#4E342E" stroke-width="0.8"/>
  <rect x="19" y="16" width="10" height="6" rx="2" fill="#A1887F" stroke="#6D4C41" stroke-width="0.8"/>
  <path d="M24 2 C28 6 30 10 28 14 C26 18 22 18 20 14 C18 10 20 6 24 2 Z" fill="url(#tfl)" opacity="0.9"/>
  <path d="M24 6 C26 8 27 10 26 13 C25 15 23 15 22 13 C21 10 22 8 24 6 Z" fill="#FFF176" opacity="0.8"/>
</svg>`
  },
  {
    id: 'sprite_sparkle', label: 'Sparkle ✨', category: 'items', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 8 L26 20 L38 22 L26 24 L24 36 L22 24 L10 22 L22 20 Z" fill="#FFD54F" stroke="#FFC107" stroke-width="0.8"/>
  <path d="M14 12 L15 18 L21 19 L15 20 L14 26 L13 20 L7 19 L13 18 Z" fill="#FFF176" opacity="0.6"/>
  <path d="M36 28 L37 32 L41 33 L37 34 L36 38 L35 34 L31 33 L35 32 Z" fill="#FFF176" opacity="0.5"/>
</svg>`
  },
  {
    id: 'sprite_map_scroll', label: 'Map Scroll 🗺️', category: 'items', viewMode: 'sprite',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="msg" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF8E1"/>
      <stop offset="1" stop-color="#FFE082"/>
    </linearGradient>
  </defs>
  <rect x="12" y="10" width="24" height="28" rx="2" fill="url(#msg)" stroke="#D4A438" stroke-width="1"/>
  <ellipse cx="24" cy="10" rx="13" ry="3" fill="#FFE082" stroke="#D4A438" stroke-width="0.8"/>
  <ellipse cx="24" cy="38" rx="13" ry="3" fill="#FFE082" stroke="#D4A438" stroke-width="0.8"/>
  <path d="M16 16 L32 16 M16 20 L28 20 M16 24 L30 24 M16 28 L26 28 M16 32 L32 32" stroke="#C9A94E" stroke-width="0.6" opacity="0.5"/>
  <circle cx="27" cy="26" r="3" fill="none" stroke="#D32F2F" stroke-width="1" opacity="0.6"/>
</svg>`
  },
];
