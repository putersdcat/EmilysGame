---
description: "Use when editing config files — game constants, biome definitions, tile metadata, item stats, quiz content. Covers typing, immutability, and naming conventions."
applyTo: "src/config/*.config.ts"
---

# Config File Standards

## Pattern
All config files follow:
```ts
export interface FooDef { /* ... */ }
export const FOO_CONFIG = { /* ... */ } as const;
```

## Inventory

```
src/config/
  ├── asset-library.config.ts   ← asset library metadata
  ├── assets.config.ts          ← tile/asset registry (key → emoji, walkable, layer)
  ├── biomes.config.ts          ← biome definitions
  ├── cosmetics.config.ts       ← cosmetic items
  ├── entropy.config.ts         ← entropy prompts + FALLBACK_WORDLIST
  ├── fire.config.ts            ← fire animation variants
  ├── game.config.ts            ← core constants (WORLD_CONFIG, LLM_CONFIG, RENDER_CONFIG)
  ├── hints.config.ts           ← quiz hint text
  ├── items.config.ts           ← item definitions
  ├── knowledge.config.ts       ← Book of Knowledge metadata
  ├── music.config.ts           ← music track registry
  ├── npc.config.ts             ← NPC roster + dialog seeds
  ├── particles.config.ts       ← particle effect parameters
  ├── quiz.config.ts            ← quiz questions + difficulty tiers
  ├── sfx.config.ts             ← sound effect registry
  ├── tiles.config.ts           ← tile metadata + LOD config
  ├── wildlife.config.ts        ← wildlife AI parameters
  └── wordlists.asset.ts        ← bundled scrambled wordlists (asset, not config)
```

## Rules
1. **Use `as const`** for all config objects — ensures literal types and immutability.
2. **Exception: `RENDER_CONFIG`** is intentionally mutable (canvas dimensions).
   This is documented but should use a setter pattern instead of direct mutation.
3. **Co-locate types with data** — each config file defines its own interfaces.
4. **Do not duplicate types** that also exist in `src/types/`. Known duplicates to resolve:
   - `QuizDifficulty` in `quiz.config.ts` vs `content-pack.types.ts`
   - `QuizCategory` in `quiz.config.ts` (5 values) vs `content-pack.types.ts` (7 values) — **divergent!**
   - `SubjectId` in `knowledge.config.ts` vs `content-pack.types.ts`
5. **Section headers** use `// ─── Section Name ───` dividers.
6. **Quiz questions belong here**, not hardcoded in main.ts.

## Adding New Config

1. **New domain?** Create a new `*.config.ts` file in `src/config/`.
2. **Naming:** `<domain>.config.ts` — never just `<domain>.ts`. The `.config.ts`
   suffix signals immutability.
3. **Use `as const`** and export the type explicitly:
   ```ts
   export interface MyConfig {
     readonly foo: number;
   }
   export const MY_CONFIG: MyConfig = { foo: 42 } as const;
   ```
4. **Co-locate the interface** in the same file as the data.
5. **If the type is shared with non-config code** (engine, rendering, game),
   promote it to `src/types/game.types.ts` (see types.instructions.md).

## Quiz Content Rules

- **Quiz questions belong in `src/config/quiz.config.ts`**, not hardcoded in
  `src/main.ts` or `src/game/quiz.ts`.
- Each question has `difficulty`, `category`, `correctIndex`, and `choices[]`.
- Use the `KnowledgeSubject` enum from `knowledge.config.ts` for `category`.

## Pre-Commit Checks

```bash
# Typecheck
npx tsc --noEmit

# Config-related tests (mostly education + gameplay)
npx playwright test tests/education/ tests/gameplay/ --reporter=line
```

## Cross-References

- `.github/instructions/architecture.instructions.md` — god-file prevention
- `.github/instructions/types.instructions.md` — when to centralize a type
- `Docs/RefactoringPlan_11-06-26.md` — config files are stable, no extraction needed