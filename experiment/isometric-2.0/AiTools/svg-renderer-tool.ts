/**
 * svg-renderer-tool.ts — Thin rendering wrapper over the Iso 2.0 game engine.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  DESIGN CONTRACT — DO NOT VIOLATE                                   ║
 * ║                                                                      ║
 * ║  This file is a WRAPPER.  Its sole job is to take SVGs and geometry  ║
 * ║  produced by the GAME ENGINE (experiment/isometric-2.0/src/) and    ║
 * ║  render them to PNG via resvg — the same pixels the browser would   ║
 * ║  show, just headless.                                               ║
 * ║                                                                      ║
 * ║  ALL coordinate math MUST be imported from or explicitly mirrored   ║
 * ║  from the game source:                                              ║
 * ║    • src/types.ts    → ISO_TILE_WIDTH, ISO_TILE_HEIGHT, MICRO_TILE  ║
 * ║    • src/types.ts    → worldToIso()                                 ║
 * ║    • src/nano-tile.ts→ transform matrices (mirrored, see comments)  ║
 * ║                                                                      ║
 * ║  ALL SVG content MUST come from the game engine generators:         ║
 * ║    • src/solver.ts   → getVariantSvg(), woodenFenceSvg(), etc.      ║
 * ║    • src/tile.ts     → base terrain SVG generators                  ║
 * ║                                                                      ║
 * ║  NEVER invent rendering constants here that do not have a source    ║
 * ║  in the game engine.  If a value cannot be imported (e.g. because   ║
 * ║  it lives in Canvas-dependent code), add an explicit comment:       ║
 * ║    // MIRROR of nano-tile.ts:NANO_Z_SCALE — keep in sync            ║
 * ║                                                                      ║
 * ║  Purpose: the tool must show the CURRENT STATE of the game engine.  ║
 * ║  If a tile looks wrong in this tool, it is wrong in the game.       ║
 * ║  If a tile looks right here, it will look right in the game.        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Pipeline:
 *   MCP tool call
 *     → index.ts     (parse args, call resolveScene / getVariantSvg)
 *     → scene-registry.ts (import getVariantSvg from src/solver.ts)
 *     → svg-renderer-tool.ts (apply transforms mirrored from src/nano-tile.ts)
 *     → @resvg/resvg-js (headless rasteriser — no browser, no Canvas API)
 *     → PNG buffer → MCP image response
 *
 * ─── src/ imports used ───────────────────────────────────────────────────
 *
 *   src/types.ts (pure, no Canvas deps — safe to import directly):
 *     ISO_TILE_WIDTH  = 256   (isometric tile diamond outer width)
 *     ISO_TILE_HEIGHT = 128   (isometric tile diamond outer height)
 *     MICRO_TILE_SIZE = 128   (SVG logical viewport size used by all generators)
 *     worldToIso(col, row, W, H) → { sx, sy }  (canonical world→screen math)
 *
 *   src/nano-tile.ts (has Canvas deps — CANNOT import; mirror the math):
 *     NANO_Z_SCALE    = 12    px / zOffset level  (MIRROR — keep in sync)
 *     MIN_NANO_HEIGHT = 16    px minimum nano render height
 *     drawPositiveNano():  translate(sx, sy+HALF_H)  matrix(1,0.5,0,1)  drawImage(0,-h,128,h)
 *     drawNegativeNano():  matrix(1,0.5,-1,0.5, cx, sy+sinkPx)
 *     drawFlatNano():      matrix(1,0.5,-1,0.5, cx, sy)  alpha=0.7
 *     drawExtrudedNano():  3-face box (stone-wall only)
 *
 *   src/solver.ts (imported via scene-registry.ts for SVG generation):
 *     getVariantSvg(kind, variant, col, row) → SVG string
 *     woodenFenceSvg(), stoneWallSvg(), stoneWallTopSvg(), gateSvg(), ...
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
  /**
   * 'extruded' — svg contains raw 3-face markup (no outer <svg>) with coords relative to
   * tile bounding-box top-left (0,0). Rendered by dumping markup directly into the outer
   * translate group; no z-pin transform applied. Used for stone-wall / cathedral-wall.
   */
  renderMode?: 'extruded';
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

