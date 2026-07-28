# Definitive path forward — one determination (2026-07-16)

**Status:** Binding recommendation — **campaign P0–P2 executed (2026-07-16)**  
**Question answered:** What path is *most likely* to deliver the best long-term outcome in the *shortest* calendar time — not merely a throwaway MVP, but a **clean, focused base engine/game** that can grow learning content, assets, characters, and side quests?

**Prior note:** `first-principles-path-forward-2026-07-16.md` surveyed options. This document **collapses to one path** with evidence and a concrete operating model.

**Execution status (2026-07-16):** Scene-first PR Plan 1–7 complete on the
`execute-plan/4baf1950-*` integrated tip. Proof:
`tests/screenshots/proof-scene-law-spawn.png` (+ explore). Expand rails:
`memories/repo/expandability-rails.md`. Next growth = recipes + content packs
(P3 paint optional).

---

## 1. The determination (read this first)

### The path

> **Stay on `experiment/isometric-2.0` as the product branch. Do not restart from `main` and do not greenfield. Re-center the *architecture of generation* so that *scenes + paths + functional gates* are the primary world author, and treat Iso 2.0 nano/materials as an optional paint layer. Freeze further presentation architecture experiments until scene grammar is law. Expand the game thereafter only through content and scene recipes, not through new world-engine ontologies.**

### Why this is the single best bet (one paragraph)

The **core loop already works here** (M1 E2E: homestead fail→retry→open; per-gate unlock; teaching; content packs; real audio; 129 Playwright specs). The failure mode you see in `visual-s5-density-spawn.png` is **not** “wrong repo” or “need a new engine” — it is **world generation still authoring atoms and decorative geometry without function**. Switching trunks to `main` or greenfield would **re-buy** months of already-solved playability, quiz, save, and content wiring to gain FOV simplicity that we already partially restored (128×64 diamonds). The docs (`01`–`04`) already prescribe the right center: flat sim, traversable regions, solvable gates, population that does not block routes. The experiment branch has the **working simulation + content spine** and the **wrong gen priority**. The fastest path to a *clean expandable base* is to **change gen priority and freeze paint complexity**, not to abandon the working spine.

---

## 2. Evidence that forced this choice (not preference)

### 2.1 Time-to-playable-product: already paid on this branch

| Asset already landed on experiment tip | Rebuild cost if starting from main/greenfield |
|----------------------------------------|-----------------------------------------------|
| Playability M1 + E2E specs | High — re-discover interact, full-tile collision, per-gate unlock |
| Homestead with south quiz_gate + teaching | Medium–high |
| Quiz pool, re-deal, softlock-safe paths | High |
| Content packs / Book / education wiring | Very high |
| Save/autosave on resolve | Medium |
| MIDI/SoundFont music + SFX discipline | High (main fought this; experiment inherits) |
| Modular assembly *catalog skeleton* | Low–medium (exists; underused as primary gen) |
| 129 `*.spec.ts` files | Irreplaceable regression net |

**Conclusion:** Shortest time-to-best-outcome cannot include throwing away the playability/content spine. That eliminates pure greenfield and pure “return to main and re-port everything” as primary strategies.

### 2.2 What is *actually* broken (evidence from product screenshots)

`tests/screenshots/visual-s5-density-spawn.png` (and user observation):

1. **Fence forms closed pens with an open front and no gate** → generator stamps *shape* without *loop function*.  
2. **Random tower / outhouse sprites** → free scatter / template atoms without scene ownership.  
3. Dirt/emoji still compete with “place” language → atom density still too high relative to structure.

These are **generation-policy** failures. They are not solved by:

- more material factories  
- more nano subdivision  
- restarting on main’s 64px FOV alone  

They *are* solved by making **illegal** any decorative barrier without a functional opening, and by placing **structures only via scenes**.

### 2.3 What the docs already say the base engine is

| Doc | Load-bearing rule |
|-----|-------------------|
| `01` | Core loop = whole game; expand education/NPCs *inside* the loop |
| `02` | Flat sim authoritative; presentation never owns walkability |
| `03` | Cell = kind + walkable + surface + item/NPC; sub-cell only for foot precision — **no render family in the model** |
| `04` | Gen must guarantee traversable regions, solvable obstacles, non-empty dead ends; pipeline is flat |
| Code org philosophy | Don’t reorganize for aesthetics; change what delivers the game |

A “clean focused base” **already has a written definition**. The codebase partially implements it and partially fights it (WU/nano as de-facto center). The path is **align code to the written base**, not invent a third base.

### 2.4 Cost structure of the experiment stack

Approximate mass on tip (order of magnitude):

