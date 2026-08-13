# Contradictions

Recovered sources do not agree. This file lists the fights. It does **not**
average them into a third ontology.

`AGENTS.md` already settles some. Those are marked **settled by current
law**. The rest are either **dilution** (later docs cleaned away
fidelity — prefer the earlier / owner-playtest reading) or **forks**
the owner should pick (at most a few).

A later session implements `GAME.md` / `ENGINE.md` / `ISO.md`, which
already take the settled and diluted sides. They do not silently invent
a compromise.

---

## Settled by current law (`AGENTS.md` + owner playtest)

### S1 — Iso is not “paint only”

| Side | Claim | Where |
|------|--------|--------|
| A | Isometric is a reversible draw trick. Simulation must not know about Z. Nano walk/occupancy is a renderer concern. | `Docs/01` Pillar 7; `Docs/02` entire keystone |
| B | Iso2 exists so height, materials, occupancy, gates, sink, and assemblies are *real venues*. Not a second physics. Not emoji shops. | IsoRenderingPlanV2.1; WorldEngine-01 nano tier; #214; #223; `AGENTS.md` |

**Pick:** B. `Docs/02` was a slogan against dual physics. It deleted
Iso2’s reason to exist. The rewrite owns **one** walk fact that
includes nano occupancy (`ENGINE.md` §2.2, §3; `ISO.md` §2).

### S2 — Home is not an exam

| Side | Claim | Where |
|------|--------|--------|
| A | Quiz gates are the preferred obstacle; generation may stamp them on any functional opening, including the homestead south gate. | WorldEngine-05; 2026-07 critical-path / scene-first memos |
| B | Starter homestead exit is a place opening. Teaching quizzes live elsewhere and have an NPC face. | Owner playtest 2026-07-20 |

**Pick:** B. Recorded in `GAME.md` §2.1 and §4.2.

### S3 — Closed issue ≠ intended-and-shipped

| Side | Claim | Where |
|------|--------|--------|
| A | #3 children, #42, #98, #99, #151, #179, #180, #214 subs, geometry A–D, Playwright green → done. | GitHub state_reason=completed; campaign memos |
| B | Owner still cannot walk around a fence. Correct quiz did not open a gate. | `AGENTS.md`; playtest 2026-07-20; #214 voiding #194–#213 |

**Pick:** B. This file and `GITHUB-EPICS.md` harvest closed issues as
*intent*, never as proof.

### S4 — Amy’s Game is not this rewrite

Independent sibling. Not a replacement, not a reason to stop.

### S5 — Visual LLM looking at screenshots is a weak oracle

Kept as a *tool after* rewrite, not as a reason to keep the current
tree.

---

## Dilution (prefer the earlier / more specific source)

These are not owner forks. Later “organized” docs lost color. Living
files already follow the richer side.

### D1 — Session end beat

- Bible: treasure room after 10–20 tiles, final quiz, new seed.
- `Docs/01`: same loop, vaguer “treasure of this area,” then a new area.
- Place-coherence memos: homestead chapter → another intentional place.

**Reading used:** short chapter that *resolves* (open, reward, leave).
Treasure room remains a valid chapter, not the only one. If the owner
wants every session to climax in a named treasure room, that is Fork A.

### D2 — Quizzes optional vs quizzes as the usual gate

- Bible: quizzes “optional for paths, mandatory for rewards.”
- `Docs/07` / WorldEngine-05: quiz gates are the preferred critical-path
  obstacle because they cannot softlock.

**Reading used:** teaching gates on the path *after home* may be quizzes;
rewards may require a quiz; home does not; silent path-quizzes without a
person are wrong.

### D3 — LLM required vs LLM fallback

- Entropy addendum + Bible: fallback RNG if inference > 1–2 s.
- PoC addendum: “Always require LLM… no pre-generated content.”

**Reading used:** fallback exists. Offline / slow machine still plays.
LLM is preferred entropy, never the rules engine.

### D4 — Grid-snapped steps vs Zelda motion

- Addendum DoD: center on a micro; 200 ms stepped animation.
- Same addendum: “near” approaches, no wide berths; Bible reads as
  continuous Zelda-like walk.

**Reading used:** logical occupancy is cell + nano patches; motion may
be smooth; hitboxes stay tight. Stepped vs smooth is feel, not grammar.
(If the owner cares, Fork C.)

### D5 — World size

- Bible: 1024×1024 with optional wrap.
- WorldEngine / later: streaming infinite, generate on approach.

