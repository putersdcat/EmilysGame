# Iso 2.0 visual technology — inventory, port status, deferred plan

**Created:** 2026-07-15  
**Status:** **Unblocked** — Playability M1 complete (2026-07-15). V1 is next.  
**Standing order:** Core play loop is solid enough; visual re-attachment is
now the active major campaign (see `playability-milestone-1.md`).  
**Primary sources:** `iso2-portback-plan.md`, `iso2-port-remaining-work.md`,
`Docs/05`, `Docs/12`, `Docs/13`, `src/asset-pipeline/iso2-*`,
`src/engine/iso2-assemblies*`, `experiment/isometric-2.0/`.

---

## 1. Short answer to “where did all this technology go?”

**It was not abandoned.** Large pieces were **ported into the main engine**
under Slices A–E and Phase D material parity. What failed is **full
wiring into live procedural generation and visual composition** so the
*player-facing world* still reads as the old flat scatter (checkerboard
dirt, random sand in grass, lone fence posts, sparse assemblies).

In one line:

> **Library ≈ ported · Showcase tests ≈ prove it can draw · World gen ≈ still
> mostly not calling the good path.**

So the “vastly better scale / materials / seamless blends / modular scenes”
experience from the experiment exists as **engine capability**, not as
**default world recipe**. That gap is intentional-deferred, not deleted.

---

## 2. What Iso 2.0 actually built (the tech the user remembers)

| Capability | Experiment location (typical) | Intent |
|------------|-------------------------------|--------|
| Even integer sub-tile math / micro scale | `iso-geometry.ts`, nano 144px, WU 5×5 | Clean subdivision, higher on-screen detail |
| Nano primitives (extrude / billboard / carve) | `nano-tile.ts`, `types.ts` | Walls, fences, rivers as composable geometry |
| Parametric materials + families | `textures/*-family.ts`, brick/stone/fence/water/roof | Same shape, different look per biome |
| Seamless / blendable ground textures | terrain + material systems in experiment | Mud↔grass without random sand noise |
| Connection-aware variants (bitmasks) | `solver.ts` / bitmask | Continuous wall/fence/water runs |
| Composite assemblies | `assemblies.ts` | Homestead, ruins, multi-cell scenes stamped as units |
| Biome-coherent material pick | biome + material wiring | Forest stone ≠ meadow plaster |

---

## 3. Port status in **main** engine (honest matrix)

### 3.1 Ported and present under `src/`

| Tech | Where in main | Notes |
|------|---------------|--------|
| Nano draw stack | `src/rendering/nano-tile*.ts`, `nano-structures/` | Real draw paths |
| Bitmask / variants | `src/engine/iso2/bitmask.ts`, `tile-variants.ts` | Slice A |
| Footprints / walkability | `src/engine/iso2/footprints.ts`, `walkability.ts` | Functional collision now full-tile by choice (2026-07-15) |
| Wall materials | `iso2-materials*.ts`, extruded draw | Slice B.5/D pixel audits |
| Fence family | `iso2-fence-family.ts` | Style-aware procedural fences |
| Water family | `iso2-water-family/` | Styles exist; live water *shape* still criticized (tanks) |
| Roof materials | `iso2-materials-roof.ts`, `nano-roof.ts` | Partial |
| Starter homestead assembly | `iso2-assemblies/starter-homestead.ts` | Origin only |
| Ruined cathedral + rare castle keep | `iso2-assemblies.ts` `maybePlaceCastleLandmark` | Castle biome, rare, dist-gated |
| Biome transition overlays | `biome-transition-overlays.ts` | Marked done in port notes |
| Weathering | `nano-weathering.ts` | Marked done in port notes |

### 3.2 Ported but **underused / undermined** in live generation

| Issue | Why the world still looks “wrong” |
|-------|-----------------------------------|
| Dirt/sand scatter | Perlin + weights + decoration still place **isolated** dirt/sand cells → checkerboard, not coherent mud language |
| Materials not driving gen | Many biome obstacle keys are bare `wall`/`fence`/`rock`; fancy material keys exist but gen rarely stamps them as first-class scene language |
| Assemblies rare | Only starter homestead is reliable; castle landmark is rare; **no** church+graveyard, pond/lake composite, full fenced farm with animals as gen recipes |
| Roof shards | “Roofs-as-assembly-only” not enforced — random roof-like debris possible |
| Water continuity | Water *styles* ported; river/pond *layout* still blocky in places |
| Detail scale | Nano 144px path exists, but dense emoji/scatter + sparse structures dominate first impression |

### 3.3 Still experiment-only or incomplete vs experiment “best frame”

