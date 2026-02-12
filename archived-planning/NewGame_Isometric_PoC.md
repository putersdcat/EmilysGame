Procedural LLM-Driven Adventure Game: Key Technical Decisions and Isometric PoC Demo Plan
Introduction
This document summarizes the key technical decisions from our discussions on developing a lightweight, browser-based top-down (now pivoting to isometric) adventure game. The game uses a local LLM (BitNet b1.58 2B4T) for procedural entropy, with educational quizzes, collectibles, and exploration mechanics. It builds on the core Development Bible and addendums, emphasizing modularity, performance on target hardware (8th Gen Intel i7, 16GB RAM, NVIDIA GTX 1050 2GB), and browser-native execution.
The second half maps out a Proof of Concept (PoC) demo for the isometric view and basic ego (player) character motion. This PoC is a fixed scene but designed with extensibility in mind: The “world painter” (rendering logic) accepts external inputs (e.g., JSON data for objects) to facilitate future integration with generative hashing from LLM seeds. No generative code is included in the PoC—focus is on validating rendering, occlusion, input, and motion.
Key Technical Decisions
Below are the major decisions, grouped by category, drawn from our iterative discussions. These evolved from initial 3D/open-world ideas to a simplified 2D/isometric Zelda-like, with LLM as entropy source.
Language and Build System
	•	TypeScript over Vanilla JavaScript: Adopted as the primary language for safer development. TypeScript (open-source, Microsoft-originated since 2012) adds static typing without runtime overhead—it compiles to plain JS. This reduces bugs in complex areas like async LLM calls, grid math, and rendering. Line count remains similar (types are minimal additions like : number), but refactoring is easier. Not natively browser-interpreted; requires compilation (e.g., via tsc or bundlers). No runtime dependencies—install as dev tool (npm i typescript).
	•	Build Tooling: Use Vite for quick setup (TS template via npm init vite@latest). Automates compilation, bundling, and hot-reloading. Output: Single HTML with inlined/included JS/CSS for local testing (open via file:// in Chromium-based browsers like Edge). For production, bundle to minimize files.
	•	Local vs. Server Testing: Local file system works for dev (double-click HTML), but bundle assets (e.g., SVGs as data URIs) to avoid CORS blocks on external loads. GitHub Pages for deployment—free static hosting; push compiled files to gh-pages branch for live URL. Nginx/local server optional for CORS testing (e.g., LLM loopback).
Rendering and Assets
	•	Canvas for 2D Rendering: Core engine uses HTML5 Canvas (2D context) for all visuals—no libraries like Phaser to keep lightweight. Handles drawing, transforms (scale, rotate, translate), and animations via requestAnimationFrame loop. Performant on target hardware (60FPS target).
	•	View Pivot: Top-Down to Isometric: Shifted from flat top-down to faux-3D isometric for depth feel (Polly Pocket toy aesthetic). Not true 3D—use 2D skews/offsets (diamond grid) and layering for occlusion. Assets remain flat; projection faked via math (e.g., offset rows by 0.5 tile width, scale Y-axis slightly).
	•	Assets Sourcing: Bootstrap Icons/Twemoji for emojis (lightweight, vector-based). LLM-generated SVGs for custom elements (prompt for connectable tiles with fixed viewBox, e.g., 128x128). Pre-cache as Image objects or data URIs. Player (ego) as dedicated SVG/sprite sheet for customization (not emoji-sourced).
	•	Sprite Handling: Emojis/SVGs treated as modular with metadata (e.g., height, layer). Flips (horizontal via ctx.scale(-1,1)) for direction. Shadows: Global rules (e.g., semi-transparent ellipse under taller objects via ctx.shadow* props).
	•	Animation: Static assets faked into motion—cycle 2-4 frames (e.g., leg poses for walking). No GIFs (bloated); use sprite sheets or layered drawing (e.g., body + arm overlay for actions). Simple tweens for actions (e.g., hand reach: offset arm position over frames).
LLM Integration and Procedural Generation
	•	Entropy Source: LLM generates nonsensical text (verb/noun pairs, sentences) as seeds. Mathematically hacked (SHA-256 hashing, ASCII sums) into numerical streams for world params (biomes, densities, features). Chaining: Player inputs/actions evolve the pool.
	•	Integration Options: Two paths—(1) Separate local server (bitnet.cpp on port 8080, fetch calls); (2) In-browser WASM/WebGPU (compile bitnet.cpp via Emscripten, cache model). Option 2 preferred for portability; fallbacks to RNG.
	•	Generative Extensibility: World painter designed modular—takes external data (e.g., JSON array of objects with positions/types). PoC uses static data; full game feeds from hashes.
Game Mechanics and UI
	•	Input: Keyboard (WASD/arrows for movement, space for interact). Async handling to avoid blocking render loop.
	•	Occlusion and Layering: Height-based sorting (draw low-to-high); player dynamically layered based on Y-position relative to objects.
	•	Customization: Player sprite customizable (colors, accessories) via flat editor; applied pre-projection.
	•	Educational/Progression: Quizzes via LLM-wrapped library; obstacles as templates (door/key interchangeable).
	•	Menus/Save: Pause (Esc), localStorage for persistence.
Performance and Scope
	•	Hardware Fit: Low footprint (<500MB total with model); async gen in Workers.
	•	PoC-First Approach: Build small demos (e.g., isometric rendering) before full scaffold to validate concepts.
	•	Extensibility: All modules small files (e.g., render.ts, gen.ts); TS interfaces for assets/inputs.
PoC Technology Demo: Isometric View and Ego Motion
This PoC validates the isometric rendering, occlusion, keyboard input, and basic motion. It’s a single fixed scene (green meadow tile) but structured like the full game: Modular code, metadata-driven assets, externalizable data. No LLM/gen—use static JSON for scene data (mimicking future hash outputs). Output: Single HTML/TS file (compiled to JS) for quick testing.
Objectives
	•	Demonstrate faux-isometric projection on a fixed 10x10 grid (diamond layout).
	•	Render a green field base with populated elements (plants, objects) from emoji/SVG sources.
	•	Show ego (player) moving via keyboard, with occlusion (walk behind taller objects).
	•	Include metadata for scales, heights, layers; global shadow rules.
	•	World painter function accepts external input (JSON array) for future gen integration.
Tech Stack for PoC
	•	Language: TypeScript (compile to JS via Vite or tsc).
	•	Structure: Small modules—main.ts (init/loop), render.ts (painter), input.ts (keyboard), assets.ts (metadata).
	•	Assets: 5-10 Bootstrap emojis (e.g., 🌳 tree, 🍄 mushroom, 🌿 grass). Ego as simple SVG (stick figure with 3 frames: idle, walk1, walk2).
	•	Grid: 10x10 cells, 64x32 px isometric tiles (squished Y for perspective).
	•	Loop: requestAnimationFrame for 60FPS; clear/redraw each frame.
Key Components and Logic
1. Asset Metadata
	•	TS interface:interface WorldObject {
	•	  emojiOrSvg: string;  // Emoji char or SVG data URI
	•	  type: 'ground' | 'plant' | 'object' | 'ego';
	•	  height: number;      // 0-10 units for sorting/occlusion
	•	  layer: 'base' | 'mid' | 'high';  // Initial draw group
	•	  scale: number;       // 0.5-2.0 for size variation
	•	  shadow: boolean;     // True for global shadow (ellipse under taller items)
	•	}
	•	
	•	Static array in assets.ts (e.g., tree: height 8, scale 1.2, shadow true; mushroom: height 2, scale 0.8).
2. Scene Data Input
	•	Externalizable JSON: Array of positioned objects (e.g., [{x: 2, y: 3, assetType: 'tree'}, ...]).
	•	Fixed for PoC: Hardcode a meadow—green base (#228B22 fill), 10 random plants (grass/flowers), 3 trees, 2 mushrooms.
	•	Painter function: function paintWorld(ctx: CanvasRenderingContext2D, sceneData: SceneJSON) { ... }—loops through data, applies metadata.
3. Isometric Projection
	•	Grid Math: Convert Cartesian (x,y) to isometric screen coords:
	◦	screenX = (x - y) * (tileWidth / 2)
	◦	screenY = (x + y) * (tileHeight / 2) (tileWidth=64, tileHeight=32 for skew).
	•	Base Layer: Fill green rect for field; optional grid lines for debug.
	•	Transforms: For each object, ctx.save(); ctx.translate(screenX, screenY); ctx.scale(obj.scale, obj.scale); drawEmojiOrSvg(); ctx.restore();.
4. Layering and Occlusion
	•	Sort Function: Before draw, sort scene objects by sortKey = y + (height / 2) (southernmost/tallest last).
	•	Draw Order: Base (ground) → Sorted mid/high objects → Overlays (shadows last).
	•	Ego Integration: Treat ego as dynamic object in sort list; walks “behind” if ego.y + ego.height < obj.y.
5. Ego Character and Motion
	•	Metadata: Height 3, scale 1.0, shadow true. 3-frame SVG sheet (idle, walk1, walk2) for animation.
	•	State: Position (x,y), direction (N/S/E/W—flipped via scale(-1,1) for left/right).
	•	Input: input.ts listens for keydown (WASD/arrows); updates velocity (e.g., dx=1 on right).
	•	Motion: In loop, update position (x += dx * speed); cycle frames every 200ms if moving.
	•	Action: Space for “reach” (overlay arm SVG, tween offset over 3 frames).
6. Global Rules
	•	Shadows: For objects with shadow: true, draw semi-transparent (#000 0.3 alpha) ellipse at base (width=scale20, height=scale10).
	•	Camera: Fixed viewport (800x600); no scroll—ego stays centered if grid fits.
7. PoC Implementation Steps
	1	Setup: Vite TS project; index.html with .
	2	Assets Load: Pre-cache emojis/SVGs as Images in assets.ts.
	3	Loop: Clear, paintWorld with sceneData, requestAnimationFrame.
	4	Input: Event listeners; debounce for smooth motion.
	5	Test: Open compiled HTML locally; arrow keys move ego, observe occlusion/shadows.
	6	Extensibility Check: Swap hardcoded sceneData with mock JSON (e.g., from console)—ensure painter adapts.
Potential Challenges and Mitigations
	•	Perf: If draw calls lag, batch shadows. Target <10ms/frame.
	•	Alignment: Test emoji/SVG bounding—use fixed viewBox.
	•	Future Gen Tie-In: SceneJSON mirrors hash output format (positions/types from streams).
	•	Scope: Keep PoC <500 lines; no menus/LLM—just core view/motion.
This PoC sets the foundation—success means smooth motion/occlusion, ready for procedural inputs. Next: Integrate with LLM hashing for dynamic scenes.
