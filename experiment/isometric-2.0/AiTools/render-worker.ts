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
import {
  StoneBrick,
  RedClinker,
  MudBrick,
  SandstoneBrick,
  AncientStone,
  Limestone,
  DarkCathedralStone,
  TimberFrameWall,
  PlasterWhitewashWall,
  RoughWoodPlankWall,
  CottageStoneFoundation,
  ThatchRoof,
} from '../src/textures/index.js';
import type { RoofPrimitiveKind } from '../src/textures/roof-family.js';

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
  topSvgV?: () => string;
  southSvg?: () => string;
  eastSvg?: () => string;
  endSvg?: () => string;
  southSvgByPlane?: () => Readonly<Record<number, string>>;
  eastSvgByPlane?: () => Readonly<Record<number, string>>;
  endSvgByPlane?: () => Readonly<Record<number, string>>;
  topOutline: boolean;
  endCapTicks: boolean;
  faceSliceEqualLighting?: boolean;
  endCapTickColor?: string;
  weatheringOverlays?: CanvasSceneEntry['weatheringOverlays'];
  /** True for textures whose orientation should match the wall axis
   *  (bricks). False for rotation-invariant textures (Voronoi). */
  topRotateWithAxis: boolean;
}
type BrickFamilyModule = {
  svg(): string;
  svgTop(): string;
  svgTopV(): string;
  svgSouth(edgeCoord?: number): string;
  svgEast(edgeCoord?: number): string;
  svgEnd(edgeCoord?: number): string;
};

type AncientStoneFamilyModule = {
  svg(): string;
  svgTop(): string;
  svgSouth(): string;
  svgEast(): string;
};

type FaceSliceMaterialModule = {
  svg(): string;
  svgTop(): string;
  svgSouth(): string;
  svgEast(): string;
  svgTopV?(): string;
  svgEnd?(): string;
};

function brickFamilySpec(material: BrickFamilyModule, endCapTickColor: string, weatheringOverlays?: CanvasSceneEntry['weatheringOverlays']): BrickTextureSpec {
  return {
    svg: () => material.svg(),
    topSvg: () => material.svgTop(),
    topSvgV: () => material.svgTopV(),
    southSvg: () => material.svgSouth(),
    eastSvg: () => material.svgEast(),
    endSvg: () => material.svgEnd(),
    southSvgByPlane: () => ({ 0: material.svgSouth(0), 48: material.svgSouth(48), 96: material.svgSouth(96), 144: material.svgSouth(144) }),
    eastSvgByPlane: () => ({ 0: material.svgEast(0), 48: material.svgEast(48), 96: material.svgEast(96), 144: material.svgEast(144) }),
    endSvgByPlane: () => ({ 0: material.svgEnd(0), 48: material.svgEnd(48), 96: material.svgEnd(96), 144: material.svgEnd(144) }),
    topOutline: true,
    topRotateWithAxis: true,
    endCapTicks: false,
    faceSliceEqualLighting: true,
    endCapTickColor,
    weatheringOverlays,
  };
}

function ancientStoneFamilySpec(material: AncientStoneFamilyModule, weatheringOverlays?: CanvasSceneEntry['weatheringOverlays']): BrickTextureSpec {
  return {
    svg: () => material.svg(),
    topSvg: () => material.svgTop(),
    southSvg: () => material.svgSouth(),
    eastSvg: () => material.svgEast(),
    topOutline: false,
    topRotateWithAxis: false,
    endCapTicks: false,
    weatheringOverlays,
  };
}

function faceSliceTextureSpec(
  material: FaceSliceMaterialModule,
  options: {
    topOutline: boolean;
    topRotateWithAxis: boolean;
    endCapTicks: boolean;
    faceSliceEqualLighting?: boolean;
    endCapTickColor?: string;
    weatheringOverlays?: CanvasSceneEntry['weatheringOverlays'];
  },
): BrickTextureSpec {
  return {
    svg: () => material.svg(),
    topSvg: () => material.svgTop(),
    topSvgV: material.svgTopV ? () => material.svgTopV!() : undefined,
    southSvg: () => material.svgSouth(),
    eastSvg: () => material.svgEast(),
    endSvg: material.svgEnd ? () => material.svgEnd!() : undefined,
    topOutline: options.topOutline,
    topRotateWithAxis: options.topRotateWithAxis,
    endCapTicks: options.endCapTicks,
    faceSliceEqualLighting: options.faceSliceEqualLighting,
    endCapTickColor: options.endCapTickColor,
    weatheringOverlays: options.weatheringOverlays,
  };
}

const weatheredRedClinkerOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'soot', color: '#17120f', intensity: 0.38, opacity: 0.34, seed: 101, faces: ['south', 'east'], yRange: [0.60, 0.98] },
  { kind: 'edge-wear', color: '#f0a36a', intensity: 0.18, opacity: 0.24, seed: 102, faces: ['top'], yRange: [0.04, 0.36] },
];
const mossyStoneBrickOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'moss', color: '#154d20', intensity: 0.78, opacity: 0.62, seed: 201, faces: ['south', 'east'], yRange: [0.48, 0.98] },
  { kind: 'moss', color: '#347a31', intensity: 0.44, opacity: 0.48, seed: 203, faces: ['top'], yRange: [0.04, 0.48] },
  { kind: 'dirt', color: '#4f3f2d', intensity: 0.26, opacity: 0.26, seed: 202, faces: ['south', 'east'], yRange: [0.72, 0.98] },
];
const dirtyMudBrickOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'dirt', color: '#231914', intensity: 0.50, opacity: 0.34, seed: 301, faces: ['south', 'east'], yRange: [0.58, 0.98] },
  { kind: 'edge-wear', color: '#d6a777', intensity: 0.18, opacity: 0.22, seed: 302, faces: ['top'], yRange: [0.10, 0.52] },
];
const snowySandstoneOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'snow', color: '#d4dde0', intensity: 0.94, opacity: 0.76, seed: 401, faces: ['top'], yRange: [0.00, 0.56] },
  { kind: 'snow', color: '#f8fbf2', intensity: 0.52, opacity: 0.55, seed: 403, faces: ['top'], yRange: [0.00, 0.34] },
  { kind: 'dirt', color: '#8a6f42', intensity: 0.28, opacity: 0.22, seed: 402, faces: ['south', 'east'], yRange: [0.68, 0.98] },
];
const dustySandstoneOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'dust', color: '#ead38f', intensity: 0.62, opacity: 0.42, seed: 501, faces: ['south', 'east', 'top'], yRange: [0.08, 0.78] },
  { kind: 'dirt', color: '#725737', intensity: 0.20, opacity: 0.20, seed: 502, faces: ['south', 'east'], yRange: [0.72, 0.98] },
];
const muddyStoneBrickOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'mud', color: '#2b2017', intensity: 0.80, opacity: 0.56, seed: 601, faces: ['south', 'east'], yRange: [0.54, 0.99] },
  { kind: 'mud', color: '#5b3d25', intensity: 0.28, opacity: 0.36, seed: 602, faces: ['top'], yRange: [0.40, 0.96] },
];
const crackedRedClinkerOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'cracks', color: '#160f0d', intensity: 0.62, opacity: 0.72, seed: 701, faces: ['south', 'east', 'top'], yRange: [0.08, 0.92] },
  { kind: 'edge-wear', color: '#f0a36a', intensity: 0.16, opacity: 0.24, seed: 702, faces: ['top'], yRange: [0.08, 0.42] },
];
const mossyAncientStoneOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'moss', color: '#244f2f', intensity: 0.74, opacity: 0.52, seed: 801, faces: ['south', 'east'], yRange: [0.52, 0.98] },
  { kind: 'moss', color: '#567e48', intensity: 0.34, opacity: 0.32, seed: 802, faces: ['top'], yRange: [0.10, 0.52] },
];
const snowyLimestoneOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'snow', color: '#d8dfe2', intensity: 0.92, opacity: 0.70, seed: 811, faces: ['top'], yRange: [0.00, 0.60] },
  { kind: 'snow', color: '#f6f8f3', intensity: 0.48, opacity: 0.50, seed: 812, faces: ['top'], yRange: [0.00, 0.34] },
];
const sootyCathedralStoneOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'soot', color: '#131214', intensity: 0.50, opacity: 0.34, seed: 821, faces: ['south', 'east'], yRange: [0.10, 0.92] },
  { kind: 'edge-wear', color: '#a79d92', intensity: 0.16, opacity: 0.18, seed: 822, faces: ['top'], yRange: [0.08, 0.34] },
];
const crackedAncientStoneOverlays: CanvasSceneEntry['weatheringOverlays'] = [
  { kind: 'cracks', color: '#2d2620', intensity: 0.68, opacity: 0.62, seed: 831, faces: ['south', 'east', 'top'], yRange: [0.08, 0.94] },
  { kind: 'dirt', color: '#5e5443', intensity: 0.20, opacity: 0.18, seed: 832, faces: ['south', 'east'], yRange: [0.72, 0.98] },
];