| Area | ~LOC | Role in product path |
|------|------|----------------------|
| `src/game/*` | ~10k | **Keep** — loop, quiz, UI, save |
| `src/config/*` | ~6k | **Keep** — content knobs, biomes (tune) |
| `src/engine/world/*` | ~4.3k | **Rewrite priority of stages** — keep ObstacleSolver/quiz density; demote WU as primary author |
| `src/rendering/*` + asset-pipeline iso2 | ~13k | **Freeze architecture**; use selectively for paint |
| `WorldUnitSolver.ts` alone | ~1161 | Highest complexity per value for *places* |

**Conclusion:** The expensive wrong center is **WU-primary + free structure scatter**, not the existence of Canvas or quiz systems. Fixing priority inside this repo is cheaper than re-homing the spine.

### 2.5 Why not main as the *build* trunk

Main strengths (evidence: `git show main:src/config/game.config.ts`):

- tileWidth **64** — healthy FOV  
- Less nano entanglement  

Main weaknesses for *shortest path*:

- Missing the bulk of post-merge-base playability/M1/homestead/gate isolation work (hundreds of commits)  
- Still would need scene-first gen to fix fence-without-gate class bugs  
- “Merge experiment later” becomes an endless dual-maintenance tax if both stay active product trunks  

**Main is a useful FOV philosophy and a release-merge target later — not the daily build trunk for fastest delivery.**

### 2.6 Expandability requirements → what the base must optimize for

To grow for years with **learning materials, assets, characters, side quests**, the base must make these operations cheap:

| Expansion type | Cheap if… | Expensive if… |
|----------------|-----------|---------------|
| New quiz packs / Book articles | Content pipeline + IDs only | Gen rewrite |
| New NPC persona | Config + dialog + sprite | New solver constraints |
| New side quest | Quest graph on flat flags + scene hook | Nano/WU schema change |
| New biome look | Presentation resolver table (`05`) | New terrain physics |
| New place type (church, market) | **One scene recipe** + placement rule | New edge-contract ontology |

Therefore the base engine’s **primary extension surface must be: scene recipes + content packs + entity configs**, not solvers or nano kinds.

That is only true if **scenes are the gen unit**. The assembly catalog already points that way; it is under-powered relative to WU/scatter.

---

## 3. The operating model (what “the path” means day to day)

### 3.1 Architectural law (enforce in code review / agent prompts)

1. **Simulation owns walkability and progression.** Presentation never decides if a gate is open.  
2. **No free structure atoms.** `outhouse`, free `house`/`hut` towers, decorative wall stubs — only via **scene recipes**.  
3. **No barrier without function.** Any fence/wall run that creates a navigable enclosure opening **must** place `quiz_gate` or `door_locked` or an explicit open path cell tagged as entry.  
4. **Iso2 nano/materials are paint.** Allowed to improve how `fence`/`wall`/`water` *look*; forbidden as a reason to change gen ontology.  
5. **FOV locked** unless a written scale RFC: current product target **128×64** diamonds, `entityDisplayScale` ~1.0, 144 source supersample. No more unmotivated 256 experiments.  
6. **Expansion PRs** should be mostly: `catalog` scene, `config` content, `assets` — not new solvers.

### 3.2 Generation pipeline — re-centered (same files, new order of power)

```
Entropy + biome/difficulty
        │
        ▼
Path skeleton (entry → landmark → exit)     ← NEW primary
        │
        ▼
Scene stamps (homestead, farm+GATE, pond, …)  ← PRIMARY structure
        │
        ▼
Functional obstacles ON path (quiz_gate density)  ← already partly in ObstacleSolver
        │
        ▼
Light terrain fill (grass/dirt paths only)   ← demote Perlin salt
        │
        ▼
Sparse decoration + coins (S5 caps)          ← already improved
        │
        ▼
WU / templates (OPTIONAL filler only)        ← demote or freeze
        │
        ▼
Validation: traversable + every fence opening functional + min gates
```

**WorldUnitSolver is not deleted on day one** (too risky for chain tests). It is **stripped of authority**: either frozen for non-structure templates or run only to fill remaining open grass with *non-blocking* terrain. Structure-bearing templates that create enclosures without gates are **disabled**.

### 3.3 Presentation — freeze and harvest

| Do now | Defer indefinitely unless a scene needs it |
|--------|--------------------------------------------|
| Keep current FOV + player scale | New nano primitives |
| Use render-time biome materials for fence/wall (already exists) | New material factories |
| Port draw quality only when a **scene** looks wrong | Pixel-perfect brick parity as a goal in itself |
| Terrain cohere / orphan cleanup (already useful) | Another tileWidth jump |

