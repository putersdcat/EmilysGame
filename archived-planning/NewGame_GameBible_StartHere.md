# Procedural LLM-Driven Adventure Game: Development Bible

## Overview
This document serves as the core reference for developing a lightweight, browser-based isometric adventure game inspired by classic Zelda-style exploration. The game features procedurally generated worlds driven by a local LLM (BitNet b1.58 2B4T) for entropy, ensuring unique, replayable sessions. It’s designed for educational fun, aimed at a child (your daughter), with quizzes integrated into gameplay. The core loop involves exploring tiles, collecting items, solving obstacles, and interacting with NPCs via short chats or challenges.

Key Goals:
- **Simplicity & Performance**: TypeScript/Canvas for rendering, runnable on an 8th Gen Intel i7 with 16GB RAM and NVIDIA GTX 1050 2GB. Browser-native for easy prototyping and sharing.
- **Procedural Innovation**: LLM generates “nonsense” text as seeds, mathematically hacked into world elements, with rules ensuring playability.
- **Educational Twist**: Quizzes (math, science, etc.) wrapped by LLM for flavor but verified by code.
- **Modularity**: Everything interchangeable (e.g., obstacles as templates) for easy expansion.
- **Session Length**: Short, engaging plays (5-15 minutes), with persistence for revisits.

Assumptions:
- Offline-first: LLM runs locally via WebLLM (WebGPU accel on Chrome/Edge, fallback to WASM).
- Assets: Generated via LLMs (e.g., Grok or similar) as SVGs for tiles/sprites, prompted for modularity.
- Development: Use AI copilots; structure code in small files for limited context windows.

## Tech Stack
- **Rendering**: HTML5 Canvas (2D context) for all visuals. No external engines—pure TypeScript.
- **Assets**: Bootstrap Icons/Twemoji for emojis, plus LLM-generated SVGs for custom tiles/sprites. Pre-cache as Image objects. Player as dedicated SVG sprite sheet for customization and animation.
- **LLM Integration**: BitNet b1.58 2B4T via WebLLM. Prompt for nonsense sentences/lists; hash outputs for gen.
- **Storage**: localStorage for saves (world seeds, inventory, progress); IndexedDB if grids grow large.
- **Audio**: Web Audio API for simple sounds (beeps, chimes— no heavy libraries).
- **Inputs**: Keyboard (WASD/arrows for movement, space/enter for interact, esc for pause).
- **Browser Features**: Web Workers for async gen (avoid UI freeze), requestAnimationFrame for 60FPS loop.
- **Dependencies**: None external—vanilla TypeScript (compiled to JS). Optional: math.js for quiz verification if needed.

## Game Mechanics
### Core Loop
1. **Start**: Random LLM-generated verb/noun list (50 pairs, >10 letters each) seeds the world. Player spawns in center of first tile.
2. **Exploration**: Isometric view, player at center. Move to tile edges triggers new chunk gen async.
3. **Collection**: Gather coins (💰) scattered via hash density.
4. **Obstacles & Progression**: Interchangeable templates (e.g., door/key 🔒/🔑, toll/coins 🚧/💰, barricade/crowbar 🪵/🛠️, river/bridge 🌊/🌉). Rules ensure solvability in-tile or nearby.
5. **Interactions**: NPCs (👤) for chats (2-3 turns, LLM responses) or quizzes. Shops for buys.
6. **End**: Reach “treasure room” after 10-20 tiles; final quiz for payout. Restart with new seed.

### Inventory & Items
- Simple array: Held items (keys, tools, potions). Display as HUD icons.
- Usage: Auto-apply on obstacles (e.g., crowbar on barricade). Drop on use if consumable.
- Carried Across Tiles: Encourages backtracking; exceptions for “wild” obstacles needing prior picks.