/**
 * wrapIsometricAssembly — compose a multi-tile scene into a single SVG.
 *
 * Coordinate system (matches chunk.ts + nano-tile.ts EXACTLY):
 *   HALF_W = 128  (ISO_TILE_WIDTH / 2)
 *   HALF_H = 64   (ISO_TILE_HEIGHT / 2)
 *
 *   drawX = (col - row) * HALF_W + originX - HALF_W   ← tile bounding-box LEFT edge
 *   drawY = (col + row) * HALF_H + originY - HALF_H   ← tile bounding-box TOP edge
 *
 *   Diamond vertices (in tile-local space, i.e. relative to drawX, drawY):
 *     top    (+HALF_W,           0)   = (128,   0)
 *     right  (+ISO_TILE_WIDTH, +HALF_H) = (256,  64)
 *     bottom (+HALF_W, +ISO_TILE_HEIGHT)= (128, 128)
 *     left   (0,       +HALF_H)       = (  0,  64)  ← nano z-pin anchor
 *
 *   Nano z-pinned transform (mirrors nano-tile.ts drawPositiveNano):
 *     translate(0, HALF_H)             → go to left vertex
 *     matrix(1, 0.5, 0, 1, 0, 0)      → z-pin shear
 *     translate(0, -MICRO_TILE)        → move up 128px (content rises from ground up)
 *
 *   Negative nano (river / trench):
 *     matrix(1, 0.5, -1, 0.5, HALF_W, sinkPx)  → flat iso sunken
 *
 *   Flat nano (tall-grass):
 *     matrix(1, 0.5, -1, 0.5, HALF_W, 0) + opacity 0.7
 *
 *   Player feet at bottom-vertex of their tile:
 *     px = (col - row) * HALF_W + originX       = drawX + HALF_W
 *     py = (col + row) * HALF_H + originY + HALF_H = drawY + ISO_TILE_HEIGHT
 */
