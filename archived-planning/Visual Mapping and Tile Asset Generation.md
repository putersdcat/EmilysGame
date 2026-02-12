# Procedural LLM-Driven Adventure Game: Visual Mapping and Tile Asset Generation - MVP Design Documentation

## Introduction
This document captures the high-level points and critical technical details from our discussions on the game's visual mapping and tile asset generation mechanics. It focuses on the isometric view system, defining core units (micro tiles, world unit tiles, macro tiles), and the procedural solver for stitching them together. Emphasis is on the MVP scope, limiting to basic themes like meadow, rock, wall, door, rivers, gates, and bridges to manage complexity. This avoids advanced biomes (e.g., desert, mountain) for now, ensuring a solid foundation before expansion.

The system builds on the Development Bible: Tiles are procedurally generated from LLM-hashed entropy but constrained by rules for coherence, playability, and visual appeal. All visuals use SVGs/emojis, rendered via Canvas with isometric projection as a final transform. No diagonals—MVP keeps movement/edges orthogonal (horizontal/vertical) for simplicity.

Key Principles:
- **Modularity**: Tiles as composable "Lego" pieces with metadata for matching and functionality.
- **Performance**: Pre-rendered templates; minimal dynamic computation.
- **MVP Focus**: Basic terrain (meadow/grass as default); obstacles (rock/wall); features (river, door/gate, bridge).
- **Extensibility**: Designs allow future additions (e.g., rotations, terminators) without breaking core solver.

## Tile Unit Definitions
The world is a logical 2D grid (flat abstraction for design; isometric applied in rendering). Units scale up hierarchically for efficient generation and solving.

### Micro Tile
- **Definition**: The smallest atomic unit—1x1 grid cell, sized to fit one player sprite or simple feature (e.g., logical 32x32 px; isometric projects to 64x32 px for diamond shape).
- **Purpose**: Represents basic terrain or features; determines walkability and interactions.
- **Properties** (Metadata):
  - Walkable: Boolean (true for grass; false for wall/rock/water).
  - Type: Enum (e.g., grass, rock, water, door).
  - Visual: SVG fragment (e.g., green fill for grass; gray textured for rock).
  - Dynamic: Optional animation (e.g., water ripple: 3-frame SVG cycle with bubbles).
  - Interaction: Enum (none, quiz-required, key-required).
- **MVP Examples**:
  - Grass: Walkable, light green SVG with subtle texture.
  - Rock: Non-walkable, gray bumpy SVG.
  - Water: Non-walkable (unless bridged), blue with animated waves.
  - Door/Gate: Non-walkable until unlocked, wooden/metal SVG with lock icon.
- **Notes**: Micro tiles don't exist in isolation—always part of larger units. Edges transparent for blending.

### World Unit Tile (Chunk)
- **Definition**: 5x5 grid of micro tiles—core building block for procedural placement (logical 160x160 px).
- **Purpose**: Provides symmetric, reusable "scenelets" with pre-defined patterns; ensures local coherence (e.g., walls align internally).
- **Properties** (Metadata):
  - Walkable Map: 5x5 boolean array (e.g., center open for gates).
  - Edge Tags: Object {north, south, east, west} with types (e.g., 'grass', 'wall', 'water') for neighbor matching.
  - Rotation Support: Boolean (true for symmetric patterns; e.g., rotate 90/180/270 degrees).
  - Connects: Boolean (e.g., true for rivers—must link to adjacent water).
  - Spawn Points: Array of positions for overlays (e.g., coin on grass; fish in water).
  - Visual: Composite SVG (stitched from micro tile fragments; supports animation layers like water bubbles).
  - Terminator: Boolean (e.g., true for river-ending pond—stops flow).