**Reading used:** streaming infinite with deterministic coordinates.
1024×1024 was a first bound, not a ceiling.

### D6 — Chunk 32×32 vs macro 25×25

WorldEngine-01 §4.4 lists options A–D and refuses to pick.

**Reading used:** macros are a generation-time chapter (25×25 idea).
Paint/page size may differ. Do not worship 32.

### D7 — Tile / diamond size

| Source | Number |
|--------|--------|
| Bible | 128×128 px cells (pre-iso density talk) |
| Iso PoC / #3 | 64×32 diamond |
| Visual Mapping / WorldEngine micro | 32×32 source → 64×32 iso |
| Iso2 V2.1 | 128×128 logical → 256×128 diamond |
| 2026-07 freeze | FOV 128×64 unchallengeable |

**Reading used:** pick one 2:1 diamond and keep it. Numbers are not
identity. Owner may still want a visual density pick — Fork B.

Owner Copilot Chat 2026-04-30 explicitly asked to consider **128→144**
so a nano is a clean **48×48×48** (no 42.666…). That is the strongest
*reason* attached to any of these numbers. Still a camera/art pick,
not grammar.

### D8 — Orthogonal-only vs later diagonals

Visual Mapping / #6: no diagonals in MVP.
Iso2 variants mention diagonal-left / diagonal-right for *paint*
connectivity.

**Reading used:** MVP movement and contracts are orthogonal. Painted
chain variants may include corners that are still orthogonal in walk.

### D9 — Emoji prototype vs material venues

Bible / #77: shop is 🏪.
#99 / Iso2 / playtest: homestead, cart yard, inn as compounds.

**Reading used:** venues. Emoji was scaffolding.

### D13 — Fog of war default

- Bible: unvisited cells grayed; reveal on enter.
- #131 (owner playtest epic): FoW **off by default**.

