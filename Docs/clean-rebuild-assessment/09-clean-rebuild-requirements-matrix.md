# 09 — Clean Rebuild Requirements Matrix

**Date:** 2026-07-07  
**Purpose:** Convert the deep assessment into an actionable requirements matrix. Each subsystem is classified by current-alpha parity, full documented vision, acceptance evidence, and source references.

## Legend

- **Parity** — required to replace the current playable alpha without losing important delivered capability.
- **Full vision** — required to satisfy the richer documented/issue backlog.
- **Spike** — required in the first Three.js proof spike.
- **Defer** — consciously post-parity unless the user prioritizes it.
- **Cut?** — candidate to remove only by explicit product decision.

## Product and platform

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Browser-first TypeScript app | ✅ | ✅ | ✅ | Vite app launches; no native/editor-only dependency | README, package.json, #247 |
| Static/local-first playability | ✅ | ✅ | ✅ | Game starts without LLM/network; local save works | Game bible, LLM docs, save code |
| Short child-friendly adventure loop |  | ✅ | ✅ | Player can explore, collect, quiz, learn, save | Game bible, #2 |
| Test mode | ✅ | ✅ | ✅ | Automated runs bypass LLM/audio instability | `llm/test-mode.ts`, tests |
| Touch/gamepad/Tesla support |  | ✅ | ✅ | Touch/gamepad flows work or are explicitly cut | #124, #126, #144, #185, #188 |
| Deployment/CI path |  | ✅ | ✅ | Build/test scripts and static hosting path documented | CI docs, README |

## World and generation

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Deterministic seed + coord generation | ✅ | ✅ | ✅ | Same seed/coords hash identical | `gen-determinism.spec.ts`, #265 |
| Generated base world + persisted deltas | ✅ | ✅ | ✅ | Opened gate/collected item persists without storing full chunk | save code, Architecture |
| Micro tile metadata | ✅ | ✅ | ✅ | Traversal/surface/edge/height metadata validates | WorldEngine-01, #165 |
| Nano 3×3 occupancy | ✅ | ✅ | ✅ | Collision/render uses explicit nano footprint | WorldEngine-01/02, Iso2 docs |
| World-unit templates |  | ✅ | ✅ | 5×5 motifs with edges/anchors/rotation | #166, tiles.config |
| Macro assembly |  |  | ✅ | 5×5 WU macro with entrances/exits/progression | WorldEngine-03 |
| Cross-chunk edge contracts |  | ✅ | ✅ | Neighbor borders compatible after streaming | #17/#42 lineage, WorldEngine-02 |
| Chain integrity |  |  | ✅ | Rivers/walls/fences have valid continuation/terminators | WorldEngine-03, #219 |
| Biome coherence |  | ✅ | ✅ | Regions are coherent, not checkerboard | #261, BiomeSelector |
| Bridge placement correctness | ✅ | ✅ | ✅ | Bridges span bank-to-bank, never start/end in water | #264 |
| Water collision regression | ✅ | ✅ | ✅ | Manually injected water blocks player if intended | #266 |
| Lock/key/quiz-gate DAG |  | ✅ | ✅ | No lock before accessible key/knowledge path | WorldEngine-05 |
| Dead-end rewards |  | ✅ | ✅ | Dead ends have reward or purpose | WorldEngine-05 |

## Rendering / visuals

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Orthographic isometric world render | ✅ | ✅ | ✅ | Camera locked to intended isometric view | Iso docs, #214 |
| Base terrain no stretch/seams | ✅ | ✅ | ✅ | Visual scene: grass/dirt/water looks coherent | #215, #262 |
| Positive-Z barriers | ✅ | ✅ | ✅ | Fence/gate/tall grass scene | #216 |
| Extruded walls | ✅ | ✅ | ✅ | Wall perimeter/corner scene no voids | #217, #246 |
| Negative-Z rivers | ✅ | ✅ | ✅ | River visibly below terrain; joins correct | #218, #263 |
| Bridge over river | ✅ | ✅ | ✅ | Player crosses bridge; water remains blocked otherwise | #223, #264 |
| Player occlusion | ✅ | ✅ | ✅ | Solid walls hide; fences show through gaps | #220 |
| Player sink | ✅ | ✅ | ✅ | Feet/body offset in negative-Z channel | #221 |
| Shadows/rim lighting |  | ✅ | ✅ | Scene proof with time/sun angle | #222 |
| Roof/structure assemblies |  | ✅ | ✅ | Homestead scene; roof/wall/foundation coherent | #224, #275, #277 |
| Normal generated startup scene | ✅ | ✅ | ✅ | Generated, not curated, visual smoke | #277 |
| Final integration scene |  | ✅ | ✅ | All nano kinds + player + walkability + perf | #226, #258 |
| VisualTestSuite script |  | ✅ | ✅ | `npm run visual-test` exists and fails on regression | #255 |