### NPCs & Chats
- Spawn: Hash-based (e.g., >70 = NPC on open cell).
- Persona: LLM prompt (“Quirky goblin merchant”) for flavor.
- Chat: Text box input (50-100 char limit), LLM responds briefly. Feeds words back into gen pool for evolution.
- Trades/Hints: Swap items or reveal map bits.

### Educational Quizzes
- Trigger: On NPC approach or obstacle (optional for paths, mandatory for rewards).
- Types: Math (word problems), Science (facts), History/Geography, Language/Spelling, Logic/Riddles.
- Backend: Local TS array/JSON library (100-500 Q&A pairs, curated from open sources).
- LLM Role: Rephrase Q in fun/story way (prompt: “As wise owl, rhyme this: [original Q]”).
- Verification: TS code (e.g., math.js/eval for math; string match for others). No LLM math!
- Rewards: Coins, keys, buffs (e.g., speed 🏃).
- Length: 1-3 questions; hints on wrong, animations on correct (Canvas particles).

### Progression & Biomes
- Levels: Hash-seeded (Forest → Cave → Castle), scaling difficulty (more obstacles).
- Exceptions: 10-20% “wildcards” (impassables force reroutes; unguarded hoards; mystery shops).
- Streaks: Correct quizzes spawn easier tiles; fails add challenges.

### Controls
- Movement: WASD/Arrows.
- Interact: Space/Enter (talk, collect, solve).
- Inventory: I key to view.
- Map: M for mini-map (grid overlay of visited tiles).
- Pause: Esc (menu).

## World Generation
### Grid Setup
- Size: 1024x1024 cells (infinite potential via wrap-around if needed).
- Chunks: 32x32 cells per “tile/screen” for lazy loading.
- Cell Size: 128x128 pixels (dense view; adjustable for zoom).
- Viewport: Window-sized Canvas, camera centers player. Buffer +1 chunk off-screen.

### LLM Entropy Source
- Init: Prompt LLM: “Generate 50 random verb-noun pairs (>10 letters, e.g., ‘obliterate quasar’).” Pick one for start.
- On Move: Direction keys trigger pair (up: “ascend flux”), prompt for 1-2 nonsense sentences.
- Hacking: SHA-256 hash to hex; chunk into seeds (terrain, density, features). ASCII sums for params (e.g., %10 = type).
- Stream: Concat outputs for evolving buffer; read as binary for flags.

### Tile Builder Rules
1. **Base Gen**: Hash to 2D density map; Perlin noise (TS impl) for smooth distribution.
   - 60-80% terrain (grass 🌿, dirt, sand).
   - 10-20% obstacles (wall 🧱, tree 🌳).
   - 5-10% features (door, chest 📦, NPC).
2. **Meshing**:
   - Auto-Tiling: Bitmask neighbors for variants (e.g., river bends).
   - Compatibility: Blend edges (transition SVGs); reroute incompatibles (wall-river → bridge).
   - Clustering: Group similars (3-5 trees).
   - Flow: Flood-fill for rivers/paths.
3. **Playability Fixes**:
   - Passability: BFS from entry; ensure 40-60% open. Add paths if <.
   - Balancing: Door? Spawn key nearby. River? Add bridge.
   - Variety: Cap same-type runs; biome bias from prompt.
4. **Post-Process**: Evolve rules per biome; player actions tweak (e.g., quiz win adds coins).

## Rendering
- **Loop**: requestAnimationFrame; clear Canvas, translate camera, draw visible chunks.
- **Layers**: Base terrain → Overlays (features, player 👦, effects).
- **Sprites**: LLM-generated SVGs (prompt: “Simple grass tile SVG, connectable edges, 128x128 viewBox.”).
  - Alignment: Prompt for fixed viewBox (e.g., “0 0 128 128”); ensure edge pixels transparent for overlap.
  - Variants: Generate sets (straight, corner) per type.
