/**
 * iso2-fence-family.ts — procedural rustic fence style presets (experiment fence-family.ts).
 *
 * Fences/gates render as procedural geometry in nano-tile.ts; this module is the
 * source of truth for material + construction presets used by those primitives.
 */

export type IsoFenceConstructionKind = 'post-and-rail' | 'split-rail' | 'picket' | 'wattle';
export type IsoFenceGateKind = 'farm' | 'picket' | 'wattle';
export type IsoFenceLeafMode = 'single' | 'double';

export interface IsoFenceWeathering {
  readonly sunBleach: number;
  readonly moss: number;
  readonly grime: number;
  readonly cracks: number;
}

export interface IsoFenceStyle {
  readonly id: string;
  readonly construction: IsoFenceConstructionKind;
  readonly gateKind: IsoFenceGateKind;
  readonly gateLeafMode: IsoFenceLeafMode;
  readonly postColor: string;
  readonly postShadow: string;
  readonly postHighlight: string;
  readonly railColor: string;
  readonly railShadow: string;
  readonly railHighlight: string;
  readonly hardwareColor: string;
  readonly bleachColor: string;
  readonly mossColor: string;
  readonly grimeColor: string;
  readonly crackColor: string;
  readonly postWidth: number;
  readonly postCapHeight: number;
  readonly postHeightScale: number;
  readonly railThickness: number;
  readonly railSpread: number;
  readonly railCount: 1 | 2 | 3;
  readonly midSpanPosts: boolean;
  readonly picketSpacing?: number;
  readonly weaveSpacing?: number;
  readonly sag: number;
  readonly roughness: number;
  readonly weathering: IsoFenceWeathering;
}

function style(spec: IsoFenceStyle): IsoFenceStyle {
  return Object.freeze(spec);
}

export const WeatheredPostRail = style({
  id: 'weathered-post-rail',
  construction: 'post-and-rail',
  gateKind: 'farm',
  gateLeafMode: 'single',
  postColor: '#6f5c48',
  postShadow: '#433528',
  postHighlight: '#a08f77',
  railColor: '#7a6852',
  railShadow: '#493a2c',
  railHighlight: '#aa987f',
  hardwareColor: '#3f403d',
  bleachColor: '#d0c2aa',
  mossColor: '#536544',
  grimeColor: '#3d3126',
  crackColor: '#2b2119',
  postWidth: 8,
  postCapHeight: 4,
  postHeightScale: 0.98,
  railThickness: 5,
  railSpread: 0.22,
  railCount: 2,
  midSpanPosts: true,
  sag: 0.8,
  roughness: 0.24,
  weathering: { sunBleach: 0.24, moss: 0.08, grime: 0.22, cracks: 0.18 },
});

export const SplitRailOak = style({
  id: 'split-rail-oak',
  construction: 'split-rail',
  gateKind: 'farm',
  gateLeafMode: 'single',
  postColor: '#665038',
  postShadow: '#382919',
  postHighlight: '#947251',
  railColor: '#73583a',
  railShadow: '#3c2819',
  railHighlight: '#9f7b53',
  hardwareColor: '#37342f',
  bleachColor: '#c5b08f',
  mossColor: '#546542',
  grimeColor: '#34271d',
  crackColor: '#261b13',
  postWidth: 7,
  postCapHeight: 3,
  postHeightScale: 0.94,
  railThickness: 6,
  railSpread: 0.25,
  railCount: 2,
  midSpanPosts: true,
  sag: 1.8,
  roughness: 0.62,
  weathering: { sunBleach: 0.16, moss: 0.06, grime: 0.24, cracks: 0.34 },
});

export const MossyFarmRail = style({
  id: 'mossy-farm-rail',
  construction: 'post-and-rail',
  gateKind: 'farm',
  gateLeafMode: 'single',
  postColor: '#645742',
  postShadow: '#3c3225',
  postHighlight: '#96886d',
  railColor: '#70644e',
  railShadow: '#40372a',
  railHighlight: '#9f9279',
  hardwareColor: '#3d3d39',
  bleachColor: '#bfb49f',
  mossColor: '#4d6a43',
  grimeColor: '#372d22',
  crackColor: '#241d18',
  postWidth: 8,
  postCapHeight: 4,
  postHeightScale: 0.98,
  railThickness: 5,
  railSpread: 0.22,
  railCount: 2,
  midSpanPosts: true,
  sag: 0.9,
  roughness: 0.28,
  weathering: { sunBleach: 0.14, moss: 0.48, grime: 0.26, cracks: 0.16 },
});

