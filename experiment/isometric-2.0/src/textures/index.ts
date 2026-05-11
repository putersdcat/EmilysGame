/**
 * textures/index.ts — barrel export for texture modules.
 *
 * Each texture module follows the contract in textures/README.md:
 *   - exports IMAGE_SIZE (canonical px size)
 *   - exports svg() returning the full SVG string
 *
 * Convention: import as a namespace so call sites read `StoneBrick.svg()`.
 */

export * as StoneBrick   from './stone-brick';
export * as RedClinker   from './red-clinker';
export * as MudBrick     from './mud-brick';
export * as SandstoneBrick from './sandstone-brick';
export * as AncientStone from './ancient-stone';
export * as BrickFamily  from './brick-family';
export * as AncientStoneFamily from './ancient-stone-family';
export * as Limestone from './limestone';
export * as DarkCathedralStone from './dark-cathedral-stone';
export * as HomesteadFamily from './homestead-family';
export * as TimberFrameWall from './timber-frame-wall';
export * as PlasterWhitewashWall from './plaster-whitewash-wall';
export * as RoughWoodPlankWall from './rough-wood-plank-wall';
export * as CottageStoneFoundation from './cottage-stone-foundation';
export * as RoofFamily from './roof-family';
export * as ThatchRoof from './thatch-roof';
