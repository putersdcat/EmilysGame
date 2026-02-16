# MVP SVG Primitives for Tile Materials and Elements (Detailed Version)

## Introduction
This updated document provides more detailed SVG primitives for the game's MVP visual elements. Each primitive is a single micro tile (32x32 viewBox), with enhanced details like gradients, additional paths for texture, subtle shadows, and improved animations where applicable. These build on the basic versions, adding realism while keeping file size low and render performance high (vector-based, no raster embeds). Use for composition in 5x5 chunks via TS code. Animations use <animate> for simple cycling.

Copy-paste into your IDE for integration.

## Grass (Meadow Base)
Enhanced with gradient fill, multiple wavy lines for depth, and light shadow hint.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#90EE90" />
      <stop offset="1" stop-color="#228B22" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#grassGrad)" />
  <path d="M0 12 Q8 8 16 12 Q24 16 32 12 M0 16 Q8 12 16 16 Q24 20 32 16 M0 20 Q8 16 16 20 Q24 24 32 20" stroke="#006400" stroke-width="1" opacity="0.8" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.1" /> <!-- Shadow hint -->
</svg>
```

## Dirt (Path/Soil Variant)
Added pebble details, uneven texture paths, and subtle cracks for realism.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dirtGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8B4513" />
      <stop offset="1" stop-color="#A0522D" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dirtGrad)" />
  <path d="M4 4 L12 12 M8 20 L20 8 M16 24 L28 12 M4 28 L16 16" stroke="#654321" stroke-width="1" opacity="0.7" />
  <circle cx="10" cy="10" r="2" fill="#654321" />
  <circle cx="22" cy="18" r="1.5" fill="#654321" />
  <circle cx="6" cy="26" r="2" fill="#654321" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.1" /> <!-- Shadow -->
</svg>
```

## Rock (Obstacle)
More jagged paths, gradient shading for 3D feel, and small cracks.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rockGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A9A9A9" />
      <stop offset="1" stop-color="#696969" />
    </linearGradient>
  </defs>
  <path d="M2 4 L8 2 L16 6 L24 2 L30 4 L32 16 L28 24 L20 30 L12 26 L4 30 L0 20 Z" fill="url(#rockGrad)" />
  <path d="M4 8 L12 12 M8 20 L16 16 M20 10 L28 14" stroke="#404040" stroke-width="1" />
  <path d="M10 18 L14 22" stroke="#404040" stroke-width="0.5" /> <!-- Small crack -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" /> <!-- Deeper shadow -->
</svg>
```

## Stone Wall Segment
Detailed bricks with mortar lines, slight 3D bevel via gradients.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brickGrad" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0" />
      <stop offset="1" stop-color="#A9A9A9" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#brickGrad)" />
  <path d="M0 0 L32 0 M0 8 L32 8 M0 16 L32 16 M0 24 L32 24 M0 32 L32 32" stroke="#808080" stroke-width="1" />
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#808080" stroke-width="1" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="#696969" stroke-width="0.5" opacity="0.8" /> <!-- Mortar details -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" /> <!-- Shadow -->
</svg>
```

## Wooden Fence (Wall Variant)
Planks with wood grain lines and nails for detail.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="woodGrad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8B4513" />
      <stop offset="1" stop-color="#A0522D" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="transparent" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="url(#woodGrad)" stroke-width="4" />
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="2" />
  <path d="M6 8 L6 10 M14 16 L14 18 M22 24 L22 26" stroke="#654321" stroke-width="1" /> <!-- Grain lines -->
  <circle cx="8" cy="6" r="1" fill="#696969" /> <!-- Nails -->
  <circle cx="16" cy="14" r="1" fill="#696969" />
  <circle cx="24" cy="22" r="1" fill="#696969" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.1" /> <!-- Shadow -->
</svg>
```

## Door/Gate
Detailed wooden panel with hinges, knob, and frame.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="doorGrad" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D" />
      <stop offset="1" stop-color="#8B4513" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#doorGrad)" />
  <path d="M4 0 V32 M28 0 V32" stroke="#654321" stroke-width="2" /> <!-- Frame -->
  <circle cx="16" cy="16" r="3" fill="#FFD700" /> <!-- Knob -->
  <path d="M6 8 H26 M6 24 H26" stroke="#654321" stroke-width="1" opacity="0.8" /> <!-- Panels -->
  <circle cx="6" cy="4" r="1" fill="#696969" /> <!-- Hinges -->
  <circle cx="6" cy="28" r="1" fill="#696969" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" /> <!-- Shadow -->
</svg>
```

## River/Water (Animated)
Deeper blue with multi-wave paths, bubbles, and opacity/radius animations for ripple effect.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#00BFFF" />
      <stop offset="1" stop-color="#1E90FF" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#waterGrad)" />
  <path d="M0 12 Q8 8 16 12 Q24 16 32 12" stroke="#FFFFFF" stroke-width="2" opacity="0.8">
    <animate attributeName="opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
  </path>
  <path d="M0 20 Q8 16 16 20 Q24 24 32 20" stroke="#FFFFFF" stroke-width="1.5" opacity="0.6">
    <animate attributeName="opacity" values="0.6;0.3;0.6" dur="2.5s" repeatCount="indefinite" />
  </path>
  <circle cx="8" cy="16" r="2" fill="#FFFFFF" opacity="0.7">
    <animate attributeName="r" values="2;3;2" dur="1s" repeatCount="indefinite" />
    <animate attributeName="cy" values="16;14;16" dur="1s" repeatCount="indefinite" />
  </circle>
  <circle cx="24" cy="24" r="1" fill="#FFFFFF" opacity="0.5">
    <animate attributeName="r" values="1;2;1" dur="1.5s" repeatCount="indefinite" />
    <animate attributeName="cy" values="24;22;24" dur="1.5s" repeatCount="indefinite" />
  </circle>
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.1" /> <!-- Shadow -->
</svg>
```

## Bridge
Planks with grain, ropes, and slight 3D shading.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bridgeGrad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D" />
      <stop offset="1" stop-color="#8B4513" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#bridgeGrad)" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="#654321" stroke-width="2" opacity="0.8" /> <!-- Grain -->
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="1" /> <!-- Planks -->
  <path d="M0 8 Q16 0 32 8 M0 24 Q16 32 32 24" stroke="#654321" stroke-width="1" /> <!-- Rope details -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" /> <!-- Shadow -->
</svg>
```