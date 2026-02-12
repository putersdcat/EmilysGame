/**
 * assets.ts - Asset metadata and definitions for the isometric world.
 * Defines world objects with visual, dimensional, and rendering properties.
 */

export interface WorldObject {
  emojiOrSvg: string;  // Emoji character or SVG data URI
  type: 'ground' | 'plant' | 'object' | 'ego';
  height: number;      // 0-10 units for sorting/occlusion
  layer: 'base' | 'mid' | 'high';  // Initial draw group
  scale: number;       // 0.5-2.0 for size variation
  shadow: boolean;     // True for global shadow (ellipse under taller items)
}

export interface SceneObject extends WorldObject {
  x: number;  // Grid X
  y: number;  // Grid Y
  frameIndex?: number;  // For animated objects
}

/**
 * Asset metadata library - indexed by asset type/name.
 */
export const assetLibrary: Record<string, WorldObject> = {
  tree: {
    emojiOrSvg: '🌳',
    type: 'plant',
    height: 8,
    layer: 'high',
    scale: 1.2,
    shadow: true,
  },
  bush: {
    emojiOrSvg: '🌿',
    type: 'plant',
    height: 3,
    layer: 'mid',
    scale: 0.9,
    shadow: true,
  },
  grass: {
    emojiOrSvg: '🌱',
    type: 'plant',
    height: 1,
    layer: 'base',
    scale: 0.7,
    shadow: false,
  },
  mushroom: {
    emojiOrSvg: '🍄',
    type: 'plant',
    height: 2,
    layer: 'mid',
    scale: 0.8,
    shadow: true,
  },
  flower: {
    emojiOrSvg: '🌼',
    type: 'plant',
    height: 1,
    layer: 'base',
    scale: 0.6,
    shadow: false,
  },
  rock: {
    emojiOrSvg: '🪨',
    type: 'object',
    height: 2,
    layer: 'mid',
    scale: 0.8,
    shadow: true,
  },
  ego: {
    emojiOrSvg: '🧑',
    type: 'ego',
    height: 3,
    layer: 'mid',
    scale: 1.0,
    shadow: true,
  },
};

/**
 * Create a scene from an array of object descriptions.
 * Input format: Array of {x, y, assetType string}
 */
export function createSceneFromData(
  sceneData: Array<{ x: number; y: number; assetType: string }>
): SceneObject[] {
  return sceneData.map((item) => ({
    ...assetLibrary[item.assetType],
    x: item.x,
    y: item.y,
    frameIndex: 0,
  }));
}

/**
 * Generate a fixed meadow scene for PoC.
 * Returns hardcoded layout: 10x10 grid with scattered plants.
 */
export function generateMeadowScene(): SceneObject[] {
  // Plant density: ~15 plants scattered across meadow
  const plantPositions = [
    { x: 2, y: 1, type: 'tree' },
    { x: 5, y: 3, type: 'tree' },
    { x: 8, y: 2, type: 'tree' },
    { x: 1, y: 4, type: 'bush' },
    { x: 3, y: 6, type: 'mushroom' },
    { x: 6, y: 5, type: 'mushroom' },
    { x: 7, y: 8, type: 'bush' },
    { x: 2, y: 7, type: 'flower' },
    { x: 4, y: 2, type: 'grass' },
    { x: 9, y: 6, type: 'rock' },
    { x: 8, y: 9, type: 'grass' },
    { x: 1, y: 8, type: 'flower' },
    { x: 5, y: 9, type: 'bush' },
    { x: 9, y: 1, type: 'mushroom' },
    { x: 3, y: 9, type: 'grass' },
  ];

  const sceneData = plantPositions.map((pos) => ({
    x: pos.x,
    y: pos.y,
    assetType: pos.type,
  }));

  return createSceneFromData(sceneData);
}
