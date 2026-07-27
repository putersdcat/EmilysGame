# Emily's Game — Art Asset Inventory

**Generated:** 2026-02-16T16:38:33.733Z  
**Workspace:** `C:\GitRoots\EmilysGame`  
**Export folder:** `C:\GitRoots\EmilysGame\asset-dev\Export`

## Summary

- **Total embedded SVG assets:** 73
- **Dynamic sprite systems:** 2 (Player character, NPC sprites)

## Usage Pipeline Overview

### Runtime Asset Loading

| Asset domain | Source | Load/prepare path | Render/use path |
| --- | --- | --- | --- |
| Tiles | `src/tiles.ts` | `preloadTiles()` renders SVG->isometric cache, `getIsoTile()` provides drawables | `src/render.ts` drawTile() + cached terrain pipeline |
| World objects/items/wildlife | `src/asset-sprites.ts` | `preloadAssetSprites()` + `getAssetSprite()`/`getFireFrame()` | `src/render.ts` object command path + emoji fallback |
| Player character | `src/sprites.ts` | `generate*CharacterSVG()` + `loadCharacterSprite*()` | `src/main.ts` sets `state.egoImg`; `src/render.ts` draws player image |
| Human NPCs | `src/npc-sprites.ts` | `generateNpcSVG()` + `getNpcSprite()` cache | `src/render.ts` NPC draw path + fallback |
| Customizer preview UI | `src/customizer.ts` | `generateIdleCharacterSVG()` etc. injected as inline SVG into DOM | Customizer overlay preview (`#customizerPreview`) |

## Embedded SVG Assets

### src/asset-sprites.ts

World object/item/wildlife sprites (isometric world entities). 48x48px viewBox.

**Total assets:** 62

