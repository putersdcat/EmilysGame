# Visual scale / DPI mismatch (2026-07-15)

## User observation (confirmed by screenshot compare)

Comparing:

- **Old micro era:** `tests/screenshots/game.png` (64×32 diamonds)
- **Iso2 smoke:** `tests/screenshots/iso2-main-game-visual-smoke.png`
- **Today V3:** `tests/screenshots/visual-v3-latest-spawn.png` / `explore.png`
- **Lab showcase:** `tests/screenshots/iso2-systems-showcase.png` (materials look great *in isolation*)

…the live game still reads as **“same relative feature scale vs player as old micro tiles”**, not as the denser “Polly Pocket” Iso 2.0 experiment promise (FirstFeedbackOnIso2.md: toy scale with small readable details).

## Root cause (code, not opinion)

Commit `13ade67` (2026-05-19) changed:

| Knob | Before | After | Ratio |
|------|--------|-------|-------|
| `tileWidth` | 64 | **256** | **4×** |
| `tileHeight` | 32 | **128** | **4×** |
| `microTileSize` | 96 | 144 | 1.5× source |
| `emojiSize` | 32 | **32** | unchanged |
| `spriteSize` | 48 | **48** | unchanged |
| `PLAYER_CONFIG.scale` | 1.0 | **1.0** | unchanged |

So:

- World diamonds grew **4×** in on-screen pixels.
- Player/emoji/NPC sprites stayed at old pixel budgets.
- **Player : tile width** went from `32/64 = 0.5` → `32/256 = 0.125` (**4× smaller avatar relative to world**).
- Nano 144 source + materials **do** paint richer *within* each diamond, but the camera still shows a sparse field of giant green diamonds with a tiny avatar — first impression stays “emoji scatter,” not “readable sub-tile architecture.”

This matches inventory note 3.2 “Detail scale” and port remaining **S5 density/scale pass** (never done).

## What Iso 2.0 was *for* (docs)

- **Docs/05:** presentation only maps flat sim → pixels; projection uses `tileWidth/Height`.
- **Iso2.0-MainEngineIntegrationGuide:** 144 micro for clean 3×48 nano math — **source/subdivision contract**, not an automatic “looks better at player scale” guarantee.
- **FirstFeedbackOnIso2 / Iso plans:** depth, continuous features, materials, **and** a sense of dense toy-scale detail.
- **Experiment showcase** proves materials/nanos *can* look excellent when framed as product shots; main game never rebalanced **viewport + entity scale** after the 4× diamond jump.

## Why V1–V3 gen/composition alone can’t fix this

V1 surfaces, V2 assemblies, V3 water basins improve *what* is placed and *how water/walls draw*, but they inherit the broken **avatar∶world∶viewport** contract. Without a scale pass, richer nanos still read as texture on oversized tiles next to an undersized player.

## Recommended scale strategy (next visual work)

1. **Entity scale tracks tile DPI** — derive player/NPC/emoji display scale from `tileWidth / 64` (or a `playerTileFraction` target ~0.4–0.5 of diamond width). Restores pre-Iso2 avatar∶tile ratio so fences/walls/houses read at human-ish scale.
2. **Optional zoom / tile display size** — second knob: on-screen diamond size (e.g. 128–192) separate from 144 source (supersample into smaller diamonds = more world on screen *and* nano detail). Do not confuse source DPI with viewport zoom.
3. **S5 density** — after scale feels right, bias gen toward fewer lone emojis and more multi-cell assemblies (already started in V2).
4. **Proof** — paired screenshots: same seed/pose, before/after scale; player height vs fence post vs cottage door must look intentional.

## Status

- Diagnosed 2026-07-15 from live PNGs + `game.config` history.
- Implementation: start with (1) entity scale derived from tile width; capture `visual-scale-rebalance-*.png`.
