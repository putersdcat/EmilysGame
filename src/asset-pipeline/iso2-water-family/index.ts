/** Public barrel for the D.6 Iso 2.0 water material family port. */

export type { WaterFactoryOptions, WaterStyle, WaterStyleId } from './types';
export { createWaterStyleVariant, defaultWaterStyle, listWaterStyles, waterStyleForTile } from './styles';
export { svgRiverBank, svgWater, svgWaterFrameStrip } from './svg-water';
