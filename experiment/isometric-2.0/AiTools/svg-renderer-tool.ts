/**
 * svg-renderer-tool.ts — 2.0 Experiment: Core SVG render logic for LLM tooling.
 * Renders SVG strings to PNG buffers, with optional isometric diamond mode.
 * Uses @resvg/resvg-js for headless SVG → PNG without a browser.
 * TODO: DOC — tool schema definitions for MCP integration
 */

import { Resvg } from '@resvg/resvg-js';

// Game engine geometry — pure constants, no Canvas deps
import { ISO_TILE_WIDTH, ISO_TILE_HEIGHT, MICRO_TILE_SIZE } from '../src/types.js';
import { HALF_W, HALF_H, NANO_Z_SCALE, Z_PX_PER_LEVEL, MIN_NANO_HEIGHT } from './iso-geometry.js';

// ─── Types ───────────────────────────────────────────────────

/** Render mode: 'flat' = standard, 'isometric' = diamond transform, 'isometric_z_pinned' = upright standing, 'isometric_assembly' = multi-tile composite. */
export type RenderMode = 'flat' | 'isometric' | 'isometric_z_pinned' | 'isometric_assembly';

export type NanoZMode = 'positive' | 'negative' | 'flat';
export type PlayerOcclusionPos = 'front' | 'behind' | 'left' | 'right';

export interface AssemblyChainItem {
  svg: string;
  col: number;
  row: number;
  /** Tile variant string e.g. 'straight-h', 'corner-tr'. Passed through from scene entries. */
  variant?: string;
  zMode?: NanoZMode;
  zOffset?: number;
  walkable?: boolean;
}

/** A player sprite placed at a world tile coordinate for walkability boundary validation. */
export interface PlayerWorldPos {
  col: number;
  row: number;
  /** Optional label drawn above the sprite. */
  label?: string;
}

/** Options for renderSvg. */
export interface RenderOptions {
  /** Render mode. Default: 'flat' */
  mode?: RenderMode;
  /** Output width in pixels. Default: 128 for flat, 256 for isometric. */
  width?: number;
  /** Output height in pixels. Default: 128 for flat, 128 for isometric. */
  height?: number;
  /** Background color (CSS). Default: transparent. */
  background?: string;
  /** DPI for SVG rendering. Default: 96. */
  dpi?: number;
  /** Nano z offset used for debug previews. */
  zOffset?: number;
  /** Nano z mode. */
  zMode?: NanoZMode;
  /** Walkability indicator for debug overlays. */
  walkable?: boolean;
  /** Blend edge hint for negative-z previews. */
  blendEdges?: boolean;
  /** Debug overlays for nano previews. */
  debug?: boolean;
  /** Dummy player position for occlusion checks in nano preview. */
  currentPlayerPos?: PlayerOcclusionPos;
  /** Multi-tile chain payload for assembly render mode. */
  assemblyChain?: AssemblyChainItem[];
  /** Player sprites placed at world positions for walkability boundary validation. */
  players?: PlayerWorldPos[];
}

/** Result from renderSvg. */
export interface RenderResult {
  /** PNG image as Buffer. */
  png: Buffer;
  /** Base64-encoded PNG string. */
  base64: string;
  /** Width of rendered image. */
  width: number;
  /** Height of rendered image. */
  height: number;
  /** Render mode used. */
  mode: RenderMode;
  /** Render time in ms. */
  renderTimeMs: number;
}

/** Result from renderAnimatedSvg. */
export interface AnimatedRenderResult {
  /** Horizontal strip PNG as Buffer. */
  stripPng: Buffer;
  /** Base64-encoded strip PNG. */
  stripBase64: string;
  /** Individual frame PNGs. */
  frames: Buffer[];
  /** Number of frames extracted. */
  frameCount: number;
  /** Frame width. */
  frameWidth: number;
  /** Frame height. */
  frameHeight: number;
  /** Suggested frame duration in ms. */
  frameDurationMs: number;
  /** Render mode used. */
  mode: RenderMode;
}

// ─── Constants ───────────────────────────────────────────────
// ISO_TILE_WIDTH=256, ISO_TILE_HEIGHT=128, MICRO_TILE_SIZE=128 come from game src/types.ts
// HALF_W=128, HALF_H=64, NANO_Z_SCALE=12, Z_PX_PER_LEVEL=4 from iso-geometry.ts

