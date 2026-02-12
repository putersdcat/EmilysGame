# MVP SVG Primitives for Tile Materials and Elements

## Introduction
This document defines a set of simple SVG primitives for the game's MVP visual elements. Each primitive represents a single micro tile (32x32 logical viewBox for easy scaling/composition in 5x5 chunks). They are designed as modular, connectable pieces with transparent edges for blending. Materials focus on MVP themes: meadow/grass (walkable base), rock (obstacle), wall (barrier), door/gate (interactive), river/water (fluid, animated), bridge (crossing). Primitives use basic shapes/colors; animations (e.g., water) via <animate> for cycling effects. These can be composed in chunks via TS code (e.g., layering/rotating in Canvas).

Copy-paste the code into your IDE for wrapping (e.g., as string constants in assets.ts). No images/references included—pure SVG code.

## Grass (Meadow Base)
Light green fill with subtle wavy texture lines (static).

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#90EE90" />
  <path d="M0 16 L32 16 M0 20 L32 20 M0 24 L32 24" stroke="#228B22" stroke-width="1" />
</svg>
```

## Dirt (Path/Soil Variant)
Brown textured fill for walkable paths or variants.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#8B4513" />
  <path d="M4 4 L28 28 M4 28 L28 4 M16 0 L16 32" stroke="#A0522D" stroke-width="1" />
</svg>
```

## Rock (Obstacle)
Gray bumpy shape; non-walkable.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 0 L8 4 L16 0 L24 4 L32 0 L32 32 L24 28 L16 32 L8 28 L0 32 Z" fill="#808080" />
  <path d="M4 8 L12 12 L20 8 L28 12" stroke="#696969" stroke-width="1" />
</svg>
```

## Stone Wall Segment
Brick pattern for barriers; connectable left/right.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#A9A9A9" />
  <path d="M0 0 L32 0 M0 16 L32 16 M0 32 L32 32" stroke="#696969" stroke-width="1" />
  <path d="M8 0 V32 M16 0 V32 M24 0 V32" stroke="#696969" stroke-width="1" />
</svg>
```

## Wooden Fence (Wall Variant)
Brown plank style for lighter barriers.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="transparent" />
  <path d="M0 8 H32 M0 16 H32 M0 24 H32" stroke="#8B4513" stroke-width="4" />
  <path d="M8 0 V32 M16 0 V32 M24 0 V32" stroke="#A0522D" stroke-width="2" />
</svg>
```

## Door/Gate
Wooden panel with knob; interactive.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#8B4513" />
  <circle cx="16" cy="16" r="4" fill="#FFD700" />
  <path d="M0 0 V32 M32 0 V32" stroke="#A0522D" stroke-width="2" />
</svg>
```

## River/Water (Animated)
Blue base with rippling waves (3-frame cycle via animate).

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#00BFFF" />
  <path d="M0 16 Q8 12 16 16 Q24 20 32 16" stroke="#FFFFFF" stroke-width="2">
    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
  </path>
  <circle cx="8" cy="20" r="2" fill="#FFFFFF">
    <animate attributeName="r" values="2;3;2" dur="1s" repeatCount="indefinite" />
  </circle>
  <circle cx="24" cy="12" r="1" fill="#FFFFFF">
    <animate attributeName="r" values="1;2;1" dur="1.5s" repeatCount="indefinite" />
  </circle>
</svg>
```

## Bridge (Over Water)
Wooden planks for crossings.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#8B4513" />
  <path d="M0 8 H32 M0 16 H32 M0 24 H32" stroke="#A0522D" stroke-width="2" />
  <path d="M8 0 V32 M16 0 V32 M24 0 V32" stroke="#A0522D" stroke-width="1" />
</svg>
```