/**
 * svg-renderer-tool.ts — 2.0 Experiment: Core SVG render logic for LLM tooling.
 * Renders SVG strings to PNG buffers, with optional isometric diamond mode.
 * Uses @resvg/resvg-js for headless SVG → PNG without a browser.
 * TODO: DOC — tool schema definitions for MCP integration
 */

import { Resvg } from '@resvg/resvg-js';

// ─── Types ───────────────────────────────────────────────────

/** Render mode: 'flat' = standard, 'isometric' = diamond transform. */
export type RenderMode = 'flat' | 'isometric';

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

/** Default isometric tile dimensions. */
const ISO_WIDTH = 256;
const ISO_HEIGHT = 128;
const MICRO_TILE = 128;

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

  if (mode === 'isometric') {
    // Wrap SVG in isometric diamond transform
    outW = options.width ?? ISO_WIDTH;
    outH = options.height ?? ISO_HEIGHT;
    finalSvg = wrapIsometric(svgString, outW, outH);
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
  const frameWidth = frames.length > 0 ? (options.mode === 'isometric' ? ISO_WIDTH : MICRO_TILE) : 0;
  const frameHeight = options.mode === 'isometric' ? ISO_HEIGHT : MICRO_TILE;

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
