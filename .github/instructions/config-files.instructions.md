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

## Rules
1. **Use `as const`** for all config objects — ensures literal types and immutability.
2. **Exception: `RENDER_CONFIG`** is intentionally mutable (canvas dimensions). This is documented but should use a setter pattern instead of direct mutation.
3. **Co-locate types with data** — each config file defines its own interfaces.
4. **Do not duplicate types** that also exist in `src/types/`. Known duplicates to resolve:
   - `QuizDifficulty` in quiz.config.ts vs content-pack.types.ts
   - `QuizCategory` in quiz.config.ts (5 values) vs content-pack.types.ts (7 values) — **divergent!**
   - `SubjectId` in knowledge.config.ts vs content-pack.types.ts
5. **Section headers** use `// ─── Section Name ───` dividers.
6. **Quiz questions belong here**, not hardcoded in main.ts.
