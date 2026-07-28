# Expandability rails — scene-first product base

**Status:** Place Coherence landed (2026-07-19); scene-first PR7 base (2026-07-16)  
**Audience:** agents + humans adding content to `experiment/isometric-2.0`  
**Authority:** `definitive-path-forward-2026-07-16.md`, `design-scene-first-productization.md`, `design-place-coherence-epic-2026-07-19.md`, `AGENTS.md`

**Place coherence pass is law.** After full chunk gen, `runPlaceCoherencePass` (`src/engine/world/PlaceCoherence.ts`) re-asserts recipe openings, seals illegal fence/wall dirt holes, and keeps homestead south closed. Walk stays `cell.walkable` SSOT; paint never decides progression. New places still expand only via **catalog recipe + openings + biome weight** — not WorldUnitSolver / nano thrash.

This document is the **how-to** for growing the game **without** reopening world-engine ontology. After scene-first P0–P1, the cheap surfaces are:

| Expansion | Touch these | Do **not** touch |
|-----------|-------------|------------------|
| New place (farm, market, shrine) | Scene recipe + biome weight | `WorldUnitSolver.ts`, nano-tile architecture |
| New quiz / Book article | Content pack JSON (+ optional pipeline) | Gen / collision / solvers |
| New NPC persona | Config + dialog + sprite | New tile kinds |
| New side-quest flag | Flat player/region flags + scene hook | New solvers |
| Cozy look polish | Presentation materials **for existing kinds** | New nano primitives “for fun” |

---

## 1. How to add a scene recipe

### 1.1 Contract (`AssemblyRecipe`)

Every modular place is data in `src/engine/iso2-assemblies/catalog.ts`:

```ts
interface AssemblyRecipe {
  id: string;           // stable key, e.g. 'fenced-farm-north'
  width: number;
  height: number;
  placements: Array<{ x; y; assetKey; itemId?; npcId? }>;
  openings?: Array<{ x; y; kind: 'quiz_gate' | 'door_locked' | 'path' }>;
}
```

**Scene law (non-negotiable):**

- If the recipe has a fence/wall gap, declare `openings[]`.
- At least one opening on a fenced pen must be **`quiz_gate` or `door_locked`** (not dirt-only).
- Dirt flanks around a gate may be `kind: 'path'`.
- Open water/path scenes with no barriers may omit `openings` (vacuous validate).

Validation/repair lives in `src/engine/iso2-assemblies/scene-invariants.ts` and runs after every stamp.

### 1.2 Steps (catalog-first)

1. **Copy a close recipe** in `catalog.ts` (e.g. `FENCED_FARM`) into a new `export const …`.
2. **Edit placements** using existing `assetKey`s only (`fence`, `quiz_gate`, `hut`, `wheat`, … from `assets.config`).  
   - Do **not** invent a new structure atom and free-scatter it.
3. **Declare `openings`** for every barrier gap.
4. **Register** in `ASSEMBLY_RECIPES` **or** call:

   ```ts
   import { registerSceneRecipe } from '../engine/iso2-assemblies';
   registerSceneRecipe(MY_RECIPE);
   ```

   `catalog.ts` **is** the register; `registerSceneRecipe` is thin sugar for tests/loaders.

5. **Biome weight** so gen can pick it (`iso2-assemblies.ts` table or):

   ```ts
   import { setBiomeSceneWeight } from '../engine/iso2-assemblies';
   setBiomeSceneWeight('meadow', 'my-farm-variant', 0.25);
   ```

6. **Prove:**
   - `npx playwright test tests/world-gen/scene-invariants.spec.ts --reporter=line`
   - Optional stamp smoke: `stampAssemblyOntoCells` + `validateSceneOpenings` in a small test
   - If gen output intentionally changes: re-capture `GOLDEN_HASH` in `gen-determinism.spec.ts`

### 1.3 Placement policy (already wired)

- `maybePlaceModularScenes` (ChunkGenerator pipeline) stamps **at most one** modular scene per non-origin chunk when chance + footprint allow.
- Origin starter homestead is separate: `starter-homestead.ts` (not in modular weights).
- Path skeleton (early `chunkDist ≤ 2`) lays dirt corridors; keep openings facing path language when you can.

### 1.4 Worked mini-example: second farm variant

