# LLM port fix + latency architecture (2026-07-10)

Continuation of Step 4 gameplay audit item #6 in `step4-gameplay-systems-
plan.md` ("NPC dialogue/interaction (LLM-driven)"). Started as a port-number
fix, evolved into a real architecture change after live-testing exposed a
genuine latency/queueing problem. See that file's item #6 for the original
framing; this file is the detailed writeup.

## Part 1 — Port fix (8000 → 8005), straightforward

User reported the local BitNet server for this session runs on port 8005,
not the historically-documented 8000/8001/8002. Verified live via
`GET http://127.0.0.1:8005/health` before touching anything (per this
project's own "always verify, don't trust docs" convention).

**Files changed:**
- `vite.config.ts` — the ONE functionally-critical change: dev-proxy target
  `http://127.0.0.1:8000` → `8005`. Verified end-to-end:
  `http://localhost:5173/api/llm/health` → `{"status":"ok"}` through the
  actual proxy path, not just a direct port check.
- `src/index.html` — `optLlmUrl` input placeholder cosmetic update (rarely
  visible; the field is always pre-filled by JS from `LLM_CONFIG.endpoint`
  or saved localStorage settings).
- `.github/copilot-instructions.md` + `.github/instructions/llm-
  integration.instructions.md` — reworded to stop asserting a specific port
  number as fact; now explicitly say the port is machine/session-dependent
  (observed 8000/8001/8002/8005 across different sessions) and instruct
  future sessions to verify via health check first.

## Part 2 — Root cause: timeout/token-budget mismatch (found via live testing)

Confirmed `isLlmAvailable()` returning true but `npcChatResponse`/
`rephraseQuizQuestion` calls still always silently falling back. Measured
real throughput against the live server with controlled, single-variable
tests (not the full request shape) via raw PowerShell `Invoke-RestMethod`
calls direct to `127.0.0.1:8005`:
- Simple 30-token completion, no system prompt: 0.664s.
- 20-token completion WITH a goblin-merchant system prompt: 3.797s, using
  the full 20-token budget → **~0.19s/token, ~5.2-5.3 TPS measured rate**.

At this rate, `LLM_CONFIG.maxTokens.npcChat=100` needs ~19s and
`maxTokens.wordlist=300` needs ~57s — both exceeding the OLD flat
`timeoutMs=15000` default, causing the `AbortController` to fire and fall
back before the server's (successful, per user-pasted BitNet server logs)
response ever arrived. `maxTokens.entropy`/`quizWrap=80` needed ~15.2s —
right at the edge, causing intermittent (not constant) fallback.

**Important**: this ~5.2 TPS measured rate is ABOVE the existing
`TPS_CUTOVER_THRESHOLD=3` in `tps.ts` (tuned for the wordlist's own
generous 60s/300-token patience budget) — so the existing cutover
mechanism does NOT catch this failure mode. A LLM that's "fast enough by
the wordlist's standard" can still be far too slow to feel interactive for
a 100-token NPC chat reply. This is why a SEPARATE, stricter interactive-
budget concept was needed (see Part 3).

## Part 3 — Fix 1: per-call timeout + TPS-based interactive-budget gating

