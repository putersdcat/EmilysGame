/**
 * render-worker.ts — Hot-reload render worker for the Iso 2.0 MCP server.
 *
 * Invoked per-request via child_process from the MCP server (index.ts).
 * Imports game engine TypeScript directly — no build step needed.
 * Any change to canvas-renderer.ts, nano-tile.ts, solver.ts etc. is
 * picked up automatically on the next MCP tool call.
 *
 * Protocol:
 *   stdin  → JSON-encoded args object
 *   argv[2] → tool name string
 *   stdout → JSON WorkerResult
 *
 * TODO: DOC
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { renderSvg, renderAnimatedSvg } from './svg-renderer-tool.js';
import { renderGeoProof, renderVariationSweep } from './proof-renderer.js';
import { resolveNamedScene, resolveScene, listScenes } from './scene-registry.js';
import type { SceneEntry } from './scene-registry.js';
import { renderGameTile, buildGameTileSvg } from './game-tile-renderer.js';
import { renderNanoTile, renderNanoScene } from './canvas-renderer.js';
import type { CanvasSceneEntry, CanvasPlayerEntry } from './canvas-renderer.js';
import { StoneBrick, RedClinker, AncientStone } from '../src/textures/index.js';

/**
 * Named brick textures available to scene entries via `texture: '<name>'`.
 * Maps to the canonical 128×128 self-tileable SVG (textures/README.md).
 *
 * `topOutline` controls whether stoneWallTopSvg draws its 0.30-alpha
 * black rectangular stroke around each wall footprint rect on the top
 * face. True (default) is correct for *brick* textures whose internal
 * lines are also rectangular grout. False is correct for non-brick
 * textures (e.g. Voronoi natural stone) whose internal geometry is
 * irregular — a rectangular outline painted on top of polygons reads
 * as a foreign shape and breaks the illusion.
 */
interface BrickTextureSpec {
  // (NB: when adding a new field here, also forward it through
  //  render_nano_scene's resolution chain below AND CanvasSceneEntry
  //  AND the NanoTile interface in src/types.ts.)
  svg(): string;
  topSvg?: () => string;
  southSvg?: () => string;
  eastSvg?: () => string;
  southSvgByPlane?: () => Readonly<Record<number, string>>;
  eastSvgByPlane?: () => Readonly<Record<number, string>>;
  topOutline: boolean;
  endCapTicks: boolean;
  /** True for textures whose orientation should match the wall axis
   *  (bricks). False for rotation-invariant textures (Voronoi). */
  topRotateWithAxis: boolean;
}
const BRICK_TEXTURES: Record<string, BrickTextureSpec> = {
  'stone-brick':    { svg: () => StoneBrick.svg(),    topOutline: true,  topRotateWithAxis: true,  endCapTicks: true  },
  'red-clinker':    { svg: () => RedClinker.svg(),    topOutline: true,  topRotateWithAxis: true,  endCapTicks: true  },
  'ancient-stone':  {
    svg: () => AncientStone.svg(),
    topSvg: () => AncientStone.svgTop(),
    southSvg: () => AncientStone.svgSouth(),
    eastSvg: () => AncientStone.svgEast(),
    southSvgByPlane: () => ({ 0: AncientStone.svgSouth(0), 48: AncientStone.svgSouth(48), 96: AncientStone.svgSouth(96), 144: AncientStone.svgSouth(144) }),
    eastSvgByPlane: () => ({ 0: AncientStone.svgEast(0), 48: AncientStone.svgEast(48), 96: AncientStone.svgEast(96), 144: AncientStone.svgEast(144) }),
    topOutline: false,
    topRotateWithAxis: false,
    endCapTicks: false,
  },
};

// ─── Types ────────────────────────────────────────────────────

type ImgContent = { type: 'image'; data: string; mimeType: 'image/png' };
type TxtContent = { type: 'text';  text: string };
type ToolContent = ImgContent | TxtContent;

