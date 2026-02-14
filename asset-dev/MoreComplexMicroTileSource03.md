# MVP SVG Primitives for Tile Materials and Elements (Even More Detailed Version)

## Introduction
This further updated document enhances the SVG primitives with even more intricate details for the game's MVP visual elements. Each primitive is a single micro tile (32x32 viewBox), incorporating advanced features like patterns for textures, filters for realistic shadows/blurs, multiple layered paths for depth, and refined animations (e.g., multi-element cycles for water). Gradients are more nuanced, with added noise-like effects for organic feel. These remain vector-based for scalability and performance in Canvas rendering. Use for chunk composition in TS.

Copy-paste into your IDE.

## Grass (Meadow Base)
Multi-layer gradient, randomized wavy patterns for natural variation, soft blur filter, and embedded noise paths for texture.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="grassBlur" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" />
    </filter>
    <linearGradient id="grassGradDetailed" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#98FB98" />
      <stop offset="0.5" stop-color="#90EE90" />
      <stop offset="1" stop-color="#228B22" />
    </linearGradient>
    <pattern id="grassNoise" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#006400" opacity="0.1" />
      <circle cx="2" cy="2" r="1" fill="#006400" opacity="0.2" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#grassGradDetailed)" filter="url(#grassBlur)" />
  <rect width="32" height="32" fill="url(#grassNoise)" opacity="0.3" />
  <path d="M0 10 Q4 6 8 10 Q12 14 16 10 Q20 6 24 10 Q28 14 32 10 M0 14 Q4 10 8 14 Q12 18 16 14 Q20 10 24 14 Q28 18 32 14 M0 18 Q4 14 8 18 Q12 22 16 18 Q20 14 24 18 Q28 22 32 18 M0 22 Q4 18 8 22 Q12 26 16 22 Q20 18 24 22 Q28 26 32 22" stroke="#006400" stroke-width="0.8" opacity="0.9" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" filter="url(#grassBlur)" /> <!-- Enhanced shadow -->
</svg>
```

## Dirt (Path/Soil Variant)
Layered gradient with embedded pebbles, crack patterns, uneven edges, and noise filter for gritty texture.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="dirtNoise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" />
    </filter>
    <radialGradient id="dirtGradDetailed" cx="16" cy="16" r="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D" />
      <stop offset="0.6" stop-color="#8B4513" />
      <stop offset="1" stop-color="#654321" />
    </radialGradient>
    <pattern id="pebblePattern" width="6" height="6" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="2" fill="#654321" opacity="0.4" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#dirtGradDetailed)" filter="url(#dirtNoise)" />
  <rect width="32" height="32" fill="url(#pebblePattern)" opacity="0.5" />
  <path d="M2 4 Q6 2 10 4 Q14 6 18 4 Q22 2 26 4 Q30 6 32 4 M4 12 L12 16 M8 24 L20 12 M16 8 L28 20 M4 28 Q12 24 20 28" stroke="#4B3621" stroke-width="1" opacity="0.7" />
  <path d="M6 10 L10 14 M14 18 L18 22 M22 6 L26 10" stroke="#4B3621" stroke-width="0.5" /> <!-- Fine cracks -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" filter="url(#dirtNoise)" /> <!-- Textured shadow -->
</svg>
```

## Rock (Obstacle)
Jagged multi-path outline, internal shading lines, embedded crystals for detail, and blur filter for softness.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="rockBlur" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
    </filter>
    <linearGradient id="rockGradDetailed" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0" />
      <stop offset="0.4" stop-color="#A9A9A9" />
      <stop offset="1" stop-color="#696969" />
    </linearGradient>
    <pattern id="crystalPattern" width="8" height="8" patternUnits="userSpaceOnUse">
      <polygon points="4,0 8,4 4,8 0,4" fill="#D3D3D3" opacity="0.3" />
    </pattern>
  </defs>
  <path d="M1 3 L7 1 L15 5 L23 1 L29 3 L32 15 L28 23 L20 29 L12 25 L4 29 L0 19 Z" fill="url(#rockGradDetailed)" filter="url(#rockBlur)" />
  <path d="M3 7 L11 11 M7 19 L15 15 M19 9 L27 13 M5 25 L13 21" stroke="#404040" stroke-width="1" />
  <path d="M8 12 L12 16 M16 20 L20 24 M24 8 L28 12" stroke="#404040" stroke-width="0.5" opacity="0.8" /> <!-- Fine details -->
  <rect width="32" height="32" fill="url(#crystalPattern)" opacity="0.2" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.25" filter="url(#rockBlur)" /> <!-- Deeper shadow -->
</svg>
```

## Stone Wall Segment
Individual bricks with varying sizes, mortar gradients, cracks, and bevel edges for 3D effect.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brickGradDetailed" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C0C0C0" />
      <stop offset="0.3" stop-color="#A9A9A9" />
      <stop offset="1" stop-color="#808080" />
    </linearGradient>
    <linearGradient id="mortarGrad" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#696969" />
      <stop offset="1" stop-color="#404040" />
    </linearGradient>
    <filter id="brickBevel" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="blur" />
      <feSpecularLighting result="specOut" in="blur" surfaceScale="5" specularConstant="0.5" specularExponent="20" lighting-color="#FFFFFF">
        <fePointLight x="-5000" y="-10000" z="20000" />
      </feSpecularLighting>
      <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="specOut" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
  </defs>
  <rect width="32" height="32" fill="url(#brickGradDetailed)" filter="url(#brickBevel)" />
  <path d="M0 0 L32 0 M0 6 L32 6 M0 12 L32 12 M0 18 L32 18 M0 24 L32 24 M0 32 L32 32" stroke="url(#mortarGrad)" stroke-width="1" opacity="0.9" />
  <path d="M4 0 V32 M10 0 V32 M16 0 V32 M22 0 V32 M28 0 V32" stroke="url(#mortarGrad)" stroke-width="1" opacity="0.9" />
  <path d="M2 2 H30 M2 8 H30 M2 14 H30 M2 20 H30 M2 26 H30" stroke="#696969" stroke-width="0.5" opacity="0.7" /> <!-- Fine mortar -->
  <path d="M6 4 L8 6 M14 10 L16 12 M22 16 L24 18" stroke="#404040" stroke-width="0.5" /> <!-- Cracks -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" filter="url(#brickBevel)" /> <!-- Beveled shadow -->
</svg>
```

## Wooden Fence (Wall Variant)
Planks with detailed grain patterns, nails, rope bindings, and soft wood texture filter.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="woodTexture" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="3" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" />
    </filter>
    <linearGradient id="woodGradDetailed" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A0522D" />
      <stop offset="0.4" stop-color="#8B4513" />
      <stop offset="1" stop-color="#654321" />
    </linearGradient>
    <pattern id="grainPattern" width="2" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 0 V32" stroke="#654321" stroke-width="0.5" opacity="0.6" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="transparent" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="url(#woodGradDetailed)" stroke-width="4" filter="url(#woodTexture)" />
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="2" opacity="0.9" />
  <rect width="32" height="32" fill="url(#grainPattern)" opacity="0.4" />
  <path d="M6 8 Q16 4 26 8 M6 24 Q16 28 26 24" stroke="#654321" stroke-width="1" opacity="0.7" /> <!-- Rope bindings -->
  <circle cx="8" cy="6" r="1" fill="#696969" /> <!-- Nails with shadow -->
  <circle cx="8" cy="6" r="0.5" fill="#FFFFFF" opacity="0.3" /> <!-- Nail highlight -->
  <circle cx="16" cy="14" r="1" fill="#696969" />
  <circle cx="16" cy="14" r="0.5" fill="#FFFFFF" opacity="0.3" />
  <circle cx="24" cy="22" r="1" fill="#696969" />
  <circle cx="24" cy="22" r="0.5" fill="#FFFFFF" opacity="0.3" />
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" filter="url(#woodTexture)" /> <!-- Textured shadow -->
</svg>
```

## Door/Gate
Paneled wood with hinges, detailed knob, frame bevels, and lock mechanism.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="doorBevel" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
      <feSpecularLighting result="specOut" in="blur" surfaceScale="3" specularConstant="0.6" specularExponent="15" lighting-color="#FFFFFF">
        <fePointLight x="-5000" y="-10000" z="20000" />
      </feSpecularLighting>
      <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="specOut" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
    <linearGradient id="doorGradDetailed" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F" />
      <stop offset="0.5" stop-color="#A0522D" />
      <stop offset="1" stop-color="#8B4513" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#doorGradDetailed)" filter="url(#doorBevel)" />
  <path d="M2 2 H30 V30 H2 Z" stroke="#654321" stroke-width="2" fill="none" /> <!-- Frame -->
  <path d="M10 2 V30 M22 2 V30" stroke="#654321" stroke-width="1" opacity="0.8" /> <!-- Panels -->
  <path d="M2 10 H30 M2 22 H30" stroke="#654321" stroke-width="1" opacity="0.8" />
  <circle cx="16" cy="16" r="3" fill="#FFD700" /> <!-- Knob -->
  <circle cx="16" cy="16" r="1.5" fill="#FFFFFF" opacity="0.4" /> <!-- Knob highlight -->
  <path d="M4 4 L6 6 M4 26 L6 28" stroke="#696969" stroke-width="1" /> <!-- Hinges -->
  <rect x="14" y="14" width="4" height="4" fill="#696969" /> <!-- Lock plate -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" filter="url(#doorBevel)" /> <!-- Beveled shadow -->
</svg>
```

## River/Water (Animated)
Multi-layered waves with varying frequencies, bubbles with path motion, and foam details for dynamic flow.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="waterGradDetailed" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1E90FF" />
      <stop offset="0.5" stop-color="#00BFFF" />
      <stop offset="1" stop-color="#4169E1" />
    </linearGradient>
    <filter id="waterGlow" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="32" height="32" fill="url(#waterGradDetailed)" filter="url(#waterGlow)" />
  <path d="M0 10 Q8 6 16 10 Q24 14 32 10" stroke="#FFFFFF" stroke-width="2" opacity="0.8">
    <animate attributeName="opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
    <animate attributeName="d" values="M0 10 Q8 6 16 10 Q24 14 32 10; M0 10 Q8 8 16 10 Q24 12 32 10; M0 10 Q8 6 16 10 Q24 14 32 10" dur="3s" repeatCount="indefinite" />
  </path>
  <path d="M0 18 Q8 14 16 18 Q24 22 32 18" stroke="#FFFFFF" stroke-width="1.5" opacity="0.6">
    <animate attributeName="opacity" values="0.6;0.3;0.6" dur="2.5s" repeatCount="indefinite" />
    <animate attributeName="d" values="M0 18 Q8 14 16 18 Q24 22 32 18; M0 18 Q8 16 16 18 Q24 20 32 18; M0 18 Q8 14 16 18 Q24 22 32 18" dur="4s" repeatCount="indefinite" />
  </path>
  <path d="M0 26 Q8 22 16 26 Q24 30 32 26" stroke="#FFFFFF" stroke-width="1" opacity="0.4">
    <animate attributeName="opacity" values="0.4;0.2;0.4" dur="3s" repeatCount="indefinite" />
  </path>
  <circle cx="8" cy="16" r="2" fill="#FFFFFF" opacity="0.7">
    <animate attributeName="r" values="2;4;2" dur="1.2s" repeatCount="indefinite" />
    <animate attributeName="cy" values="16;12;16" dur="1.2s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1.2s" repeatCount="indefinite" />
  </circle>
  <circle cx="24" cy="24" r="1.5" fill="#FFFFFF" opacity="0.5">
    <animate attributeName="r" values="1.5;3;1.5" dur="1.8s" repeatCount="indefinite" />
    <animate attributeName="cy" values="24;20;24" dur="1.8s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.5;0.2;0.5" dur="1.8s" repeatCount="indefinite" />
  </circle>
  <path d="M4 28 Q8 26 12 28 Q16 30 20 28 Q24 26 28 28" stroke="#ADD8E6" stroke-width="1" opacity="0.3" /> <!-- Foam details -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.15" filter="url(#waterGlow)" /> <!-- Glowing shadow -->
</svg>
```

## Bridge
Planks with detailed grain, rope bindings with knots, nails with highlights, and plank variations for realism.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="bridgeTexture" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="2" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
    </filter>
    <linearGradient id="bridgeGradDetailed" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#CD853F" />
      <stop offset="0.5" stop-color="#A0522D" />
      <stop offset="1" stop-color="#8B4513" />
    </linearGradient>
    <pattern id="plankGrain" width="4" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 0 V32" stroke="#654321" stroke-width="0.5" opacity="0.7" />
      <path d="M2 0 V32" stroke="#654321" stroke-width="0.3" opacity="0.5" />
    </pattern>
  </defs>
  <rect width="32" height="32" fill="url(#bridgeGradDetailed)" filter="url(#bridgeTexture)" />
  <rect width="32" height="32" fill="url(#plankGrain)" opacity="0.5" />
  <path d="M0 4 H32 M0 12 H32 M0 20 H32 M0 28 H32" stroke="#654321" stroke-width="2" opacity="0.8" /> <!-- Grain details -->
  <path d="M4 0 V32 M12 0 V32 M20 0 V32 M28 0 V32" stroke="#A0522D" stroke-width="1.5" />
  <path d="M0 8 Q8 4 16 8 Q24 4 32 8 M0 24 Q8 28 16 24 Q24 28 32 24" stroke="#654321" stroke-width="1.5" opacity="0.9" /> <!-- Rope with knots -->
  <circle cx="8" cy="8" r="2" fill="#696969" /> <!-- Knots/nails -->
  <circle cx="8" cy="8" r="1" fill="#FFFFFF" opacity="0.3" /> <!-- Highlight -->
  <circle cx="24" cy="24" r="2" fill="#696969" />
  <circle cx="24" cy="24" r="1" fill="#FFFFFF" opacity="0.3" />
  <path d="M6 6 L10 10 M14 22 L18 26" stroke="#4B3621" stroke-width="0.5" /> <!-- Fine wood cracks -->
  <rect x="0" y="28" width="32" height="4" fill="#000000" opacity="0.2" filter="url(#bridgeTexture)" /> <!-- Textured shadow -->
</svg>
```