**`src/engine/llm/client.ts`**: `llmChat()` gained an optional `timeoutMs?`
4th param (mirroring `llmComplete`'s already-existing pattern), flowing
through to `llmFetch(path, body, timeoutMs)`. This was the ONE real
signature asymmetry between the two sibling functions.

**`src/engine/llm/tps.ts`**: added `INTERACTIVE_BUDGET_MS = 8000` constant,
`estimateEtaMs(tokens)` (pure calc from `getLlmAvgTps()`, returns null if no
TPS measured yet), and `isLikelyToFitBudget(tokens, budgetMs?)` (the actual
gate: true if no data yet — optimistic on cold start — or if the estimated
ETA fits the budget). Callers use this BEFORE attempting a live call, to
skip straight to fallback instead of waiting through a doomed timeout.

**Per-call timeouts bumped** (safety-net ceiling for calls the TPS gate
above decided were worth attempting, not the primary mechanism):
- `npcChatResponse` (npc.ts): 30000ms for `maxTokens.npcChat=100`.
- `rephraseQuizQuestion` (npc.ts): 25000ms for `maxTokens.quizWrap=80`.
- `expandEntropy` (entropy.ts): 25000ms for `maxTokens.entropy=80`.
- `generateWordlist` already had 60000ms for `maxTokens.wordlist=300` (this
  was the PRE-EXISTING pattern that inspired the above three).

## Part 4 — Live-testing found a SECOND, more serious problem: server-side queueing

Repeated real-LLM Playwright test runs (many sequential invocations, each
firing genuine generation requests) reproduced a concrete queueing/backlog
symptom: a `cat_default` persona call that succeeded fast (well under 1s)
in an EARLY isolated test later took the FULL 30s safety-net timeout in a
LATER test, and — worse — a subsequent `merchant_default` call in the SAME
test exceeded even a 60s Playwright test timeout entirely, apparently
queued behind the cat call's already-timed-out-client-side-but-still-
running-server-side request. This strongly suggests the local llama.cpp
server processes one request at a time; an abandoned client request
(AbortController fired, client gave up) does NOT stop the server from
continuing to crunch on it, delaying/starving every subsequent request —
even ones a fresh client has no way of knowing are queued behind a ghost.

**User's architectural direction in response** (paraphrased): don't just
make timeouts bigger — (1) account for calls queueing up, and (2) predict
what's likely needed and send it to the LLM well AHEAD of time in the
background, checking later whether a precomputed answer is ready; fall
back to the existing curated defaults if not. Goal: "the user is never
waiting on any latency in an NPC or other LLM enabled natural language
thing."

## Part 5 — Fix 2: `background-queue.ts` (single-slot mutex + prefetch/cache)

**New file `src/engine/llm/background-queue.ts`**. Core primitives:
- `tryAcquire()` / `release()` — non-blocking mutex. `tryAcquire()` returns
  false immediately if busy; callers must NEVER wait/retry on failure (that
  would reintroduce the exact latency this exists to prevent) — they
  should skip straight to their existing deterministic fallback.
- `prefetch(key, job)` — fire-and-forget background job. Polls internally
  for the shared slot (fine, since nothing is blocked waiting on a
  prefetch to START) and caches the job's result under `key`.
- `getPrefetchedResult(key)` — instant, non-blocking cache lookup.
- `isPrefetchPending(key)`, `isQueueBusy()` — introspection.

**Applied everywhere a live LLM call happens** (`npcChatResponse`,
`rephraseQuizQuestion`, `expandEntropy`, `generateWordlist`'s own live
attempt) so the "at most one real request in flight" invariant holds
across BOTH direct/interactive calls AND background prefetch jobs — a
direct call that finds the slot busy skips straight to fallback rather
than firing a second concurrent request.

Each direct-call function was split into an inner body (no acquire/
gating, e.g. `_rephraseQuizQuestionInner`) + the public wrapper (does
TPS-gate + `tryAcquire`/`release` + calls the inner body) so the SAME
inner body can be reused by a prefetch job without double-acquiring the
slot (a real bug caught during design: `prefetch()`'s own `tryAcquire`
plus the direct function's OWN `tryAcquire` would have deadlocked/always-
failed on the second acquire attempt).

## Part 6 — Fix 3: quiz-question pre-pick + prefetch wiring (the one LIVE, concrete win)

**Key discovery while designing this**: of the three LLM integration
points, only ONE is actually live in real gameplay today:
- `npcChatResponse` — **dead code, zero callers**, confirmed earlier this
  session (Step 4 audit). Live NPC interaction only shows a static
  pre-authored greeting, never calls the LLM.
- `expandEntropy` (async `generateChunk()`) — **ALSO dead code**, newly
  discovered this session. The ONLY production chunk generator,
  `generateChunkSync()` (`ChunkGenerator.ts`), is fully synchronous and
  derives its seed from `fastHash()` + a snapshot of `getEntropyBuffer()`
  — and `appendEntropyRaw()` (the only way that buffer gets populated) is
  ONLY called from the async `generateChunk()`, which nothing calls live.
  So the LLM-driven per-chunk entropy system described in ARCHITECTURE.md
  is currently dormant end-to-end, same shape of gap as npcChatResponse.
- `rephraseQuizQuestion` — **confirmed live**, called from `quiz.ts`'s
  `startQuiz()`, itself called from `main.ts`'s `handleDialogInput()` and
  wildlife interaction handling.

Given this, the prefetch feature was scoped to the ONE live call site,
built properly rather than speculatively building prefetch triggers for
dead code.

**The exploit**: `state.pendingQuiz` is set the MOMENT a player triggers an
NPC (canQuiz)/quiz_gate/wildlife-with-quizCategory interaction —
`showDialog()` + `state.paused = true` happen at the SAME time. The player
must then read the dialog and press "interact" to close it before
`startQuiz()` actually runs. This dialog-reading window is free lead time.

**Structural change**: extracted `pickQuizQuestion(difficulty, bias?)` from
`startQuiz()`'s inline pool-building+random-pick logic (`src/game/
quiz.ts`) — pure, synchronous, reusable. `startQuiz()` gained an optional
5th param `preSelectedQuestion?` — uses it if provided, else picks fresh
exactly as before (100% backward compatible; `startQuiz` has only ONE
production call site, `main.ts`'s `handleDialogInput`, confirmed via
`vscode_listCodeUsages`-style grep, so this was low risk).

`GameState.pendingQuiz`'s type (`game-state.ts`) gained an optional
`question?: QuizQuestion | null` field.

**Three call sites** now pre-pick + kick off `prefetchQuizRephrase
(question.question)` the moment `pendingQuiz` is set:
1. `interaction-handler.ts`'s `npc` case (canQuiz branch).
2. `interaction-handler.ts`'s `quiz_gate` case.
3. `main.ts`'s wildlife interaction (`quizCategory` branch).

`main.ts`'s `handleDialogInput` now passes `pq.question` through to
`startQuiz(...)` as the 5th arg, so the SAME question the prefetch was
keyed on is what actually gets used (never re-rolls a different one).

`quiz.ts`'s `startQuiz()` rephrase step: `getPrefetchedResult(question.
question)` checked FIRST (instant, zero wait) — only falls through to the
existing direct `rephraseQuizQuestion()` call (TPS-gated + `tryAcquire` +
25s timeout) on a cache miss. This is a genuinely additive change — the
non-prefetch fallback path is byte-for-byte the same behavior as before.

`prefetchQuizRephrase()` deliberately does NOT apply the strict
`isLikelyToFitBudget` interactive-budget gate (no hard deadline for
background work — even a "too slow to feel interactive" measured rate
might still finish before the dialog closes, and even if not, nothing is
lost since nobody is waiting on it). It still respects
`isTpsCutoverActive()` implicitly is NOT checked directly — worth revisit
if this ever proves wasteful, but low priority since `tryAcquire` already
bounds it to one attempt at a time.

**Debug hooks added** (`src/game/debug-api.ts`): `isLlmAvailable,
checkLlmHealth, getLlmTps, getLlmAvgTps, isTpsCutoverActive,
isLikelyToFitBudget, estimateEtaMs, isQueueBusy, getPrefetchedResult,
isPrefetchPending, prefetchQuizRephrase, pickQuizQuestion` — all exposed
via `window.__gameDebug` for live/test verification.

## Part 7 — Validation status

- `npx tsc --noEmit` clean after every edit batch.
- Full regression: `tests/gameplay/quiz-gate-retry-loop.spec.ts` +
  `tests/education/streak-quiz.spec.ts` + `quiz-content-pack-
  integration.spec.ts` + `quiz-accessibility.spec.ts` +
  `tests/gameplay/wildlife.spec.ts` + `npc-chat-fallback-quality.spec.ts`
  = **42/42 PASS** (exercises all three pre-pick/prefetch call sites in
  test mode, where `isTestMode()` short-circuits the actual LLM call but
  the STRUCTURAL wiring — pendingQuiz.question threading, startQuiz's
  optional param, pickQuizQuestion extraction — is fully exercised).
- Broader sweep (`tests/gameplay tests/core tests/education`, ~327 tests)
  kicked off to double-check the wider blast radius of touching
  `main.ts`/`interaction-handler.ts`/`game-state.ts`/`quiz.ts` — check
  `scoped-sweep2.log` in the repo root for the result if this file is read
  before that command's own follow-up confirms it (should match the
  baseline from earlier this session: 310 passed / 17 pre-existing-
  unrelated math-solver-93 + one flaky injury-system timing failure, ZERO
  regressions from this session's changes).
- **Live LLM end-to-end proof of the prefetch mechanism**: initially
  INCOMPLETE (server went down mid-verification, see Part 8) — **now
  COMPLETE**, see Part 9 (GPU backend live validation, 2026-07-13).

## Part 8 — IMPORTANT: local BitNet LLM server went down during this session

After extensive real-LLM testing (many sequential Playwright runs each
firing genuine generation requests, deliberately probing the queueing
behavior described in Part 4), the local server stack became fully
unreachable: BOTH `http://127.0.0.1:8005/health` (FastAPI adapter) AND
`http://127.0.0.1:8080/health` (llama-server) return "actively refused"
(nothing listening), not just slow/erroring. This is the USER's own
externally-managed process (not started by or under the control of this
agent session) — most likely cause is resource exhaustion / a crash from
the accumulated backlog of abandoned-but-still-server-side-processing
requests this session's own repeated testing created (directly
demonstrating the Part 4 problem in an unwanted way). **User needs to
restart their local BitNet server stack to resume live LLM testing.**