export const BleachedPaddock = style({
  id: 'bleached-paddock',
  construction: 'post-and-rail',
  gateKind: 'farm',
  gateLeafMode: 'double',
  postColor: '#847d6f',
  postShadow: '#555044',
  postHighlight: '#c8c1b2',
  railColor: '#948b7b',
  railShadow: '#5d5548',
  railHighlight: '#d4ccbc',
  hardwareColor: '#4b4944',
  bleachColor: '#e3dac9',
  mossColor: '#6a7a56',
  grimeColor: '#4a4337',
  crackColor: '#3a342d',
  postWidth: 8,
  postCapHeight: 4,
  postHeightScale: 0.96,
  railThickness: 4,
  railSpread: 0.18,
  railCount: 3,
  midSpanPosts: true,
  sag: 0.4,
  roughness: 0.18,
  weathering: { sunBleach: 0.56, moss: 0.04, grime: 0.18, cracks: 0.18 },
});

export const RoughPicket = style({
  id: 'rough-picket',
  construction: 'picket',
  gateKind: 'picket',
  gateLeafMode: 'double',
  postColor: '#72624b',
  postShadow: '#453729',
  postHighlight: '#a79479',
  railColor: '#806b50',
  railShadow: '#4a3a2b',
  railHighlight: '#b19878',
  hardwareColor: '#41403b',
  bleachColor: '#cfbea2',
  mossColor: '#556947',
  grimeColor: '#3b3126',
  crackColor: '#2a2018',
  postWidth: 8,
  postCapHeight: 4,
  postHeightScale: 1.02,
  railThickness: 4,
  railSpread: 0.24,
  railCount: 2,
  midSpanPosts: true,
  picketSpacing: 16,
  sag: 0.2,
  roughness: 0.22,
  weathering: { sunBleach: 0.20, moss: 0.08, grime: 0.18, cracks: 0.16 },
});

export const HazelWattle = style({
  id: 'hazel-wattle',
  construction: 'wattle',
  gateKind: 'wattle',
  gateLeafMode: 'single',
  postColor: '#6c5638',
  postShadow: '#3e2d1a',
  postHighlight: '#9a7a52',
  railColor: '#8a6c44',
  railShadow: '#4d351d',
  railHighlight: '#b78e5d',
  hardwareColor: '#473a2d',
  bleachColor: '#d2bd93',
  mossColor: '#607046',
  grimeColor: '#3d2e20',
  crackColor: '#2a1e14',
  postWidth: 7,
  postCapHeight: 3,
  postHeightScale: 0.92,
  railThickness: 4,
  railSpread: 0.16,
  railCount: 3,
  midSpanPosts: true,
  weaveSpacing: 12,
  sag: 0.9,
  roughness: 0.40,
  weathering: { sunBleach: 0.18, moss: 0.12, grime: 0.22, cracks: 0.12 },
});

const STYLES: Record<string, IsoFenceStyle> = {
  [WeatheredPostRail.id]: WeatheredPostRail,
  [SplitRailOak.id]: SplitRailOak,
  [MossyFarmRail.id]: MossyFarmRail,
  [BleachedPaddock.id]: BleachedPaddock,
  [RoughPicket.id]: RoughPicket,
  [HazelWattle.id]: HazelWattle,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function resolveFenceStyle(styleLike?: string | IsoFenceStyle): IsoFenceStyle {
  if (!styleLike) return defaultFenceStyle();
  return typeof styleLike === 'string' ? (getFenceStyle(styleLike) ?? defaultFenceStyle()) : styleLike;
}

export function getFenceStyle(name: string): IsoFenceStyle | undefined {
  return STYLES[name];
}

export function listFenceStyles(): readonly string[] {
  return Object.keys(STYLES);
}

export function defaultFenceStyle(): IsoFenceStyle {
  return WeatheredPostRail;
}

export function fenceStyleForTile(
  styleLike: string | IsoFenceStyle | undefined,
  worldCol: number,
  worldRow: number,
  variant: string,
): IsoFenceStyle {
  const base = resolveFenceStyle(styleLike);
  const seed = `${base.id}:${worldCol}:${worldRow}:${variant}`;
  const bleachNoise = hash01(`${seed}:bleach`) * 0.10 - 0.03;
  const mossNoise = hash01(`${seed}:moss`) * 0.08 - 0.02;
  const grimeNoise = hash01(`${seed}:grime`) * 0.10 - 0.02;
  const crackNoise = hash01(`${seed}:cracks`) * 0.08 - 0.02;
  const roughNoise = hash01(`${seed}:rough`) * 0.08 - 0.03;

  return style({
    ...base,
    roughness: clamp01(base.roughness + roughNoise),
    sag: Math.max(0, base.sag + hash01(`${seed}:sag`) * 0.5 - 0.15),
    weathering: {
      sunBleach: clamp01(base.weathering.sunBleach + bleachNoise),
      moss: clamp01(base.weathering.moss + mossNoise),
      grime: clamp01(base.weathering.grime + grimeNoise),
      cracks: clamp01(base.weathering.cracks + crackNoise),
    },
  });
}