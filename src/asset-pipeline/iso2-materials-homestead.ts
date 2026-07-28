/**
 * iso2-materials-homestead.ts — rural dwelling wall factory (D.3 port).
 * Source: experiment/isometric-2.0/src/textures/homestead-family.ts
 */

export const HOMESTEAD_IMAGE_SIZE = 144;

const SIZE = HOMESTEAD_IMAGE_SIZE;
const BOARD_MIN = 14;
const BOARD_VARIANCE = 10;

export interface HomesteadPaletteSpec {
  readonly mode: 'timber-frame' | 'plaster' | 'planks';
  readonly plasterBase: string;
  readonly limeWash: string;
  readonly speck: string;
  readonly crack: string;
  readonly beamBase: string;
  readonly beamHighlight: string;
  readonly beamShadow: string;
  readonly sideBoards: readonly string[];
  readonly topBoards: readonly string[];
  readonly seam: string;
  readonly grain: string;
  readonly salt: number;
}

export interface HomesteadMaterial {
  readonly IMAGE_SIZE: typeof HOMESTEAD_IMAGE_SIZE;
  svg(): string;
  svgTop(): string;
  svgTopV(): string;
  svgSouth(): string;
  svgEast(): string;
  svgEnd(): string;
}

function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function wrap(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
    ${body}
  </svg>`;
}

function boardField(
  palette: readonly string[],
  seam: string,
  grain: string,
  salt: number,
  vertical: boolean,
): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${seam}" />`];
  let pos = 0;
  let idx = 0;

  while (pos < SIZE) {
    const remaining = SIZE - pos;
    const raw = BOARD_MIN + Math.floor(hash01(idx, vertical ? 17 : 23, salt) * BOARD_VARIANCE);
    const span = Math.min(remaining, raw);
    const fill = palette[(idx + Math.floor(hash01(idx, salt, 91) * palette.length)) % palette.length]!;

    if (vertical) {
      parts.push(`<rect x="${pos + 1}" y="0" width="${Math.max(1, span - 2)}" height="${SIZE}" fill="${fill}" />`);
      parts.push(`<rect x="${pos + 1}" y="0" width="1" height="${SIZE}" fill="rgba(255,255,255,0.14)" />`);
      parts.push(`<rect x="${pos + span - 2}" y="0" width="1" height="${SIZE}" fill="rgba(0,0,0,0.16)" />`);
      for (let g = 0; g < 3; g++) {
        const gx = pos + 3 + Math.floor(hash01(idx, g, salt + 101) * Math.max(2, span - 6));
        parts.push(`<rect x="${gx}" y="0" width="1" height="${SIZE}" fill="${grain}" opacity="${(0.10 + hash01(idx, g, salt + 107) * 0.16).toFixed(2)}" />`);
      }
      if (span > 16) {
        const knotX = pos + 4 + hash01(idx, salt, 151) * Math.max(4, span - 8);
        const knotY = 24 + hash01(idx, salt, 157) * 96;
        parts.push(`<ellipse cx="${knotX.toFixed(1)}" cy="${knotY.toFixed(1)}" rx="2.4" ry="3.8" fill="rgba(50,26,12,0.18)" />`);
      }
    } else {
      parts.push(`<rect x="0" y="${pos + 1}" width="${SIZE}" height="${Math.max(1, span - 2)}" fill="${fill}" />`);
      parts.push(`<rect x="0" y="${pos + 1}" width="${SIZE}" height="1" fill="rgba(255,255,255,0.14)" />`);
      parts.push(`<rect x="0" y="${pos + span - 2}" width="${SIZE}" height="1" fill="rgba(0,0,0,0.16)" />`);
      for (let g = 0; g < 3; g++) {
        const gy = pos + 3 + Math.floor(hash01(idx, g, salt + 131) * Math.max(2, span - 6));
        parts.push(`<rect x="0" y="${gy}" width="${SIZE}" height="1" fill="${grain}" opacity="${(0.10 + hash01(idx, g, salt + 137) * 0.16).toFixed(2)}" />`);
      }
      if (span > 16) {
        const knotX = 24 + hash01(idx, salt, 171) * 96;
        const knotY = pos + 4 + hash01(idx, salt, 173) * Math.max(4, span - 8);
        parts.push(`<ellipse cx="${knotX.toFixed(1)}" cy="${knotY.toFixed(1)}" rx="3.8" ry="2.4" fill="rgba(50,26,12,0.18)" />`);
      }
    }

    pos += span;
    idx++;
  }

  return parts.join('\n    ');
}

