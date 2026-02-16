# MVP SVG Primitives for Tile Materials and Elements (Detailed and Performance-Optimized Version)

## Introduction
This optimized version refines the SVG primitives for the game's MVP visual elements, adding intricate details while prioritizing performance. Each primitive is a single micro tile (32x32 viewBox) for fast rendering in Canvas. Optimizations include: combined paths to reduce node count, minimal filters/gradients (reused via defs), short animation durations with low keyframe counts, and no unnecessary opacity/clipping. Details like textures use patterns or simple strokes instead of heavy elements. These load quickly as data URIs in TS and support isometric scaling without artifacts.

Copy-paste into your IDE for integration.

## Grass (Meadow Base)
Optimized gradient (single def), batched wavy paths, minimal noise pattern for texture, and subtle shadow—under 20 nodes.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grassGradOpt" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#98FB98" />
      <stop offset="1" stop-color="#228B22" />
    </linearGradient>
    <pattern id="grassNoiseOpt" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M0 0 L4 4 M0 4 L4 0" stroke="#006400" stroke-width="0.5" opacity="0.2" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#grassGradOpt)" />
  <rect width="32" height="32" fill="url(#grassNoiseOpt)" opacity="0.3" />
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 14 Q8 10 16 14 Q24 18 32 14 M0 18 Q8 14 16 18 Q24 22 32 18 M0 22 Q8 18 16 22 Q24 26 32 22" stroke="#006400" stroke-width="0.8" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" />
</svg>
```

## Dirt (Path/Soil Variant)
Batched paths for cracks/pebbles, single turbulence filter (low stdDeviation), radial gradient for depth—minimal defs.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="dirtNoiseOpt" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="1" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
    </filter>
    <radialGradient id="dirtGradOpt" cx="16" cy="16" r="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D" />
      <stop offset="1" stop-color="#654321" />
    </radialGradient>
  </defs>
  <rect width="32" height="32" fill="url(#dirtGradOpt)" filter="url(#dirtNoiseOpt)" />
  <path d="M4 4 L12 12 M8 20 L20 8 M16 24 L28 12 M4 28 L16 16 M6 10 L10 14 M14 18 L18 22 M22 6 L26 10" stroke="#4B3621" stroke-width="0.8" opacity="0.7" />
  <circle cx="10" cy="10" r="1.5" fill="#654321" opacity="0.5" />
  <circle cx="22" cy="18" r="1" fill="#654321" opacity="0.5" />
  <circle cx="6" cy="26" r="1.5" fill="#654321" opacity="0.5" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" />
</svg>
```

## Rock (Obstacle)
Combined jagged paths, single linear gradient, batched stroke details, low-opacity pattern for crystals—reduced octaves in turbulence if added.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rockGradOpt" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0" />
      <stop offset="1" stop-color="#696969" />
    </linearGradient>
    <pattern id="crystalPatternOpt" width="8" height="8" patternUnits="userSpaceOnUse">
      <polygon points="4,0 8,4 4,8 0,4" fill="#D3D3D3" opacity="0.2" />
    </pattern>
  </defs>
  <path d="M1 3 L7 1 L15 5 L23 1 L29 3 L32 15 L28 23 L20 29 L12 25 L4 29 L0 19 Z" fill="url(#rockGradOpt)" />
  <rect width="32" height="32" fill="url(#crystalPatternOpt)" opacity="0.3" />
  <path d="M3 7 L11 11 M7 19 L15 15 M19 9 L27 13 M5 25 L13 21 M8 12 L12 16 M16 20 L20 24 M24 8 L28 12" stroke="#404040" stroke-width="0.8" opacity="0.7" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.25" />
