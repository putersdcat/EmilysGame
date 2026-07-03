# Iso 2.0 → Main Engine Port — Remaining Open Items

Last verified: 2026-07-03
Branch: `experiment/isometric-2.0`
Tracking: #277 + continuation

## Known visual issues (from screenshot 2026-07-03)

1. **Dark green triangle "shadows"** — WU terrain-cache diamond pre-fill leaks at
   WU/chunk boundaries where adjacent WU canvases don't fully overlap to cover
   the diamond corners. Each visible dark triangle is one WU's corner not being
   painted over by the neighbouring WU's cells. Most visible where cells are
   non-base (fence, water, NPC).
2. **Stretched rectangular water "tanks"** — water clusters look like large
   square pools rather than rivers because water cells are drawn in a wide flat
   block instead of a flowing river. Likely related to the same WU-canvas issue.
3. **Wall/cell "tails" / spikes** — some fence/wall cells render with a long
   thin spike sticking out (visible in mid-canvas). Likely a per-cell sprite
   drawn outside the cell diamond bounds.
4. **Performance regression** — browser FPS and player movement feel sluggish.
   Could be related to: terrain cache re-creation on every frame, the
   texture-density increase in grass/dirt, missing viewport culling on object
   sprites, or a hot-path allocation.

## Port remaining work (from phase-d-handoff + 277)

- **D.6 WaterFamily** — ported but water rendering shape is wrong (see above)
- **D.7 seamless terrain** — done; D.7 seam delta 2.6
- **D.8 biome transitions** — done; gated to actual transition chunks
- **D.9 weathering overlays** — done
- **D.10 sloped roof geometry** — done
- **S2 roofs-as-assembly-only** — not yet enforced (random roof shards still possible)
- **S3 overlay opacity tuning** — partially softened in biomes.config
- **S4 house/hut/shop assembly stamps** — only origin chunk has starter homestead
- **S5 density/scale pass** — not yet, heavy structures still in early biomes

## Next prioritized slices

### R1 — Fix the dark green triangle shadows
The WU diamond pre-fill corners leak. Two options:
  a) Make the pre-fill match the actual cell-rendered area exactly per cell
     instead of per WU (fill cells one at a time with grass first).
  b) Render WU canvases with an extra 1-cell overlap on every side so the
     corners are guaranteed covered by adjacent WUs.
Prefer (a) — it's the actual fix, not a band-aid.

### R2 — Fix water "tanks" shape
The water cluster in the screenshot looks square because the water cells
form a 2x2 or larger block. Either the water template/seed is producing
blocky pools, or the water nano renderer is drawing outside the cell
diamond. Investigate `inferWaterVariant` + `waterNano` shape.

### R3 — Wall/cell spike artifacts
The thin spike sticking out of a fence cell in the screenshot is a
per-cell sprite being drawn at the wrong size or outside the diamond.
Look at `iterateObjectCells` + `getNanoStack` for height/bias issues.

### R4 — Performance pass
- Verify terrain cache is keyed properly and not re-created per frame
- Check for hot-path allocations in render loop
- Profile with `?perf=1` URL param
- Consider viewport culling for high-density object cells

### R5 — Port remaining slice
After R1-R4, port the next major slice from the Iso 2.0 → main port
contract. Check Iso 2.0 experiment for what's ready to pull over.
