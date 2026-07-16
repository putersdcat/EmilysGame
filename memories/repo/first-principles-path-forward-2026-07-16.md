# First-principles path forward — Emily's Game (2026-07-16)

**Author:** agent analysis at user request  
**Status:** Historical survey (A/B/C). **Superseded for decisions by**  
`definitive-path-forward-2026-07-16.md` (single path: productize this branch, scene-first).  
**Trigger:** User review of `tests/screenshots/visual-s5-density-spawn.png` (closed fence loops without gates, random tower/outhouse sprites) + request to step back from current implementation and redesign the path if gloves were off.

**Sources re-read for this note:**  
`docs/01`–`02`, `05`, `09`, `12`, `13`; `memories/repo/code-organization-philosophy.md`, `visual-scale-dpi-mismatch-2026-07-15.md`, `iso2-visual-technology-inventory-and-deferred-plan.md`, `functional-first-2026-07-15.md`, `playability-milestone-1.md`; branch topology `main` vs `experiment/isometric-2.0`; live proof PNGs; `main`'s `game.config.ts` (tileWidth **64**).

---

## 0. One-sentence bottom line

**I would not start from this experiment branch as the product trunk.** I would take **playability-proven ideas and a small set of Iso2 *assets/draw recipes*** back onto a **simpler main-like presentation stack**, with world *scenes* (not cell salt + half-broken WU stamps) as the generator's first-class unit — and I would keep this branch as a **museum + material library**, not as the living architecture.

---

## 1. What the game is *for* (first principles, from the docs)

From `01` (vision) and `02` (architecture), the non-negotiables are:

1. **A short session for a young child** — explore → block → solve (quiz/key) → reward → new area.  
2. **No softlocks; failure is gentle.**  
3. **Flat 2D simulation is authoritative; isometric is a draw-time costume.**  
4. **No engine framework** — TypeScript + Canvas 2D, holdable in one head.  
5. **LLM as entropy**, not as required online brain.  
6. **Cozy, warm presentation** (visual + audio) in service of the loop — not a tech demo of subdivision math.

Everything else (nano 144, AC-3 world units, material factories, fence families) is **instrumentation** for those goals. When instrumentation becomes the product, the child loses.

### What "success" looks like for Emily

A 8-minute session where she:

- Spawns somewhere that *looks like a place* (yard, path, house door, gate).  
- Moves without snagging.  
- Learns Space/Enter at a **real** gate (not a fence rectangle with a hole).  
- Walks a path that *feels designed* (breadcrumbs, landmark, next gate).  
- Hears soft feedback; sees clear toasts.  
- Ends with a small win (open gate, coin stash, NPC hello).

**Not:** "the nano stack can draw four water styles in a unit test."

---

## 2. What the S5 screenshot is really saying

User observations on `visual-s5-density-spawn.png` map to systemic failures, not one-off bugs:

| What you see | Diagnosis |
|--------------|-----------|
| **Fence closed loops, open front, no gate** | Generator stamps *structure geometry* (fence runs / enclosures) without *function* (quiz_gate / door_locked on the opening). Pillar 2 is "block only with things you can overcome by playing" — a decorative pen that doesn't teach the loop is a broken promise. |
| **Random tall column / outhouse sprites** | Perlin + template + emoji asset catalog places *atoms* (outhouse, tower-like house sprites) without *scene grammar* ("this is a yard with one outhouse behind the house"). |
| **Dirt checkerboard still readable** | V1 reduced sand salt but dirt patches + WU templates still compete; FOV zoom-out makes the quilt *more* visible. |
| **Emoji salt reduced but still there** | S5 helped; atoms still win over scenes. |
| **Starter homestead fence + cottage** | One of the few places that *almost* works — because it was **hand-authored** as an assembly, not pure noise. |

**Core lesson:** Atoms (cells, asset keys, nano kinds) were optimized hard. **Scenes** (places with purpose) were not the generator's unit of thought.

---

## 3. What main had (and why the experiment branched)

