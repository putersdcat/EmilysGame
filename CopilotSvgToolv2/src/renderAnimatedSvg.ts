import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';

export interface RenderAnimatedSvgOptions {
  size?: number;
  background?: string;

  /** Number of frames to sample (ignored if timesMs is provided). */
  frameCount?: number;

  /** Total animation duration to sample over in ms (best-effort auto-detected if omitted). */
  durationMs?: number;

  /** Explicit sample times in ms. When provided, frameCount/durationMs are ignored. */
  timesMs?: number[];

  /**
   * Layout for storyboard composition.
   * - grid: rows/cols auto chosen (roughly square)
   * - strip: single row
   */
  storyboardLayout?: 'grid' | 'strip';

  /** When true, write frames/storyboard to disk and return file paths. */
  writeToDisk?: boolean;
}

export interface AnimatedPreviewMetadata {
  mediaType: 'image/png';
  frameCount: number;
  width: number;
  height: number;
  bytesTotal: number;
  timesMs: number[];
  durationMs: number;
  warnings: string[];
  sha256: string;
  pngFilePaths?: string[];
  storyboardFilePath?: string;
  [key: string]: unknown;
}

export interface AnimatedPreviewResult {
  metadata: AnimatedPreviewMetadata;
  frames: Buffer[];
  storyboard?: Buffer;
}

const DEFAULT_SIZE = 128;
const MIN_SIZE = 16;
const MAX_SIZE = 1024;

/**
 * Render an animated SVG by sampling the browser's SMIL/CSS animation timeline.
 *
 * Why Playwright?
 * - resvg intentionally renders a static snapshot and does not evaluate SMIL/CSS animation timelines.
 * - Chromium does evaluate them, and exposes SVGSVGElement.setCurrentTime().
 */
