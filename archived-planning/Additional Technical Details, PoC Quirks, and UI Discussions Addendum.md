# Addendum: Additional Technical Details, PoC Quirks, and UI Discussions

## Introduction
This addendum captures the key points from recent discussions on technical quirks observed in the isometric PoC demo, player movement mechanics, occlusion handling, UI/menu features, and LLM integration flexibility. It focuses on high-level observations, proposed fixes, and rules to ensure smooth gameplay. These details build on the core Development Bible and previous addendums, emphasizing MVP refinements without introducing new complexity. The goal is to define "definition of done" criteria for components like movement and occlusion, while noting specific PoC issues for resolution in the full implementation.

## PoC Quirks and Observations
- **Player Movement Restrictions**: In the PoC, collisions felt awkward and overly restrictive. The player couldn't approach objects (e.g., trees, mushrooms) closely, creating unnatural "wide berths" around them. This stemmed from using the flat 2D logical grid for collision detection without adjusting for the isometric projection, leading to mismatched spatial perception.
- **Occlusion Failure**: No effective occlusion effect when the player moved "behind" taller objects in isometric view. The player remained fully visible, and there was no partial hiding (e.g., tree covering the player's head). This made the world feel flat despite the projection.
- **Sprite Animation Quirk**: When moving left/right, the player's arm blocks (simple SVG paths) detached from the body, floating separately. This occurred due to improper flipping/mirroring of the sprite—likely a whole-sprite scale(-1,1) without adjusting layered elements like arms.
- **General Playability**: The PoC lacked coherent world-building definitions, resulting in unplayable or visually inconsistent layouts. Future builds must address this through better solver rules.

## Player Movement and Occlusion Rules
To resolve PoC issues, define clear runtime mechanics and tests. These ensure fluid, intuitive interaction in the isometric view.

### Player Movement Rules
- **Grid-Snapped Movement**: Player always centers on a micro tile; no sub-pixel or free-floating positions. Movement is tile-by-tile steps (e.g., 200ms animation per move) to prevent jerky or imprecise navigation.
- **Collision Detection**: Use the logical 2D grid for checks (walkable boolean per micro tile), but adjust bounds visually for isometric (e.g., tighter hitboxes to allow "near" approaches without blocking).
- **Direction Handling**: Support orthogonal movement only (up/down/left/right); flip sprite via scale(-1,1) for left/right, but layer arms/body separately to avoid detachment—arms swap "forward" based on direction.
- **Definition of Done**:
  - Player can circumnavigate objects without unnatural gaps.
  - Smooth animation cycles (idle, walk1, walk2) trigger on move; no floating parts.
  - Test: Player moves around/through a 5x5 chunk with mixed walkable/non-walkable micros; no clipping or stutters.

### Occlusion Rules
- **Height-Based Draw Order**: Sort all objects (including player) by `sortKey = y + (height / 2)` before rendering—taller/southernmost draw last, occluding others.
- **Dynamic Layering**: Player treated as a world object in the sort list; automatically "hidden" behind taller features (e.g., tree trunk covers lower body when y-position overlaps).
- **Partial Occlusion**: Use Canvas clipping or alpha masks for soft hiding (e.g., fade player behind tree foliage).
- **Definition of Done**:
  - Player partially occluded when behind trees/rocks (e.g., head visible above low bushes, fully hidden behind tall walls).
  - No z-fighting or pop-in during movement.
  - Test: Player walks a path crossing behind/around 3-5 objects; occlusion updates per frame without glitches.

## UI and Menu Features
- **Options Menu**: Accessible from main/pause; includes sound sliders (master/SFX/music), control remapping, and LLM config (see below).
- **Save/Load Menu**: 3-5 slots with timestamps; auto-save on chunk exit, manual via Esc.
- **Player Sprite Customizer**: Sub-menu/overlay; edit flat SVG base (body color, hair styles/colors, clothes, accessories like glasses/hat). Bake changes to memory/save file; apply pre-isometric projection for preview.
- **Sidebar Usage**: Reserve ~20% right-side space for dynamic elements (inventory icons top, interaction panel middle—e.g., NPC chat/quiz window, item tooltips; stats bottom—coins, words learned). Keeps main canvas focused without dead space.

## LLM Integration Flexibility
- **Configurable Endpoint**: In options menu, allow runtime setup: Mode (local/remote), URL (default: http://localhost:8080), optional API key (for OpenRouter/Grok-compatible services).
- **No Static Fallback**: Always require LLM for entropy (even if mocked RNG as temp backup); no pre-generated content.
- **Abstraction Layer**: Use OpenAI-compatible API calls in src/llm.ts; flexible for switching between local bitnet.cpp server or remote without code changes.
- **Notes**: Avoid WASM in-browser for now (too complex); focus on local setup with Visual C++/CMake, despite heaviness.

## Next Steps and Tests
- **Integration**: Fold these into solver (e.g., ensure chunks support occlusion metadata) and runtime (e.g., movement/occlusion in render loop).
- **General Tests**: BFS for paths; visual checks for quirks (e.g., arm detachment); playtest for "feel" (no wide berths).
- **MVP Limit**: Focus on meadow/rock/river/wall/door/gate/bridge; defer advanced features.

This addendum ensures quirks are addressed, providing clear guidelines for implementation. Iterate via PoC refinements.