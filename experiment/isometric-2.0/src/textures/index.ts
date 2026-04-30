/**
 * textures/index.ts — barrel export for texture modules.
 *
 * Each texture module follows the contract in textures/README.md:
 *   - exports IMAGE_SIZE (canonical px size)
 *   - exports svg() returning the full SVG string
 *
 * Convention: import as a namespace so call sites read `StoneBrick.svg()`.
 */

export * as StoneBrick from './stone-brick';
export * as RedClinker from './red-clinker';
export * as StoneStub  from './stone-stub';