- **Animations**: Frame swaps (e.g., water ripple: 3 SVGs cycled). Player: Cycle 2-4 frames (idle, walk poses); layer overlays (e.g., arm for actions).
- **Isometric Projection**: Faux-3D via diamond grid (offset rows by 0.5 tile width, squash Y-axis). Height-based sorting for occlusion (draw low-to-high; player dynamically layered).
- **Shadows**: Global rules—semi-transparent ellipse under taller objects.
- **HUD**: Top bar for coins, inventory icons; bottom for chat box.

## UI, Menus, Pause, & Save
- **Menus**:
  - Start: Title screen (play, load, options). Options: Volume, zoom, difficulty (quiz level). Include player customization (hair color, accessories) via flat SVG editor.
  - Pause: Esc overlays menu (resume, save, quit, sound toggle).
- **Save/Load**: Serialize to localStorage: Seed list, grid chunks (compressed JSON), inventory, position. Auto-save on tile exit; manual via menu.
- **Fog-of-War**: Unvisited cells grayed; reveal on enter.
- **Mini-Map**: Canvas sub-element; dots for visited/chunks.
- **Tooltips**: Mouse hover (if added) for item desc.

## Sound
- **Implementation**: Web Audio API (oscillators for beeps; no external files for lightness).
- **Effects**: Collect coin (chime), quiz correct (fanfare), move (footsteps—subtle loop), chat (blip).
- **Music**: Optional simple loop (sine waves for ambient tune).
- **Volume**: Slider in options; mute toggle.

## Code Structure
Break into small, tight files (1-2k lines max) for copilot ease. Use ES modules (import/export). Folder: `src/` for TS, `assets/` for SVGs, `styles/` for CSS (minimal, e.g., Canvas full-screen).

- `index.html`: Entry (Canvas element, script imports).
- `styles/main.css`: Canvas styling (full-window, no scroll).
- `src/main.ts`: Init (load assets, start loop), game state object.
- `src/render.ts`: Draw functions (renderChunk, hud, animations).
- `src/gen.ts`: World gen (generateChunk, rules, hashing). Worker-wrapped for async.
- `src/llm.ts`: WebLLM setup, prompt functions.
- `src/mechanics.ts`: Player movement, collisions, interactions.
- `src/quiz.ts`: Library data, verification logic, LLM wrapping.
- `src/inventory.ts`: Item handling, templates.
- `src/ui.ts`: Menus, pause, save/load.
- `src/audio.ts`: Sound effects/mixer.
- `src/utils.ts`: Helpers (hash, Perlin, BFS).

Style: Clean functions (e.g., function applyMeshing(grid) { ... }), no globals (pass state), comments per module. Use TS interfaces for assets (e.g., height, layer).

## Asset Generation
- **LLM Prompting**: Use tools like Grok/DALL-E for SVGs. Example: “Generate a connectable grass tile as SVG code, viewBox 0 0 128 128, transparent edges for seamless tiling, natural variations.”
  - Alignment: Always specify viewBox/preserveAspectRatio; test meshing in browser.
  - Sets: Prompt batches (e.g., “5 variants: straight river, bend, end cap”).
  - Library: 20-30 types; store as data URIs in TS const.
- **Fallback**: Emojis if SVGs fail (e.g., 🌳 for tree).
- **Player Sprite**: Dedicated SVG sheet (idle, walk frames, reach overlay); customizable pre-projection (colors, accessories).

## Potential Expansions & Missed Elements
- **Multiplayer**: Shared seeds for co-op (via URL params).
- **Achievements**: Track streaks (localStorage badges).
- **Accessibility**: Keyboard-only, color-blind modes (high-contrast toggles).
- **Debug**: Console commands (e.g., reveal map).
- **Error Handling**: LLM fail? Fallback to pure RNG.
- **Testing**: Unit tests for rules (e.g., ensure passability).
- **Deployment**: Host on GitHub Pages for sharing.

This bible captures our discussions—iterate as needed during dev! If building, start with gen.ts and render.ts for a quick prototype.