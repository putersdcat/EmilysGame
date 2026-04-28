# Textures

Source-of-truth SVG texture modules for stone-wall, fence, river, etc.

## Contract

Every texture module exports:

- `IMAGE_SIZE` — the canonical pixel size of one tile of the image (always 128 here, divides evenly into the 128 px game tile).
- `svg(): string` — the full SVG string for one 128×128 tile.

The image MUST be **self-tileable** when laid edge-to-edge in both axes:
its right edge must match its left, and its bottom must match its top,
so a single rasterized image can be fed to `ctx.createPattern(img, 'repeat')`
and tile seamlessly across any sized fill rect.

Patterns must use **solid backgrounds** (no transparency through mortar /
gap pixels) so biome tiles do not bleed through wall faces.

## Renderer contract

The canvas renderer (nano-tile.ts) uses `createPattern` on this single
image for BOTH the side faces AND the top face of stone walls. This
guarantees identical brick scale on every face, and aligned mortar lines
where the top meets each side.

Pattern phase is anchored relative to the **wall-top screen line** (so
the top edge of the side face starts at the same pattern y the front
edge of the top face starts at) and the **game-tile world origin** (so
adjacent tiles share grout phase).