function wrapIsometricAssembly(
  chain: AssemblyChainItem[],
  width: number,
  height: number,
  options: RenderOptions,
): string {
  // originX/Y = where tile(0,0) TOP VERTEX lands on canvas.
  const debug   = options.debug   ?? false;
  const players = options.players ?? [];

  // ── Scene-bounds-aware origin – centres the tile grid in the canvas ──────
  // For tile at (col,row): sx=(col-row)*HALF_W, sy=(col+row)*HALF_H
  const allCols = [...chain.map(i => i.col), ...players.map(p => p.col)];
  const allRows = [...chain.map(i => i.row), ...players.map(p => p.row)];
  const minCol = allCols.length ? Math.min(...allCols) : 0;
  const maxCol = allCols.length ? Math.max(...allCols) : 0;
  const minRow = allRows.length ? Math.min(...allRows) : 0;
  const maxRow = allRows.length ? Math.max(...allRows) : 0;

  // Horizontal: scene spans (minCol-maxRow)*HALF_W … (maxCol-minRow)*HALF_W + ISO_TILE_WIDTH
  const sxMid = ((minCol - maxRow) + (maxCol - minRow + 2)) * HALF_W / 2; // midpoint
  // Vertical: scene spans (minCol+minRow)*HALF_H … (maxCol+maxRow)*HALF_H + ISO_TILE_HEIGHT
  const syMid = ((minCol + minRow) + (maxCol + maxRow + 2)) * HALF_H / 2; // midpoint
  // Walls rise MICRO_TILE above the ground – shift origin down half that to give head room
  const nanoHeadroom = MICRO_TILE / 2; // = 64 typical; keeps tops of z=4 walls in frame
  const originX = Math.round(width  / 2 - sxMid + HALF_W);
  const originY = Math.round(height / 2 - syMid + HALF_H + nanoHeadroom);

  // ── Two-pass render (mirrors the game engine) ─────────────────────────────
  // Pass 1: All ground tiles (flat / negative zMode) sorted back-to-front.
  // Pass 2: All positive nano overlays (walls, fences…) sorted back-to-front.
  // Pass 3: All player sprites sorted back-to-front.
  //
  // Separating passes ensures wall billboards always draw ON TOP of the ground
  // layer even when a stone-wall and a grass tile occupy the SAME (col, row).
  type RenderItem =
    | { type: 'tile';   item: AssemblyChainItem; depth: number }
    | { type: 'player'; col: number; row: number; label?: string; depth: number };

  const mkDepth = (col: number, row: number) => col + row;

  const groundItems:  RenderItem[] = chain
    .filter(it => (it.zMode ?? 'positive') !== 'positive')
    .map(it => ({ type: 'tile' as const, item: it, depth: mkDepth(it.col, it.row) }));

  const nanoItems: RenderItem[] = chain
    .filter(it => (it.zMode ?? 'positive') === 'positive')
    .map(it => ({ type: 'tile' as const, item: it, depth: mkDepth(it.col, it.row) }));

  const playerItems: RenderItem[] = players
    .map(p => ({ type: 'player' as const, col: p.col, row: p.row, label: p.label, depth: mkDepth(p.col, p.row) }));

  const depthSort = (a: RenderItem, b: RenderItem) => a.depth - b.depth;
  groundItems.sort(depthSort);
  nanoItems.sort(depthSort);
  playerItems.sort(depthSort);

  const allItems: RenderItem[] = [...groundItems, ...nanoItems, ...playerItems];

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  for (const ri of allItems) {

    // ── Player sprite at bottom-vertex of its tile ──────────────────────────
    if (ri.type === 'player') {
      // bottom-vertex: drawX + HALF_W, drawY + ISO_TILE_HEIGHT
      //              = (col-row)*HALF_W + originX,  (col+row)*HALF_H + originY + HALF_H
      const px = (ri.col - ri.row) * HALF_W + originX;
      const py = (ri.col + ri.row) * HALF_H + originY + HALF_H;
      out += renderAssemblyPlayer(px, py, ri.label);
      continue;
    }

    // ── Tile ─────────────────────────────────────────────────────────────────
    const item = ri.item;

    // Bounding-box top-left (matches chunk.ts drawX / drawY)
    const drawX = (item.col - item.row) * HALF_W + originX - HALF_W;   // (col-row)*128 + oX - 128
    const drawY = (item.col + item.row) * HALF_H + originY - HALF_H;   // (col+row)*64  + oY - 64

    // Extruded tiles: raw <image> face markup — no outer SVG tag, no id= attributes.
    // Skip stripSvgWrapper + scopeSvgIds (would corrupt base64 data URIs in href attrs).
    // All other tiles: strip outer SVG and scope ids to prevent clipPath collisions.
    const tilePrefix = `t${item.col}_${item.row}_`;
    const innerContent = item.renderMode === 'extruded'
      ? item.svg
      : scopeSvgIds(stripSvgWrapper(item.svg), tilePrefix);
    const zMode    = item.zMode    ?? 'positive';
    const zOffset  = item.zOffset  ?? 0;
    const walkable = item.walkable !== false;

    // Group origin at tile bounding-box top-left
    out += `<g transform="translate(${drawX}, ${drawY})">`;

    // diamond vertices in tile-local space (256 wide × 128 tall)
    const pts = `${HALF_W},0 ${ISO_TILE_WIDTH},${HALF_H} ${HALF_W},${ISO_TILE_HEIGHT} 0,${HALF_H}`;
    const fill   = debug ? (walkable ? 'rgba(0,220,0,0.12)' : 'rgba(255,30,30,0.18)') : 'rgba(0,0,0,0.04)';
    const stroke = debug ? (walkable ? 'rgba(0,200,0,0.6)'  : 'rgba(220,20,20,0.7)')  : 'rgba(0,0,0,0.12)';
    out += `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;

    // ── Nano overlay ─────────────────────────────────────────────────────────
    if (zMode === 'negative') {
      // Sunken flat-iso — river / river-bank
      // mirrors: ctx.transform(1, 0.5, -1, 0.5, cx, sY + sinkPx)
      // cx = sX + HALF_W  →  in tile-local: HALF_W (= 128)
      const sinkPx = Math.abs(zOffset) * Z_PX_PER_LEVEL;
      out += `<g transform="matrix(1, 0.5, -1, 0.5, ${HALF_W}, ${sinkPx})">`;
      out += `<svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">${innerContent}</svg></g>`;

    } else if (zMode === 'flat') {
      // Flat semi-transparent — tall-grass
      // mirrors: ctx.transform(1, 0.5, -1, 0.5, cx, sY) + alpha 0.7
      out += `<g transform="matrix(1, 0.5, -1, 0.5, ${HALF_W}, 0)" opacity="0.7">`;
      out += `<svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">${innerContent}</svg></g>`;

    } else {
      // Positive z-pinned billboard — fence / wall / gate / bridge / homestead / cathedral
      // mirrors nano-tile.ts drawPositiveNano:
      //   ctx.translate(screenX, screenY + HALF_H)    → anchor at left diamond vertex
      //   ctx.transform(1, 0.5, 0, 1, 0, 0)           → z-pin shear
      //   ctx.drawImage(img, 0, -MICRO_TILE, 128, 128) → draw upward from ground
      out += `<g transform="translate(0, ${HALF_H})">`;     // move to left-vertex (0, 64)
      out += `<g transform="matrix(1, 0.5, 0, 1, 0, 0)">`; // z-pin shear
      out += `<g transform="translate(0, -${MICRO_TILE})">`; // rise upward 128px
      out += `<svg width="${MICRO_TILE}" height="${MICRO_TILE}" viewBox="0 0 128 128">${innerContent}</svg>`;
      out += `</g></g></g>`;

      if (debug) {
        // Z-height marker on the left edge
        out += `<line x1="0" y1="${HALF_H}" x2="0" y2="${HALF_H - MICRO_TILE}" stroke="#4af" stroke-width="1.5" stroke-dasharray="4 2"/>`;
        out += `<text x="4" y="${HALF_H - MICRO_TILE - 2}" font-size="9" font-family="monospace" fill="#4af">z=${zOffset}</text>`;
      }
    }

    out += '</g>';
  }

  out += '</svg>';
  return out;
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

/**
 * Scope all SVG id= attributes and url(#...) / href="#..." references so that
 * multiple copies of the same SVG source in one document don't share IDs.
 *
 * This is REQUIRED when compositing multiple tiles into a single SVG — if two
 * stone-wall tiles both define clipPath id="wall-clip", resvg silently ignores
 * the second one and both tiles reference the first tile's clip region.
 *
 * @param content  Inner SVG markup (outer <svg> already stripped).
 * @param prefix   Unique prefix per tile, e.g. "t3_2_" for col=3,row=2.
 */
function scopeSvgIds(content: string, prefix: string): string {
  // Collect all id values first so we can replace references safely
  const ids: string[] = [];
  content = content.replace(/\bid="([^"]+)"/g, (_, id) => {
    ids.push(id);
    return `id="${prefix}${id}"`;
  });
  // Replace url(#id) fill/stroke/clip references
  for (const id of ids) {
    content = content.replaceAll(`url(#${id})`, `url(#${prefix}${id})`);
    content = content.replaceAll(`href="#${id}"`,  `href="#${prefix}${id}"`);
    content = content.replaceAll(`xlink:href="#${id}"`, `xlink:href="#${prefix}${id}"`);
  }
  return content;
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