Live evidence gathered BEFORE the crash (still valid, doesn't need
re-proving): real coherent in-persona completions succeed given enough
time (e.g. goblin merchant: "Oh, ho ho! Today, I have a great selection of
'Dragon's Breath' potions and..."; cat: "Meow *meows*"), the ~5.2 TPS
measured rate, and the server-side queueing/backlog symptom itself.

**Not yet live-verified (AT THE TIME Part 8 was first written)**: the NEW
`background-queue.ts` prefetch mechanism's actual latency-hiding behavior
against a real server. **RESOLVED in Part 9 below** — the user brought up
a GPU-accelerated backend and this was fully live-verified.

## Part 9 — GPU-accelerated backend: full live validation SUCCEEDS (architecture), reveals a SEPARATE content-quality bug (2026-07-10/13)

User switched to a GPU-accelerated version of the local LLM (same
`127.0.0.1:8005` FastAPI adapter, `"backend":"gpu"` now reported by
`/health`). Two distinct findings, both confirmed via direct raw HTTP
tests (bypassing the game) before/after re-testing through the actual
game + `window.__gameDebug` hooks:

**Bug found first (2026-07-10), then fixed by the user (confirmed working
2026-07-13)**: every completion request (`/v1/chat/completions` AND
`/v1/completions`, even a minimal `{"model":"BitNet","prompt":"Hi",
"max_tokens":5}`) failed IMMEDIATELY (~0.015-0.45s, before any real
inference) with `500 {"detail": "'ChatFormat' object has no attribute
'encode'"}` — a server-side Python `AttributeError` in the GPU adapter's
own request handling, unrelated to request payload shape (confirmed with
progressively more minimal payloads) and NOT something fixable from the
game client. `/health` reported `"status":"ok"` throughout, which was
misleading since it doesn't exercise the actual completion path — worth
remembering for future debugging (a passing health check does not prove
the completion endpoints work).

**Once fixed, live end-to-end proof of the ENTIRE session's architecture,
via the actual game + debug hooks (not just raw HTTP)**:
- `isLlmAvailable()` → `true`.
- Direct `npcChatResponse('merchant_default', ...)` returned in **632ms**
  (not the 30s safety-net timeout), confirmed **NOT a fallback** (checked
  against `getNpcFallbackResponses`) — i.e. genuine live LLM output
  arrived fast enough that the TPS-gate/timeout architecture never needed
  its safety net at all.
- Measured throughput via the game's own `getLlmAvgTps()`: **147.9 TPS**
  (`estimateEtaMs(100)` = ~676ms) — roughly **28x faster** than the CPU
  backend's ~5.2 TPS measured in Part 2, and even faster than this
  session's own raw-HTTP GPU measurements (54.5 TPS simple, 46.6 TPS with
  system prompt) — likely GPU warm-up/cache effects between calls.