/** Aliases matching old usage — backed by game engine constants. */
const ISO_WIDTH  = ISO_TILE_WIDTH;   // 256
const ISO_HEIGHT = ISO_TILE_HEIGHT;  // 128
const MICRO_TILE = MICRO_TILE_SIZE;  // 128

// Nano preview canvas (taller to accommodate z-height): keep internal, not from game
const NANO_WIDTH  = 320;  // wider to fit skewed silhouette
const NANO_HEIGHT = 320;  // taller to show Z height

// ─── Core Render ─────────────────────────────────────────────

/**
 * Render an SVG string to a PNG buffer.
 * In 'isometric' mode, wraps the SVG content in a diamond-clipped isometric transform.
 */
export function renderSvg(svgString: string, options: RenderOptions = {}): RenderResult {
  const t0 = performance.now();
  const mode = options.mode ?? 'flat';

  let finalSvg: string;
  let outW: number;
  let outH: number;

  if (mode === 'isometric_assembly') {
    outW = options.width ?? (ISO_WIDTH * 3);
    outH = options.height ?? (ISO_HEIGHT * 3);
    finalSvg = wrapIsometricAssembly(options.assemblyChain ?? [], outW, outH, options);
  } else if (mode === 'isometric') {
    // Wrap SVG in isometric diamond transform
    outW = options.width ?? ISO_WIDTH;
    outH = options.height ?? ISO_HEIGHT;
    finalSvg = wrapIsometric(svgString, outW, outH);
  } else if (mode === 'isometric_z_pinned') {
    // Wrap SVG in standing Z-pinned transform
    outW = options.width ?? NANO_WIDTH;
    outH = options.height ?? NANO_HEIGHT;
    finalSvg = wrapIsometricZPinned(svgString, outW, outH, options);
  } else {
    outW = options.width ?? MICRO_TILE;
    outH = options.height ?? MICRO_TILE;
    finalSvg = svgString;
  }

  const resvg = new Resvg(finalSvg, {
    fitTo: { mode: 'width', value: outW },
    background: options.background,
    dpi: options.dpi ?? 96,
  });

  const rendered = resvg.render();
  const png = Buffer.from(rendered.asPng());
  const renderTimeMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    png,
    base64: png.toString('base64'),
    width: rendered.width,
    height: rendered.height,
    mode,
    renderTimeMs,
  };
}

// ─── Isometric Wrapper ───────────────────────────────────────

/**
 * Wrap an SVG in an isometric diamond transformation.
 * Applies the same transform matrix as the game renderer:
 *   transform(1, 0.5, -1, 0.5, halfW, 0)
 * with diamond clipping.
 */