- **MVP Examples**:
  - Meadow Base: Fully grass micro tiles; all walkable; edges 'grass'; spawns flowers.
  - Rock Wall: Horizontal wall across one row (e.g., row 3); non-walkable row; edges 'wall' on sides.
  - River Straight: Water across middle row; non-walkable; edges 'water'; animated ripples.
  - River Bend: Water in L-shape (e.g., rows 1-3 vertical, then horizontal); connects on two edges.
  - Gate Wall: Wall with center gap (micro tile open/door); requires key/quiz; symmetric for rotation.
  - Bridge River: River with center bridge micro tile (walkable); requires quiz; terminator optional (e.g., ends in pond).
- **Notes**: 5x5 chosen for symmetry (easy gates in center) and variety (e.g., turns in rivers without diagonals). Pre-render 5-10 variants per type (e.g., wall in row 1 vs. row 3).

### Macro Tile (Solver Unit)
- **Definition**: Larger aggregation (e.g., 5x5 chunks = 25x25 micro tiles)—unit for procedural solving and stitching.
- **Purpose**: Ensures global coherence; solves connectivity (e.g., rivers flow logically) across chunks.
- **Properties** (Metadata):
  - Connectivity Rules: Must match neighbor edges (e.g., water to water; wall to wall/open).
  - Path Guarantee: BFS validation—ensure walkable paths; reroll if trapped.
  - Entropy Input: Hash selects chunks from library; tweaks rotations/terminators.
  - Terminator Logic: For rivers/walls—end in pond/rock pile (special chunk) to avoid infinite lines.
- **MVP Constraints**: No infinite features (e.g., rivers max 3-5 chunks before terminating); no enclosed boxes (solver checks openness).
- **Notes**: Solver runs per new visible area (e.g., on edge cross); focuses on MVP themes to limit permutations.

## Procedural Solver Mechanics
High-level flow for generating/stitching macro tiles (MVP: meadow-focused with rock/river/wall interruptions).

- **Input**: LLM-hashed entropy (stream for selections; e.g., % value picks theme bias like "river-heavy").
- **Process**:
  1. **Theme Bias**: Hash sets macro "mood" (e.g., 70% meadow chunks).
  2. **Chunk Selection**: Pick from library (e.g., "river straight" if water needed).
  3. **Rotation/Placement**: Rotate to fit neighbors; check edge tags (e.g., align wall ends).
  4. **Connectivity Solve**: For rivers—extend or terminate (e.g., bend then pond); for walls—gap with gate if path blocked.
  5. **Playability Check**: BFS from player entry—ensure >40% walkable, no dead-ends; inject bridges/gates if needed.
  6. **Overlays**: Post-solve, spawn emojis (e.g., door on gate spot; fish in river).
  7. **Rendering Prep**: Composite to offscreen Canvas; apply isometric (diamond offsets, Y-squash).
- **MVP Limitations**: Orthogonal only (no diagonals); terminators mandatory (e.g., rivers end in 1-3 chunks); focus on passable features (bridges/gates as "solvers").
- **Edge Cases**: If solver fails (e.g., trapped path)—reroll chunk or force open gap.

## Visual Composition and Rendering
- **Layers**: Base (terrain SVG) → Features (walls/rivers) → Overlays (emojis, animations) → Player → Shadows.
- **Isometric Transform**: Applied last—logical flat grid skewed (x-y offsets) for depth; height metadata sorts draw order for occlusion.
- **Animations**: Chunk-level (e.g., river ripples cycle frames); no per-micro (keep simple).
- **Blending**: Transparent SVG edges; auto-variants (e.g., wall-cap if no neighbor).
- **MVP Visuals**: Green meadow base; blue wavy rivers; gray rocky walls; wooden gates/bridges.

## MVP Scope Limitations
- Themes: Meadow (grass base); Rock (obstacles); Wall/Door/Gate (barriers); River/Bridge (water crossings).
- No: Diagonals, infinite features, complex biomes (desert/mountain deferred).
- Focus: Coherent paths, symmetric gates (center of 5x5), terminators (ponds/rock piles).

This doc provides a blueprint for implementation—next steps: PoC with meadow/river chunks. Expand post-MVP.