export type WorkerResult =
  | { ok: true;  content: ToolContent[]; structuredContent: Record<string, unknown> }
  | { ok: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────

const img = (base64: string): ImgContent =>
  ({ type: 'image', data: base64, mimeType: 'image/png' });

const txt = (text: string): TxtContent =>
  ({ type: 'text', text });

const metaTxt = (m: Record<string, unknown>): TxtContent =>
  txt(JSON.stringify(m));

function absPath(p: string): string {
  return p.startsWith('/') || /^[A-Za-z]:/.test(p)
    ? p
    : `c:/GitRoots/EmilysGame/${p}`;
}

function savePng(outputPath: string, data: Buffer): void {
  const abs = absPath(outputPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
}

// ─── Dispatch ─────────────────────────────────────────────────

const toolName = process.argv[2];

async function dispatch(): Promise<WorkerResult> {
  // Read all args from stdin (piped by parent execFileSync with `input:`)
  const rawInput = await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (d: Buffer) => chunks.push(d));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
  const args: Record<string, unknown> = JSON.parse(rawInput);

  switch (toolName) {

    // ── render_nano_isometric ─────────────────────────────────
    case 'render_nano_isometric': {
      const { svg, width, height, background, writePngBase64,
              zOffset, zMode, walkable, blendEdges, includePlayer, debug } = args as Record<string, any>;
      const positions: (string | undefined)[] = includePlayer?.length > 0 ? includePlayer : [undefined];
      const content: ToolContent[] = [];
      let totalMs = 0;
      let last: ReturnType<typeof renderSvg> | null = null;
      for (const pos of positions) {
        const r = renderSvg(svg, {
          mode: 'isometric_z_pinned', width, height, background,
          zOffset, zMode, walkable, blendEdges, debug, currentPlayerPos: pos,
        });
        totalMs += r.renderTimeMs;
        last = r;
        content.push(img(r.base64));
      }
      const m: Record<string, unknown> = {
        width: last!.width, height: last!.height, mode: last!.mode,
        renderTimeMs: Math.round(totalMs * 100) / 100,
        bytes: last!.png.length,
        nanoMeta: { zOffset, zMode, blendEdgeApplied: blendEdges, walkable },
      };
      if (writePngBase64) m.pngBase64 = last!.base64;
      content.push(metaTxt(m));
      return { ok: true, content, structuredContent: m };
    }

    // ── render_svg_isometric ──────────────────────────────────
    case 'render_svg_isometric': {
      const { svg, mode, width, height, background, writePngBase64, response } = args as Record<string, any>;
      const r = renderSvg(svg, { mode, width, height, background });
      const shape = response ?? 'image';
      const content: ToolContent[] = [];
      if (shape !== 'metadata') content.push(img(r.base64));
      const m: Record<string, unknown> = {
        width: r.width, height: r.height, mode: r.mode,
        renderTimeMs: r.renderTimeMs, bytes: r.png.length,
      };
      if (writePngBase64) m.pngBase64 = r.base64;
      content.push(metaTxt(m));
      return { ok: true, content, structuredContent: m };
    }

    // ── render_nano_assembly ──────────────────────────────────
    case 'render_nano_assembly': {
      const { svgChain, width, height, background, debug } = args as Record<string, any>;
      const r = renderSvg('<svg></svg>', {
        mode: 'isometric_assembly', width: width ?? 768, height: height ?? 384,
        background, debug, assemblyChain: svgChain,
      });
      const m: Record<string, unknown> = {
        width: r.width, height: r.height, mode: r.mode,
        renderTimeMs: r.renderTimeMs, bytes: r.png.length, tileCount: svgChain.length,
      };
      return { ok: true, content: [img(r.base64), metaTxt(m)], structuredContent: m };
    }

    // ── render_svg_isometric_strip ────────────────────────────
    case 'render_svg_isometric_strip': {
      const { svg, frameCount, frameDurationMs, mode, response, writeStripBase64 } = args as Record<string, any>;
      const r = renderAnimatedSvg(svg, frameCount, frameDurationMs, { mode });
      const shape = response ?? 'image';
      const content: ToolContent[] = [];
      if (shape !== 'metadata') content.push(img(r.stripBase64));
      const m: Record<string, unknown> = {
        frameCount: r.frameCount, frameWidth: r.frameWidth,
        frameHeight: r.frameHeight, frameDurationMs: r.frameDurationMs, mode: r.mode,
      };
      if (writeStripBase64) m.stripBase64 = r.stripBase64;
      content.push(metaTxt(m));
      return { ok: true, content, structuredContent: m };
    }

    // ── render_geo_proof ──────────────────────────────────────
    case 'render_geo_proof': {
      const a = args as Record<string, any>;
      const r = renderGeoProof({
        variant: a.variant, svg: a.svg, title: a.title,
        width: a.width, height: a.height, background: a.background,
        compassRose: a.compassRose, axisArrows: a.axisArrows,
        faceLabels: a.faceLabels, coordLabels: a.coordLabels,
        boundOutline: a.boundOutline, col: a.col, row: a.row,
      });
      const m: Record<string, unknown> = {
        variant: r.proofVariant, width: r.width, height: r.height,
        renderTimeMs: r.renderTimeMs, bytes: r.png.length,
      };
      return { ok: true, content: [img(r.base64), metaTxt(m)], structuredContent: m };
    }

    // ── render_variation_sweep ────────────────────────────────
    case 'render_variation_sweep': {
      const { svg, param, values, background, frameSize } = args as Record<string, any>;
      const r = renderVariationSweep(svg, param, values, { background, frameSize });
      const m: Record<string, unknown> = {
        param, values, frameCount: r.frameCount,
        frameWidth: r.frameWidth, frameHeight: r.frameHeight,
        renderTimeMs: r.renderTimeMs,
      };
      return { ok: true, content: [img(r.stripBase64), metaTxt(m)], structuredContent: m };
    }

    // ── render_iso_scene ──────────────────────────────────────
    case 'render_iso_scene': {
      const { sceneName, entries, listScenes: doList, width, height,
              background, debug, players, outputPath } = args as Record<string, any>;
      if (doList) {
        const scenes = listScenes();
        return { ok: true, content: [txt(JSON.stringify(scenes, null, 2))], structuredContent: { scenes } };
      }
      let chain: ReturnType<typeof resolveScene>;
      let descriptor: { canvasWidth?: number; canvasHeight?: number } | null = null;
      if (sceneName) {
        const resolved = resolveNamedScene(sceneName);
        chain = resolved.chain;
        descriptor = resolved.descriptor;
      } else if (entries?.length > 0) {
        chain = resolveScene({ name: 'custom', description: 'Custom scene', entries: entries as SceneEntry[] });
      } else {
        throw new Error('Provide either sceneName or entries.');
      }
      const outW = width  ?? descriptor?.canvasWidth  ?? 1024;
      const outH = height ?? descriptor?.canvasHeight ?? 512;
      const r = renderSvg('<svg/>', {
        mode: 'isometric_assembly', width: outW, height: outH,
        background, debug, assemblyChain: chain, players,
      });
      if (outputPath) savePng(outputPath, r.png);
      const m: Record<string, unknown> = {
        scene: sceneName ?? 'custom', tileCount: chain.length,
        playerCount: players?.length ?? 0, width: r.width, height: r.height,
        renderTimeMs: r.renderTimeMs, bytes: r.png.length, savedTo: outputPath ?? null,
      };
      return { ok: true, content: [img(r.base64), metaTxt(m)], structuredContent: m };
    }

    // ── render_game_tile ──────────────────────────────────────
    case 'render_game_tile': {
      const { kind, svgOnly, ...rest } = args as Record<string, any>;
      const opts = {
        ...rest,
        connections: rest.connections
          ? { top: rest.connections.top ?? false, right: rest.connections.right ?? false,
              bottom: rest.connections.bottom ?? false, left: rest.connections.left ?? false }
          : undefined,
      };
      if (svgOnly) {
        const svg = buildGameTileSvg(kind, opts);
        return { ok: true, content: [txt(svg)], structuredContent: { svg } };
      }
      const r = renderGameTile(kind, opts);
      const m: Record<string, unknown> = {
        kind, variant: opts.variant ?? 'straight-h', zOffset: opts.zOffset,
        width: r.width, height: r.height, renderTimeMs: r.renderTimeMs, bytes: r.png.length,
      };
      return { ok: true, content: [img(r.base64), metaTxt(m)], structuredContent: m };
    }

    // ── render_nano_tile ──────────────────────────────────────
    case 'render_nano_tile': {
      const { kind, variant, zOffset, width, height, background } = args as Record<string, any>;
      const r = await renderNanoTile(kind, { variant, zOffset, width, height, background });
      const m: Record<string, unknown> = {
        kind, variant: variant ?? 'straight-h',
        width: r.width, height: r.height, renderTimeMs: r.renderTimeMs, bytes: r.png.length,
      };
      return { ok: true, content: [img(r.png.toString('base64')), metaTxt(m)], structuredContent: m };
    }

    // ── render_nano_scene ─────────────────────────────────────
    case 'render_nano_scene': {
      const { entries, players: rawPlayers, width, height, debug, geometryLayers, background, outputPath } = args as Record<string, any>;
      const sceneEntries: CanvasSceneEntry[] = (entries ?? []).map((e: Record<string, any>) => {
        // Resolve the optional `texture` shorthand (e.g. 'red-clinker')
        // into svgOverride + topSvgOverride + topOutline. Explicit
        // override fields win if both are supplied.
        let svgOverride: string | undefined = e.svgOverride;
        let topSvgOverride: string | undefined = e.topSvgOverride;
        let topFaceSvgOverride: string | undefined = e.topFaceSvgOverride;
        let southFaceSvgOverride: string | undefined = e.southFaceSvgOverride;
        let eastFaceSvgOverride: string | undefined = e.eastFaceSvgOverride;
        let southFaceSvgByPlane: Readonly<Record<number, string>> | undefined = e.southFaceSvgByPlane;
        let eastFaceSvgByPlane: Readonly<Record<number, string>> | undefined = e.eastFaceSvgByPlane;
        let topOutline: boolean | undefined = e.topOutline;
        let topRotateWithAxis: boolean | undefined = e.topRotateWithAxis;
        let endCapTicks: boolean | undefined = e.endCapTicks;
        if (typeof e.texture === 'string') {
          const spec = BRICK_TEXTURES[e.texture];
          if (!spec) throw new Error(`Unknown texture name: ${e.texture}. Known: ${Object.keys(BRICK_TEXTURES).join(', ')}`);
          const tex = spec.svg();
          svgOverride       = svgOverride       ?? tex;
          topSvgOverride    = topSvgOverride    ?? tex;
          topFaceSvgOverride   = topFaceSvgOverride   ?? spec.topSvg?.()   ?? tex;
          southFaceSvgOverride = southFaceSvgOverride ?? spec.southSvg?.() ?? tex;
          eastFaceSvgOverride  = eastFaceSvgOverride  ?? spec.eastSvg?.()  ?? tex;
          southFaceSvgByPlane  = southFaceSvgByPlane  ?? spec.southSvgByPlane?.();
          eastFaceSvgByPlane   = eastFaceSvgByPlane   ?? spec.eastSvgByPlane?.();
          topOutline        = topOutline        ?? spec.topOutline;
          topRotateWithAxis = topRotateWithAxis ?? spec.topRotateWithAxis;
          endCapTicks       = endCapTicks       ?? spec.endCapTicks;
        }
        return {
          kind: e.kind, col: e.col, row: e.row,
          variant: e.variant as CanvasSceneEntry['variant'],
          zOffset: e.zOffset,
          svgOverride,
          topSvgOverride,
          topFaceSvgOverride,
          southFaceSvgOverride,
          eastFaceSvgOverride,
          southFaceSvgByPlane,
          eastFaceSvgByPlane,
          topOutline,
          topRotateWithAxis,
          endCapTicks,
        };
      });
      const playerEntries: CanvasPlayerEntry[] = (rawPlayers ?? []).map((p: Record<string, any>) => ({
        col: p.col, row: p.row, label: p.label,
        nanoCol: p.nanoCol, nanoRow: p.nanoRow,
      }));
      const r = await renderNanoScene(sceneEntries, { width, height, debug, geometryLayers, background, players: playerEntries });
      if (outputPath) savePng(outputPath, r.png);
      const m: Record<string, unknown> = {
        tileCount: sceneEntries.length, playerCount: playerEntries.length,
        width: r.width, height: r.height, renderTimeMs: r.renderTimeMs,
        bytes: r.png.length, savedTo: outputPath ?? null,
      };
      return { ok: true, content: [img(r.png.toString('base64')), metaTxt(m)], structuredContent: m };
    }

    default:
      throw new Error(`render-worker: unknown tool "${toolName}"`);
  }
}

// ─── Run ──────────────────────────────────────────────────────

dispatch()
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const result: WorkerResult = { ok: false, error: message };
    process.stdout.write(JSON.stringify(result));
    process.exit(0); // exit 0 so execFileSync doesn't throw — parent checks ok flag
  });