### 3.4 Phased delivery (calendar-oriented, not endless experiment)

**Phase P0 — Scene law (shortest critical path, ~days of focused work)**  

- Validator + gen fix: fence openings → required gate/path.  
- Ban free scatter of outhouse / stray house-like obstacles.  
- Proof: screenshot where every pen has a gate; no random towers.  
- Tests: scene-invariant specs.

**Phase P1 — Scene-primary gen for dist ≤ 2–3 (~1–2 weeks)**  

- Homestead (exists) + farm **with south quiz_gate** + path-to-gate + pond scene.  
- Path skeleton BFS-proven.  
- Disable structure-heavy WU weights in early biomes.  
- Proof: live session to first open gate looks intentional.

**Phase P2 — Expandability rails (~parallel, continuous)**  

- Scene recipe format documented (TS catalog is fine; optional JSON later).  
- Content pack drop path already half-there — formalize “add quiz CSV / Book article without touching gen.”  
- NPC/side-quest hooks: flat flags on player/region (`questId`, `metNpc`), not new tile kinds.

**Phase P3 — Paint pass (only after P1 feels good)**  

- Selective Iso2 materials on fence/wall/water **for stamped scenes**.  
- Audio polish on loop events.  

**Definition of “clean base engine” for this path:**  

After P1, a competent agent can add a new place type by writing one scene recipe + weights, and add a week of school content by dropping quiz/Book data — **without** opening `WorldUnitSolver.ts` or `nano-tile.ts`.

---

## 4. What success looks like (acceptance, not vibes)

### Product acceptance (child session)

1. Spawn in a **readable place** (yard + house + **gated** exit).  
2. Move without snags; Space teaches gate.  
3. Fail quiz → retry → open → leave.  
4. Next structure encountered is a **place** (farm/pond/path), not a random tower.  
5. Session 5–15 minutes feels complete.

### Engineering acceptance (expandable base)

1. Scene invariant tests green.  
2. M1 playability suite remains green.  
3. Adding a scene does not change collision math.  
4. Adding quizzes does not change gen.  
5. `engine/` does not gain new imports from nano “render family” for gameplay.

### Explicit non-goals (until base is locked)

- Perfect river meshing across all biomes  
- Full AC-3 elegance  
- Experiment-parity material showcase  
- Speculative file splits  

---

## 5. Risk register for *this* path only

| Risk | Mitigation |
|------|------------|
| WU disable breaks determinism / chain tests | Disable structure templates only; keep river/path chains if needed; re-golden deliberately |
| Agents keep “improving” nano instead of scenes | Standing order in this file + `13`; refuse nano PRs without scene justification |
| Merge to main later is hard | Periodic “product tip is truth”; main becomes deploy branch via merge when P1 done — not dual feature trunks |
| Scene catalog becomes a new god-object | One recipe = data file; placement policy thin |

---

## 6. Rejected paths (with reasons — not alternatives to pick)

| Rejected | Why rejected for *shortest best* outcome |
|----------|------------------------------------------|
| Greenfield from docs | Destroys paid playability/content/audio; longest time to same loop |
| Daily build trunk = `main` + re-port | Re-implements M1/homestead/gates; scene work still required; dual-branch tax |
| Keep experiment tip, keep WU-primary + more materials | Repeats S5 screenshot failure class; expands unmaintainable surface |
| Full deletion of all Iso2 code now | Throws away paint recipes and tests useful for P3; no need if frozen |

---

## 7. Immediate next engineering action

**Campaign PR 1–7 complete.** Default work is now **content growth on the locked base**:

1. New places via `catalog.ts` / `registerSceneRecipe` + biome weights (`expandability-rails.md`).  
2. New quizzes/Book via `public/content/packs/…` (no gen edits).  
3. Optional **P3 paint/audio** only when a stamped scene looks wrong — freeze nano architecture.  
4. Keep proof suite green; re-capture golden deliberately when gen policy changes.

Macro plan (historical + acceptance checkboxes):  
`memories/repo/design-scene-first-productization.md`.

---

## 8. Final statement

**The one path:** Productize **this** branch by making **scene-first generation + functional barriers** the law, freezing Iso2 as paint, and expanding only via **scenes and content**. That is the minimum-time route to a playable, beautiful-enough, **continuously expandable** base — because the loop spine is already here, the docs already define the base, and the remaining failure is gen priority, not the choice of git root.

*Determination recorded 2026-07-16. Supersedes A/B/C framing in `first-principles-path-forward-2026-07-16.md` for decision-making; that file remains historical survey.*