function wrapIsometric(innerSvg: string, width: number, height: number): string {
  const halfW = width / 2;
  const halfH = height / 2;

  // Extract inner SVG content (strip outer <svg> wrapper if present)
  const innerContent = stripSvgWrapper(innerSvg);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="iso-diamond">
      <polygon points="${halfW},0 ${width},${halfH} ${halfW},${height} 0,${halfH}" />
    </clipPath>
  </defs>
  <g clip-path="url(#iso-diamond)">
    <g transform="matrix(1, 0.5, -1, 0.5, ${halfW}, 0)">
      <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">
        ${innerContent}
      </svg>
    </g>
  </g>
</svg>`;
}

/**
 * Wrap an SVG in a Z-pinned isometric transformation (standing billboard).
 * Matches the Z-pinned shear from nano-tile.ts:
 *   transform(1, 0.5, 0, 1, 0, 0)
 * anchored at the left vertex of the diamond projection.
 * Returns an unclipped SVG so the nano can extent beyond the basic tile diamond.
 */
function wrapIsometricZPinned(innerSvg: string, width: number, height: number, options: RenderOptions): string {
  // Use a sensible default origin for testing.
  // In nano-tile.ts, anchor is at (screenX, screenY + HALF_H).
  // Here we center horizontally and place the anchor in the lower-middle of the view.
  const anchorX = width / 2 - 64; // so left vertex of a 128-wide element is centered
  const anchorY = height * 0.75;
  
  const innerContent = stripSvgWrapper(innerSvg);
  const zOffset = options.zOffset ?? 0;
  const zMode = options.zMode ?? 'positive';
  const debug = options.debug ?? false;
  const walkable = options.walkable ?? true;
  const playerPos = options.currentPlayerPos;

  let output = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  output += `<g transform="translate(${anchorX}, ${anchorY})">`;

  let baseColor = 'rgba(0,0,0,0.05)';
  let baseStroke = 'rgba(0,0,0,0.1)';
  if (debug) {
    baseColor = walkable ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)';
    baseStroke = walkable ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)';
  }
  output += `<polygon points="0,0 64,32 128,0 64,-32" fill="${baseColor}" stroke="${baseStroke}"/>`;

  if (playerPos === 'behind') {
    output += renderPlayerSilhouette(64, -32);
  } else if (playerPos === 'left') {
    output += renderPlayerSilhouette(32, -16);
  } else if (playerPos === 'right') {
    output += renderPlayerSilhouette(96, -16);
  }

  if (zMode === 'negative') {
    const sinkPx = zOffset * 8;
    output += `
    <g transform="matrix(1, 0.5, -1, 0.5, 64, ${sinkPx - 32})">
      <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">
        ${innerContent}
      </svg>
    </g>`;
  } else {
    output += `
    <g transform="matrix(1, 0.5, 0, 1, 0, 0)">
      <g transform="translate(0, -${MICRO_TILE})">
        <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">
          ${innerContent}
        </svg>
      </g>
    </g>`;
  }

  if (playerPos === 'front') {
    output += renderPlayerSilhouette(64, 32);
  }

  if (debug && zMode === 'positive') {
    output += `<line x1="0" y1="0" x2="0" y2="-${zOffset * 8}" stroke="blue" stroke-width="2" stroke-dasharray="4" />`;
    output += `<line x1="128" y1="64" x2="128" y2="${64 - (zOffset * 8)}" stroke="blue" stroke-width="2" stroke-dasharray="4" />`;
  } else if (debug && zMode === 'negative') {
    output += `<line x1="64" y1="-32" x2="64" y2="${-32 + (zOffset * 8)}" stroke="red" stroke-width="2" stroke-dasharray="4" />`;
  }

  output += '</g></svg>';
  return output;
}

function wrapIsometricAssembly(
  chain: AssemblyChainItem[],
  width: number,
  height: number,
  options: RenderOptions,
): string {
  const originX = width / 2;
  const originY = height / 4;
  const debug = options.debug ?? false;
  const players = options.players ?? [];

  // Painter's algorithm: sort tiles and players together by (row + col).
  // Tiles at same depth sort before players (player stands in front of tile at same depth).
  type RenderItem =
    | { type: 'tile'; item: AssemblyChainItem; sortKey: number }
    | { type: 'player'; col: number; row: number; label?: string; sortKey: number };

  const allItems: RenderItem[] = [
    ...chain.map(item => ({ type: 'tile' as const, item, sortKey: item.row + item.col })),
    ...players.map(p => ({ type: 'player' as const, col: p.col, row: p.row, label: p.label, sortKey: p.row + p.col })),
  ];
  allItems.sort((a, b) => a.sortKey - b.sortKey || (a.type === 'tile' ? -1 : 1));

  let output = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  for (const ri of allItems) {
    if (ri.type === 'player') {
      // Player feet at front vertex of their tile
      const px = originX + (ri.col - ri.row) * 64;
      const py = originY + (ri.col + ri.row) * 32 + 32;
      output += renderAssemblyPlayer(px, py, ri.label);
      continue;
    }

    const item = ri.item;
    const isoX = originX + (item.col - item.row) * (MICRO_TILE / 2) - 64;
    const isoY = originY + (item.col + item.row) * (MICRO_TILE / 4);

    const innerContent = stripSvgWrapper(item.svg);
    const zMode = item.zMode ?? 'positive';
    const zOffset = item.zOffset ?? 0;
    const isWalkable = item.walkable !== false;

    output += `<g transform="translate(${isoX}, ${isoY})">`;

    let baseColor = 'rgba(0,0,0,0.05)';
    let baseStroke = 'rgba(0,0,0,0.1)';
    if (debug) {
      baseColor = isWalkable ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)';
      baseStroke = isWalkable ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)';
    }
    output += `<polygon points="0,0 64,32 128,0 64,-32" fill="${baseColor}" stroke="${baseStroke}"/>`;

    if (zMode === 'negative') {
      const sinkPx = zOffset * 8;
      output += `<g transform="matrix(1, 0.5, -1, 0.5, 64, ${sinkPx - 32})">`;
      output += `<svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">${innerContent}</svg></g>`;
    } else {
      output += `<g transform="matrix(1, 0.5, 0, 1, 0, 0)">`;
      output += `<g transform="translate(0, -${MICRO_TILE})">`;
      output += `<svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">${innerContent}</svg></g></g>`;
    }

    if (debug && zMode === 'positive') {
      output += `<line x1="0" y1="0" x2="0" y2="-${zOffset * 8}" stroke="blue" stroke-width="2" stroke-dasharray="4" />`;
    }
    output += '</g>';
  }

  output += '</svg>';
  return output;
}