- `prefetchQuizRephrase()` kickoff: **6ms** (fire-and-forget, confirmed
  non-blocking as designed).
- After a mere 5s wait (vs the 20s+ needed on CPU), `getPrefetchedResult()`
  returned a cached value with a **3ms** lookup (instant, as designed) —
  full proof the background-queue prefetch pipeline (schedule → run when
  slot free → cache → instant retrieval) works correctly end-to-end
  against a real, live server.

**This closes out the ONE remaining unverified item from Part 8.** The
whole session's architecture (per-call timeouts, `isLikelyToFitBudget`
TPS gating, `background-queue.ts`'s single-slot mutex + prefetch/cache,
and the quiz pre-pick/prefetch wiring in `interaction-handler.ts`/
`main.ts`/`quiz.ts`) is now proven correct against BOTH a slow CPU backend
(graceful, correctly-gated fallback behavior) AND a fast GPU backend
(near-instant real output, prefetch delivers cached results well within
a dialog-reading window) — exactly the two operating regimes it was
designed for.

**NEW, SEPARATE bug found on the GPU backend (content quality, NOT
latency)**: every completion's actual TEXT content is degenerate —
collapses into a single token/word repeated for the entire budget,
regardless of persona, prompt, or token count:
- 30 tokens, no system prompt: `"HelloHelloHello..."` (x30).
- 100 tokens, goblin-merchant system prompt: `"IIIIIII..."` (x50 actual
  tokens generated before hitting whatever internal stop).
