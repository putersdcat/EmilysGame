# Iso 2.0 — Player Anchor Convention (Canonical)

**Status:** Canonical for the `experiment/isometric-2.0` branch as of commit
introducing nano-snapped player placement in `AiTools/canvas-renderer.ts`.

## Rule

Every player avatar renders **centered inside one nano-tile** — a 1/9
sub-cell (1/3 × 1/3) of a micro-tile. The sprite's **feet anchor at the
south vertex of the chosen nano patch**, mirroring the legacy micro-tile
anchor but at nano granularity.

## Coordinates

A player is positioned by **micro-tile coords + nano sub-cell**:

```ts
interface CanvasPlayerEntry {
  col: number;              // Micro-tile column (integer)
  row: number;              // Micro-tile row    (integer)
  nanoCol?: 0 | 1 | 2;      // 0=W, 1=center, 2=E
  nanoRow?: 0 | 1 | 2;      // 0=N, 1=center, 2=S
  label?: string;
}
```

Foot world position:

```
footWorldCol = col + (nanoCol + 1) / 3
footWorldRow = row + (nanoRow + 1) / 3
```

Nano-grid screen mapping (with `HALF_W = 64`, `HALF_H = 32`):

```
px = ox + (footWorldCol - footWorldRow) * HALF_W
py = oy + (footWorldCol + footWorldRow) * HALF_H - HALF_H
```

Depth sort uses the same foot coords so nano-snapped sprites layer
correctly against tile features (`depth = footWorldCol + footWorldRow`).

## Backwards Compatibility

If `nanoCol` / `nanoRow` are omitted, the sprite anchors at the south
vertex of the whole micro tile (`(col + 1, row + 1)`) — preserving every
pre-nano harness exactly.

## Walkability Note

Walkability is currently **per-micro-tile**, not per-nano. A nano patch
inside a non-walkable micro tile is treated as non-walkable, so the
**closest legal nano** to a wall sits in the corner of the *adjacent*
interior tile, not inside the wall tile itself. Future work: nano-level
walkability so a player can occupy the outer-strip nano of a wall tile
that the wall geometry doesn't actually fill.

## Reference Render

`experiment/isometric-2.0/ProgressEvaluations/closed-players-iter04.png`
— closed stone-wall square with one player nano-snapped against each
interior wall (N/S/E/W), demonstrating both the centered-in-nano anchor
and correct depth layering.