```ts
// catalog.ts
export const FENCED_FARM_NORTH: AssemblyRecipe = {
  id: 'fenced-farm-north',
  width: 5,
  height: 5,
  placements: [
    // …fence ring…
    // North entry: dirt + quiz_gate (not dirt-only)
    { x: 2, y: 0, assetKey: 'quiz_gate' },
    // …hut, crops, animals…
  ],
  openings: [
    { x: 1, y: 0, kind: 'path' },
    { x: 2, y: 0, kind: 'quiz_gate' },
    { x: 3, y: 0, kind: 'path' },
  ],
};

// ASSEMBLY_RECIPES['fenced-farm-north'] = FENCED_FARM_NORTH;
// setBiomeSceneWeight('meadow', 'fenced-farm-north', 0.15);
```

No edits to `WorldUnitSolver.ts`. No new nano kinds.

---

## 2. How to add quiz / Book content

### 2.1 Content packs (preferred)

Shipped packs live under:

```
public/content/packs/default-v1/
  manifest.json
  quizzes/quizzes-00N.json
  articles/articles-00N.json
```

Schema: `src/types/content-pack.types.ts`. Loader: content pack loader (see `public/content/README.md`).

**Add quizzes:**

1. Append questions to a shard under `quizzes/` (≤ ~100 per shard) **or** add `quizzes-00N.json`.
2. Fields that matter in play: `id`, `category`, `difficulty`, `ageMetadata`, `question`, `answers[]`, `hint`, `explanation`, `tags`, `provenance`.
3. Update `manifest.json` counts (`npm run content:validate` / `generate-manifest` if using the pipeline).
4. Gameplay merges pack questions with the static bank — **no gen change**.

**Add Book articles:**

1. Append to `articles/articles-00N.json` (or new shard).
2. Tag subject so “I don’t know” routing can find a matching article.
3. Validate pack; no solver touch.

### 2.2 Pipeline helpers (optional)

```bash
npx tsx scripts/generate-quiz-content.ts
npx tsx scripts/generate-knowledge-content.ts
npx tsx scripts/generate-manifest.ts
# or:
npm run content:ingest:offline
npm run content:validate
```

### 2.3 What not to do for content

- Do **not** hard-code new quiz text only inside gate interaction code if a pack can hold it.
- Do **not** change gen density to “feature” a new quiz pack.
- Do **not** add a new `assetKey` for “quiz about X.”

---

## 3. What not to touch (frozen base)

| Area | Path | Why frozen for expansion |
|------|------|---------------------------|
| WU structure authority | `src/engine/world/WorldUnitSolver.ts` | Structure-bearing free templates demoted; places come from scenes |
| Nano presentation architecture | `src/rendering/nano-tile*.ts`, material factories | Iso2 is **paint only**; not a new world ontology |
| TileWidth / FOV thrash | `game.config` diamond size | Locked **128×64** on-screen diamonds unless written RFC |
| Speculative reorgs | Large file splits for line counts | `code-organization-philosophy.md` |

**Allowed without reopening the freeze:**

- New/edited scene recipes + weights  
- Content packs  
- NPC/dialog/sprite config  
- Bugfixes that prove a real playability/gen invariant failure  
- Selective materials on **existing** fence/wall/water for stamped scenes (P3 paint)

---

## 4. Proof bar when you expand

After a scene or content PR, prefer:

```text
npx playwright test \
  tests/world-gen/scene-invariants.spec.ts \
  tests/world-gen/ban-free-structure-atoms.spec.ts \
  tests/world-gen/path-skeleton.spec.ts \
  tests/world-gen/place-coherence-homestead.spec.ts \
  tests/world-gen/place-coherence-audit.spec.ts \
  tests/world-gen/gen-determinism.spec.ts \
  tests/gameplay/playability-m1-core-loop.spec.ts \
  --reporter=line
```

Session / leave-via-gate regression stays in the expand suite (`playability-m1-core-loop`) alongside place-coherence locks.

Visual bar (scene-first campaign):  
`tests/screenshots/proof-scene-law-spawn.png` (+ explore) — intentional gated places, **not** free towers / gate-less pens.  
Capture helper: `tests/world-gen/proof-scene-law-capture.spec.ts`.

Visual bar (place-coherence campaign):  
`tests/screenshots/proof-place-coherence-homestead.png` (closed south fence),  
`proof-place-coherence-recipe.png` (catalog recipe e.g. `fenced-garden-quiz`),  
`proof-place-coherence-explore.png` (early fixed-seed intentional places).  
Capture helper: `tests/world-gen/proof-place-coherence-capture.spec.ts`.

Homestead closed south fence remains **regression-locked** (P6).

---

## 5. One-line summary

> **New place = catalog recipe + openings + biome weight. Place coherence pass keeps stamp/walk/draw agreed. New learning = content pack. Do not open WorldUnitSolver or invent nano kinds to grow the game.**