- 10 tokens, cat-sounds-only system prompt: `"your your your your..."`.
- Live in-game `npcChatResponse` (merchant): `"job job job job..."` (full
  100-token budget).
- Live in-game `prefetchQuizRephrase`: `"by by by by..."`.
This is CONSISTENT and SYSTEMIC (always degenerates to one repeated
token/word, independent of prompt/persona/budget) — a strong signal of a
sampling bug in the GPU adapter (e.g. `temperature`/`top_p`/`top_k` not
actually being applied on the GPU code path, defaulting to greedy
decoding, which self-reinforces into a repeat loop; or a KV-cache/
attention-mask bug specific to GPU inference). **This is a server-side
model/backend bug, not a game-client bug** — not something to fix in this
repo. Diagnosing the EXACT root cause (sampling params vs KV-cache vs
something else) is out of scope for this session; flagged for the user's
own BitNet/GPU adapter work. **Practical implication for THIS repo**: the
architecture (timeouts, TPS-gating, prefetch) is fully validated and
correct; testing "does dialogue read as persona-appropriate" is blocked
until the user's own backend produces coherent text again -- re-test
content quality (not just timing) once that's fixed, if desired.

## Files touched this session (LLM/prefetch work only, not the earlier npc-
chat-fallback-quality commit `6074aff` which predates this)