</svg>
```

## Stone Wall Segment
Batched mortar lines, single gradient, minimal bevel filter (low stdDeviation), combined cracks—optimized for repeated use.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="brickBevelOpt" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.3" result="blur" />
      <feSpecularLighting result="specOut" in="blur" surfaceScale="3" specularConstant="0.4" specularExponent="15" lighting-color="#FFFFFF">
        <fePointLight x="-5000" y="-10000" z="20000" />
      </feSpecularLighting>
      <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="specOut" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    <linearGradient id="brickGradOpt" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0" />
      <stop offset="1" stop-color="#808080" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#brickGradOpt)" filter="url(#brickBevelOpt)" />
  <path d="M0 0 L32 0 M0 6 L32 6 M0 12 L32 12 M0 18 L32 18 M0 24 L32 24 M0 32 L32 32 M4 0 V32 M10 0 V32 M16 0 V32 M22 0 V32 M28 0 V32 M2 2 H30 M2 8 H30 M2 14 H30 M2 20 H30 M2 26 H30" stroke="#696969" stroke-width="0.8" opacity="0.9" />
  <path d="M6 4 L8 6 M14 10 L16 12 M22 16 L24 18" stroke="#404040" stroke-width="0.5" /> <!-- Cracks -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" />
</svg>
```

## Wooden Fence (Wall Variant)
Batched grain and ropes, low-opacity pattern, simplified filter for texture—reduced turbulence octaves.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="woodTextureOpt" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
    </filter>
    <linearGradient id="woodGradOpt" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D" />
      <stop offset="1" stop-color="#654321" />
    </linearGradient>
    <pattern id="grainPatternOpt" width="2" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 0 V32 M1 0 V32" stroke="#654321" stroke-width="0.3" opacity="0.5" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="transparent" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="url(#woodGradOpt)" stroke-width="4" filter="url(#woodTextureOpt)" />
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="2" opacity="0.9" />
  <rect width="32" height="32" fill="url(#grainPatternOpt)" opacity="0.4" />
  <path d="M6 8 Q16 4 26 8 M6 24 Q16 28 26 24" stroke="#654321" stroke-width="1" opacity="0.7" /> <!-- Ropes -->
  <circle cx="8" cy="8" r="1" fill="#696969" /> <!-- Nails -->
  <circle cx="8" cy="8" r="0.5" fill="#FFFFFF" opacity="0.3" /> <!-- Highlight -->
  <circle cx="24" cy="24" r="1" fill="#696969" />
  <circle cx="24" cy="24" r="0.5" fill="#FFFFFF" opacity="0.3" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" />
</svg>
```

## Door/Gate
Detailed panels with grain, hinges with screws, knob with reflection, and enhanced bevel filter—optimized with fewer composites.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="doorBevelOpt" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="blur" />
      <feSpecularLighting result="specOut" in="blur" surfaceScale="3" specularConstant="0.5" specularExponent="15" lighting-color="#FFFFFF">
        <fePointLight x="-5000" y="-10000" z="20000" />
      </feSpecularLighting>
      <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="specOut" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    <linearGradient id="doorGradOpt" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F" />
      <stop offset="1" stop-color="#8B4513" />
    </linearGradient>
    <pattern id="doorGrainOpt" width="2" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 0 V32" stroke="#654321" stroke-width="0.3" opacity="0.6" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#doorGradOpt)" filter="url(#doorBevelOpt)" />
  <rect width="32" height="32" fill="url(#doorGrainOpt)" opacity="0.4" />
  <path d="M2 2 H30 V30 H2 Z" stroke="#654321" stroke-width="2" fill="none" /> <!-- Frame -->
  <path d="M10 2 V30 M22 2 V30 M2 10 H30 M2 22 H30" stroke="#654321" stroke-width="1" opacity="0.8" /> <!-- Panels and crossbars -->
  <circle cx="16" cy="16" r="3" fill="#FFD700" /> <!-- Knob -->
  <circle cx="16" cy="16" r="1.5" fill="#FFFFFF" opacity="0.4" /> <!-- Knob reflection -->
  <path d="M4 4 L6 6 M4 26 L6 28" stroke="#696969" stroke-width="1" /> <!-- Hinges -->
  <circle cx="5" cy="5" r="0.5" fill="#404040" /> <!-- Hinge screws -->
  <circle cx="5" cy="27" r="0.5" fill="#404040" />
  <rect x="14" y="14" width="4" height="4" fill="#696969" opacity="0.9" /> <!-- Lock plate with bevel -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" /> <!-- Shadow -->
</svg>
```

