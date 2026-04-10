# Isometric 2.5D Wall Corner Geometry Reference

## 1. Coordinate Systems

### 1a. Iso 2.0 Tile-Space vs. Screen-Space

Each tile has its own **tile-local** coordinate system (tx, ty): both go 0→128,
representing pixel positions within the 128×128 micro-tile square.

**Iso projection formula** (the fundamental formula all face calculations derive from):

```
tile(tx, ty) → screen(sX + HALF_W + tx - ty,  sY + (tx + ty) / 2)
```

Where:
- `sX, sY` = tile's screen-top origin (top corner of the iso diamond)
- `HALF_W = 128`, `HALF_H = 64`
- tx increases → moves right-and-down on screen (East axis, `\` direction)
- ty increases → moves left-and-down on screen (South axis, `/` direction)
- Z (height in pixels) subtracts from screen Y: `screen_y -= z`

This is the **2:1 isometric (dimetric) projection** where diamonds are 256w×128h.

**Reference:** The formula `isoX = tx - ty; isoY = (tx + ty) / 2` is the standard
Cartesian→Iso conversion as documented by Clint Bellanger
(https://clintbellanger.net/articles/isometric_math/) applied to sub-tile px coordinates.

---

### 1b. Wall Strip Layout in Tile-Space

```
  ty=0
  ├────────────────────────────────────────────────┤
  │                 OPEN (not wall)                │  ← ty 0..40
  │                                                │
  ty=40 = WALL_OFFSET
  ├──────────────┬─────────────────────────────────┤
  │              │       H-STRIP (horizontal arm)  │  ← ty 40..88
  │              │  Core (40..88 × 40..88)         │
  ty=88 = NE (WALL_OFFSET + WALL_THICKNESS)
  ├──────────────┤                                 │
  │  V-STRIP     │                                 │  ← ty 88..128
  │  (vert. arm) │       OPEN                      │
  ty=128
  └─────────────────────────────────────────────────┘
tx= 0          40            88                  128
                WALL_OFFSET   NE
```

Constants:
- `WALL_OFFSET = 40` — start of wall strip
- `WALL_THICKNESS = 48` — width of wall strip
- `NE = 88` = `WALL_OFFSET + WALL_THICKNESS` — outer edge of wall strip

---

## 2. The Shear-Transform Face Drawing Approach

The current codebase draws faces by anchoring at a specific tile-space point and
applying a 2D shear matrix (`ctx.transform`) to project a rectangular bitmap into
a parallelogram.

### Reference: jdan/isomer (https://github.com/jdan/isomer)

The isomer.js library (the canonical open-source isometric renderer for Canvas 2D)
uses proper **3D vertex projection** — defining each face as 4 explicit 3D corner
points and projecting each to a 2D screen polygon:

```js
// From jdan/isomer: js/isomer.js
Isomer.prototype._translatePoint = function(point) {
  // X rides along angle=PI/6 (30°), Y rides along PI-angle
  var xMap = new Point(point.x * cos(angle), point.x * sin(angle));
  var yMap = new Point(point.y * cos(PI - angle), point.y * sin(PI - angle));
  var x = originX + xMap.x + yMap.x;
  var y = originY - xMap.y - yMap.y - (point.z * scale);
  return new Point(x, y);
};
```

With `angle = PI/6`, this reduces to:
- `screen_x = originX + tx * cos30 - ty * cos30`
- `screen_y = originY - tx * sin30 - ty * sin30 - z`

For a **2:1 diamond** (standard dimetric): `cos(30°) * scale = HALF_W` and
`sin(30°) * scale = HALF_H`. So the game formula is **exactly equivalent**.

### How the shear-transform approach relates

Our game uses this identity: anchoring at `tile(tx0, ty0)` and applying
`ctx.transform(1, 0.5, 0, 1)` maps face-local `(u, v)` to screen:

```
screen = (anchor_x + u,  anchor_y + 0.5u + v)
```

Since `anchor_x = sX + HALF_W + tx0 - ty0` and `anchor_y = sY + (tx0 + ty0)/2`,
then `(u, v)` = `(tx - tx0, -(height))` gives the same result as the iso formula.
**The shear approach is fully equivalent** to vertex projection for rectangular faces.

---

## 3. Face Anatomy — a Single Straight-H Wall

For a **straight-h wall** (the simplest case), the only visible face is the
**South face** (the `\`-slanting face at ty = NE = 88):

```
Face vertices in tile-space:
  BL = tile( 0, 88)   BR = tile(128, 88)
  TL = tile( 0, 88) @ z=drawH   TR = tile(128, 88) @ z=drawH

Screen projection:
  BL → (sX + HALF_W + 0   - 88,  sY + (0   + 88)/2) = (sX + 40,   sY + 44)
  BR → (sX + HALF_W + 128 - 88,  sY + (128 + 88)/2) = (sX + 168,  sY + 108)
  TL → (sX + 40,   sY + 44 - drawH)
  TR → (sX + 168,  sY + 108 - drawH)
```

Draw call:
```js
ctx.translate(sX + 40, sY + 44);        // anchor at BL
ctx.transform(1, 0.5, 0, 1);            // South-face shear
ctx.drawImage(img, 0, -drawH, 128, drawH);
```

---

## 4. Corner Variant Face Parameters

### Naming Convention

```
          corner-br          corner-bl
         (upper-left)      (upper-right)  ← in a perimeter box
              ┌────────────────┐
              │                │
              │   INSIDE       │
              │   PERIMETER    │
              └────────────────┘
         corner-tr          corner-tl
         (lower-left)      (lower-right)
```

**Corner arm directions** (which neighbors does this corner connect to?):

| Variant   | Arms connect to   | Screen position in perimeter |
|-----------|-------------------|------------------------------|
| corner-tl | top + left        | lower-right — inner, faces camera |
| corner-tr | top + right       | lower-left — side-facing |
| corner-bl | bottom + left     | upper-right — side-facing |
| corner-br | bottom + right    | upper-left — outer, both arms away from camera |

### Face parameter table

Each corner needs two faces:
- **South face** (`ctx.transform(1, 0.5, 0, 1)`) — at ty=88 plane, covers the H-arm extent
- **East face** (`ctx.transform(-1, 0.5, 0, 1)`) — at tx=88 plane, covers the V-arm extent

Anchor formulas:
```
South anchor (sax, say) = (sX + HALF_W + sx0 - NE,  sY + (sx0 + NE) / 2)
East  anchor (eax, eay) = (sX + HALF_W + NE - ey0,  sY + (NE + ey0) / 2)
```

Both anchors are at screen_y = `sY + (sx0 + NE) / 2` and `sY + (NE + ey0) / 2`
respectively. When both equal `sY + HALF_H = sY + 64`, both faces share the same
iso "ground level" anchor height.

| Variant   | sx0 | sw  | ey0 | ew  | Inner corner at Z-edge    |
|-----------|-----|-----|-----|-----|---------------------------|
| corner-br |  40 |  88 |  40 |  88 | tile(88,88) → (sX+128,sY+88) |
| corner-bl |   0 |  88 |  40 |  88 | tile(88,88) → (sX+128,sY+88) |
| corner-tr |  40 |  88 |   0 |  88 | tile(88,88) → (sX+128,sY+88) |
| corner-tl |   0 |  88 |   0 |  88 | tile(88,88) → (sX+128,sY+88) |

**Verified:** For every corner, both faces converge at the same inner corner screen
point `(sX + HALF_W, sY + 88)`. The shear math is correct.

### Screen-space vertex positions for corner-br

South face (sx0=40, sw=88, drawH=48):
```
BL = (sX +  80,  sY + 64)
BR = (sX + 168,  sY + 108)
TR = (sX + 168,  sY + 60)
TL = (sX +  80,  sY + 16)
inner corner at u=48: (sX + 128, sY + 88)
```

East face (ey0=40, ew=88, drawH=48):
```
BR = (sX + 176,  sY + 64)   [u=0,  v=0]
BL = (sX +  88,  sY + 108)  [u=88, v=0]
TL = (sX +  88,  sY + 60)   [u=88, v=-48]
TR = (sX + 176,  sY + 16)   [u=0,  v=-48]
inner corner at u=48: (sX + 128, sY + 88)
```

---

## 5. The "Dark Void" — Root Cause Analysis

The triangular void below the inner corner of corner-br/corner-tr is **expected geometry**:

```
Screen Y axis (down = +Y):

sY + 64  --  [BL of South]---...---[BR of East]  (both faces anchor here)
             /                           \
sY + 88  --  [inner corner: both faces meet here]
             \                           /
sY + 108 --   [BR of South] --- [BL of East]
                    \          /
sY + 128 --          \ VOID  /             ← terrain shows through here
                      [tile bottom]
```

The region **between the two face bottom edges below the inner corner** is not
covered by any face — this is the terrain's job. In a properly layered scene render,
the terrain tile is drawn FIRST, then the wall faces on top, so terrain fills the void.

**Fix**: Always draw terrain under wall tiles in `render_nano_scene`. A wall nano tile
must NOT replace the terrain base render — it layers ON TOP of it.

If rendering a wall in isolation (no terrain), a ground-fill rect can be drawn
in the void area:
```js
// Fill the inner void with ground color / terrain texture BEFORE drawing wall faces
ctx.save();
ctx.beginPath();
// Diamond clip to tile bounds
clipDiamond(ctx, screenX + HALF_W, screenY + HALF_H, HALF_W, HALF_H);
ctx.fillStyle = '#3a5f3a'; // grass approximation
ctx.fill();
ctx.restore();
```

---

## 6. Top Cap Joint Gap

The `stoneWallTopSvg()` generates two overlapping SVG strips:

```
H-strip: rect(x0, 40, x1-x0, 48)   where x0=0 or 40, x1=88 or 128
V-strip: rect(40, y0, 48, y1-y0)   where y0=0 or 40, y1=88 or 128
         ← drawn ON TOP of H-strip, so V wins at intersection
```

For corner-br:
- H-strip (green): x=40..128, y=40..88 — covers right arm + core
- V-strip (blue): x=40..88, y=40..128 — covers core + bottom arm
- Overlap at core (40..88, 40..88): V-strip wins (blue)

**The cap DOES fully cover the L-shaped footprint.** Any apparent seam at the
junction is a sub-pixel rendering artifact of the iso shear transform on the
crisp SVG rects — not a geometry gap.

To eliminate it: add 1px of overlap in the SVG strips at the junction boundary.

---

## 7. Corrected Rendering Order

The **required draw order** for a correct wall tile:

```
1. Terrain base (ALWAYS drawn first — fills void, provides ground)
2. East face  (further from camera, dimmer) — shadow ~14%
3. South face (closer to camera, lit)
4. Top cap (iso-projected at elevatedY = screenY - drawH)
```

This order ensures:
- The terrain fills the triangular void between face bottoms
- East face is occluded by South face at the Z-edge
- Cap sits cleanly on top of both faces

---

## 8. Why GitHub Search Returned No Results

GitHub code search for "isometric wall shear canvas corner" finds nothing because:
1. Most isometric games use pre-rendered art (not live canvas transforms)
2. Canvas 2D shear-texture approach is game-specific (not a named pattern)
3. Libraries like jdan/isomer do pure polygon drawing, not bitmap extrusion

The best reference implementations are:
- **jdan/isomer** (https://github.com/jdan/isomer) — polygon-based iso, 3D vertices projected
- **clintbellanger.net/articles/isometric_math** — canonical tile→screen formula
- **IsoCity / Phaser-isometric** — typically use pre-rendered tile art, not relevant here

---

## 9. Summary: What Is Actually Wrong

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Dark void at inner corner | No terrain drawn under wall tile | Always draw terrain base first |
| Cap seam between H/V strips | Sub-pixel artifact at SVG rect borders | +1px overlap in SVG rects |
| WALL_DEBUG_FLAT stuck on | Left `= true` during debug session | Reset to `false` |
| end-b / end-r swap (FIXED) | Wrong arm-switch grouping in wallBounds/stoneWallTopSvg | Fixed ✓ |