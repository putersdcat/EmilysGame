# Emily's Game — Audio Asset Sourcing Brief (Issue #148)

> Purpose: hard-reset audio quality by replacing synthetic/noisy ambience + SFX with curated recorded/sample-based assets.
> 
> Owner split:
> - **Agent**: define this spec + later transcode/integrate/mix.
> - **User**: source raw files against this checklist.

---

## 1) Non-Negotiables (Quality + Direction)

## Do
- Natural, organic, child-safe sound palette.
- Warm, cozy, storybook adventure tone.
- Clear, readable UI feedback with soft transient tails.
- World ambience that feels outdoors and alive (not tonal synth drones).

## Do NOT
- No synthetic alarm-like tones in ambience.
- No harsh high-frequency ringing / static hiss textures.
- No buzzy oscillator-like placeholders.
- No jump-scare loudness spikes.

## Global loudness targets (source handoff)
- Deliver raw files with healthy headroom (no heavy limiting).
- Suggested target per one-shot: around **-18 to -14 LUFS short-term** equivalent.
- Suggested peak ceiling: **<= -3 dBFS**.
- Ambience loops should feel quiet and supportive by default.

---

## 2) File Format + Naming Requirements (for sourcing handoff)

## Preferred source format from you
- **WAV** (preferred): 24-bit / 48 kHz or 16-bit / 48 kHz.
- If only available: high-quality FLAC/AIFF acceptable.
- Avoid MP3 as source when possible.

## Loop prep expectations
- Ambience loops: 30s-120s ideal.
- Should be naturally loopable (no abrupt seam/click).
- If not perfectly looped, still provide best candidate; I will do loop cleanup/transcode.

## Naming convention
Use this filename scheme before handoff:
- `amb_<domain>_<timeOrWeather>_<detail>_v01.wav`
- `sfx_<system>_<event>_<variant>_v01.wav`
- `ui_<event>_<variant>_v01.wav`
- `voc_<creatureOrNpc>_<event>_<variant>_v01.wav`

Examples:
- `amb_meadow_day_birds-wind_v01.wav`
- `sfx_player_footstep_grass_01_v01.wav`
- `ui_menu_navigate_soft_01_v01.wav`
- `voc_cat_purr_loop_soft_v01.wav`

---

## 3) Ambience Design Spec (What it should sound like)

## Core ambience character
- Air movement + distant nature bed + subtle life.
- Zero tonal whining/drone that resembles alarms.
- Real-world field-recording feel over synth pad feel.

## Ambience stack model
Each area/time can layer:
1. **Base bed** (wind/air/space)
2. **Life layer** (birds/insects/frogs/etc.)
3. **Weather layer** (rain/storm/fog tone)
4. **Localized loop emitters** (waterfall, campfire)

## Required ambience source set

### P0 (must-have)
- [ ] `amb_global_day_clear_base`
- [ ] `amb_global_dusk_clear_base`
- [ ] `amb_global_night_clear_base`
- [ ] `amb_weather_rain_base`
- [ ] `amb_weather_storm_base`
- [ ] `amb_weather_fog_base`
- [ ] `amb_emit_waterfall_loop`
- [ ] `amb_emit_campfire_loop`
- [ ] `amb_emit_wind_loop_soft`
- [ ] `amb_emit_crickets_loop`

### P1 (strongly recommended)
- [ ] `amb_biome_meadow_day`
- [ ] `amb_biome_meadow_night`
- [ ] `amb_biome_forest_day`
- [ ] `amb_biome_forest_night`
- [ ] `amb_biome_cave_day`
- [ ] `amb_biome_cave_night`
- [ ] `amb_biome_castle_day`
- [ ] `amb_biome_castle_night`

### P2 (nice-to-have enrichers)
- [ ] Light transitional stingers for day↔dusk↔night shifts (very subtle)
- [ ] Seasonal alternates (leafier wind, wetter ground, etc.)

---

## 4) Complete SFX Inventory Checklist (All game systems)

This list is **full target coverage** for current gameplay + UI + known systems. Even if a sound exists today, source a quality replacement candidate.

## A) Movement & traversal

### P0
- [ ] `sfx_player_footstep_grass_01`
- [ ] `sfx_player_footstep_grass_02`
- [ ] `sfx_player_footstep_dirt_01`
- [ ] `sfx_player_footstep_dirt_02`
- [ ] `sfx_player_footstep_stone_01`
- [ ] `sfx_player_footstep_stone_02`
- [ ] `sfx_player_wall_bump_soft`

### P1
- [ ] `sfx_player_footstep_wood_01`
- [ ] `sfx_player_footstep_sand_01`
- [ ] `sfx_player_footstep_shallowwater_01`

---

## B) Interaction / world object SFX

### P0
- [ ] `sfx_item_pickup_generic_01`
- [ ] `sfx_item_pickup_coin_01`
- [ ] `sfx_container_chest_open_01`
- [ ] `sfx_gate_open_quiz_01`
- [ ] `sfx_obstacle_resolved_01`
- [ ] `sfx_obstacle_blocked_01`
- [ ] `sfx_drink_stream_01`
- [ ] `sfx_outhouse_enter_01`
- [ ] `sfx_outhouse_clean_bonus_01`
- [ ] `sfx_eat_worms_01`
- [ ] `sfx_campfire_rest_01`