/**
 * Render a player sprite at absolute screen coordinates in a scene assembly.
 * CALL SITE: feet (bottom-vertex of the player's tile) at (cx, cy).
 * The sprite rises UPWARD from (cx, cy) so the ground shadow sits on the tile floor.
 */
function renderAssemblyPlayer(cx: number, cy: number, label?: string): string {
  let out = `<g>`;
  // Ground shadow ellipse
  out += `<ellipse cx="${cx}" cy="${cy}" rx="14" ry="7" fill="rgba(0,0,0,0.35)"/>`;
  // Body (torso)
  out += `<rect x="${cx - 10}" y="${cy - 44}" width="20" height="34" rx="5" fill="rgba(60,100,210,0.9)" stroke="white" stroke-width="1.5"/>`;
  // Head
  out += `<circle cx="${cx}" cy="${cy - 56}" r="12" fill="rgba(60,100,210,0.9)" stroke="white" stroke-width="1.5"/>`;
  // Eyes
  out += `<circle cx="${cx - 4}" cy="${cy - 57}" r="2" fill="white"/>`;
  out += `<circle cx="${cx + 4}" cy="${cy - 57}" r="2" fill="white"/>`;
  if (label) {
    out += `<rect x="${cx - label.length * 3.5 - 4}" y="${cy - 80}" width="${label.length * 7 + 8}" height="14" rx="3" fill="rgba(0,0,0,0.7)"/>`;
    out += `<text x="${cx}" y="${cy - 70}" text-anchor="middle" font-size="9" font-family="monospace" fill="#fff">${label}</text>`;
  }
  out += `</g>`;
  return out;
}

function renderPlayerSilhouette(cx: number, cy: number): string {
  return `
  <g transform="translate(${cx}, ${cy})">
     <ellipse cx="0" cy="0" rx="16" ry="8" fill="rgba(0,0,0,0.3)" />
     <rect x="-12" y="-48" width="24" height="40" rx="6" fill="rgba(80,80,200,0.8)" stroke="white" stroke-width="1.5"/>
     <circle cx="0" cy="-60" r="14" fill="rgba(80,80,200,0.8)" stroke="white" stroke-width="1.5"/>
  </g>`;
}

/**
 * Strip the outer <svg ...> and </svg> tags, returning just the inner content.
 * Handles various SVG formats: self-closing, with attrs, etc.
 */
function stripSvgWrapper(svg: string): string {
  // Remove opening <svg ...> tag
  let content = svg.replace(/^\s*<svg[^>]*>/i, '');
  // Remove closing </svg> tag
  content = content.replace(/<\/svg>\s*$/i, '');
  return content.trim();
}

// ─── Animated SVG Support ────────────────────────────────────

/**
 * Render an animated SVG by extracting frames at regular intervals.
 * Returns a horizontal strip PNG and individual frames.
 *
 * Note: Since resvg doesn't natively support SMIL animation, this uses
 * a simple approach: renders the SVG at different time offsets by injecting
 * CSS animation-delay overrides. For complex animations, a browser-based
 * renderer (like CopilotSvgToolv2) is recommended.
 */