function plasterField(spec: HomesteadPaletteSpec): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.plasterBase}" />`];

  for (let i = 0; i < 28; i++) {
    const cx = 8 + hash01(i, spec.salt, 11) * 128;
    const cy = 8 + hash01(i, spec.salt, 13) * 128;
    const rx = 8 + hash01(i, spec.salt, 17) * 18;
    const ry = 3 + hash01(i, spec.salt, 19) * 7;
    const rot = hash01(i, spec.salt, 23) * 180;
    parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="${spec.limeWash}" opacity="${(0.10 + hash01(i, spec.salt, 29) * 0.16).toFixed(2)}" />`);
  }

  for (let i = 0; i < 42; i++) {
    const x = hash01(i, spec.salt, 31) * SIZE;
    const y = hash01(i, spec.salt, 37) * SIZE;
    const w = 1 + Math.floor(hash01(i, spec.salt, 41) * 3);
    const h = 1 + Math.floor(hash01(i, spec.salt, 43) * 3);
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" fill="${spec.speck}" opacity="${(0.25 + hash01(i, spec.salt, 47) * 0.35).toFixed(2)}" />`);
  }

  for (let i = 0; i < 7; i++) {
    const x1 = 8 + hash01(i, spec.salt, 53) * 128;
    const y1 = 12 + hash01(i, spec.salt, 59) * 120;
    const x2 = x1 + (hash01(i, spec.salt, 61) * 26 - 13);
    const y2 = y1 + 18 + hash01(i, spec.salt, 67) * 34;
    const x3 = x2 + (hash01(i, spec.salt, 71) * 18 - 9);
    const y3 = y2 + 16 + hash01(i, spec.salt, 73) * 22;
    parts.push(`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${x2.toFixed(1)} ${y2.toFixed(1)} ${x3.toFixed(1)} ${y3.toFixed(1)}" fill="none" stroke="${spec.crack}" stroke-width="1.1" stroke-linecap="round" opacity="0.55" />`);
  }

  return parts.join('\n    ');
}

function timberPanelField(spec: HomesteadPaletteSpec): string {
  const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="${spec.plasterBase}" />`];

  for (let i = 0; i < 30; i++) {
    const x = hash01(i, spec.salt, 211) * SIZE;
    const y = hash01(i, spec.salt, 223) * SIZE;
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="2" height="2" fill="${spec.speck}" opacity="0.34" />`);
  }

  for (let y = 0; y < SIZE; y += 48) {
    for (let x = 0; x < SIZE; x += 48) {
      const inset = 3;
      const beam = 5;
      const panelX = x + inset;
      const panelY = y + inset;
      const panelW = 48 - inset * 2;
      const panelH = 48 - inset * 2;

      parts.push(`<rect x="${panelX + beam}" y="${panelY + beam}" width="${panelW - beam * 2}" height="${panelH - beam * 2}" fill="${spec.plasterBase}" />`);
      parts.push(`<rect x="${panelX + beam + 2}" y="${panelY + beam + 2}" width="${panelW - beam * 2 - 4}" height="${panelH - beam * 2 - 4}" fill="${spec.limeWash}" opacity="0.16" />`);

      parts.push(`<rect x="${panelX}" y="${panelY}" width="${beam}" height="${panelH}" fill="${spec.beamBase}" />`);
      parts.push(`<rect x="${panelX + panelW - beam}" y="${panelY}" width="${beam}" height="${panelH}" fill="${spec.beamBase}" />`);
      parts.push(`<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${beam}" fill="${spec.beamBase}" />`);
      parts.push(`<rect x="${panelX}" y="${panelY + panelH - beam}" width="${panelW}" height="${beam}" fill="${spec.beamBase}" />`);

      parts.push(`<rect x="${panelX}" y="${panelY}" width="${panelW}" height="1" fill="${spec.beamHighlight}" opacity="0.50" />`);
      parts.push(`<rect x="${panelX}" y="${panelY + panelH - 1}" width="${panelW}" height="1" fill="${spec.beamShadow}" opacity="0.62" />`);
      parts.push(`<rect x="${panelX}" y="${panelY}" width="1" height="${panelH}" fill="${spec.beamHighlight}" opacity="0.42" />`);
      parts.push(`<rect x="${panelX + panelW - 1}" y="${panelY}" width="1" height="${panelH}" fill="${spec.beamShadow}" opacity="0.58" />`);

      const flip = ((x / 48 + y / 48 + spec.salt) & 1) === 0;
      const x1 = flip ? panelX + beam : panelX + panelW - beam;
      const x2 = flip ? panelX + panelW - beam : panelX + beam;
      const y1 = panelY + panelH - beam;
      const y2 = panelY + beam;
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${spec.beamBase}" stroke-width="4" stroke-linecap="square" />`);
      parts.push(`<line x1="${x1}" y1="${y1 - 1}" x2="${x2}" y2="${y2 - 1}" stroke="${spec.beamHighlight}" stroke-width="1" opacity="0.38" />`);
    }
  }

  return parts.join('\n    ');
}