| Symbol | Lines | Exported File | Usage |
| --- | --- | --- | --- |
| `TREE_SVG` | 25–42 | `asset-dev\Export\embedded\src__asset-sprites\001-TREE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `TREE_PINE_SVG` | 45–58 | `asset-dev\Export\embedded\src__asset-sprites\002-TREE_PINE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `TREE_PALM_SVG` | 61–80 | `asset-dev\Export\embedded\src__asset-sprites\003-TREE_PALM_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FLOWER_SVG` | 87–99 | `asset-dev\Export\embedded\src__asset-sprites\004-FLOWER_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FLOWER_PINK_SVG` | 102–111 | `asset-dev\Export\embedded\src__asset-sprites\005-FLOWER_PINK_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FLOWER_RED_SVG` | 114–126 | `asset-dev\Export\embedded\src__asset-sprites\006-FLOWER_RED_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SUNFLOWER_SVG` | 129–143 | `asset-dev\Export\embedded\src__asset-sprites\007-SUNFLOWER_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `TULIP_SVG` | 146–152 | `asset-dev\Export\embedded\src__asset-sprites\008-TULIP_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `BUSH_SVG` | 155–170 | `asset-dev\Export\embedded\src__asset-sprites\009-BUSH_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `MUSHROOM_SVG` | 173–182 | `asset-dev\Export\embedded\src__asset-sprites\010-MUSHROOM_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `STUMP_SVG` | 185–193 | `asset-dev\Export\embedded\src__asset-sprites\011-STUMP_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `CACTUS_SVG` | 196–213 | `asset-dev\Export\embedded\src__asset-sprites\012-CACTUS_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `WHEAT_SVG` | 216–227 | `asset-dev\Export\embedded\src__asset-sprites\013-WHEAT_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SEEDLING_SVG` | 230–237 | `asset-dev\Export\embedded\src__asset-sprites\014-SEEDLING_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `CLOVER_SVG` | 240–250 | `asset-dev\Export\embedded\src__asset-sprites\015-CLOVER_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `WILTED_FLOWER_SVG` | 253–259 | `asset-dev\Export\embedded\src__asset-sprites\016-WILTED_FLOWER_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `MAPLE_LEAF_SVG` | 262–267 | `asset-dev\Export\embedded\src__asset-sprites\017-MAPLE_LEAF_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `COIN_SVG` | 270–283 | `asset-dev\Export\embedded\src__asset-sprites\018-COIN_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `KEY_SVG` | 286–300 | `asset-dev\Export\embedded\src__asset-sprites\019-KEY_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `CROWBAR_SVG` | 303–314 | `asset-dev\Export\embedded\src__asset-sprites\020-CROWBAR_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `POTION_SVG` | 317–333 | `asset-dev\Export\embedded\src__asset-sprites\021-POTION_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `BANDAGE_SVG` | 336–354 | `asset-dev\Export\embedded\src__asset-sprites\022-BANDAGE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SNACK_SVG` | 357–377 | `asset-dev\Export\embedded\src__asset-sprites\023-SNACK_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `WATER_FLASK_SVG` | 380–400 | `asset-dev\Export\embedded\src__asset-sprites\024-WATER_FLASK_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SOAP_SVG` | 403–420 | `asset-dev\Export\embedded\src__asset-sprites\025-SOAP_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `TORCH_SVG` | 423–442 | `asset-dev\Export\embedded\src__asset-sprites\026-TORCH_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `MAP_SCROLL_SVG` | 445–467 | `asset-dev\Export\embedded\src__asset-sprites\027-MAP_SCROLL_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `CHEST_SVG` | 470–484 | `asset-dev\Export\embedded\src__asset-sprites\028-CHEST_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SIGN_SVG` | 487–494 | `asset-dev\Export\embedded\src__asset-sprites\029-SIGN_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `HOUSE_SVG` | 497–515 | `asset-dev\Export\embedded\src__asset-sprites\030-HOUSE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `HUT_SVG` | 518–534 | `asset-dev\Export\embedded\src__asset-sprites\031-HUT_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SHOP_SVG` | 537–555 | `asset-dev\Export\embedded\src__asset-sprites\032-SHOP_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `OUTHOUSE_SVG` | 558–565 | `asset-dev\Export\embedded\src__asset-sprites\033-OUTHOUSE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `WALL_SVG` | 568–582 | `asset-dev\Export\embedded\src__asset-sprites\034-WALL_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `DOOR_LOCKED_SVG` | 585–593 | `asset-dev\Export\embedded\src__asset-sprites\035-DOOR_LOCKED_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `DOOR_OPEN_SVG` | 596–601 | `asset-dev\Export\embedded\src__asset-sprites\036-DOOR_OPEN_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FENCE_SVG` | 604–613 | `asset-dev\Export\embedded\src__asset-sprites\037-FENCE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `QUIZ_GATE_SVG` | 616–622 | `asset-dev\Export\embedded\src__asset-sprites\038-QUIZ_GATE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `TOLL_GATE_SVG` | 625–634 | `asset-dev\Export\embedded\src__asset-sprites\039-TOLL_GATE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `BARRICADE_SVG` | 637–643 | `asset-dev\Export\embedded\src__asset-sprites\040-BARRICADE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SPARKLE_SVG` | 646–650 | `asset-dev\Export\embedded\src__asset-sprites\041-SPARKLE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `BRIDGE_SVG` | 653–664 | `asset-dev\Export\embedded\src__asset-sprites\042-BRIDGE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `TALL_PLANT_SVG` | 667–674 | `asset-dev\Export\embedded\src__asset-sprites\043-TALL_PLANT_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `ROCK_V0_SVG` | 681–693 | `asset-dev\Export\embedded\src__asset-sprites\044-ROCK_V0_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `ROCK_V1_SVG` | 696–708 | `asset-dev\Export\embedded\src__asset-sprites\045-ROCK_V1_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `ROCK_V2_SVG` | 711–723 | `asset-dev\Export\embedded\src__asset-sprites\046-ROCK_V2_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FIRE_FRAME_0_SVG` | 729–742 | `asset-dev\Export\embedded\src__asset-sprites\047-FIRE_FRAME_0_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FIRE_FRAME_1_SVG` | 745–759 | `asset-dev\Export\embedded\src__asset-sprites\048-FIRE_FRAME_1_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FIRE_FRAME_2_SVG` | 762–777 | `asset-dev\Export\embedded\src__asset-sprites\049-FIRE_FRAME_2_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FIRE_FRAME_3_SVG` | 780–794 | `asset-dev\Export\embedded\src__asset-sprites\050-FIRE_FRAME_3_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `CHICKEN_SVG` | 801–811 | `asset-dev\Export\embedded\src__asset-sprites\051-CHICKEN_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `ROOSTER_SVG` | 814–826 | `asset-dev\Export\embedded\src__asset-sprites\052-ROOSTER_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `PIG_SVG` | 829–844 | `asset-dev\Export\embedded\src__asset-sprites\053-PIG_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `COW_SVG` | 847–861 | `asset-dev\Export\embedded\src__asset-sprites\054-COW_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `SHEEP_SVG` | 864–880 | `asset-dev\Export\embedded\src__asset-sprites\055-SHEEP_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `GOAT_SVG` | 883–896 | `asset-dev\Export\embedded\src__asset-sprites\056-GOAT_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `RABBIT_SVG` | 899–910 | `asset-dev\Export\embedded\src__asset-sprites\057-RABBIT_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `DUCK_SVG` | 913–922 | `asset-dev\Export\embedded\src__asset-sprites\058-DUCK_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `FOX_SVG` | 925–939 | `asset-dev\Export\embedded\src__asset-sprites\059-FOX_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `DEER_SVG` | 942–955 | `asset-dev\Export\embedded\src__asset-sprites\060-DEER_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `HORSE_SVG` | 958–971 | `asset-dev\Export\embedded\src__asset-sprites\061-HORSE_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |
| `DOG_SVG` | 974–988 | `asset-dev\Export\embedded\src__asset-sprites\062-DOG_SVG.svg` | preloadAssetSprites() pre-renders SVGs into canvas cache |