**Reading used:** FoW is optional; first session sees the meadow (#131).

### D14 — Random injury vs event injury

- #109: 5–10% chance on bumping obstacles.
- #131: remove random bandaid injuries; injuries from explicit hazards.

**Reading used:** #131 (later, playtest). Deterministic and funny.

### D10 — Survival

Absent from the Bible core loop. #70 / #109 / #110 specify a funny
non-lethal side loop. `Docs/01` says not gritty.

**Reading used:** secondary, after the session loop works. Never blocks
progress.

### D11 — “No static fallback” vs bundled Book

Addendum: no pre-generated content.
Book spec: bundle 50–100 articles per subject offline.

**Reading used:** world *structure* may be generated; educational
*facts* are curated packs. Entropy LLM ≠ content LLM (#8).

### D12 — Docs/01–13 vs archives

`Docs/01–13` are a cleaned restatement. They promoted flat-sim slogan,
dropped nano as grammar, and baked “no speculative rewrites” into
`Docs/13`. Archives + issues + playtest have more fidelity.

**Reading used:** scavenge `Docs/01–13` for pillars 1–6 and education
clarity; do not obey 7 / 13 freezes.

---

## Unresolved forks (owner; at most these)

Living files made a default so harvest can continue. Say if a default
is wrong.

### Fork A — What ends a 5–15 minute session?

1. **Bible:** hit a treasure room after a handful of tiles, final quiz,
   payout, new seed next time.
2. **Place chapter (default in `GAME.md`):** leave home, resolve *one*
   other intentional place (cart, inn, bridge, gated wall, or treasure),
   save. Treasure room is one kind of place, not the only climax.

This changes generation pacing and HUD (“you did it” beat).

### Fork B — How big is a diamond on screen?

1. **PoC / WorldEngine micro:** 64×32 class toys, 32×32 sources.
2. **Iso2 reboot:** 256×128 class ground, taller nanos, cathedral scale.

This changes art, camera, and how big the homestead reads. It does not
change the grammar. Default in `ISO.md`: pick one 2:1 ratio; prefer
Iso2’s denser materials *look* once contact works, but do not lock FOV.

### Fork C — Stepped grid or smooth walk?

1. Addendum: tile-centered steps, 200 ms.
2. Zelda-smooth feet with the same occupancy map (default).

Contact (“near the fence”) is required either way.

**Do not wait on these to keep harvesting or, later, to build the
homestead + one gate loop.** They change flavor and camera, not the
softlock law.

---

### D15 — Later agents shrank the session

July 2026 memos restated the game as one yard gate, called 5–15 minutes
aspirational, or treated boot + coins as success. That is **not** a
source of product law. `GAME.md` §2.3 forbids repeating it.

### D17 — Troll-bridge: locked toll vs always-walkable deck

- #208 (closed): troll-bridge is `conditional`; U-key / quiz unlocks;
  walk priority puts locked conditional above `always`.
- #223 body + first real comment: `troll-bridge` and `bridge` are
  **always-walkable** traversal; the **gate** is the lock; quiz UI
  unlock was never done.

**Reading used:** the *deck* is always walkable (Iso2 / #223). A troll
is an **NPC at the crossing**, not missing planks. If a toll exists, it
is a person / gate, not an invisible floor hole. #208’s locked floor is
the failed “math to walk on wood” pattern.

### D18 — Fog of war: explore gray vs default off vs night mystery

- Bible: unvisited gray.
- #139 / #131: FoW **off** by default.
- #114: night FoW + desaturation + glowing eyes as *night* mystery.

**Reading used:** daytime FoW optional, default off. Night darkness +
flashlight/bonfire is a different system (local light), not the same
toggle.

### D19 — Day length

- Early #57 comment: ~2 minutes real-time for a full 8-phase cycle
  (7200 frames) — unplayably fast (owner later said so).
- #136 / #131: **12 game hours per 1 real hour**, persist played hours.

**Reading used:** #136.

### D20 — Homestead assembly south quiz vs home-is-not-exam

#209 `homestead-small` stamps `conditionId='quiz:homestead-gate'` on
the south gate. Owner playtest (S2) forbids that. Assembly recipe must
use interact-open at spawn.

### D22 — Collect animals as pets vs pet them in the yard

#57: collect animals as inventory buffs.
#25 / #142: cats (and yard chickens) live in the world; you pet them.

**Reading used:** ambient creatures you can pet. No capture economy
unless the owner asks for one.

### D23 — “Game over on depletion”

#131’s close comment lists “game over on depletion” as done.
Every earlier and later owner source says **no game over**.

**Reading used:** no game over. That closer is agent checklist rot.

### D24 — Homestead hut walkable=always

#209 demo: hut nano `walkable='always'` so the child walks *through*
the cottage. Playtest wants approachable faces, not a pass-through
sticker.

**Reading used:** the cottage occupies its patches. You walk *up to*
the door, not through the walls.

### D25 — Closed farm with no gate

#57: closed farm, full fence, animals visible as tease.
“No barrier without function” forbids a beautiful prison.

**Reading used:** a tease farm is allowed only if there is a planned
way around or a later opening. Never a boxed-in child.

### D21 — Emoji library vs phase-out vs materials

#58 added 30+ emoji structures/animals. #115 is “phase out emoji.”
Iso2 / Nano-3D want purpose-built materials. Emoji is bootstrap.

### D16 — Micro boolean walk vs nano footprint

Addendum: walk is a boolean per micro, tighter visual hitboxes.
Iso2 integration: walls are a *strip*; the child should occupy the
empty ninths of a wall cell. PlayerAnchor admits micro-only walk is
why she cannot hug a fence.

**Reading used:** one occupancy that includes nano patches
(`ENGINE.md` §3). Settled by S1.

## Implementation fights that are not product forks

Do not ask the owner these. They are rewrite choices, or already
repealed.

- WASM core vs Canvas TS (deferred; not identity).
- BitNet-in-page vs local server vs remote OpenAI-compatible (client
  is configurable; rules stay in code).
- AC-3 vs any other contract solver.
- Macro-aligned chunks vs overlay macros.
- Whether to keep `experiment/isometric-2.0` as a tree (historical;
  not the target).
- God-file decomposition / folder layers as a moral good (#247).
- Three.js (rejected).

---

## Source-trust ranking (when they fight)

1. Owner playtest notes and `AGENTS.md` stance.
2. Open master epics #2, #3, #4, #6, #214 in their *bodies* (intent),
   not their checkbox state.
3. `archived-planning/` Game Bible, Iso PoC, addendum, entropy, Book.
4. WorldEngine 00–05 and Visual Mapping (grammar).
5. Iso2 plans + FirstFeedback (look and contact).
6. Individual closed issues (intent of a feature, often over-closed).
7. `Docs/01–13` (cleaned; good at pillars 1–6, bad at iso/freeze).
8. `memories/repo/` campaign memos (what agents thought; often wrong).
9. `src/` and tests (crime scene).
