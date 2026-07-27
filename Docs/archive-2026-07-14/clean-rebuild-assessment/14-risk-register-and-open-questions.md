# 14 — Risk Register and Open Questions

**Date:** 2026-07-07  
**Purpose:** Capture the major risks and unresolved decisions before a clean branch begins.

## Top risks

### R1 — Rewrite trap

**Risk:** A clean branch consumes months and never reaches current alpha parity.  
**Likelihood:** High if unmanaged.  
**Impact:** High.  
**Mitigation:** Proof spike first; current game remains playable; parity matrix is binding; stop/go gates.

### R2 — Three.js does not preserve desired visual style

**Risk:** Orthographic Three.js becomes generic low-poly or too “3D,” losing the Iso2 storybook/toybox feel.  
**Likelihood:** Medium.  
**Impact:** High.  
**Mitigation:** Spike scenes must compare against Iso2 visual goals; lock camera; use stylized materials; preserve isometric composition.

### R3 — Geometry solves seams but creates material complexity

**Risk:** Wall/roof/river geometry works, but material mapping across faces becomes as hard as Canvas face slicing.  
**Likelihood:** Medium.  
**Impact:** Medium/High.  
**Mitigation:** Use a tiny material family set in the spike; decide whether procedural texture factories generate CanvasTextures, SVG textures, or real image atlases.

### R4 — Product breadth is underestimated

**Risk:** Team rebuilds renderer/world and forgets Book, audio, UI, survival, wildlife, content, platform.  
**Likelihood:** High without docs.  
**Impact:** High.  
**Mitigation:** Requirements matrix; product parity gate; cut/defer decisions explicit.

### R5 — Stale docs/issues send work in wrong direction

**Risk:** Agents follow old paths, stale line counts, missing `AGENTS.md`, or superseded geometry contracts.  
**Likelihood:** High.  
**Impact:** Medium.  
**Mitigation:** Use `11-source-of-truth-reconciliation.md`; create a single source-of-truth note before implementation.

### R6 — LLM dependency hurts deployability/testability

**Risk:** Game blocks on local LLM or diverges across test/deploy modes.  
**Likelihood:** Medium.  
**Impact:** High.  
**Mitigation:** Fallback-first startup; LLM enrichment async; tests never depend on LLM.

### R7 — Solver overbuild before fun is proven

**Risk:** Team spends months implementing a perfect WorldEngine before a playable loop exists.  
**Likelihood:** Medium.  
**Impact:** High.  
**Mitigation:** Spike uses deterministic fixture/generator, not full macro solver; macro solver comes after current parity.

### R8 — Visual validation becomes artifact sprawl

**Risk:** Screenshots pile up, repo grows, and no one knows which images are authoritative.  
**Likelihood:** High based on branch history.  
**Impact:** Medium.  
**Mitigation:** Baseline promotion policy; scratch artifacts ignored; named visual scene specs.

### R9 — Save migration complexity

**Risk:** Clean branch cannot load/translate existing saves or loses player progress.  
**Likelihood:** Medium.  
**Impact:** Medium.  
**Mitigation:** Treat old saves as import-only migration; versioned SaveGameV2; generated-world deltas.

### R10 — Audio scope creep

**Risk:** Curated audio hard reset grows into a separate production effort blocking engine work.  
**Likelihood:** Medium.  
**Impact:** Medium.  
**Mitigation:** Preserve current basic audio parity first; curated audio remains a later milestone.

## Open questions with default recommendations

### Q1 — Should the clean branch preserve every quirky current gameplay system?

**Default:** Preserve as parity unless explicitly cut, but implement after core renderer/gameplay proof.  
**Reason:** Diarrhea/worms/hygiene/wildlife are current alpha identity and tests exist, but they should not block the Three.js spike.

### Q2 — Should Tesla mode remain a parity requirement?

**Default:** Preserve after base UI/input parity.  
**Reason:** It exists and is documented, but it is niche and should not affect core engine decisions.

### Q3 — Should player movement be smooth continuous or tile-step?

**Default:** Preserve current smooth movement for parity, but test tile-step as an accessibility/feel option if desired.  
**Reason:** Early docs wanted tile-snapped steps; current code uses smooth movement and footprint collision.

### Q4 — Should chunk size remain 25×25?

**Default:** Yes for parity/spike.  
**Reason:** Current architecture and world-unit math assume 25×25 macro chunks as 5×5 world units.

### Q5 — Should nano stay 3×3 in Three.js?

**Default:** Yes logically; renderer may generate higher-detail geometry from it.  
**Reason:** 3×3 is deeply documented and aligns with player anchor/walkability semantics.

### Q6 — Should LLM be required for production?

**Default:** No.  
**Reason:** Static/GitHub Pages/test mode and current fallback systems show that playability should not require LLM. LLM remains a differentiator when available.

### Q7 — Should the current MIDIocre backend be ported exactly?

**Default:** Preserve the user-facing music/tapeplayer behavior, not necessarily the exact backend.  
**Reason:** Backend can change if the same assets/controls/mute behavior survive.

### Q8 — Should content ingestion/rephrasing be part of alpha parity?

**Default:** No; content pack loading is parity, ingestion/rephrasing automation is full vision.  
**Reason:** Existing packs can carry alpha parity; pipeline automation can follow.

### Q9 — Should existing Playwright tests be ported wholesale?

**Default:** Use them as acceptance references, not direct copy at first.  
**Reason:** New architecture should add pure/property/visual tests and then restore browser flows.

### Q10 — Should the clean branch live in `src-next/` or a separate experiment folder?

**Default:** Spike in `experiment/three-clean-spike/`; full accepted branch can move to `src-next/`.  
**Reason:** Isolation avoids polluting current playable branch before proof.

## Explicit user decisions eventually needed

1. Is Three.js acceptable as the new rendering dependency if the spike succeeds?
2. Is the goal current-alpha parity first, or full documented vision directly?
3. Which quirky survival/illness systems are mandatory parity?
4. Is Tesla mode still important?
5. Should old saves be migrated or can the clean branch start fresh?
6. Should the clean branch target GitHub Pages/static deployment from day one?
7. What is the visual style reference: current Iso2 screenshots, concept images, or a new art direction?

## Recommended default answers

If no additional direction is given:

- accept Three.js only after spike proof;
- current-alpha parity first;
- preserve all current gameplay systems unless they block proof;
- keep Tesla as later parity;
- migrate old saves only if practical, otherwise provide import/reset note;
- keep static deployment compatibility;
- use current Iso2 visual goals as style reference.
