# What the isometric layer is for

Iso is how Emily’s Game is *seen and touched*: a Polly Pocket / Zelda-ish
diamond world where buildings have height, rivers sink, fences occlude,
and the child can stand *near* a door.

It is not a second game world. It is not a second physics. It is not
emoji shops. It is also not “paint only” in the 2026-07 freeze sense.

---

## 1. Purpose

The project pivoted from flat top-down to faux-isometric for **depth
feel**, not for a 3D sim.

> Shifted from flat top-down to faux-3D isometric for depth feel (Polly
> Pocket toy aesthetic). Not true 3D—use 2D skews/offsets (diamond grid)
> and layering for occlusion. Assets remain flat; projection faked via
> math.
>
> — `archived-planning/NewGame_Isometric_PoC.md`, Rendering and Assets

The world painter consumes **world facts** (what is on the ground, what
stands on it, how tall, whether the child may stand there) and draws
them. The PoC’s painter already accepted external scene data so
generation could plug in later. That split is still right: simulate
facts, then paint them.

Iso2 rebooted because the first painter stayed a flat quilt.

> Flat Appearance and No Depth: Entire scene looks 2D-flat—no Z-height
> simulation (e.g., rocks/water don't “sink” or “rise”).
>
> — `Docs/archive-2026-07-14/FirstFeedbackOnIso2.md`

Iso2’s job, from the reboot spec:

- Base biomes that look like ground, not stretched diamonds.
- True height: positive-Z uprights (fence, wall, spire), negative-Z
  carve-outs (river), player sink into mud/water.
- Continuous features that actually connect (straight / corner / tee /
  end), not jagged stickers.
- Occlusion: partial through a fence, full behind a wall.
- Contact: overlays carry walk rules; gates and bridges are real
  openings.
- Materials: stone, wood, water, grass that read as different stuff.
- Large assemblies (homestead, cathedral) as **venues**, with overhangs.
- 60 FPS with baked chunks.

— `Docs/archive-2026-07-14/IsoRenderingPlanV2.1.md`, Success Criteria;
  GitHub #214

`AGENTS.md` current law matches Iso2’s purpose, not the later freeze:

> What the isometric layer was supposed to be (Iso2 purpose, materials,
> Z-height structures as real venues, occlusion, contact, not a second
> physics and not emoji shops).

---

## 2. Not a second world, not paint-only

Two true sentences that later docs turned into a false war:

1. **Authoritative gameplay state is a 2D grid** (cell + nano patches,
   traversal, inventory, unlocks). You can run it headless. The Bible
   and the PoC both generate and collide in that plane.
2. **Height, occupancy, and materials are part of that state** because
   they change where the child may stand, what she can walk behind, and
   whether a place reads as a shop or a sticker.

`Docs/02` (2026-07) promoted sentence 1 into Pillar 7: “isometric is how
it looks, not what it is,” and used it to forbid the rest of the game
from knowing about Z. That was a *repair slogan* against a renderer that
had started inventing its own physics. It is **not** original Iso2
intent. Iso2’s walkable flags, sink, gate unlocks, and 3×3 occupancy
live on the nano facts the engine already owns (`ENGINE.md` §2.2, §3).

Rewrite rule:

- One walk fact, owned by the world, **including** nano occupancy and
  gate state.
- The painter projects that fact. It does not keep a second collider.
- The painter *does* own: diamond math, sort/clip for occlusion,
  materials, shadows, rim light, sink *offset as a drawing of the
  already-known Z*, camera.

If the painter is deleted, a headless test can still say “gate locked →
no path.” If the world is deleted, the painter has nothing honest to
draw.

---

## 3. Projection and scale

PoC math (cartesian cell → screen):

- `screenX = (x - y) * (tileWidth / 2)`
- `screenY = (x + y) * (tileHeight / 2)`

PoC tile: **64×32** diamond, 10×10 demo meadow.
Visual Mapping / WorldEngine micro: **32×32** source SVG → **64×32**
iso diamond.
Iso2 reboot: **128×128** logical biome → **256×128** diamond, plus
nanos (e.g. 128×32 fence strips) with Z-pinned skew.
Bible (earlier, pre-iso detail): cells discussed as 128×128 *pixels*
in a dense view.

These numbers fought for a year. They are **not** the product. The
product is:

- Orthogonal logical grid.
- Diamond paint with a consistent cell aspect (classically 2:1).
- Enough pixels that a cottage, a fence post, and a child read as
  toys, not as UI icons.
- Camera centered on the ego; off-screen buffer of generated land.
Materials are **families that wrap a cube**, not stamps. Owner taught
this live in Copilot Chat (2026-04-28–30): stone-brick grout must
continue from side onto top at the same scale; a 90° or 45° top is a
fail; ancient stone is a tessellation, not painted rectangles; brick
end-ticks are brick-only. He asked 128→144 so a nano is a clean
**48×48×48** and every texture is a 1:1 multiple of 48, seamless on
all four edges. Red clinker and ancient-stone are the next families
after gray brick is locked. Texture factories belong in files, not
grown inside the solver.

A homestead **gate that looks like a stick in an open fence hole** is
a fail (Copilot Chat 2026-07-18). The opening is a gate *in* the run.

**Visual proof the owner asked for (session `00a90421`):** a 5×5 grass
field, a full stone-wall *square* (four corners), and **no fewer than
eight** player sprites — in front, behind, left, right of each wall
segment — standing on the **maximum walkable line**. If the men float
or sit in the wall, the nano is a lie.

Fences are the same grammar as walls, just thinner (~48 px / one nano
high). They must close a yard and have a gate. Corners are clean, not
crossed. Posts sit on the ground. Long spans get a mid-post. They
share the 48 px lattice so a fence can meet a stone wall.

A homestead starts as a **2×2 cottage**: timber walls + thatch slopes,
**no fence, no yard, no clutter** until that building reads. Roof =
a 48³ cube on a 48³ cube, top cube cut on the diagonal (or a
right-triangle alpha) so two slopes make a ridge.

Walls that face the camera need an **end cap**. An open backside you
can see through is a fail.

Owner feel from #25, still the look:

- Grass is not one stamp tiled forever — larger patches, variants.
- Water **moves** (ripples).
- Sun is **not** noon: shadows fall SE (NW light). Only tall things
  (trees) get real shadows; tiny mushrooms do not, and they sit on
  the ground, three to a cell, not giant floaters.
- Nothing floats that should rest.

Night is a place, not a tint (#67, #114): the world goes dark /
desaturated; bonfires and a facing flashlight cone (`F`) punch holes
of color; nocturnal animals are eyes until the beam hits them.

#184 is still **open** because blockers still do not read as blockers.
Front faces, real height in the sort, wall occlusion — those are iso
jobs. A WebGL experiment was allowed as research, not as a pivot.

- Adjacent ground should **not** read as a quilt of diamonds (#260).
  Edge blend / shared material so the grid is a simulation fact, not
  a visible chicken-wire. Water must continue across cell borders
  (#263, #218). A bridge must visually rest on two banks (#264).

See `CONTRADICTIONS.md` Fork B (tile / FOV size). A rewrite picks one
diamond and keeps it. It does not inherit “FOV 128×64 unchallengeable.”

---

## 4. Materials and Z (venues, not stickers)

### 4.1 Base ground

Flat biome textures: grass, dirt, mud, sand, stone, wood decks, water
*surface* as the parent micro. Auto-tile transitions so grass/water is
a shore, not a hard square. Variants by deterministic coordinates so
the same cell never sparkles differently each frame.

### 4.2 Nanos as the expressiveness layer

| Family | Reads as | Walk |
|--------|----------|------|
| Billboard fence / gate / tall grass | Thin, upright, alpha gaps | Fence never; gate conditional; grass always |
| Extruded wall (homestead / stone / cathedral) | Three-face box, cap, real corner | Never, except a declared opening |
| River carve | Sunken bed, banks blend to grass | Never unless a deck crosses it |
| Bridge / troll-bridge | Deck over a carve | Always on the deck |
| Flat decal | Path wear, crop row | Does not block |

Unlimited positive Z for spires and tall walls, with overhangs that
bleed over neighboring diamonds. That is how a cathedral becomes a
place you walk *in front of*, not a glyph.

Assemblies (#214, #99, Nano-3D inventory): homestead, cathedral, inn,
cart yard, shop-as-shell. Multi-tile **one building**, one silhouette,
a walkable apron on the faces the child should reach. A shop is a wall
or booth shell + awning + plaza — not 🏪. Owner playtest rejected a
9×9 stamp that still looked like the small house plus rubble.

Feet sit at the **center of a nano patch** so hugging a wall looks the
same from every side. Owner playtest in Copilot Chat (2026-04-29/30):
N/W characters stood too far from the wall; S/E looked like they stood
*on* it — that second one was **draw order** (the wall must occlude),
not the wrong cell. A south-vertex anchor made N/W look farther than
S/E — rejected (`Iso2.0-PlayerAnchorConvention.md`).

Fence / tall grass are **billboards** (upright, alpha gaps). Stone
walls are **extruded boxes** (faces + cap). A homestead cottage is a
**building**, not a fence panel — owner rejected a hut SVG that already
had 3D geometry *and* then got z-pinned (double-skew, #209 / #212).
The law is: **do not put isometric 3D inside a z-pinned texture.** The
cottage still needs mass and a door face you cannot walk through
(#209’s `walkable='always'` on the hut is a demo lie).

#184 leftover that still matters: elevated blockers need a **south
face** (a vertical strip under the diamond) so a wall reads as a wall,
not a flat stamp.

### 4.3 Player sink

Feet offset into negative-Z (mud, river shallows, carved path) so the
body shares the ground. This is a presentation of Z the world already
stored. It is not a second collider.

### 4.4 Light

Sun angle exists to cast path-based shadows from real silhouettes and
rim-light the sun side. FirstFeedback called out the debug sun slider
with no shadows as a lie. Time-of-day may lengthen shadows. This is
feel, not a weather sim.

---

## 5. Occlusion (being behind something)

PoC / addendum / #3 / #179 intent, as feel:

- Southern / taller draws later and covers northern / shorter.
- The child is a world object in that order, not a HUD sticker.
- **Partial** hide is required: head over a bush, body in a trunk,
  visible through fence pickets, gone behind a stone wall.
- Canvas clip / alpha mask is a means. The end is “I walked behind the
  tree.”
- No z-fight, no pop-in mid-step.

FirstFeedback and Iso2 distinguish fence (see-through) from wall
(solid). That distinction is both paint and walk: you never walk
*through* the wall; you may see *through* the fence you cannot walk
through.

Do not ship a sort-key formula as the product. Ship the feel tests:

- Walk a path behind 3–5 mixed objects; hide updates every frame.
- Fence: body striped, not deleted.
- Wall: body gone.
- Gate open: the hole is a hole in both paint and walk.

---

## 6. Contact (the reason the owner is furious)

The first addendum already named today’s bug:

> use the logical 2D grid for checks … but adjust bounds visually for
> isometric (e.g., tighter hitboxes to allow “near” approaches without
> blocking).
>
> Definition of Done: Player can circumnavigate objects without
> unnatural gaps.

— PoC addendum, Player Movement Rules; GitHub #3

#151: collision and paint disagreed by approach direction; she walked
into water from the north. Expected: the visible shore *is* the stop.

#180 (tightened hitbox) and #181 (clipping) were the same feel, closed
as “done,” still broken in 2026-08.

Iso2 #223: live demo must refuse a locked gate and allow it after
unlock; BFS inside a fence ring is null when locked and valid when
open.

Rewrite contact rules:

1. One occupancy: nano patches + micro traversal + gate state.
2. The sprite’s feet / shadow sit on the cell she occupies.
3. Solid art that occupies a patch cannot be entered.
4. The blocking volume is **tighter** than the pretty silhouette so
   she can stand at the door, along the fence, at the cottage’s south
   and west faces.
5. Open means open in the same frame she is told it opened.

Animation notes that are product, not trivia:

- Ego: idle / walk1 / walk2 at minimum. Space is a reach.
- Flip by facing, but **layer arms and body** so limbs do not detach
  (#3).
- Customizer paints the flat sheet *before* projection.

---

## 7. What the painter consumes

A scene description, not a screenshot:

- Ground micros (surface, height, variation).
- Nano stacks (kind, patches, Z, variant, unlocked?).
- Assemblies (which cells are “the homestead,” so they paint as one).
- Mobile things: player, NPCs, pickups.
- Light (sun / time).
- Fog of war / known cells (minimap is a separate small canvas).

The painter does not invent a river that the walk map lacks. The walk
map does not invent a wall the painter hid.

---

## 8. Asset intent

Bible / PoC: SVG / emoji bootstrap, LLM-made connectable tiles with a
fixed viewBox, pre-cached. Player is a dedicated sheet, not an emoji.

Iso2: purpose-built materials, vision-loop to iterate SVGs, assemblies
checked with a dummy player in front and behind.

Nano-3D inventory (archive) was a catalog of structural parts — walls,
roofs, corners — so buildings could be *built*, not iconized. Recover
that catalog as a **parts list for venues**, not as a requirement to
keep the old nano renderer.

Fallback emojis were a prototype mercy. They are not the look.

---

## 9. What was rejected

| Rejected | Why | Source |
|----------|-----|--------|
| True 3D / Three.js as the game | Isolated spike was “a tiny floating board.” A library cannot fix missing world semantics (composition, walk, scale, assemblies). | `clean-rebuild-assessment/17-threejs-rejection-record.md`; `Docs/01` §5 |
| Phaser / Unity / Godot | Same: must stay inspectable | Bible; `Docs/01` |
| Iso as a second physics | Dual colliders are how she walks on water | `AGENTS.md`; #151 |
| Emoji shops as venues | Place-coherence / Iso2 / playtest | #77 vs #99 vs playtest |
| “Paint only / FOV 128×64 unchallengeable / stay on experiment/isometric-2.0” | 2026-07 freeze that protected the broken tree | Repealed in `AGENTS.md` |
| Closing Iso2 issues without PNG proof | Owner voided #194–#213 | #214 |
| Stretching a square texture into a diamond and calling it iso | Iso2 exists because of this | IsoRenderingPlanV2.1 goal |
| WASM as a required pivot | Deferred; not the identity | #45; #247 |

Nested `experiment/isometric-2.0/` is **historical**: MCP tools, eval
PNGs, research. It is not the rewrite target and not a branch lock.

---

## 10. Smallest iso that is still this look

Enough to support `GAME.md` §13:

- 2:1 diamonds of ground.
- A fence run that occludes and blocks, with a gate hole that matches
  walk.
- A cottage with height, a shadow, and an apron on south and west.
- A river that sinks; a deck that does not.
- The child drawable behind / in front, arms attached, no wide berth.
- Sun shadow optional for the first honest session; occlusion and
  contact are not optional.

Vision-LLM screenshot oracles are weak. A queryable scene (what patch
is this, who is occluded, is the gate open) is the iso test a model
can actually run — after the rewrite, not as a reason to keep the old
tree.
