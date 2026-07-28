/** Water style palettes and deterministic per-tile variation. */

import type { FeatureVariant, WaterFactoryOptions, WaterStyle, WaterStyleId } from './types';
import { clamp01, hash01, mix } from './utils';

const STYLES: Record<WaterStyleId, WaterStyle> = {
  'clear-river': {
    id: 'clear-river',
    bankOuter: '#5f6530', bankInner: '#786733', bankWet: '#3f512e',
    shallow: '#2b86a8', mid: '#1b638f', deep: '#0d345f',
    foam: '#a8d9e8', glint: '#e8fff8', vegetation: '#4e9a46', pebble: '#9b8b62',
    channelWidth: 64, bankWidth: 11, flowSpeed: 1.0, rippleDensity: 1.0, opacity: 1,
  },
  'muddy-creek': {
    id: 'muddy-creek',
    bankOuter: '#6a5429', bankInner: '#806439', bankWet: '#3e3524',
    shallow: '#617845', mid: '#3d684f', deep: '#244b46',
    foam: '#b7caa6', glint: '#e4e8cf', vegetation: '#5d8844', pebble: '#8d7650',
    channelWidth: 58, bankWidth: 13, flowSpeed: 0.65, rippleDensity: 0.72, opacity: 1,
  },
  'deep-pond': {
    id: 'deep-pond',
    bankOuter: '#5a4a28', bankInner: '#746035', bankWet: '#303c2a',
    shallow: '#286b86', mid: '#174f78', deep: '#082b50',
    foam: '#87bfd4', glint: '#e5fff7', vegetation: '#467a38', pebble: '#8b7a55',
    channelWidth: 70, bankWidth: 12, flowSpeed: 0.25, rippleDensity: 1.25, opacity: 1,
  },
  'marsh-water': {
    id: 'marsh-water',
    bankOuter: '#596b32', bankInner: '#69753d', bankWet: '#344529',
    shallow: '#52774a', mid: '#356751', deep: '#1d4744',
    foam: '#a8c49d', glint: '#d9eed2', vegetation: '#5fa047', pebble: '#7c7650',
    channelWidth: 62, bankWidth: 14, flowSpeed: 0.45, rippleDensity: 0.88, opacity: 1,
  },
};

const DEFAULT_STYLE: WaterStyleId = 'clear-river';

export function listWaterStyles(): readonly WaterStyleId[] {
  return Object.keys(STYLES) as WaterStyleId[];
}

export function defaultWaterStyle(): WaterStyle {
  return STYLES[DEFAULT_STYLE];
}

export function resolveWaterStyle(styleLike?: WaterStyleId | WaterStyle): WaterStyle {
  if (!styleLike) return defaultWaterStyle();
  return typeof styleLike === 'string' ? STYLES[styleLike] : styleLike;
}

export function createWaterStyleVariant(
  styleLike?: WaterStyleId | WaterStyle,
  options: WaterFactoryOptions = {},
): WaterStyle {
  const base = resolveWaterStyle(styleLike);
  const seed = options.seed ?? base.id;
  const n = (slot: string) => hash01(`${seed}:${slot}`);
  const wet = clamp01(0.42 + (options.wetness ?? 0) + n('wet') * 0.18);
  const silt = clamp01(0.18 + (options.silt ?? 0) + n('silt') * 0.22);
  const reeds = clamp01(0.20 + (options.reeds ?? 0) + n('reeds') * 0.22);
  const turbulence = clamp01(0.16 + (options.turbulence ?? 0) + n('turb') * 0.20);
  return Object.freeze({
    ...base,
    bankOuter: mix(base.bankOuter, base.bankWet, wet * 0.22),
    bankInner: mix(mix(base.bankInner, base.bankWet, wet * 0.28), '#82683a', silt * 0.18),
    shallow: mix(base.shallow, base.bankWet, silt * 0.08),
    mid: mix(base.mid, base.bankWet, silt * 0.06),
    deep: mix(base.deep, '#061b34', wet * 0.06),
    vegetation: mix(base.vegetation, '#6aa84f', reeds * 0.18),
    pebble: mix(base.pebble, '#6b5635', silt * 0.24),
    rippleDensity: Math.max(0.25, base.rippleDensity + turbulence * 0.25 - 0.10),
  });
}

export function waterStyleForTile(
  styleLike: WaterStyleId | WaterStyle | undefined,
  worldCol: number,
  worldRow: number,
  variant: FeatureVariant,
  options: Omit<WaterFactoryOptions, 'style' | 'seed'> = {},
): WaterStyle {
  const base = styleLike ? resolveWaterStyle(styleLike) : (variant === 'isolated' ? STYLES['deep-pond'] : STYLES[DEFAULT_STYLE]);
  return createWaterStyleVariant(base, {
    ...options,
    seed: `${base.id}:${worldCol}:${worldRow}:${variant}`,
  });
}

export function chooseWaterStyle(
  styleId: WaterStyleId | WaterStyle | undefined,
  worldCol: number,
  worldRow: number,
  variant: FeatureVariant,
  options: WaterFactoryOptions,
): WaterStyle {
  if (styleId) return waterStyleForTile(styleId, worldCol, worldRow, variant, options);
  if (variant === 'isolated') return STYLES['deep-pond'];
  void worldCol;
  void worldRow;
  // Connected rivers must not randomly change color family from tile to tile.
  return STYLES[DEFAULT_STYLE];
}
