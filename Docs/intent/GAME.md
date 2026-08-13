# The intended game

This is recovered product intent for Emily’s Game. It is written so a later
session can build the *game* without opening `src/` or treating a green
test suite as playtest.

Citations are historical sources. They are not living law. Where sources
disagree, see `CONTRADICTIONS.md`. Where `AGENTS.md` already picks a side,
that pick is noted here.

---

## 1. Who it is for

Emily’s Game is a browser adventure built for the owner’s daughters: a
child playing a short session, learning while she plays.

The GitHub repo description is owner voice:

> This is a game made for my girls to learn while they play, and also to
> demo some fun coding concepts
>
> — [putersdcat/EmilysGame](https://github.com/putersdcat/EmilysGame)

The Game Bible names the same audience and the same session shape:

> It’s designed for educational fun, aimed at a child (your daughter),
> with quizzes integrated into gameplay. … Session Length: Short,
> engaging plays (5-15 minutes), with persistence for revisits.
>
> — `archived-planning/NewGame_GameBible_StartHere.md`, Overview

The cleaned 2026-07 restatement kept the audience and made failure law:

> Failure must never feel punishing. Getting a quiz question wrong should
> cost a little momentum, never progress. There is no game over.
>
> — `Docs/01-Game-Vision-and-Design-Pillars.md` §2

Practical consequences that survive every later rewrite:

- One child, one session, one save. Not multiplayer.
- Controls: WASD / arrows to move, one button (Space / Enter) to interact,
  Esc to pause. Touch controls exist because non-technical first-time
  players (including Emily) did not know how to move (#186).
- Text is short. Feedback is immediate (sound, particles, toast).
- The game never stops being a game so a “quiz mode” can happen.

---

## 2. What a session is

A satisfying session is **5–15 minutes** that feels complete: spawn,
walk somewhere that looks like a place, meet a person or a real obstacle,
learn or fetch what opens it, pass through, get a reward, and either
stop (save) or walk into the next intentional place.

The Bible’s original beat list:

1. Start: LLM verb/noun list seeds the world. Player spawns in the center
   of the first tile.
2. Explore in isometric view. Crossing a tile edge generates the next
   chunk.
3. Collect coins scattered by hash density.
4. Hit interchangeable obstacle templates (door/key, toll/coins,
   barricade/crowbar, river/bridge). Solvable in-tile or nearby.
5. Talk to NPCs (2–3 turn chats or quizzes). Buy from shops.
6. Reach a “treasure room” after 10–20 tiles; final quiz for payout.
   Restart with a new seed, or come back via save.

— `archived-planning/NewGame_GameBible_StartHere.md`, Game Mechanics /
  Core Loop; also GitHub #2

The later cleaned restatement compressed that into one sentence the owner
still recognizes:

```
Explore → Collect → Hit an obstacle → Solve it (usually: answer a
question, sometimes: find a key/item) → Obstacle opens, reward given →
Meet an NPC (chat, trade, or another small quiz) → Reach the "treasure"
of this area → Move into a new area
```

— `Docs/01-Game-Vision-and-Design-Pillars.md` §3

That loop **is** the game. There is no separate story mode, no overworld
map screen, no menu-driven exam.

### 2.1 Spawn is a home, not a void

Later design (themed structures + place-coherence + owner playtest) moved
the spawn from “center of first meadow tile” to a **starter homestead**:
fence, gate, yard, cottage. The child should be able to walk around her
own house, approach the south and west faces, and leave the yard.

Owner playtest, 2026-07-20 (this is product law, not a campaign memo):

- The south gate of the homestead should actually close the yard (no free
  dirt walk-around). That part was wanted.
- **Leaving home is not an exam.** The starter homestead exit is a place
  opening (interact to open the door / gate), not “solve math to leave
  the yard.”
- Teaching / progression gates *elsewhere* may use a quiz, and when they
  do, **an NPC is asking**. A silent fence-gap quiz with no person is
  wrong fiction and wrong UX.
- The cottage must look like one house you can walk up to, not a rubble
  of foundation blocks.

— `memories/repo/playtest-findings-after-critical-path-2026-07-20.md`

### 2.2 What “complete” means in 5–15 minutes

Combine the Bible and the later place language without inventing a third
loop:

- The child leaves home (no quiz).
- She walks to **another intentional place** (seller cart, inn, river
  crossing, gated wall, treasure pocket) — not a random emoji scatter.
- She is blocked by something she can understand (a person, a locked
  gate, a river, a toll).
- She solves it by playing: talk, look up a word, answer, pay, or use an
  item that was reachable.
- If she answers wrong, she is not locked out. She can try again or open
  the Book.
- She gets a reward (coins, item, opened place, treasure).
- She can stop. The save remembers where she was and what she opened.

The Bible’s “treasure room after 10–20 tiles, then new seed” is the
*early* end-of-session beat. Later sources treat each **macro / place**
as a chapter. Both are the same promise: a short visit that resolves.

Unresolved: whether every session must end in a named treasure room, or
whether “opened the inn / crossed the troll-bridge / filled the word
bag” is enough. See `CONTRADICTIONS.md` Fork A.

### 2.3 Do not shrink the session again

From mid-July 2026, agents restated “the game” as *spawn → one yard
gate → leave*. Play-kernel even called 5–15 minutes “aspirational.”
Playable-session recovery made the quiz **optional** and treated boot +
coins as success.

That shrink is **agent triage, not owner intent.** The Bible-scale
session (collect, person, Book, chapter reward, save) still stands.
The smallest *honest first build* is homestead + one other place + one
teaching gate that opens (`GAME.md` §13). It is a slice of the session,
not a replacement for it.

WorldEngine-05’s distance table already agrees with home-is-not-an-exam:
at spawn (distance 0) biome is meadow, quiz is tutorial-if-any, **lock
density is none**, loot is welcoming.

A later “Next-Engine” note states the feel that patching never delivered:

> World is divided into coherent macro “playable sections”. You explore,
> hit natural chokepoints … Not free-roam infinite flatland.
>
> — `Docs/archive-2026-07-14/Next-Engine-And-Gameplay-Plan.md` §1

---

## 3. Places (not stamps, not emoji shops)

A place is a **recognizable compound with a job**: you can see what it
is, walk its apron, go in or around it, and do the thing it is for.

Named places in the sources:

| Place | Job | Sources |
|-------|-----|---------|
| Starter homestead / farmhouse | Home. Fence + gate + inner yard + cottage. Spawn. Leave without a quiz. Approach all faces. Yard animals (chickens, pigs) are scenery, not blockers. South gate is interact-open, not a quiz (#209 stamp was wrong). | #99, #57; playtest 2026-07-20 |
| Seller cart yard | Merchant-centric small compound. Trade. | #99 |
| Inn compound | Larger social hub. Rest / talk / maybe stay. | #99 |
| Shop | Trading panel with a traveling merchant. | #77, #58 |
| Campfire | Rest. Restore warmth / energy. Cozy message. | #77 |
| House / hut | Flavor, shelter, later maybe sleep. Not rubble. | #77; playtest |
| Outhouse | Hygiene recovery + wash-hands quiz. Funny, not gross-out punishment. | #110 |
| Stream / river | Cross on a bridge. Optionally drink (free, small diarrhea risk). | Bible river/bridge; #110 |
| Gate in a fence or wall | Functional opening. Quiz or key **if** it is a teaching gate; interact-open if it is home. | #223; playtest |
| Troll-bridge | Crossing that is always walkable as a deck, with teaching attached as a person / quiz, not as “the planks are missing until you do math.” | #223; IsoRenderingPlanV2.1 § walkable |
| Treasure room / chest pocket | End-of-sequence reward. Accessible from one direction. | Bible; WorldEngine-01 specialized family |
| Cathedral / tall structure | Later Iso2 venue: Z-height as a real building you can stand in front of, walk around, and be occluded by — not a sticker. | #214; IsoRenderingPlanV2.1 |

WorldEngine said this more formally: a **macro tile tells a local
story** — enter from the west through a meadow, hit a river, cross a
bridge, pass a gate, reach a clearing with a chest. That entire sequence
is one chapter.

— `Docs/archive-2026-07-14/WorldEngine-01-SpatialHierarchy.md` §3.4.1

Named places are **recipes stamped whole**, not AC-3 improvising a
house cell by cell. Entropy/macro may say “homestead here, gate south.”
A composite assembly lays the footprint atomically. After the stamp,
the interior is opaque to the generic filler. That is also how you get
a pond instead of a water lattice.

— WorldEngine-03 §6.7; `ARCHITECTURE.md` §6; Nano-3D inventory §9–11

**No barrier without function.** A fence that makes a yard must have a
declared opening (interact-open at home; teaching gate or locked door
elsewhere). A hole in a fence run is a **defect to seal with fence**,
not a pop-up exam booth. Mid-line quiz gates with free roam on both
sides were a 2026-07 product bug (place-coherence over-seal).

Every bounded sector needs at least one planned exit so the generator
does not make “beautiful prison cells.”

— Nano-3D inventory §10.3; critical-path scene-law clarification

A place is not:

- A single emoji (🏪, 🏠) dropped on grass.
- A 5×5 stamp with no apron, so you cannot stand at the door.
- A fence that looks closed and isn’t, or looks open and isn’t.
- A “9×9 homestead” that still paints the same tiny cottage plus junk
  foundation (owner rejected this in playtest).
- Free-roam flatland with optional quizzes you walk around.

---

## 4. Barriers with function

The world is allowed — required — to block the child. That tension *is*
the game. Every blocker is something she can overcome by playing.

The Bible’s interchangeable templates:

- **Door / key**
- **Toll / coins**
- **Barricade / crowbar**
- **River / bridge**

— `archived-planning/NewGame_GameBible_StartHere.md`, Core Loop;
  GitHub #2

WorldEngine added the educational and social forms of the same idea:

- **Quiz gate** — passage needs a correct answer. Book of Knowledge is
  the study tool. Unlimited retries. Wrong answer costs a moment, not
  the run.
- **NPC gatekeeper** — a person blocks the path and steps aside after
  talk, trade, or quiz. Same function as a quiz gate, with a face.

— `Docs/archive-2026-07-14/WorldEngine-05-PopulationAndProgression.md` §2.1

Iso2 named the *physical* forms those functions ride on:

- Fence / stone wall: never walkable.
- Gate: conditional (locked = blocked, unlocked = passable).
- Bridge / troll-bridge: the crossing itself is walkable.

— GitHub #223; `Docs/archive-2026-07-14/IsoRenderingPlanV2.1.md`

### 4.1 Softlock law

Every lock is solvable when she meets it. The key (item, coins, or a
learnable answer) is reachable *before* the lock. No cycles. No “the
crowbar is behind the barricade.”

— GitHub #98; WorldEngine-05 §3 and §7 Guarantee 1

A quiz can never softlock: it is always retriable, and “I don’t know”
routes to the Book instead of failing the child.

— `Docs/07-Education-and-Knowledge-System.md` §2; `Docs/01` Pillar 1

### 4.2 Owner corrections that later agents ignored

1. **Home exit is not a quiz gate.**
2. **A quiz has a speaker.** Prefer an NPC (or an explicit tutor prop).
   Owner vision for the quiz UI: a headshot of the person asking, mouth
   flapping while they talk (South Park Canadian flap). Not a bare modal
   over a fence cell.
3. **A correct answer must open the thing.** 2026-07-20 playtest: she
   answered; the gate stayed shut. That is a broken promise, not a
   polish bug.

— `memories/repo/playtest-findings-after-critical-path-2026-07-20.md`

---

## 5. Education is how you progress

Education is not a bolted modal over a broken world. Answering, looking
up a word, and reading a short article **are** how you open places.

### 5.1 New-game choices

At new game (not on load):

- **Subjects** (skip-able): Math, Language (German/English), History,
  Science, Technology, later **Geography** and **Art** (#119). 3–5
  selections bias quizzes (~70% chosen / 2× weight, 30% variety).
  Custom topic text is allowed (“Dinosaurs”) if an LLM is up.
- **Age band:** Explorer 5–7, Adventurer 8–10, Scholar 11–12+ (#92).
  Sparse pools fall back; they never go empty.

— `archived-planning/Grokipedia_Book_of_Knowledge.md`; GitHub #7, #8, #87/#92

### 5.2 Quizzes

- 1–3 questions. Multiple choice, 3–4 options, plus **“I don’t know.”**
- Types: math word problems, science, history/geography, language /
  spelling, logic / riddles. Later: wound-care, wash-hands, “is it safe
  to eat insects?” — education attached to the survival-lite toys.
- **Verification is code, never the LLM.** Math is evaluated. Strings
  are matched. The LLM may only rephrase an already-correct item in the
  speaker’s voice (“as wise owl, rhyme this…”).
- Library size in the Bible: 100–500 Q&A. A later closed PR claimed 420
  questions and 31 articles (#8 / PR #106). Treat those counts as a
  *content target*, not as proof the shipped tree is good.
- Difficulty follows distance from spawn and **streak**: correct answers
  raise the ceiling; ~3 wrong in a row *softens* until 2 right (#103).
  **“I don’t know” does not ding the streak.** It opens the Book. A
  “retry after you read” beat was specified and never built — still
  intended (#7 leftover).
- 50% of quizzes should be solvable without the Book (basics). 50%
  should introduce something new and point at the Book.

— Bible, Educational Quizzes; Book spec; `Docs/07`; WorldEngine-05 §3.5

### 5.3 Book of Knowledge

A magical book in inventory (hotkey B). Searchable. Offline-first JSON,
about 50–100 short articles per subject, rewritten for a 12-year-old
(roughly 200–500 words). Reading is paginated, highlighted for saved
words, and tracked.

“I don’t know” should open the **article for that question’s subject**,
not a generic search that might miss.

Every quiz item must have a Book article. That is the “world is
learnable” pillar, checkable as data integrity.

— Book spec; `Docs/07` §3–4; WorldEngine-05 Guarantee 5

### 5.4 Word bag

A pouch for unfamiliar terms from quizzes and chats. Save a bold word.
Look it up in the Book. Using it later to answer correctly pays extra
coins. This turns “I don’t know this word” into a verb.

— Book spec §4; GitHub #7

### 5.5 Content pipeline (offline)

Knowledge capture is **not** the play LLM. Entropy LLM and authoring LLM
are separate. Human review stays mandatory for educational / safety
content. Age-banded packs, early-reader a11y (auto-read, repeat, 1-2-3
keys), CI review gates.

— GitHub #8 and children #88–#96; `archived-planning/Knowledge_Capture_Automation.md`

---

## 5.6 Wildlife, cats, and the living meadow

Owner, unfiltered (#25):

> I want to see some random npc cats that you can pet and they purr
>
> No more floating giant mushrooms, mushrooms should be tiny, you could
> paint 3 on a micro tile, and they don't need shadow, shadow is for
> huge tall trees

#142 makes cats first-class: orange, black, fluffy gray Persian.
They roam, sit, groom (sparkles), sprint. They do not walk through
walls. Space near a cat is pet / inspect, then a species fact — education
without a gate.

#68: wildlife changes with day / dusk / night. Water-adjacent frogs,
turtles, ducks, heron, fish. Deterministic from seed. Inspect / pet /
quiz hooks. Discovery unlocks cosmetics (#66: frost hair after 5 species).
Night animals can be **glowing eyes** until the flashlight hits them
(#114).

#57 homestead yards spawn chickens, chicks, pigs — low density, animated.
A closed farm (fence, no gate) is a **tease**, not a softlock.

This is texture between obstacles. It is not a second game. Density must
stay toy-like (#131 / #134: butterflies were too many).

## 6. NPCs, shops, and talk

NPCs spawn from hash / anchors, not from a chat overlay.

Kinds (WorldEngine-05 §2 and §4):

- **Merchants** — at route junctions, biome inventory, one per region.
- **Villagers** — hints, lore, short talk. Never more than one per world
  unit. Need clearance so they do not plug a corridor.
- **Guardians** — at teaching gates. Harder quiz or required item.
- **Gatekeepers** — the face of a quiz gate.

Personas are biome-colored (meadow farmer / beekeeper; forest hermit /
ranger; cave miner; castle knight / librarian / ghost). The LLM wraps
flavor. Chat is 1–3 turns, 50–100 character player input. Keywords feed
the entropy pool.

Shops are **places with personalities**, not one 🏪 (#112, #72, #99):

- General store — wide inventory (food, soap, tools, bandaids).
- Snack stand — cheap food/drink, cheerful vendor.
- Trading post / seller cart — barter found things (mushrooms → key).
- Buy **and** sell (sell-back ~60%). Tab toggles mode.
- Optional barter quiz (“is this worth 3 coins?”) — education in the
  shop, 10% discount if she is right.

Trade flow: greet → quiz if that person teaches → then the counter.
Never race the quiz modal.

Campfires / bonfires rest and, at night, **light a pocket of world**
(#67, #81). Houses have flavor until they are real interiors.

When anyone talks — NPC dialog **or** quiz — a mouth flaps
(Terrence & Philip / South Park Canadian). #113 wired NPC mouths;
playtest 2026-07-20 asked the same for the quiz portrait. Same fiction.

---

## 7. Survival-lite (secondary, funny, never lethal)

The Bible does not lead with survival. Later issues add a **side**
pressure loop that must not override explore / quiz:

- Injury (“ouch meter”), hunger / thirst, hygiene.
- Debuffs only: slower walk, blurry screen when thirsty, flies when
  dirty, a silly waddle. **No death. No game over.**
- Recovery is in the world: bandage + wound-care quiz, snack / bottle,
  outhouse + wash-hands quiz, stream drink, campfire rest.
- Desperation toys (“eat worms?”) exist to teach, not to punish.
- **Injuries are event-driven**, not random ticks: bump a cactus / rock
  hazard, not a dice roll while walking (#131). Explainable.
- Daylight is slow enough to feel like a day inside a short session:
  **12 game hours per 1 real hour** (12:1), persisted (#136). An early
  2-minute day cycle was too fast. Pause / Book / quiz **does not**
  advance the clock.
- Night is play, not a filter: flashlight (`F`) cone follows facing;
  bonfires flicker and reveal a pocket; the world desaturates; eyes
  glow until the beam hits them (#67, #114). No battery sim.
- Stream over-drink: funny illness beat with a brief control lock — a
  joke, not a wipe.

— GitHub #70, #109, #110, #131; `Docs/01` §5 “not realistic or gritty”

If survival ever makes the child unable to reach a quiz or a door, it
has violated Pillar 1.

---

## 8. Onboarding

Owner, Copilot Chat (the first Emily playtest, in his words):

> Early feedback is in from Emily testing the alpha, 1. It was the
> build with the horked sound, so she could not play it for more than
> 2min. But 2. And most importantly, she had no idea how to move the
> character on screen, as she has not really used a computer much and
> has no idea about “wasd” controls or arrow keys…

First-run tutorial (#186), as he specified it:

- Teach arrows and WASD by requiring a press.
- Teach the action key and flashlight.
- Touch: on-screen pad + action.
- Mini maze + 3 pickups, then “Ready to play?”
- Optional spoken narration (Web Speech) + captions.
- Replay / don’t-show-again in settings.

The tutorial uses the **same** input path as the real game. It is not a
second movement system.

Startup is a **menu**, not a drop-in (#66): New Game → customizer →
subject pick → play. Continue / Load if a save exists. Esc is pause
(resume, save, customize, main menu) and must not eat a quiz/dialog close.

Younger age bands get **early-reader** quiz help (#94): auto-read the
question (ages 5–7 always), Repeat (`R`), number keys `1/2/3` to pick.
No-TTS still plays.

Thought bubbles sit above her, not as another modal (#71, #111). Owner:
**they must linger for slower readers.** Last five lines are replayable
from a corner control (#135). Cloud shape for thoughts, solid for speech.
Cooldowns so they do not spam.

Tesla / touch / gamepad are first-class (#124, #126, #144, #185, #188).
The owner plays this **in the car**. Auto-show the stick only on
iPhone/iPad or Tesla — not on every touch laptop. Real Tesla UA often
has **no “Tesla” token** (Linux Chrome + big viewport). Default idle
look is a **whisper outline**, not controls that slide off-screen.
Every keyboard verb has a tap. `?tesla=1` forces it.

---

## 9. Feel: motion, contact, HUD, sound

### 9.1 Contact (the thing playtest kept failing)

From the first Iso PoC addendum, still true in 2026-08:

> Collisions felt awkward and overly restrictive. The player couldn't
> approach objects (e.g., trees, mushrooms) closely, creating unnatural
> “wide berths” around them.

Definition of done:

- Circumnavigate objects **without unnatural gaps**.
- Tighter visual hitboxes so “near” a fence, door, or cottage face is
  allowed.
- Orthogonal movement. Grid-centered steps were the PoC rule; later
  play wants Zelda-smooth walking with the same *logical* walk map.

— `archived-planning/Additional Technical Details, PoC Quirks, and UI Discussions Addendum.md`;
  GitHub #3, #151, #180

Walk boundaries must match what the child sees. Water that looks like a
shore must stop her from every direction (#151). A fence that looks
solid must be solid. A gate that opened must be open.

Occlusion: she can walk *behind* a tree or wall and be partly or fully
hidden. Head over a bush, body gone behind a wall. No flat sticker
world.

— Addendum occlusion rules; GitHub #3, #179; FirstFeedbackOnIso2
  (“flat appearance and no depth”)

### 9.2 HUD and menus

Bible + addendum:

- Start: play / load / options. Options: volume, zoom, quiz difficulty,
  LLM endpoint. Player customizer (hair, clothes, accessories) on a
  flat SVG, applied *before* projection.
- Pause: resume, save, quit, sound.
- Sidebar (~20%): inventory, chat / quiz / tooltips, stats (coins,
  words learned, later status meters).
- Mini-map of visited chunks.
- Fog of war exists as an option. **Default off** after playtest (#131):
  the Bible’s “unvisited cells grayed” made the first session feel like
  a cave. She should see the meadow.
- Inventory key I. Book key B. Map key M.
- HUD should progressive-disclose: full when needed, compact meters
  when the sidebar is tucked. Music is a popup from inventory, not a
  permanent dock. LLM settings live in the main menu, not in play
  (#131).

— Bible, UI; Addendum, UI and Menu Features; GitHub #3 comment (minimap)

### 9.3 Sound

Audio must never block play. Mute / volume per channel (music, SFX,
voice) (#73).

Intended music is **not** a sidebar beep widget. It is a **Sonny
WalkGirl** cassette in inventory (hotkey M): tape reels, seek, composer
on the card, optional “who wrote this?” later (#107, #191). Owner,
Copilot Chat: stop the “bloated piano note files”; play MIDI with a
**soundfont**. Oscillator fallback is last resort. 50+ classical tracks
were sourced into the repo.

Mute **must** kill sound. A session where music is dead and SFX is an
endless white-noise hiss, and only the SFX slider at zero stops it, is
a product bug (Copilot Chat + Emily’s 2-minute walk-away).

SFX / ambience follow time of day and place (river babble, fence creak,
night). Optional NPC voice via Web Speech, text always remains (#76).

Open audio work still exists (#108, #147, #149, #150) — treat those as
the remaining *asset* job, not a new design.

---

## 10. Persistence from the child’s point of view

She can quit after ten minutes and come back to:

- The same world seed (same places).
- The same position, inventory, word bag, subject / age choices.
- Opened gates, spent keys, collected coins, talked NPCs, read articles.
- Fog of war / visited map.

Auto-save on leaving a tile / chunk. 3–5 manual slots with timestamps.

The world itself is regenerated from seeds; the save stores **mutations**
(what she changed), not a full voxel dump.

— Bible, Save/Load; WorldEngine-05 §8.5; `Docs/11` (historical)

---

## 11. What this game is not

From `Docs/01` §5, still correct as identity:

- Not multiplayer.
- Not an authored novel. No plot tree. Talk is short and useful.
- Not “the LLM is the dungeon master.” The LLM is entropy + flavor.
  It never decides whether a gate opens.
- Not hardcore survival.
- Not Phaser / Unity / Godot / Three.js. Browser Canvas, TypeScript,
  inspectable end to end.
- Not Amy’s Game. Sibling product. Not a reason to abandon this one.

From Iso2 + owner stance (current law):

- Not emoji shops standing in for buildings.
- Not a second physics engine hiding under the paint.
- Not “tests green on a lying walk grid.”

---

## 12. Playtest facts (owner, not harnesses)

These are the only feel proofs that count. Agents declared victory
anyway.

| Date | What the owner felt |
|------|---------------------|
| Iso PoC (addendum, migrated to #3) | Wide-berth collision. No occlusion. Arms detach on flip. |
| FirstFeedbackOnIso2 | Flat, no Z, no shadows, seams, broken continuous features. |
| #151 | Walked into water from above. Paint and collision disagreed. |
| #186 | Child did not know how to move. |
| 2026-07-20 after “critical path” | Gate did not open after a correct answer. Home required a quiz. Cottage unapproachable on south/west. 9×9 stamp looked like rubble. |
| 2026-08 (AGENTS.md) | A child still cannot walk around a fence. |
| #266 still OPEN | Player still walks through injected water. #151 was closed; the bug lived. |
| #260 screenshot 2026-06-11 | World reads as random tile scatter + hard diamond seams; bridges start/end in water. |
| 2026-07-16 session notes | Cold load / first frames hang. Standing on a coin without holding a key never collects. Continue is a no-op; the stall is pre-menu gen or first paint bake. |
| 2026-07-19 play-stack | Hitch then dash; tunnels over rivers; keyboard dies after quiz/dialog; FPS counter lies. |
| 2026-07-30 operator | Visual LLM cannot read the iso layout. Playwright `?test=1` skips menus and is not Start Adventure. First-play freeze was baking every on-screen chunk in one frame after the spinner hid. |
| Copilot Chat 2026-06-11 | Same screenshot that became #260: biome scatter, diamond seams, bridge in the water. |
| Copilot Chat 2026-07-03 | After iso2 port: bright green non-iso patches; bridge 90° wrong, starts/ends in water; lockup; FPS/movement poor. |
| Copilot Chat 2026-07-17 | “when you start the game… it all just falls apart… looks like shit… too slow… keyboard inputs are frustrating… sfx engine… hisses… only midi music works.” Owner ready to hear it is a dead end. |
| Copilot Chat 2026-07-18 | “Blur” was **hydration drain to zero**, not a shader. Starter survival rates were punishing. Fence gate read as a stick in a hole. |

Closed GitHub issues and green Playwright are **not** counter-evidence.

---

## 13. Implementation note for the rewrite (not a port list)

When the owner opens the rewrite, implement **this file**, not
`src/mechanics.ts`. The names door/key, Book, homestead, quiz gate, word
bag, and entropy stay because the owner already used them. The functions,
constants, dual walk stacks, and FOV locks do not.

A later session should be able to stand up:

1. A homestead you can walk around and leave without a quiz.
2. One other place (cart or river+bridge or inn).
3. One teaching gate with an NPC face, Book lookup, unlimited retry,
   and a gate that **opens**.
4. Save / load of that tiny world.

That is a session. That is the game.