### src/tiles.ts

Terrain tiles (isometric world terrain). 32x32px micro tiles, rendered to 64x32 isometric diamonds.

**Total tiles:** 11

| Symbol | Lines | Exported File | Usage |
| --- | --- | --- | --- |
| `GRASS_TILE_SVG` | 271–285 | `asset-dev\Export\embedded\src__tiles\001-GRASS_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `DIRT_TILE_SVG` | 287–304 | `asset-dev\Export\embedded\src__tiles\002-DIRT_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `ROCK_TILE_SVG` | 306–320 | `asset-dev\Export\embedded\src__tiles\003-ROCK_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `WATER_TILE_SVG` | 322–335 | `asset-dev\Export\embedded\src__tiles\004-WATER_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `SAND_TILE_SVG` | 337–355 | `asset-dev\Export\embedded\src__tiles\005-SAND_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `STONE_FLOOR_TILE_SVG` | 357–371 | `asset-dev\Export\embedded\src__tiles\006-STONE_FLOOR_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `STONE_WALL_TILE_SVG` | 373–384 | `asset-dev\Export\embedded\src__tiles\007-STONE_WALL_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `BRIDGE_TILE_SVG` | 386–400 | `asset-dev\Export\embedded\src__tiles\008-BRIDGE_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `DOOR_GATE_TILE_SVG` | 402–417 | `asset-dev\Export\embedded\src__tiles\009-DOOR_GATE_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `WOODEN_FENCE_TILE_SVG` | 419–433 | `asset-dev\Export\embedded\src__tiles\010-WOODEN_FENCE_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |
| `QUIZ_GATE_TILE_SVG` | 435–455 | `asset-dev\Export\embedded\src__tiles\011-QUIZ_GATE_TILE_SVG.svg` | preloadTiles() renders SVG->isometric cache |

## Dynamic Sprite Systems

### src/sprites.ts — Player Character

**Type:** dynamic-generated  
**Description:** Player character sprites (64x96px) with customizable appearance

**Generator functions:**
- `generateIdleCharacterSVG()`
- `generateWalkingCharacterSVG()`
- `generateBackIdleCharacterSVG()`
- `generateBackWalkingCharacterSVG()`
- `generateSideIdleCharacterSVG()`
- `generateSideWalkingCharacterSVG()`

**Customization options:**
- hairStyle (6 styles: straight, pigtails, wavy, ponytail, braids, spiky)
- hairColor (customizable hex)
- dressColor (customizable hex)
- skinTone (customizable hex)
- eyeColor (customizable hex)
- accessory (7 types: none, bow, crown, glasses, cowboy_hat, wizard_hat, flower_crown)
- expression (4 types: happy, neutral, surprised, determined)
- outfitPattern (4 types: plain, floral, striped, starry)

**Usage:**
- loadCharacterSpriteAsync() creates sprite images
- render.ts draws player at state.ego position
- customizer.ts preview in customization UI

### src/npc-sprites.ts — Human NPCs

**Type:** dynamic-generated  
**Description:** Human NPC sprites (64x64px) in paper-cut art style

**Generator functions:**
- `generateNpcSVG(assetKey, facing, mouth)`

**Archetypes:**
- `npc_merchant`
- `npc_villager`
- `npc_guardian`
- `npc_farmer`
- `npc_beekeeper`
- `npc_ranger`
- `npc_hermit`
- `npc_miner`
- `npc_knight`

**Facing directions:**
- south (front)
- north (back)
- east (right)
- west (left)

**Mouth states (dialog animation):**
- closed
- open
- wide

**Usage:**
- getNpcSprite() retrieves cached sprite
- render.ts object render pass with emoji fallback

---

*This inventory is auto-generated. All embedded SVG assets are exported to `C:\GitRoots\EmilysGame\asset-dev\Export\embedded` for reference.*