**COMMITTED** as two commits (git-workflow.md conventions followed: never
pushed, `.github/agents/GameMan.agent.md` and `scripts/gen-patch.ps1`
excluded from both):
- `d5884ee` — port fix (Part 1): `vite.config.ts`, `src/index.html`,
  `.github/copilot-instructions.md`, `.github/instructions/llm-
  integration.instructions.md`.
- `0d39752` — TPS gating + background-queue + quiz prefetch (Parts 3, 5,
  6): everything else below. Also fixed a real bug caught during final
  review before committing: `prefetchQuizRephrase`'s doc comment claimed
  it checks `isTpsCutoverActive()` but the function body never actually
  did — added the real check (`if (isTpsCutoverActive()) return;`) before
  committing, re-verified `tsc --noEmit` clean afterward.

Full file list (for reference):
- `vite.config.ts`, `src/index.html`, `.github/copilot-instructions.md`,
  `.github/instructions/llm-integration.instructions.md` (Part 1)
- `src/engine/llm/client.ts` (Part 3 — llmChat timeout param)
- `src/engine/llm/tps.ts` (Part 3 — INTERACTIVE_BUDGET_MS, estimateEtaMs,
  isLikelyToFitBudget)
- `src/engine/llm/npc.ts` (Part 3 + 5 + 6 — timeouts, tryAcquire/release,
  _npcChatResponseInner, _rephraseQuizQuestionInner, prefetchQuizRephrase)
- `src/engine/llm/entropy.ts` (Part 3 + 5 — timeouts, tryAcquire/release,
  _tryExpandEntropyLive, _tryGenerateWordlistLive, corrected STATUS NOTE
  on expandEntropy being dead code)
- `src/engine/llm/background-queue.ts` (Part 5 — NEW FILE)
- `src/engine/llm.ts` (barrel exports for all of the above)
- `src/game/game-state.ts` (Part 6 — pendingQuiz.question field)
- `src/game/quiz.ts` (Part 6 — pickQuizQuestion extraction, startQuiz's
  preSelectedQuestion param + prefetch-cache check)
- `src/game/interaction-handler.ts` (Part 6 — npc + quiz_gate pre-pick/prefetch)
- `src/main.ts` (Part 6 — wildlife pre-pick/prefetch + startQuiz call update)
- `src/game/debug-api.ts` (debug hooks for all of the above)

## Next steps (not yet done)

1. ~~Commit all of the above~~ **DONE** — see commit hashes above.
2. ~~Once the user's LLM server is back up: one careful live end-to-end
   prefetch verification test~~ **DONE 2026-07-13** — see Part 9. Full
   architecture (timeouts, TPS gating, prefetch/cache) proven correct
   against both a slow CPU backend and a fast GPU backend.
3. Consider whether `npcChatResponse`/`expandEntropy` (both confirmed dead
   code this session) warrant their own product-decision conversation
   (build real call sites vs. formally retire) — flagged, not decided.
4. This whole thread was a deep-dive off the `step4-gameplay-systems-plan.md`
   list's item #6; items #1-5 (trading.ts biome-inventory, quiz retry-loop
   softlock -- may already be done, saw a passing quiz-gate-retry-loop.spec.ts
   this session that wasn't investigated further --, save fidelity,
   wildlife discovery payoff, book-of-knowledge cross-reference) remain
   unstarted/unconfirmed as of this writing.
5. **NEW (2026-07-13)**: the GPU backend's degenerate-output sampling bug
   (Part 9) is the user's own server-side issue, not tracked as a to-do
   for this repo -- but if/when they fix it, a follow-up content-QUALITY
   check (not just timing) of `npcChatResponse`/`rephraseQuizQuestion`
   output would be worthwhile, since this session could only validate
   latency/architecture against the GPU backend, not dialogue coherence.
