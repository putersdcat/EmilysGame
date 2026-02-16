import { Resvg } from '@resvg/resvg-js';
import crypto from 'node:crypto';

export interface RenderSvgOptions {
  size?: number;
  background?: string;
}

/**
 * Small, token-friendly render metadata.
 * Keep this free of base64/data-uri by default.
 */
export interface RenderSvgMetadata {
  mediaType: 'image/png';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  warnings: string[];
  [key: string]: unknown;
}

/**
 * Full render result including PNG bytes.
 */
export interface RenderSvgBinaryResult {
  metadata: RenderSvgMetadata;
  pngBuffer: Buffer;
}

/**
 * Legacy result with base64 and data URI (for backward compatibility).
 */
export interface RenderSvgResult extends RenderSvgMetadata {
  pngBase64: string;
  dataUri: string;
}

const DEFAULT_SIZE = 128;
const MIN_SIZE = 16;
const MAX_SIZE = 1024;
const MAX_SVG_CHARS = 100_000;

export function renderSvgPreview(svg: string, options: RenderSvgOptions = {}): RenderSvgResult {
  // Back-compat wrapper (kept for callers that still expect pngBase64/dataUri fields).
  const binary = renderSvgToPng(svg, options);
  const pngBase64 = binary.pngBuffer.toString('base64');

  return {
    ...binary.metadata,
    pngBase64,
    dataUri: `data:image/png;base64,${pngBase64}`
  };
}

/**
 * Preferred API for the MCP tool: returns PNG bytes + compact metadata.
 */
export function renderSvgToPng(svg: string, options: RenderSvgOptions = {}): RenderSvgBinaryResult {
  const warnings: string[] = [];

  if (typeof svg !== 'string' || svg.trim().length === 0) {
    throw new Error('svg must be a non-empty string.');
  }

  if (svg.length > MAX_SVG_CHARS) {
    throw new Error(`svg is too large. Maximum allowed length is ${MAX_SVG_CHARS} characters.`);
  }

  const requestedSize = Number.isFinite(options.size) ? Math.trunc(options.size as number) : DEFAULT_SIZE;
  const size = clamp(requestedSize, MIN_SIZE, MAX_SIZE);

  if (size !== requestedSize) {
    warnings.push(`size was clamped to ${size}. Allowed range is ${MIN_SIZE}-${MAX_SIZE}.`);
  }

  if (/<animate|<set|<animateTransform|<animateMotion/i.test(svg)) {
    warnings.push('Animated SVG elements detected; preview is a static snapshot of the SVG.');
  }

  const safeSvg = svg.trim();

  const resvg = new Resvg(safeSvg, {
    fitTo: {
      mode: 'width',
      value: size
    },
    background: options.background,
    font: {
      loadSystemFonts: false
    }
  });

  const rendered = resvg.render();
  const pngBuffer = rendered.asPng();

  const sha256 = crypto.createHash('sha256').update(pngBuffer).digest('hex');

  return {
    metadata: {
      mediaType: 'image/png',
      width: rendered.width,
      height: rendered.height,
      bytes: pngBuffer.length,
      sha256,
      warnings
    },
    pngBuffer
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