export async function renderAnimatedSvgPreview(svg: string, options: RenderAnimatedSvgOptions = {}): Promise<AnimatedPreviewResult> {
  if (typeof svg !== 'string' || svg.trim().length === 0) {
    throw new Error('svg must be a non-empty string.');
  }

  const warnings: string[] = [];
  const requestedSize = Number.isFinite(options.size) ? Math.trunc(options.size as number) : DEFAULT_SIZE;
  const size = clamp(requestedSize, MIN_SIZE, MAX_SIZE);
  if (size !== requestedSize) {
    warnings.push(`size was clamped to ${size}. Allowed range is ${MIN_SIZE}-${MAX_SIZE}.`);
  }

  const background = options.background;
  const layout = options.storyboardLayout ?? 'grid';

  const timesMs = normalizeTimesMs(svg, options, warnings);
  const durationMs = timesMs.length > 0 ? Math.max(...timesMs) : (options.durationMs ?? 1000);

  // Dynamic import so the package can still build in environments where playwright isn't installed.
  // (If you add it as a dependency, it will be present; this mainly improves error messages.)
  let chromium: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'Animated SVG rendering requires Playwright. Install it with `npm i playwright` and then run `npx playwright install chromium`.'
    );
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1
    });

    // Make the page background transparent by default.
    await page.setContent(
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #wrap {
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${background ?? 'transparent'};
        overflow: hidden;
      }
      svg { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="wrap">${svg}</div>
  </body>
</html>`,
      { waitUntil: 'load' }
    );

    const svgHandle = await page.$('svg');
    if (!svgHandle) {
      throw new Error('No <svg> element was found in the provided markup.');
    }

    // Pause all animations so we can step time deterministically.
    await page.evaluate(() => {
      // Pause Web Animations API animations (mostly CSS animations).
      for (const anim of document.getAnimations()) {
        try {
          anim.pause();
        } catch {
          // ignore
        }
      }

      const svgEl = document.querySelector('svg') as any;
      if (svgEl && typeof svgEl.pauseAnimations === 'function') {
        try {
          svgEl.pauseAnimations();
        } catch {
          // ignore
        }
      }
    });

    const bbox = await svgHandle.boundingBox();
    if (!bbox) {
      throw new Error('Unable to measure SVG bounding box for screenshot capture.');
    }

    const clip = {
      x: Math.max(0, Math.floor(bbox.x)),
      y: Math.max(0, Math.floor(bbox.y)),
      width: Math.max(1, Math.ceil(bbox.width)),
      height: Math.max(1, Math.ceil(bbox.height))
    };

    const frames: Buffer[] = [];
    let bytesTotal = 0;

    for (const t of timesMs) {
      await page.evaluate((timeMs: number) => {
        // SMIL timeline
        const svgEl = document.querySelector('svg') as any;
        if (svgEl && typeof svgEl.setCurrentTime === 'function') {
          try {
            svgEl.setCurrentTime(timeMs / 1000);
          } catch {
            // ignore
          }
        }

        // Web Animations API timeline (CSS)
        for (const anim of document.getAnimations()) {
          try {
            // currentTime is in ms
            anim.currentTime = timeMs;
          } catch {
            // ignore
          }
        }
      }, t);

      // Give the browser a microtask tick to apply styles.
      await page.waitForTimeout(10);

      const buf = (await page.screenshot({
        type: 'png',
        clip,
        omitBackground: background == null || background === 'transparent' || background === 'rgba(0,0,0,0)'
      })) as Buffer;

      frames.push(buf);
      bytesTotal += buf.length;
    }

    const sha256 = crypto.createHash('sha256').update(Buffer.concat(frames)).digest('hex');

    let storyboard: Buffer | undefined;
    try {
      storyboard = composeStoryboard(frames, layout);
      bytesTotal += storyboard.length;
    } catch {
      warnings.push('Failed to compose storyboard; returning frames only.');
    }

    const metadata: AnimatedPreviewMetadata = {
      mediaType: 'image/png',
      frameCount: frames.length,
      width: clip.width,
      height: clip.height,
      bytesTotal,
      timesMs,
      durationMs,
      warnings,
      sha256
    };

    if (options.writeToDisk) {
      const dir = path.join(os.tmpdir(), 'copilot-svg-tool', 'animated-previews', sha256);
      await fs.mkdir(dir, { recursive: true });

      const framePaths: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const filePath = path.join(dir, `frame_${String(i).padStart(3, '0')}_${timesMs[i]}ms.png`);
        await fs.writeFile(filePath, frames[i]);
        framePaths.push(filePath);
      }

      metadata.pngFilePaths = framePaths;

      if (storyboard) {
        const storyboardPath = path.join(dir, `storyboard_${layout}.png`);
        await fs.writeFile(storyboardPath, storyboard);
        metadata.storyboardFilePath = storyboardPath;
      }
    }

    return { metadata, frames, storyboard };
  } finally {
    await browser.close();
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeTimesMs(svg: string, options: RenderAnimatedSvgOptions, warnings: string[]): number[] {
  if (Array.isArray(options.timesMs) && options.timesMs.length > 0) {
    return options.timesMs
      .map((v) => Math.max(0, Math.trunc(v)))
      .sort((a, b) => a - b);
  }

  const frameCountRaw = options.frameCount ?? 6;
  const frameCount = clamp(Math.trunc(frameCountRaw), 1, 60);
  if (frameCount !== frameCountRaw) {
    warnings.push(`frameCount was clamped to ${frameCount}. Allowed range is 1-60.`);
  }

  const durationMs = options.durationMs ?? tryDetectDurationMs(svg) ?? 1000;
  if (!options.durationMs && durationMs === 1000) {
    warnings.push('durationMs was not provided and could not be confidently detected; defaulting to 1000ms.');
  }

  if (frameCount === 1) {
    return [0];
  }

  const step = durationMs / (frameCount - 1);
  const times: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    times.push(Math.trunc(i * step));
  }

  return times;
}

function tryDetectDurationMs(svg: string): number | undefined {
  // Very lightweight heuristic: look for dur="Xs" or dur="Xms".
  const match = svg.match(/\bdur\s*=\s*"\s*([0-9]*\.?[0-9]+)\s*(ms|s)\s*"/i);
  if (!match) return undefined;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;

  const unit = match[2].toLowerCase();
  return unit === 's' ? Math.trunc(value * 1000) : Math.trunc(value);
}

function composeStoryboard(frames: Buffer[], layout: 'grid' | 'strip'): Buffer {
  if (frames.length === 0) {
    throw new Error('No frames to compose.');
  }

  const decoded = frames.map((b) => PNG.sync.read(b));
  const w = decoded[0].width;
  const h = decoded[0].height;

  for (const d of decoded) {
    if (d.width !== w || d.height !== h) {
      throw new Error('All frames must have identical dimensions to compose a storyboard.');
    }
  }

  let cols = decoded.length;
  let rows = 1;

  if (layout === 'grid') {
    cols = Math.ceil(Math.sqrt(decoded.length));
    rows = Math.ceil(decoded.length / cols);
  }

  const out = new PNG({ width: cols * w, height: rows * h });

  for (let i = 0; i < decoded.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    PNG.bitblt(decoded[i], out, 0, 0, w, h, col * w, row * h);
  }

  return PNG.sync.write(out);
}