- Full assembly catalog from experiment (`assemblies.ts` breadth) not all mirrored as gen-callable recipes  
- Some material polish / AiTools showcase loops live under `experiment/isometric-2.0/`  
- Seamless terrain “looks solved in port notes” but **player screenshot quality** still fails the mud/grass story (gen composition ≠ material paint)  
- Modular “world builder calls scene recipes” layer is **nascent** (`stampIso2Assembly` + 2 ids), not a full catalog + placement policy

---

## 4. Composite / templated scenes — status

| Scene | Code | Live gen |
|-------|------|----------|
| Starter homestead (fence, cottage, campfire, south quiz_gate) | `stampStarterHomestead` | Yes, origin only |
| Homestead-small assembly | `Iso2AssemblyId` | Debug / stamp API more than common gen |
| Ruined cathedral | `maybePlaceCastleLandmark` | Rare, castle biome, chunkDist>2 |
| Castle keep single-cell | same | Rare alternate |
| Cathedral chapel single-cell | deliberately unwired (product overlap) | No |
| Pond/lake composite | **not built** | Docs `13` still lists as priority for river saturation |
| Church + graveyard | **not built** | Planned class of assembly |
| Farm with animals | wildlife + scatter, not one stamp | No coherent recipe |
| Gatehouse / quiz compound | not built | Next-Engine plan Phase 2 |

**Design intent (still valid):** LLM entropy / biome / difficulty pick *which scene recipe* and *where*; a sub-solver stamps a pre-authored, nano-correct composite atomically. That is **not** “give up” — it is **under-catalogued and under-called**.

---

## 5. Why this was deferred (now unblocked)

1. **User 2026-07-15:** functional playability first; Minecraft look OK until loop works.  
2. **Code-organization philosophy:** no speculative visual rewrite while the loop is soft.  
3. **Iso2 port already proved** many materials/nanos *can* draw correctly in isolation tests; the remaining work is **generation composition + more assemblies + wiring**, which is a large product surface.  
4. Risk was re-opening material/gen scale without a finished loop — **M1 closed that gate.**

**Unblocked 2026-07-15** after M1 checklist + E2E proof
(`playability-milestone-1.md`, `playability-m1-core-loop.spec.ts`).

---

## 6. Attachment plan (active after M1)

Order is incremental; start at V1:

### Track V1 — Generation composition (biggest visual win per effort)

1. **Biome surface language** — ✅ 2026-07-15: meadow/forest drop sand salt;
   `cohereSurfacePatches` kills isolated dirt/sand; mixed_terrain/meadow_garden
   no longer checkerboard; meadow drops sandy_patch/sand_path/beach_cove weights.
   Proof: `tests/world-gen/v1-surface-coherence.spec.ts` (sandSalt=0, dirtSalt=0
   on sample meadow chunks). Determinism golden re-captured → `a5a2b340`.
2. **Material by biome** — ensure gen stamps material-bearing assetKeys (or resolvers) already audited in Slice D/E.  
3. **Fence/wall runs only via chain-aware stamps** — fewer lone posts.

### Track V2 — Assembly catalog (modular scenes)

1. Author 4–6 recipes: fenced farm+animals, pond/lake, church+graveyard, gatehouse, bridge crossing, castle outer wall segment.  
2. Placement policy: biome + chunkDist + rarity + edge contracts.  
3. Wire through `stampIso2Assembly` / ChunkGenerator phase (same pattern as homestead/castle).

### Track V3 — Water & terrain polish

1. Fix water tank shapes / river continuity (known open visual bugs).  
2. WU terrain diamond corner leaks (R1 in port remaining).  
3. Enforce roofs-as-assembly-only.

### Track V4 — Scale / math pass (only if still needed)

1. Re-verify even subdivision / 144px contracts still hold end-to-end in main.  
2. Any residual experiment-only geometry helpers left behind.

### Proof bar for each V-track

Same as Iso2 port methodology: live gen or stamp → screenshot or pixel test → no “looks ported because import exists.”

---

## 7. Links for future agents

| Doc | Role |
|-----|------|
| `iso2-portback-plan.md` | Full slice history A–E, bugs fixed, gotchas |
| `iso2-port-remaining-work.md` | Visual bugs R1–R4 (partially stale date) |
| `Docs/05-Presentation-Layer-Isometric-Rendering.md` | Where render concepts belong |
| `Docs/12` / `Docs/13` | Gap analysis + priority; § visual deferred points here |
| `Docs/archive-2026-07-14/Next-Engine-And-Gameplay-Plan.md` | Composite gated sections Phase 2 |
| `experiment/isometric-2.0/` | Reference implementation & textures |

---

## 8. One-sentence for status reports

**Iso 2.0 materials, nanos, and a few assemblies are in main; world generation still underuses them, so the game looks pre-Iso2. Core playability M1 is done (2026-07-15) — this file is now the active checklist to reattach, starting at V1 gen composition.**