### Main (`origin/main` ~ `419c5a9` / later docs tip)

From `game.config.ts` on main:

- **tileWidth 64 / tileHeight 32** — FOV shows many cells; player∶tile ratio matches emojiSize 32 / spriteSize 48.  
- **microTileSize 96** — better raster into small diamonds without pretending nano is the world model.  
- Rendering path: tiles + emoji/SVG sprites + some nano wiring experiments starting (#184) but **not** a full Iso2 world stack.  
- World gen already chunked 25×25; playability systems largely present historically.  
- Audio: real MIDI/SoundFont path already a priority on main-line history.  
- Felt "visually stuck" in the **style** of tiles (flat, quilted, emoji), not necessarily "can't ship the loop."

### Experiment (`experiment/isometric-2.0`, ~**493 commits** ahead of merge-base with main)

Added / doubled-down on:

- **144 micro / nano geometry stack** (walls, fences, water carve-outs, materials).  
- **tileWidth 256→128** later (FOV / scale thrash).  
- **WorldUnit AC-3 solver**, huge template catalog, chain integrity, edge contracts.  
- Material families, assemblies (partial), castle landmarks, etc.  
- Massive test surface for *renderer* fidelity.

### Honest cost/benefit of the experiment

| Gained | Paid |
|--------|------|
| Proof that extruded walls / water styles *can* look good | Scale contract broken for months (DPI vs player) |
| Some real playability fixes (gates, collision, homestead) | Presentation logic entangled with gen (walkability ↔ nano footprint history) |
| Richer asset factories | Complexity that agents keep "fixing around" instead of shipping scenes |
| Documentation rewrite (`01`–`13`) clarifying flat-sim truth | Implementation still half-lives the old nano-as-schema world |

**The experiment succeeded as R&D.** It did not cleanly succeed as a *product architecture migration*.

---

## 4. Where this branch is right / wrong relative to `02`

`02` already names the failure mode: **nano metadata treated as core spatial grammar**.

Current reality:

- Simulation *mostly* flat (good).  
- Presentation *can* draw nanos (good in isolation).  
- **Generation still thinks in tiles and edge tags**, then hopes presentation + post-passes make it look like places.  
- Assemblies (homestead, fenced-farm) prove the *right* direction, but they're a thin veneer on a salt+WU pipeline that still produces **decorative loops without function**.

The user-visible failures (fence pens, random towers) are not "need more materials." They are **"gen is not authoring places."**

---

## 5. If gloves were off — preferred path (ranked)

### Option A — **Recommended: "Main + Scenes + Selective Iso2 paint"**

**Branch from `main` (or a thin rebase of playability-only commits), not from this experiment tip as the trunk.**

#### A1. Product spine (week 1–2 mindset)

1. **Core loop only:** move, interact, quiz gate, open, save.  
2. **One authored starter scene** (homestead with **south quiz_gate that is the only exit**).  
3. **Region streaming 25×25** as today.  
4. **Presentation:** keep **64×32 or 96×48** diamonds (main-like FOV). Do **not** jump to 256.  
5. **Player/sprite scale locked to tile width** from day one (one formula, one test).

#### A2. World generation re-centered on *scenes*

Replace "Perlin + WU template soup + scatter" as the primary author with:

```
Region recipe (distance, biome, difficulty)
  → pick 1–3 scene stamps (farm, pond, path-to-gate, market)
  → lay a main path graph (BFS-proven)
  → place 1–N quiz gates ON the path (not beside it)
  → light decoration in leftover open grass
  → optional LLM entropy only as flavor (names, dialog, rare tile salt)
```

Rules every scene stamp must declare:

- **Footprint** (w×h)  
- **Entries / exits** (cells that must stay open or must be gates)  
- **Required function cells** (quiz_gate, door_locked, campfire, sign)  
- **Forbidden random overwrite** mask  

**A fence with an opening is illegal unless the opening is a gate or labeled path.**  
That single rule would kill the S5 screenshot's closed pen.

#### A3. Presentation ladder (visual quality without architecture captivity)

1. **Phase P0:** Coherent grass + dirt *paths* (not salt); emoji OK if sparse.  
2. **Phase P1:** Port **only** the Iso2 draw recipes that earn their keep:  
   - fence/wall connection-aware draw  
   - water carve for *river corridors and pond scenes*  
   - cottage/homestead assembly  
3. **Phase P2:** Materials by biome (meadow picket vs castle stone) — **render-time**, as Slice E already proved.  
4. **Never** make nano Z-mode required for walkability again. Full-tile or simple footprints; polish later.

Use `experiment/isometric-2.0` and this branch as:

- Asset/factory reference  
- Screenshot inspiration  
- Port checklist  

Not as the runtime world model.

#### A4. Performance

- **Fewer pixels per cell** (64–128 diamond, not 256) → cheaper terrain cache, more FOV, better Tesla/low-end.  
- Bake terrain per WU/Region; draw objects sparsely.  
- Cap draw commands; no per-frame material factory.  
- Prefer one solid audio path (main already fought oscillator hiss) over more visual systems.

#### A5. Sound

Treat audio as first-class *loop feedback* (docs `09`):

- Footsteps, collect, quiz soft-wrong, gate-open cheer — all mandatory for child clarity.  
- Biome bed + one local emitter (campfire).  
- Don't wait for "visual done" — audio sells the loop even with simple art.

#### A6. Maintainability

- Enforce `02` in CI: `engine/` cannot import `rendering/` nano kinds for gameplay decisions.  
- Gen tests: **scene validity** (every fence opening is a gate; every region has ≥1 on-path quiz_gate; no orphan outhouse).  
- Renderer tests: **material pixel** only for pure presentation modules.  
- Follow code-organization philosophy: split on *seams*, not line counts; avoid another 493-commit experiment stack.

---

### Option B — **Stay on experiment tip; brutal productization cut**

Only if sunk cost must be honored in-place:

1. **Freeze** new nano systems.  
2. **Delete or disable** WU templates that place decorative enclosures without gates.  
3. **Scene validator** post-pass: any fence-run opening → force quiz_gate / dirt path.  
4. **Cull** outhouse/tower atoms from free scatter; only stamp via scenes.  
5. Keep FOV at 128×64 (or go back toward 96×48).  
6. Ship loop polish; treat remaining nanos as optional paint.

This can work, but the mental model stays heavy; every agent session will re-discover scale/WU issues.

---

### Option C — **Greenfield from docs only**

Greenfield TypeScript + Vite + Canvas, port:

- Quiz content packs  
- MIDI library + SFX naming  
- Starter cottage / fence SVGs from Iso2  
- Document set `01`–`11` as law  

**Do not** port WorldUnitSolver or full nano walkability.  
Highest purity, highest rewrite cost. Only worth it if Option A still feels polluted after a clean main branch + scene gen.

---

## 6. What I would *not* do again

1. **Raise tileWidth 4× without a FOV + entity scale contract and a screenshot bar.**  
2. **Treat nano as world ontology** (render family in the same schema as walkability).  
3. **Ship fence geometry without gate function.**  
4. **Optimize material factories before scene grammar.**  
5. **Let Perlin place animals/structures as terrain weights** (emoji salt looks like content; it isn't).  
6. **493 commits of experiment without a kill criterion** ("by commit N, starter region must look like a place and run 60fps on target hardware").  
7. **Confuse R&D success (showcase PNG) with product success (child session).**

---

## 7. Concrete reconciliation plan from *this* moment

### Recommended immediate strategy

| Step | Action |
|------|--------|
| 1 | Tag this branch `archive/iso2-experiment-peak` (or leave name; freeze as reference). |
| 2 | Cut **`product/scene-first`** from **`main`**. |
| 3 | Cherry-pick or re-implement **only**: quiz-gate reliability, homestead-as-scene, full-tile collision decision (or simple footprints), coin trails, audio fixes, content packs. |
| 4 | Implement **scene catalog v0** (homestead, fenced farm *with gate*, pond, path segment) as the only structure placement for dist ≤ 3. |
| 5 | Presentation: main-like FOV (64 or 96 diamond width); port fence/water *draw* from Iso2 only where scenes request them. |
| 6 | Keep experiment tree in-repo under `experiment/` + this branch for porting; do not merge whole tip into main. |

### If we must stay on experiment for continuity

Next *engineering* slice is not more materials — it is:

1. **Fence opening → required gate** invariant + test.  
2. **Ban free scatter of outhouse / tower-like houses** outside scenes.  
3. **Dirt as path language** only (trails to gates), not checkerboard clearings.  
4. Live MCP feel test against pillar loop, not against pixel styles.

---

## 8. Performance / sound / maintainability — first-principles targets

| Area | Target | How |
|------|--------|-----|
| **Visual quality** | Readable *places*, coherent surfaces, intentional landmarks | Scene stamps + path graph; materials secondary |
| **Gameplay speed** | Instant feel of movement; short time-to-first-gate | Full-tile or simple collision; no softlock; teaching toasts |
| **Runtime perf** | Stable 60 on laptop / acceptable on Tesla-class | Smaller diamonds, sparse objects, baked terrain, budgeted draw cmds |
| **Sound** | Every state-change has soft feedback | Event bus from sim → audio presenter |
| **Maintainability** | Agent can change gen without breaking render math | `02` layering, scene schemas, fewer global solvers |

---

## 9. Direct answers to the user's framing

### "What would you do differently from scratch?"

**Start with scenes and the core loop; add isometric paint as a costume; import Iso2 materials only after places exist.** Never invert that order.

### "Main vs this experiment?"

**Main had the healthier FOV and simpler stack; experiment had better *potential* paint and some real playability work.** The visual wall on main was mostly **content language + tile art coherence**, not "we need a new spatial ontology." The experiment answered a harder question than the wall required.

### "Reconcile from here or go another direction?"

**Another direction with selective porting (Option A).** Continuing to polish experiment tip (Option B) is possible but keeps the wrong center of gravity. Full greenfield (Option C) only if A still feels stuck after one clean product branch.

### "In the limit, deliver original core ideas successfully?"

Ship a **Zelda-petting-zoo-quiz walk** that looks like a **storybook map of places**, runs fast, sounds warm, and never softlocks — even if half the nano factories never ship. Success is Emily finishing a gate and wanting one more; not a perfect brick palette.

---

## 10. Appendix — evidence anchors

- Vision: `docs/01-Game-Vision-and-Design-Pillars.md`  
- Architecture: `docs/02-Architecture-Core-Principle.md` §3–4 (nano erosion)  
- Presentation role: `docs/05`  
- Audio: `docs/09`  
- Gaps: `docs/12`  
- Scale bug: `memories/repo/visual-scale-dpi-mismatch-2026-07-16.md` / `…-07-15.md`  
- Org: `memories/repo/code-organization-philosophy.md`  
- Proof of gen failure mode: `tests/screenshots/visual-s5-density-spawn.png`  
- Main FOV: `git show main:src/config/game.config.ts` → tileWidth **64**  
- Experiment distance from main: ~**493** commits on tip vs merge-base  

---

## 11. Working conclusion (for later review)

The path that maximizes chance of delivering Emily's Game:

1. **Treat Iso 2.0 as a materials and technique library, not the world engine.**  
2. **Make "scene + path + gate" the generation unit.**  
3. **Keep simulation flat and boring; make presentation pretty.**  
4. **Prefer main's FOV philosophy; prefer experiment's best assemblies/draw recipes.**  
5. **Kill decorative structure without function.**  
6. **Measure success by child sessions and scene screenshots, not nano unit tests alone.**

*Document written 2026-07-16. Update in place when a product branch is cut or a decision (A/B/C) is chosen.*