## Gameplay systems

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Player movement/collision | ✅ | ✅ | ✅ | Move around structures; no unnatural gap/clipping | addendum, #180 |
| Interact key dispatch | ✅ | ✅ | ✅ | NPC/chest/sign/gate interactions work | mechanics.ts |
| Inventory/items |  | ✅ | ✅ | Collect/use keys, coins, tools, consumables | game bible, inventory code |
| Chests/rewards |  | ✅ | ✅ | Open chest, persist resolved state | mechanics/save |
| NPC dialog |  | ✅ | ✅ | Dialog opens/advances/closes, with fallback lines | npc config, llm npc |
| Shops/trading/barter |  | ✅ | ✅ | Buy/sell/trade and barter quiz | #112, trading code |
| Quiz gates | ✅ | ✅ | ✅ | Quiz unlock changes logical walkability and persists | #223, #256 |
| Wildlife interactions |  | ✅ | ✅ | Discover animal, fact/dialog, optional quiz bias | wildlife tests |
| Survival/status |  | ✅ | ✅ | Energy/hydration/cleanliness debuffs and UI | #131, #138 |
| Injury/hygiene/illness |  | ✅ | ✅ | Injury quiz, hygiene, stream/worm/diarrhea flows | #109, #110, #133 |
| Cosmetics/customization |  | ✅ | ✅ | Customizer and unlocks persist | #116, cosmetics code |

## Education/content

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Content pack manifest loader |  | ✅ | ✅ | Manifest/shards load; fallback works | content-loader.ts |
| Manifest is source of truth |  | ✅ | ✅ | Counts derived from manifest, not prose | content docs drift |
| Subject selection |  | ✅ | ✅ | New-game subjects bias quizzes/book | Book docs/code |
| Age profile |  | ✅ | ✅ | Age-band filters content | #92 lineage, age-profile |
| Quiz engine | ✅ | ✅ | ✅ | Multiple choice, difficulty, rewards | quiz code |
| Quiz accessibility |  | ✅ | ✅ | Auto-read/repeat/numeric keys | #94 |
| Book of Knowledge |  | ✅ | ✅ | Browse/search/open related articles | #7, book code |
| Word bag |  | ✅ | ✅ | Save term, lookup, discovery points | Grokipedia doc/code |
| `I don't know` learning path |  | ✅ | ✅ | Opens related article/book, no punitive count | main quiz handling |
| Source ingestion pipeline |  |  | ✅ | Public source → normalized packs | #96 |
| Rephrase/quality gates |  |  | ✅ | Age/safety/QA report | #91 |
| Automated content refresh |  |  | ✅ | CI/manual review gate | #95 |
| Free-response math |  |  | ✅/Defer | Solver-backed validation if retained | #93 |

## UI/UX

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| DOM HUD/sidebar |  | ✅ | ✅ | Status/inventory/minimap readable | ui modules, #138 |
| Menus/save slots/options |  | ✅ | ✅ | New/load/pause/settings flows | main/menu code |
| Quiz/dialog/trade overlays | ✅ | ✅ | ✅ | Modal priority works | main.ts, ui overlays |
| Book overlay |  | ✅ | ✅ | Search/browse/word bag tabs | knowledge code |
| Tutorial |  | ✅ | ✅ | Startup/replay tutorial | #186 |
| Audio UI/cassette |  | ✅ | ✅ | Music popup/tape personality preserved or revised | #107, #138 |
| Thought bubbles/history |  | ✅ | ✅ | Bubbles show/hide/replay | #135 |
| Bug report/debug UI |  | ✅ | ✅ | Snapshot/debug report path | bug-report code |

## Audio

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Music playback |  | ✅ | ✅ | Tracks play/mute/advance | #107, #191 |
| MIDI/SoundFont or replacement |  | ✅ | ✅ | Decide preserve vs replace, no regression | music code |
| SFX one-shots |  | ✅ | ✅ | UI/pickup/gate/wall sounds | sfx config/code |
| Sampled SFX assets |  | ✅ | ✅ | Manifest loads; no synthetic hiss | #108, #147 |
| Positional audio |  | ✅ | ✅ | Campfire/water/ambience listener updates | #108 |
| Full mute correctness |  | ✅ | ✅ | No audio when muted/test mode | audio tests/issues |
| NPC voice |  | ✅/Defer | ✅ | Speech synthesis toggle and test-mode off | npc-voice code |

## Validation/tooling

| Requirement | Spike | Parity | Full vision | Evidence / acceptance | Source refs |
|---|---:|---:|---:|---|---|
| Typecheck |  | ✅ | ✅ | `npx tsc --noEmit` | repo standards |
| Unit/property tests | ✅ | ✅ | ✅ | Pure solver tests without browser where possible | clean-branch addition |
| Playwright integration |  | ✅ | ✅ | Core browser flows | tests/ |
| Visual regression | ✅ | ✅ | ✅ | Canonical scenes/goldens | #255 |
| Perf artifact |  | ✅ | ✅ | 100-frame JSON / thresholds | #183, #258 |
| GitHub issue evidence |  | ✅ | ✅ | Screenshots/commits linked to issues | #214 rules |

## Explicit cut/defer decisions needed

These are not recommendations to cut; they are decisions to make before rebuild scope locks:

| Area | Default recommendation | Why decision needed |
|---|---|---|
| Tesla mode | Preserve for parity unless user deprioritizes | Current code/docs support it, but it's niche. |
| Diarrhea/poop chain | Preserve if “full current alpha” means exact parity | Distinctive but scope-heavy. |
| NPC voice | Defer if spike/parity needs focus | Browser speech is peripheral. |
| MIDIocre exact backend | Preserve audio identity, not necessarily exact library | Three.js branch can reuse or simplify. |
| Full content ingestion pipeline | Defer beyond current alpha parity | Needed for full vision, not initial renderer proof. |
| Free-response math | Defer pending #93 | Valuable but not central to renderer/world proof. |
