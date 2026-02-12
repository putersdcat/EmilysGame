# Emily's Game - Isometric PoC

[![Pages](https://github.com/putersdcat/EmilysGame/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/putersdcat/EmilysGame/actions/workflows/ci-cd.yml)

A lightweight, browser-based procedural adventure game with isometric view and LLM-driven entropy.

## Project Overview

This is the Proof of Concept (PoC) implementation of the game described in [Docs/NewGame_Isometric_PoC.md](Docs/NewGame_Isometric_PoC.md). The PoC validates:

- **Isometric Rendering**: Faux-3D projection on a 10x10 grid using 2D Canvas
- **Occlusion & Layering**: Objects render in correct depth order based on Y-position
- **Player Motion**: Keyboard-driven ego character movement with direction flipping
- **Asset System**: Modular metadata-driven approach for extensibility

## Tech Stack

- **Language**: TypeScript (v5.0+)
- **Build**: Vite
- **Runtime**: Browser (Canvas 2D)
- **Assets**: Emoji/SVG-based sprites

## Quick Start

### Prerequisites

- Node.js 16+
- npm 8+

### Installation

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev

# Build for production
npm run build
```

The dev server will typically open at `http://localhost:5173`.

### Playing the PoC

- **Move**: Arrow keys or WASD
- **Interact**: Space (not yet implemented)
- **Direction**: Character faces left/right based on horizontal movement

## Project Structure

```
src/
  main.ts         - Entry point, game loop orchestration
  render.ts       - Canvas rendering engine (IsometricRenderer)
  input.ts        - Keyboard input handling (InputManager)
  assets.ts       - Asset metadata and scene generation
  index.html      - Page template
```

### Core Modules

#### `assets.ts`
Defines the `WorldObject` interface and asset library:
- Metadata: emoji/SVG, height, layer, scale, shadow
- Scene generation: Fixed meadow with procedural plant placement
- Extensible for future LLM-driven procedural generation

#### `render.ts`
Isometric rendering pipeline:
- Grid-to-screen coordinate conversion (diamond projection)
- Depth sorting for occlusion
- Emoji rendering via Canvas font API
- Shadow systems (ellipse under tall objects)

#### `input.ts`
Keyboard event manager:
- WASD + Arrow key support
- Normalized diagonal movement
- Stateful input tracking for smooth motion

#### `main.ts`
Game loop and state management:
- 60 FPS render loop with `requestAnimationFrame`
- Ego position + direction tracking
- Integration of render, input, and update systems

## Configuration

### Render Settings (main.ts)

```typescript
const renderConfig: RenderConfig = {
  canvasWidth: 800,
  canvasHeight: 600,
  tileWidth: 64,       // Isometric tile width
  tileHeight: 32,      // Isometric tile height (squished Y)
  baseColor: '#228B22', // Field color
};
```

### Game Parameters (main.ts)

```typescript
const speed = 0.05;  // Grid units per frame
const startPos = { x: 5, y: 5 }; // Grid center (10x10)
```

## Development Notes

### Adding New Assets

1. Add to `assetLibrary` in `assets.ts`:
   ```typescript
   apple: {
     emojiOrSvg: '🍎',
     type: 'object',
     height: 1,
     layer: 'mid',
     scale: 0.7,
     shadow: false,
   }
   ```

2. Reference in scene data (e.g., `generateMeadowScene()`).

### Extending Scene Generation

The PoC uses hardcoded meadow data. For full game integration:

1. Replace `generateMeadowScene()` with procedural generation from LLM hashes
2. Input format remains: `Array<{x, y, assetType}>`
3. The `paintWorld` function automatically adapts to external data

### Performance Targets

- **FPS**: 60 (Web workers for LLM in future)
- **Canvas frame**: <10ms
- **Memory**: <50MB (excluding model)

## Known Limitations (PoC)

- No LLM integration yet (static scene only)
- Emojis render as text, not preloaded images (fine for PoC)
- No collision detection
- No actual interaction/quiz system
- Fixed viewport (no camera pan/zoom)

## Future Work

1. **LLM Integration**: Local BitNet 2B4T via Node.js subprocess or WASM
2. **Procedural Generation**: Hash-to-scene mapping from LLM outputs
3. **Educational Mechanics**: Quiz system via wrapper library
4. **UI/Menus**: Pause, settings, save/load
5. **Collectibles & Progression**: Item system, inventory

## Resources

- **Core Design**: [Docs/NewGame_GameBible_StartHere.md](Docs/NewGame_GameBible_StartHere.md)
- **LLM Integration**: [Docs/NewGame_LLM_Addendum.md](Docs/NewGame_LLM_Addendum.md)
- **Entropy/Hashing**: [Docs/NewGame_LlmEntropyAddendum.md](Docs/NewGame_LlmEntropyAddendum.md)

## License

TBD