export function createHomesteadMaterial(spec: HomesteadPaletteSpec): HomesteadMaterial {
  let cachedSide: string | null = null;
  let cachedTop: string | null = null;
  let cachedTopV: string | null = null;
  let cachedEnd: string | null = null;

  function sideBody(): string {
    if (spec.mode === 'planks') return boardField(spec.sideBoards, spec.seam, spec.grain, spec.salt, true);
    if (spec.mode === 'timber-frame') return timberPanelField(spec);
    return plasterField(spec);
  }

  function topBody(vertical: boolean): string {
    return boardField(spec.topBoards, spec.seam, spec.grain, spec.salt + 401, !vertical);
  }

  function endBody(): string {
    return spec.mode === 'planks'
      ? boardField(spec.topBoards, spec.seam, spec.grain, spec.salt + 601, true)
      : spec.mode === 'timber-frame'
        ? timberPanelField(spec)
        : boardField(spec.topBoards, spec.seam, spec.grain, spec.salt + 607, true);
  }

  return {
    IMAGE_SIZE: HOMESTEAD_IMAGE_SIZE,
    svg(): string {
      cachedSide ??= wrap(sideBody());
      return cachedSide;
    },
    svgTop(): string {
      cachedTop ??= wrap(topBody(false));
      return cachedTop;
    },
    svgTopV(): string {
      cachedTopV ??= wrap(topBody(true));
      return cachedTopV;
    },
    svgSouth(): string {
      cachedSide ??= wrap(sideBody());
      return cachedSide;
    },
    svgEast(): string {
      cachedSide ??= wrap(sideBody());
      return cachedSide;
    },
    svgEnd(): string {
      cachedEnd ??= wrap(endBody());
      return cachedEnd;
    },
  };
}

/** Timber frame (experiment timber-frame-wall.ts) — existing homestead_wall default. */
export const TimberFrameWall = createHomesteadMaterial({
  mode: 'timber-frame',
  plasterBase: '#d3c8b5',
  limeWash: 'rgba(255,250,236,0.24)',
  speck: 'rgba(116,104,88,0.14)',
  crack: 'rgba(96,82,65,0.18)',
  beamBase: '#6f4c32',
  beamHighlight: '#a57a53',
  beamShadow: '#452d1d',
  sideBoards: ['#88613b', '#7a5532', '#967049'],
  topBoards: ['#8d633b', '#7d5632', '#9d7348'],
  seam: '#5b3f27',
  grain: 'rgba(54,35,21,0.22)',
  salt: 9101,
});

/** Limewashed plaster cottage wall (experiment plaster-whitewash-wall.ts). */
export const PlasterWhitewashWall = createHomesteadMaterial({
  mode: 'plaster',
  plasterBase: '#e2dbcf',
  limeWash: 'rgba(255,255,248,0.30)',
  speck: 'rgba(126,118,101,0.12)',
  crack: 'rgba(113,103,88,0.18)',
  beamBase: '#755234',
  beamHighlight: '#aa8055',
  beamShadow: '#4b3120',
  sideBoards: ['#88613b', '#7a5532', '#967049'],
  topBoards: ['#866039', '#78552f', '#96704a'],
  seam: '#5f4228',
  grain: 'rgba(52,33,18,0.20)',
  salt: 9102,
});

/** Rough wood plank wall (experiment rough-wood-plank-wall.ts). */
export const RoughWoodPlankWall = createHomesteadMaterial({
  mode: 'planks',
  plasterBase: '#8c6b45',
  limeWash: 'rgba(255,255,255,0)',
  speck: 'rgba(0,0,0,0)',
  crack: 'rgba(0,0,0,0)',
  beamBase: '#755234',
  beamHighlight: '#aa8055',
  beamShadow: '#4b3120',
  sideBoards: ['#8a653d', '#77522e', '#9b7548', '#684626'],
  topBoards: ['#916a41', '#7f5934', '#a37d50', '#714c2b'],
  seam: '#513720',
  grain: 'rgba(44,27,15,0.28)',
  salt: 9103,
});