const BRICK_TEXTURES: Record<string, BrickTextureSpec> = {
  'stone-brick': brickFamilySpec(StoneBrick, '#3a3835'),
  'red-clinker': brickFamilySpec(RedClinker, '#2a201c'),
  'mud-brick': brickFamilySpec(MudBrick, '#4a3325'),
  'sandstone-brick': brickFamilySpec(SandstoneBrick, '#6f5d3a'),
  'weathered-red-clinker': brickFamilySpec(RedClinker, '#2a201c', weatheredRedClinkerOverlays),
  'mossy-stone-brick': brickFamilySpec(StoneBrick, '#3a3835', mossyStoneBrickOverlays),
  'dirty-mud-brick': brickFamilySpec(MudBrick, '#4a3325', dirtyMudBrickOverlays),
  'snowy-sandstone-brick': brickFamilySpec(SandstoneBrick, '#6f5d3a', snowySandstoneOverlays),
  'dusty-sandstone-brick': brickFamilySpec(SandstoneBrick, '#6f5d3a', dustySandstoneOverlays),
  'muddy-stone-brick': brickFamilySpec(StoneBrick, '#3a3835', muddyStoneBrickOverlays),
  'cracked-red-clinker': brickFamilySpec(RedClinker, '#2a201c', crackedRedClinkerOverlays),
  'ancient-stone': ancientStoneFamilySpec(AncientStone),
  'limestone': ancientStoneFamilySpec(Limestone),
  'dark-cathedral-stone': ancientStoneFamilySpec(DarkCathedralStone),
  'mossy-ancient-stone': ancientStoneFamilySpec(AncientStone, mossyAncientStoneOverlays),
  'snowy-limestone': ancientStoneFamilySpec(Limestone, snowyLimestoneOverlays),
  'sooty-dark-cathedral-stone': ancientStoneFamilySpec(DarkCathedralStone, sootyCathedralStoneOverlays),
  'cracked-ancient-stone': ancientStoneFamilySpec(AncientStone, crackedAncientStoneOverlays),
  'timber-frame-wall': faceSliceTextureSpec(TimberFrameWall, {
    topOutline: false,
    topRotateWithAxis: true,
    endCapTicks: false,
  }),
  'plaster-whitewash-wall': faceSliceTextureSpec(PlasterWhitewashWall, {
    topOutline: false,
    topRotateWithAxis: true,
    endCapTicks: false,
  }),
  'rough-wood-plank-wall': faceSliceTextureSpec(RoughWoodPlankWall, {
    topOutline: false,
    topRotateWithAxis: true,
    endCapTicks: false,
  }),
  'cottage-stone-foundation': ancientStoneFamilySpec(CottageStoneFoundation),
};

function roofTextureSvg(kind: string, texture: string): string | undefined {
  if (texture !== 'thatch-roof') return undefined;
  if (kind === 'roof-slope-left' || kind === 'roof-slope-right' || kind === 'roof-ridge') {
    return ThatchRoof.svgFor(kind as RoofPrimitiveKind);
  }
  return undefined;
}