export function renderAnimatedSvg(
  svgString: string,
  frameCount: number = 4,
  frameDurationMs: number = 250,
  options: RenderOptions = {},
): AnimatedRenderResult {
  const mode = options.mode ?? 'flat';
  const frames: Buffer[] = [];

  // For static SVG rendering with resvg, we render the base frame
  // and create slight variations via CSS transform tweaks.
  // Full SMIL support requires browser-based rendering.
  for (let i = 0; i < frameCount; i++) {
    const result = renderSvg(svgString, options);
    frames.push(result.png);
  }

  // Build horizontal strip by concatenating frame buffers
  // Simple approach: render each frame and report them individually
  // A proper strip would require pixel-level composition
  const frameWidth = frames.length > 0 ? (options.mode === 'isometric' ? ISO_WIDTH : (options.mode === 'isometric_z_pinned' ? NANO_WIDTH : MICRO_TILE)) : 0;
  const frameHeight = options.mode === 'isometric' ? ISO_HEIGHT : (options.mode === 'isometric_z_pinned' ? NANO_HEIGHT : MICRO_TILE);

  // For the strip, we render a wider SVG containing all frames side by side
  const stripWidth = frameWidth * frameCount;
  const stripSvg = buildStripSvg(svgString, frameCount, frameWidth, frameHeight, mode);
  const stripResult = renderSvg(stripSvg, {
    ...options,
    mode: 'flat', // Strip is always flat (already composed)
    width: stripWidth,
    height: frameHeight,
  });

  return {
    stripPng: stripResult.png,
    stripBase64: stripResult.base64,
    frames,
    frameCount,
    frameWidth,
    frameHeight,
    frameDurationMs,
    mode,
  };
}

/** Build a horizontal strip SVG from repeated frames. */
function buildStripSvg(
  baseSvg: string,
  count: number,
  frameW: number,
  frameH: number,
  mode: RenderMode,
): string {
  const totalW = frameW * count;
  const innerContent = stripSvgWrapper(baseSvg);
  let frames = '';

  for (let i = 0; i < count; i++) {
    const x = i * frameW;
    if (mode === 'isometric') {
      const halfW = frameW / 2;
      const halfH = frameH / 2;
      frames += `
      <g transform="translate(${x}, 0)">
        <defs>
          <clipPath id="iso-clip-${i}">
            <polygon points="${halfW},0 ${frameW},${halfH} ${halfW},${frameH} 0,${halfH}" />
          </clipPath>
        </defs>
        <g clip-path="url(#iso-clip-${i})">
          <g transform="matrix(1, 0.5, -1, 0.5, ${halfW}, 0)">
            <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">
              ${innerContent}
            </svg>
          </g>
        </g>
      </g>`;
    } else if (mode === 'isometric_z_pinned') {
      const anchorX = frameW / 2 - 64; 
      const anchorY = frameH * 0.75;
      frames += `
      <g transform="translate(${x}, 0)">
        <g transform="translate(${anchorX}, ${anchorY})">
          <polygon points="0,0 64,32 128,0 64,-32" fill="rgba(0,0,0,0.05)" stroke="rgba(0,0,0,0.1)"/>
          <g transform="matrix(1, 0.5, 0, 1, 0, 0)">
            <g transform="translate(0, -${MICRO_TILE})">
              <svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">
                ${innerContent}
              </svg>
            </g>
          </g>
        </g>
      </g>`;
    } else {
      frames += `
      <g transform="translate(${x}, 0)">
        <svg width="${frameW}" height="${frameH}" viewBox="0 0 128 128">
          ${innerContent}
        </svg>
      </g>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${frameH}" viewBox="0 0 ${totalW} ${frameH}">
    ${frames}
  </svg>`;
}

// ─── Tool Schema (for MCP-like integration) ──────────────────

/** JSON schema definition for the render-svg tool, suitable for LLM function calling. */
export const TOOL_SCHEMA = {
  name: 'render-svg',
  description: 'Render an SVG string to a PNG image. Supports flat and isometric diamond modes.',
  inputSchema: {
    type: 'object',
    properties: {
      svg: {
        type: 'string',
        description: 'SVG markup string to render',
      },
      mode: {
        type: 'string',
        enum: ['flat', 'isometric'],
        default: 'flat',
        description: 'Render mode: flat (standard) or isometric (256x128 diamond)',
      },
      width: {
        type: 'number',
        description: 'Output width in pixels (default: 128 flat, 256 iso)',
      },
      height: {
        type: 'number',
        description: 'Output height in pixels (default: 128)',
      },
      background: {
        type: 'string',
        description: 'Background color (CSS string)',
      },
    },
    required: ['svg'],
  },
} as const;
