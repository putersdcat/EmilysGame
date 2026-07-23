# Playtest findings after Critical-Path Recovery (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Branch / tip** | `experiment/isometric-2.0` @ `784c3bf` (Critical-Path Recovery landed + F3 test fix) |
| **Source** | Human playtest after `/execute-plan` critical-path epic |
| **Status** | **Parked** — document only; **do not** start new execute/fix thrash until user reopens |

---

## What improved (ack)

- Homestead **south gate is closed** (no free dirt walk-around). That part of place-coherence / critical-path landed as intended.

---

## Critical product bugs (next work when reopened)

### 1. Answering a quiz does **not** open the gate

- User answered the question; gate stayed closed.
- Ownership to investigate (when work resumes): `resolveQuizGate` / mechanics interact path / cell rewrite to `door_open` (or equivalent) / walkability stamp after open / interact range / play-kernel motor not re-querying walk.
- Regression: “correct answer → cell becomes walkable open and player can pass.”

### 2. Not every gate is a quiz gate — **home exit should not require a quiz**

- Product law refinement:
  - **Teaching / progression gates** elsewhere may use quiz (with an NPC — see below).
  - **Starter homestead exit** is a **place opening**, not a random exam booth. Leaving home should be free or a light non-quiz open (e.g. open door / interact open without quiz), not “solve math to leave the yard.”
- Critical-path / scene-first over-applied “functional opening = quiz_gate” for the **origin teaching yard**. Revisit homestead south opening kind and stamp.

### 3. Bare gate quiz is narrative nonsense

- When a question is asked, the fiction is **an NPC is asking it**.
- A silent fence-gap quiz_gate with no person is wrong UX and wrong story.
- Prefer: quiz only when an NPC (or explicit tutor prop) owns the interaction; otherwise door/open path.

### 4. Homestead “9×9 multi-cell” read as worse, not better

- User: still sees the **same small house model**, plus **strange chunks** around it (foundation/wall mass felt like broken rubble, not a larger cottage).
- Walk: **cannot get near south or west facing parts of the house** — walkable boundaries / collision / cottage mass footprint still wrong (likely non-walkable `starter_*` mass + plus-shape / interact / half-extent, or stamp/clearance over-protect).
- Takeaway for next design: multi-cell stamp without better **paint mass + walkable apron** failed the child-readable “home” test. Prefer:
  - Readable larger **paint** (scale/zOffset/multi-tile art that still looks like one cottage), and
  - Explicit **walkable apron** around the house so player can approach south/west faces,
  - Not opaque foundation blocks that read as junk and block approach.

### 5. Walkability still feels broken overall

- Free-roam / fence-ring work was partial; house approach is a concrete softlock-adjacent feel bug at spawn.
- Keep flat sim SSOT; fix stamps and clearance, not FOV thrash.

---

## Backlog: quiz UI — NPC talking head (document only)

**User vision (period-game style):**

- Quiz popup should show a **headshot of the NPC** who is asking.
- Head **gabs / flaps** while “talking” — user reference: **South Park Canadian** head-flap gag (mouth/head bob while lines play).
- Not bare modal text over a fence cell.

**Parked as design seed only** — no implementation in this session.

Suggested future home when opened:

- UI layer: `src/ui/` quiz modal + portrait
- Persona / NPC content: who speaks which quiz
- Optional light animation loop (sprite sheet or 2-frame flap), not a nano campaign
- Wire only when interact is with an NPC (or NPC-linked gate), matching §3 above

---

## Relation to prior epics

| Epic | Note |
|------|------|
| Place Coherence | Closed south fence; over-sealing mid-fence quiz later reworked in critical-path PR4 |
| Critical-Path Recovery | Hang/yield, boundary queue, barrier seal, passability protect, homestead 9×9 stamp |
| This note | Human: gate open broken; home quiz wrong; 9×9 stamp failed feel; house approach blocked; quiz needs NPC face |

**Do not** re-run closed scene-first or place-coherence PR plans. Next open should be a **new** small design (or focused bug plan) with: homestead open/exit + house approach walk, quiz resolve open, home non-quiz exit, then optionally talking-head quiz UI.

---

## Explicit stop

User requested: **document the talking-head idea + findings, then stop work.**  
No further implement/execute in this session.
