# Character Sprite System Reference

## Overview

The character sprite system provides programmatic SVG generation for animated character variations. This enables lightweight, scalable character customization without requiring external image assets.

## Files

- **`src/sprites.ts`** - Sprite generation and management
- Used by `src/main.ts` for ego character rendering
- Rendered by `src/render.ts` via `drawSpriteImage()`

## Character Variations

Three built-in character variations (inspired by pixel art examples):

### `blonde_pink`
- Hair: Golden blonde (#D4A574) with pigtails
- Dress: Deep pink (#C84E89)
- Skin: Warm peach (#F4C9B8)

### `brunette_green`
- Hair: Brown (#8B6F47), straight style
- Dress: Forest green (#4A9D5F)
- Skin: Warm peach (#F4C9B8)

### `blonde_purple`
- Hair: Golden blonde (#DAA520), wavy style
- Dress: Purple (#6A5ACD)
- Skin: Warm peach (#F4C9B8)

## Generation Functions

### `generateIdleCharacterSVG(variation: CharacterVariation)`
Returns SVG markup for idle/standing pose.
- Head with hair (style-based)
- Face with eyes and mouth
- Dress/body
- Arms
- Legs and shoes

### `generateWalkingCharacterSVG(variation: CharacterVariation, frame: number)`
Returns SVG markup for walking animation frame (0-5).
- All idle elements plus:
- Animated leg positions (marching)
- Swinging arms (opposite to legs)
- Dynamic pose per frame

## Usage

### Loading Sprites

```typescript
import { characterVariations, loadCharacterSprite } from './sprites';

// Get a character variation
const variation = characterVariations['blonde_pink'];

// Load idle sprite
const idleSprite = loadCharacterSprite(variation, 0, false);

// Load walking sprite (frame 3 out of 6)
const walkSprite = loadCharacterSprite(variation, 3, true);
```

### Integration with Renderer

The `IsometricRenderer.render()` method accepts an optional `egoSpriteImg` parameter:

```typescript
renderer.render(
  sceneObjects,
  egoPosition,
  egoDirection,
  egoSpriteImg  // HTMLImageElement
);
```

If provided, the ego character renders as the SVG sprite instead of emoji.

## Animation System

Walking animations use 6 frames, cycling continuously during movement:

```
Frame 0: Neutral stance
Frame 1: Left leg back, right leg forward
Frame 2: Left leg back (maximum), right leg forward (maximum)
Frame 3: Returning to neutral
Frame 4: Left leg forward, right leg back
Frame 5: Left leg forward (maximum), right leg back (maximum)
```

Arms swing in opposite direction to legs for realistic walking motion.

## Performance

- SVG generation is CPU-bound but lightweight (<1ms per sprite)
- Generated sprites are cached in `spriteCache` Map
- Sprite cache stores: `"variation_name_f{frame}_{walking|idle}"`
- One sprite per animation state (negligible memory footprint)

## Extending the System

### Adding a New Character Variation

1. Add to `characterVariations` in `sprites.ts`:
```typescript
export const characterVariations: Record<string, CharacterVariation> = {
  // ... existing variations
  my_character: {
    name: 'My Character',
    hairColor: '#FF6B6B',
    hairStyle: 'wavy',
    dressColor: '#4ECDC4',
    skinTone: '#FDBCB4',
  },
};
```

2. Update character loading in `main.ts`:
```typescript
const characterVariation = characterVariations['my_character'];
```

### Customizing Hair Styles

Modify `generateIdleCharacterSVG()` and `generateWalkingCharacterSVG()` to add new styles in the `if (hairStyle === '...')` branches.

### Fine-tuning Animation

Adjust leg/arm offsets in the frame position arrays at the top of `generateWalkingCharacterSVG()`:

```typescript
const legOffset = [0, -4, -6, -4, 0, 4][frame];  // Y-axis movement
const armSwing = [0, -3, -5, -3, 0, 3][frame];   // Arm rotation angle
```

## Future Improvements

1. **Accessories**: Add hats, glasses, backpacks via additional conditional SVG elements
2. **Expressions**: Animate eyes/mouth based on game state (happy, talking, surprised)
3. **Color Palette**: Decouple colors for fine-grained customization
4. **Pixel Art Import**: Parse pixel art spritesheets and convert to procedural SVG paths
5. **Performance**: Use canvas rendering instead of SVG for potentially faster drawing

## Technical Notes

- SVG strings are converted to Blob URLs for rendering via Canvas `drawImage()`
- Image load is handled asynchronously but cached for instant reuse
- Synchronous `loadCharacterSprite()` returns immediately; image loads in background
- `loadCharacterSpriteAsync()` available for guaranteed-loaded sprites (if needed)

## See Also

- [Renderer Reference](src/render.ts) - `drawSpriteImage()` method
- [Main Loop](src/main.ts) - Sprite animation state management
- [Assets System](src/assets.ts) - WorldObject metadata