### P1
- [ ] `sfx_structure_interact_generic_01`
- [ ] `sfx_shop_open_stall_01`

---

## C) Player condition / survival / injury SFX

### P0
- [ ] `sfx_player_ouch_01`
- [ ] `sfx_player_bandaid_use_01`
- [ ] `sfx_player_eat_food_01`
- [ ] `sfx_player_drink_flask_01`
- [ ] `sfx_status_warning_soft_01`
- [ ] `sfx_status_critical_soft_01`
- [ ] `sfx_status_relief_recover_01`
- [ ] `sfx_illness_gurgle_01`  

### P1
- [ ] `sfx_illness_marker_place_01` (optional subtle plop for marker placement)

---

## D) Quiz / education / progression SFX

### P0
- [ ] `ui_quiz_start_01`
- [ ] `ui_quiz_correct_01`
- [ ] `ui_quiz_wrong_01`
- [ ] `ui_menu_navigate_01`
- [ ] `ui_dialog_open_01`
- [ ] `ui_dialog_advance_01`
- [ ] `ui_dialog_close_01`

### P1
- [ ] `ui_book_open_01`
- [ ] `ui_book_close_01`
- [ ] `ui_hint_popup_01`

---

## E) Trade / shop / barter SFX

### P0
- [ ] `ui_shop_open_01`
- [ ] `ui_shop_buy_success_01`
- [ ] `ui_shop_fail_01`
- [ ] `ui_trade_mode_toggle_01`

### P1
- [ ] `ui_barter_offer_present_01`
- [ ] `ui_barter_result_success_01`
- [ ] `ui_barter_result_fail_01`

---

## F) Wildlife / creature calls (one-shots)

## Current runtime-triggered creatures/events
### P0
- [ ] `voc_bird_chirp_01`
- [ ] `voc_bird_chirp_02`
- [ ] `voc_bird_chirp_03`
- [ ] `voc_frog_croak_01`
- [ ] `voc_owl_hoot_01`
- [ ] `voc_rooster_crow_01`

## Species coverage set (full game roster target)
### P1
- [ ] `voc_rabbit_01`
- [ ] `voc_squirrel_01`
- [ ] `voc_deer_01`
- [ ] `voc_hedgehog_01`
- [ ] `voc_fox_01`
- [ ] `voc_raccoon_01`
- [ ] `voc_bat_01`
- [ ] `voc_wolf_01`
- [ ] `voc_turtle_01`
- [ ] `voc_duck_01`
- [ ] `voc_heron_01`
- [ ] `voc_spider_foley_01` (tiny skitter texture)
- [ ] `voc_rat_01`

### P1 (Cats, explicitly requested quality uplift)
- [ ] `voc_cat_purr_loop_orange`
- [ ] `voc_cat_meow_orange_01`
- [ ] `voc_cat_purr_loop_black`
- [ ] `voc_cat_meow_black_01`
- [ ] `voc_cat_purr_loop_persian`
- [ ] `voc_cat_meow_persian_01`

---

## G) Weather + world event one-shots

### P0
- [ ] `sfx_weather_thunder_01`

### P1
- [ ] `sfx_weather_light_rain_drip_oneshot_01`
- [ ] `sfx_weather_storm_gust_oneshot_01`

---

## H) UI meta controls (menu/HUD/system)

These are currently underrepresented sonically; include candidates.

### P1
- [ ] `ui_hud_button_click_01`
- [ ] `ui_sidebar_toggle_01`
- [ ] `ui_save_success_01`
- [ ] `ui_load_success_01`
- [ ] `ui_slot_delete_01`
- [ ] `ui_pause_open_01`
- [ ] `ui_pause_close_01`
- [ ] `ui_mainmenu_confirm_01`
- [ ] `ui_mainmenu_back_01`
- [ ] `ui_customize_open_01`
- [ ] `ui_customize_apply_01`

---

## I) Positional audio emitters (looping)

### P0
- [ ] `amb_emit_campfire_loop` (already listed above)
- [ ] `amb_emit_waterfall_loop` (already listed above)

### P1
- [ ] `amb_emit_shop_crowd_low_loop` (if shops become denser)
- [ ] `amb_emit_settlement_murmur_loop` (future structures)

---

## 5) Coverage Mapping Template (fill during handoff)

For each sourced file, provide:
1. Checklist ID
2. Actual filename
3. Source/provider
4. License status
5. Notes (quality/loop/clicks/noise)

Example:

| Checklist ID | Provided File | Source | License | Notes |
|---|---|---|---|---|
| `voc_owl_hoot_01` | `voc_owl_hoot_01_v01.wav` | personal field record | owned | clean, no clipping |

---

## 6) Integration Notes (agent follow-up)

When you deliver assets, I will:
1. Transcode to web-ready runtime set (likely `.ogg` + manifest updates).
2. Loudness-match by category.
3. Replace synthetic ambience path for gameplay ambience.
4. Wire missing triggers where required.
5. Validate in-game with Playwright/gameplay pass.

---

## 7) Acceptance Checklist for Issue #148

- [x] Ambience style guide included.
- [x] Explicit anti-goals included (no synthetic alarm-like ambience).
- [x] Full SFX inventory included across gameplay/UI/system paths.
- [x] File specs + naming conventions included for sourcing handoff.

---

TODO: DOC - once integrated, document final mix bus, limiter strategy, and runtime voice allocation policy.