function roofGableTextureSvg(kind: string, texture: string): string | undefined {
  if (texture !== 'thatch-roof') return undefined;
  if (kind === 'roof-slope-left' || kind === 'roof-slope-right') return ThatchRoof.svgGable();
  return undefined;
}

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
        let svgOverride: string | undefined = e.svgOverride || undefined;
        let topSvgOverride: string | undefined = e.topSvgOverride || undefined;
        let topFaceSvgOverride: string | undefined = e.topFaceSvgOverride || undefined;
        let topFaceSvgVOverride: string | undefined = e.topFaceSvgVOverride || undefined;
        let southFaceSvgOverride: string | undefined = e.southFaceSvgOverride || undefined;
        let eastFaceSvgOverride: string | undefined = e.eastFaceSvgOverride || undefined;
        let endFaceSvgOverride: string | undefined = e.endFaceSvgOverride || undefined;
        let southFaceSvgByPlane: Readonly<Record<number, string>> | undefined = e.southFaceSvgByPlane;
        let eastFaceSvgByPlane: Readonly<Record<number, string>> | undefined = e.eastFaceSvgByPlane;
        let endFaceSvgByPlane: Readonly<Record<number, string>> | undefined = e.endFaceSvgByPlane;
        let topOutline: boolean | undefined = e.topOutline;
        let topRotateWithAxis: boolean | undefined = e.topRotateWithAxis;
        let endCapTicks: boolean | undefined = e.endCapTicks;
        let faceSliceEqualLighting: boolean | undefined = e.faceSliceEqualLighting;
        let endCapTickColor: string | undefined = e.endCapTickColor;
        let weatheringOverlays: CanvasSceneEntry['weatheringOverlays'] | undefined = e.weatheringOverlays;
        const textureName = typeof e.texture === 'string' && e.texture.trim().length > 0
          ? e.texture.trim()
          : undefined;
        if (textureName) {
          const roofSvg = roofTextureSvg(e.kind, textureName);
          if (roofSvg) svgOverride = svgOverride ?? roofSvg;
          const roofGableSvg = roofGableTextureSvg(e.kind, textureName);
          if (roofGableSvg) southFaceSvgOverride = southFaceSvgOverride ?? roofGableSvg;
        }
        if (textureName) {
          const spec = BRICK_TEXTURES[textureName];
          if (!spec) {
            if (svgOverride) {
              return {
                kind: e.kind, col: e.col, row: e.row,
                variant: e.variant as CanvasSceneEntry['variant'],
                zOffset: e.zOffset,
                svgOverride,
                topSvgOverride,
                topFaceSvgOverride,
                topFaceSvgVOverride,
                southFaceSvgOverride,
                eastFaceSvgOverride,
                endFaceSvgOverride,
                southFaceSvgByPlane,
                eastFaceSvgByPlane,
                endFaceSvgByPlane,
                topOutline,
                topRotateWithAxis,
                endCapTicks,
                faceSliceEqualLighting,
                endCapTickColor,
                weatheringOverlays,
              };
            }
            throw new Error(`Unknown texture name: ${textureName}. Known: ${Object.keys(BRICK_TEXTURES).join(', ')}, thatch-roof`);
          }
          const tex = spec.svg();
          svgOverride       = svgOverride       ?? tex;
          topSvgOverride    = topSvgOverride    ?? tex;
          topFaceSvgOverride   = topFaceSvgOverride   ?? spec.topSvg?.();
          topFaceSvgVOverride  = topFaceSvgVOverride  ?? spec.topSvgV?.();
          southFaceSvgOverride = southFaceSvgOverride ?? spec.southSvg?.();
          eastFaceSvgOverride  = eastFaceSvgOverride  ?? spec.eastSvg?.();
          endFaceSvgOverride   = endFaceSvgOverride   ?? spec.endSvg?.();
          southFaceSvgByPlane  = southFaceSvgByPlane  ?? spec.southSvgByPlane?.();
          eastFaceSvgByPlane   = eastFaceSvgByPlane   ?? spec.eastSvgByPlane?.();
          endFaceSvgByPlane    = endFaceSvgByPlane    ?? spec.endSvgByPlane?.();
          topOutline        = topOutline        ?? spec.topOutline;
          topRotateWithAxis = topRotateWithAxis ?? spec.topRotateWithAxis;
          endCapTicks       = endCapTicks       ?? spec.endCapTicks;
          faceSliceEqualLighting = faceSliceEqualLighting ?? spec.faceSliceEqualLighting;
          endCapTickColor = endCapTickColor ?? spec.endCapTickColor;
          weatheringOverlays = weatheringOverlays ?? spec.weatheringOverlays;
        }
        return {
          kind: e.kind, col: e.col, row: e.row,
          variant: e.variant as CanvasSceneEntry['variant'],
          zOffset: e.zOffset,
          svgOverride,
          topSvgOverride,
          topFaceSvgOverride,
          topFaceSvgVOverride,
          southFaceSvgOverride,
          eastFaceSvgOverride,
          endFaceSvgOverride,
          southFaceSvgByPlane,
          eastFaceSvgByPlane,
          endFaceSvgByPlane,
          topOutline,
          topRotateWithAxis,
          endCapTicks,
          faceSliceEqualLighting,
          endCapTickColor,
          weatheringOverlays,
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