## River/Water (Animated)
Optimized waves (batching paths), bubble animations with combined attributes, foam as static path, glow filter with low blur.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="waterGradOpt" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1E90FF" />
      <stop offset="1" stop-color="#4169E1" />
    </linearGradient>
    <filter id="waterGlowOpt" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="32" height="32" fill="url(#waterGradOpt)" filter="url(#waterGlowOpt)" />
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10 M0 18 Q8 14 16 18 Q24 22 32 18 M0 26 Q8 22 16 26 Q24 30 32 26" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7">
    <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite" />
    <animate attributeName="d" values="M0 10 Q8 6 16 10 Q24 14 32 10 M0 18 Q8 14 16 18 Q24 22 32 18 M0 26 Q8 22 16 26 Q24 30 32 26; M0 10 Q8 8 16 10 Q24 12 32 10 M0 18 Q8 16 16 18 Q24 20 32 18 M0 26 Q8 24 16 26 Q24 28 32 26; M0 10 Q8 6 16 10 Q24 14 32 10 M0 18 Q8 14 16 18 Q24 22 32 18 M0 26 Q8 22 16 26 Q24 30 32 26" dur="3s" repeatCount="indefinite" />
  </path>
  <circle cx="8" cy="16" r="2" fill="#FFFFFF" opacity="0.6">
    <animate attributeName="r" values="2;3;2" dur="1s" repeatCount="indefinite" />
    <animate attributeName="cy" values="16;14;16" dur="1s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1s" repeatCount="indefinite" />
  </circle>
  <circle cx="24" cy="24" r="1" fill="#FFFFFF" opacity="0.4">
    <animate attributeName="r" values="1;2;1" dur="1.5s" repeatCount="indefinite" />
    <animate attributeName="cy" values="24;22;24" dur="1.5s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite" />
  </circle>
  <path d="M4 28 Q8 26 12 28 Q16 30 20 28 Q24 26 28 28" stroke="#ADD8E6" stroke-width="1" opacity="0.3" /> <!-- Foam -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" />
</svg>
```

## Bridge
Batched planks with varied grain, ropes with twists, nails with shadows/highlights, optimized texture filter.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="bridgeTextureOpt" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="1" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
    </filter>
    <linearGradient id="bridgeGradOpt" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F" />
      <stop offset="1" stop-color="#8B4513" />
    </linearGradient>
    <pattern id="plankGrainOpt" width="3" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 0 V32 M1.5 0 V32" stroke="#654321" stroke-width="0.4" opacity="0.6" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#bridgeGradOpt)" filter="url(#bridgeTextureOpt)" />
  <rect width="32" height="32" fill="url(#plankGrainOpt)" opacity="0.5" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="#654321" stroke-width="2" opacity="0.8" /> <!-- Grain -->
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="1.5" />
  <path d="M0 8 Q8 4 16 8 Q24 4 32 8 M0 24 Q8 28 16 24 Q24 28 32 24" stroke="#654321" stroke-width="1.5" opacity="0.9" /> <!-- Ropes -->
  <circle cx="8" cy="8" r="1.5" fill="#696969" /> <!-- Knots/nails -->
  <circle cx="8" cy="8" r="0.75" fill="#FFFFFF" opacity="0.3" /> <!-- Highlight -->
  <circle cx="24" cy="24" r="1.5" fill="#696969" />
  <circle cx="24" cy="24" r="0.75" fill="#FFFFFF" opacity="0.3" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" />
</svg>
```