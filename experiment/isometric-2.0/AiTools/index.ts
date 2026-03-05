/**
 * index.ts — 2.0 Experiment: MCP Server for isometric SVG rendering.
 * Registers `render_svg_isometric` tool via @modelcontextprotocol/sdk stdio transport.
 * Accepts SVG markup, renders to PNG with optional isometric diamond transform.
 * TODO: DOC — tool schema auto-published via MCP protocol
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { renderSvg, renderAnimatedSvg } from './svg-renderer-tool.js';
import { renderGeoProof, renderVariationSweep } from './proof-renderer.js';
import { resolveNamedScene, resolveScene, listScenes, type SceneEntry } from './scene-registry.js';
import { renderGameTile, buildGameTileSvg } from './game-tile-renderer.js';

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

const server = new McpServer({
  name: 'iso2-svg-renderer',
  version: '1.0.0',
});

// ─── Tool: render_svg_isometric ──────────────────────────────

server.registerTool(
  'render_nano_isometric',
  {
    title: 'Render Nano SVG (Z-Pinned)',
    description:
      'Render SVG markup to a PNG preview using Z-Pinned isometric transform. ' +
      'Produces a "standing billboard" aligned to the left iso axis of the diamond grid.',
    inputSchema: {
      svg: z
        .string()
        .min(1)
        .describe('Full SVG markup string to render.'),
      width: z
        .number()
        .int()
        .min(16)
        .max(2048)
        .optional()
        .describe('Override output width in pixels. Default: 256.'),
      height: z
        .number()
        .int()
        .min(16)
        .max(2048)
        .optional()
        .describe('Override output height in pixels. Default: 256.'),
      background: z
        .string()
        .optional()
        .describe('Background color (CSS string, e.g. "#ffffff" or "transparent").'),
      writePngBase64: z
        .boolean()
        .optional()
        .describe('When true, also include raw pngBase64 string in metadata (large). Default: false.'),
      zOffset: z
        .number()
        .optional()
        .describe('Z-offset layer for positive/negative nanos (determines draw height or sink depth).'),
      zMode: z
        .enum(['positive', 'negative', 'flat'])
        .optional()
        .describe("Render strategy: 'positive' (standing), 'negative' (sunken), 'flat'."),
      walkable: z
        .boolean()
        .optional()
        .describe('If true (default), tile is walkable. Visible in debug mode.'),
      blendEdges: z
        .boolean()
        .optional()
        .describe('Whether negative-z edges are blended.'),
      includePlayer: z
        .array(z.enum(['front', 'behind', 'left', 'right']))
        .optional()
        .describe('Render dummy player sprite at these relative positions to test occlusion.'),
      debug: z
        .boolean()
        .optional()
        .describe('Render walkable overlay and Z-height edge lines.'),
    },
  },
  async ({ svg, width, height, background, writePngBase64, zOffset, zMode, walkable, blendEdges, includePlayer, debug }) => {
    try {
      const positions = includePlayer && includePlayer.length > 0 ? includePlayer : [undefined];
      const content: ToolContent[] = [];
      let totalRenderTime = 0;
      let lastResult: ReturnType<typeof renderSvg> | null = null;

      for (const pos of positions) {
        const result = renderSvg(svg, {
          mode: 'isometric_z_pinned',
          width,
          height,
          background,
          zOffset,
          zMode,
          walkable,
          blendEdges,
          debug,
          currentPlayerPos: pos,
        });
        totalRenderTime += result.renderTimeMs;
        lastResult = result;
        content.push({ type: 'image', data: result.base64, mimeType: 'image/png' });
      }

      if (!lastResult) {
        throw new Error('Nano render produced no output frame.');
      }

      const meta: Record<string, unknown> = {
        width: lastResult.width,
        height: lastResult.height,
        mode: lastResult.mode,
        renderTimeMs: Math.round(totalRenderTime * 100) / 100,
        bytes: lastResult.png.length,
        nanoMeta: { zOffset, zMode, blendEdgeApplied: blendEdges, walkable },
        occlusionNotes: positions[0] !== undefined
          ? `Player tested at: ${positions.join(', ')}. Check visual occlusion relative to asset.`
          : undefined,
      };
      if (writePngBase64) {
        meta.pngBase64 = lastResult.base64;
      }
      content.push({ type: 'text', text: JSON.stringify(meta) });

      return { content, structuredContent: meta };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown render error.';
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        structuredContent: { error: message },
      };
    }
  },
);

// ─── Tool: render_svg_isometric ──────────────────────────────

server.registerTool(
  'render_svg_isometric',
  {
    title: 'Render SVG (Isometric)',
    description:
      'Render SVG markup to a PNG preview. Supports flat (128×128) and isometric diamond (256×128) modes. ' +
      'Use isometric mode when creating or previewing tile assets for the Iso 2.0 engine. ' +
      'Returns an MCP image content block for visual inspection plus metadata.',
    inputSchema: {
      svg: z
        .string()
        .min(1)
        .describe('Full SVG markup string to render (128×128 viewBox recommended for tiles).'),
      mode: z
        .enum(['flat', 'isometric', 'isometric_z_pinned'])
        .optional()
        .describe(
          "Render mode. 'flat' renders as-is. 'isometric' applies diamond clip + " +
          "transform. 'isometric_z_pinned' applies upright skew. Default: flat."
        ),
      width: z
        .number()
        .int()
        .min(16)
        .max(2048)
        .optional()
        .describe('Override output width in pixels. Default: 128 (flat) or 256 (isometric).'),
      height: z
        .number()
        .int()
        .min(16)
        .max(2048)
        .optional()
        .describe('Override output height in pixels. Default: 128.'),
      background: z
        .string()
        .optional()
        .describe('Background color (CSS string, e.g. "#ffffff" or "transparent").'),
      writePngBase64: z
        .boolean()
        .optional()
        .describe('When true, also include raw pngBase64 string in metadata (large). Default: false.'),
      response: z
        .enum(['image', 'metadata', 'both'])
        .optional()
        .describe("Response shape. 'image' (default) returns image+compact text metadata, 'metadata' returns only metadata, 'both' behaves like image but preserves explicit intent."),
    },
  },
  async ({ svg, mode, width, height, background, writePngBase64, response }) => {
    try {
      const result = renderSvg(svg, { mode, width, height, background });
      const shape = response ?? 'image';
      const content: ToolContent[] = [];

      if (shape !== 'metadata') {
        content.push({ type: 'image', data: result.base64, mimeType: 'image/png' });
      }

      // Compact metadata
      const meta: Record<string, unknown> = {
        width: result.width,
        height: result.height,
        mode: result.mode,
        renderTimeMs: result.renderTimeMs,
        bytes: result.png.length,
      };
      if (writePngBase64) {
        meta.pngBase64 = result.base64;
      }
      content.push({ type: 'text', text: JSON.stringify(meta) });

      return { content, structuredContent: meta };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown render error.';
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        structuredContent: { error: message },
      };
    }
  },
);

// ─── Tool: render_nano_assembly ─────────────────────────────

server.registerTool(
  'render_nano_assembly',
  {
    title: 'Render Nano Assembly (Multi-Tile)',
    description:
      'Render a continuous chain or assembly of multi-tile SVGs into a single composite PNG. ' +
      'Evaluates connectivity, overlap, and Z-sorting.',
    inputSchema: {
      svgChain: z
        .array(
          z.object({
            svg: z.string(),
            col: z.number().int(),
            row: z.number().int(),
            zMode: z.enum(['positive', 'negative', 'flat']).optional(),
            zOffset: z.number().optional(),
            walkable: z.boolean().optional(),
          }),
        )
        .describe('Array of tile definitions to render together into a layout.'),
      width: z.number().int().optional().describe('Output width. Default: 512'),
      height: z.number().int().optional().describe('Output height. Default: 256'),
      background: z.string().optional(),
      debug: z.boolean().optional().describe('Show walkable overlays and bounds.'),
    },
  },
  async ({ svgChain, width, height, background, debug }) => {
    try {
      const result = renderSvg('<svg></svg>', {
        mode: 'isometric_assembly',
        width: width ?? 768,
        height: height ?? 384,
        background,
        debug,
        assemblyChain: svgChain,
      });

      const content: ToolContent[] = [];
      content.push({ type: 'image', data: result.base64, mimeType: 'image/png' });

      const meta: Record<string, unknown> = {
        width: result.width,
        height: result.height,
        mode: result.mode,
        renderTimeMs: result.renderTimeMs,
        bytes: result.png.length,
        tileCount: svgChain.length,
      };
      content.push({ type: 'text', text: JSON.stringify(meta) });

      return { content, structuredContent: meta };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown render error.';
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        structuredContent: { error: message },
      };
    }
  },
);

// ─── Tool: render_svg_isometric_strip ────────────────────────

server.registerTool(
  'render_svg_isometric_strip',
  {
    title: 'Render Animated SVG Strip (Isometric)',
    description:
      'Render an animated or multi-frame SVG into a horizontal sprite strip PNG. ' +
      'Supports flat and isometric modes. Useful for previewing tile animations.',
    inputSchema: {
      svg: z
        .string()
        .min(1)
        .describe('Full SVG markup string to render.'),
      frameCount: z
        .number()
        .int()
        .min(1)
        .max(32)
        .optional()
        .describe('Number of frames to extract. Default: 4.'),
      frameDurationMs: z
        .number()
        .int()
        .min(16)
        .max(5000)
        .optional()
        .describe('Duration per frame in ms. Default: 250.'),
      mode: z
        .enum(['flat', 'isometric', 'isometric_z_pinned'])
        .optional()
        .describe("Render mode. Default: 'flat'."),
      response: z
        .enum(['image', 'metadata', 'both'])
        .optional()
        .describe("Response shape. 'metadata' avoids image payload for lightweight validation."),
      writeStripBase64: z
        .boolean()
        .optional()
        .describe('Include strip PNG base64 inside structured metadata (large). Default: false.'),
    },
  },
  async ({ svg, frameCount, frameDurationMs, mode, response, writeStripBase64 }) => {
    try {
      const result = renderAnimatedSvg(svg, frameCount, frameDurationMs, { mode });

      const shape = response ?? 'image';
      const content: ToolContent[] = [];
      if (shape !== 'metadata') {
        content.push({ type: 'image', data: result.stripBase64, mimeType: 'image/png' });
      }

      const meta: Record<string, unknown> = {
        frameCount: result.frameCount,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        frameDurationMs: result.frameDurationMs,
        mode: result.mode,
      };
      if (writeStripBase64) {
        meta.stripBase64 = result.stripBase64;
      }
      content.push({ type: 'text', text: JSON.stringify(meta) });

      return { content, structuredContent: meta };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown render error.';
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        structuredContent: { error: message },
      };
    }
  },
);

// ─── Tool: render_geo_proof ──────────────────────────────────

server.registerTool(
  'render_geo_proof',
  {
    title: 'Render Geometric Proof',
    description:
      'Render an annotated isometric geometric proof image with compass rose, X/Y/Z axis arrows, ' +
      'face color-coding (TOP=lime, FRONT=yellow, CAP=cyan), Z-EDGE marker, and tile bound outline. ' +
      'Use "reference" variant for a canonical labeled 3D box (no SVG input needed). ' +
      'Use "overlay" variant to annotate your own SVG in z-pinned mode. ' +
      'Essential for verifying face orientation, Z-height, and camera direction during nano tile development.',
    inputSchema: {
      variant: z
        .enum(['reference', 'overlay'])
        .optional()
        .describe(
          '"reference" renders a canonical labeled 3D proof box (default, no svg needed). ' +
          '"overlay" applies z-pinned transform to your svg and adds annotations on top.',
        ),
      svg: z
        .string()
        .optional()
        .describe('SVG to render in overlay mode. Ignored in reference mode.'),
      title: z
        .string()
        .optional()
        .describe('Title text shown at top-left of the proof image.'),
      width: z
        .number()
        .int()
        .min(200)
        .max(2048)
        .optional()
        .describe('Output width in pixels. Default: 520.'),
      height: z
        .number()
        .int()
        .min(150)
        .max(2048)
        .optional()
        .describe('Output height in pixels. Default: 380.'),
      background: z
        .string()
        .optional()
        .describe('Background color. Default: "#0d1117".'),
      compassRose: z.boolean().optional().describe('Show compass rose. Default: true.'),
      axisArrows:  z.boolean().optional().describe('Show X/Y/Z axis arrows. Default: true.'),
      faceLabels:  z.boolean().optional().describe('Color-code and label TOP/FRONT/CAP faces. Default: true.'),
      coordLabels: z.boolean().optional().describe('Show col/row coordinate at tile center. Default: true.'),
      boundOutline:z.boolean().optional().describe('Show dashed diamond bound outline. Default: true.'),
      col: z.number().int().optional().describe('Col coordinate for overlay mode coord annotation.'),
      row: z.number().int().optional().describe('Row coordinate for overlay mode coord annotation.'),
    },
  },
  async ({ variant, svg, title, width, height, background, compassRose, axisArrows, faceLabels, coordLabels, boundOutline, col, row }) => {
    try {
      const result = renderGeoProof({ variant, svg, title, width, height, background, compassRose, axisArrows, faceLabels, coordLabels, boundOutline, col, row });
      const meta: Record<string, unknown> = {
        variant: result.proofVariant,
        width: result.width,
        height: result.height,
        renderTimeMs: result.renderTimeMs,
        bytes: result.png.length,
      };
      return {
        content: [
          { type: 'image' as const, data: result.base64, mimeType: 'image/png' },
          { type: 'text' as const, text: JSON.stringify(meta) },
        ],
        structuredContent: meta,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], structuredContent: { error: message } };
    }
  },
);

// ─── Tool: render_variation_sweep ────────────────────────────

server.registerTool(
  'render_variation_sweep',
  {
    title: 'Render Variation Sweep',
    description:
      'Render N variants of an SVG with one parameter swept across given values, ' +
      'returned as a labelled horizontal strip PNG. ' +
      'Use this to find the correct texture rotation, scale, zOffset, or opacity in one shot ' +
      'instead of making multiple round-trips. Each frame is annotated with the param value. ' +
      'Supported params: textureRotation (degrees 0/90/180/270), textureScale (0.5/1/1.5/2), ' +
      'zOffset (-2..+4), opacity (0.3..1.0).',
    inputSchema: {
      svg: z
        .string()
        .min(1)
        .describe('Base SVG template to sweep (128×128 viewBox recommended).'),
      param: z
        .enum(['textureRotation', 'textureScale', 'zOffset', 'opacity'])
        .describe('Which parameter to sweep across values.'),
      values: z
        .array(z.number())
        .min(1)
        .max(8)
        .describe('Array of values to sweep. E.g. [0, 90, 180, 270] for textureRotation.'),
      background: z.string().optional().describe('Background color. Default: "#0d1117".'),
      frameSize: z
        .number()
        .int()
        .min(100)
        .max(400)
        .optional()
        .describe('Width/height of each frame in pixels. Default: 200.'),
    },
  },
  async ({ svg, param, values, background, frameSize }) => {
    try {
      const result = renderVariationSweep(svg, param, values, { background, frameSize });
      const meta: Record<string, unknown> = {
        param,
        values,
        frameCount: result.frameCount,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        renderTimeMs: result.renderTimeMs,
      };
      return {
        content: [
          { type: 'image' as const, data: result.stripBase64, mimeType: 'image/png' },
          { type: 'text' as const, text: JSON.stringify(meta) },
        ],
        structuredContent: meta,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], structuredContent: { error: message } };
    }
  },
);

// ─── Tool: render_iso_scene ───────────────────────────────────

const SCENE_ENTRY_SCHEMA = z.object({
  kind:    z.string().describe('TileKind (grass/dirt/rock/water/sand/dry-grass) or NanoKind slug.'),
  col:     z.number().int(),
  row:     z.number().int(),
  variant: z.string().optional().describe('Feature variant: straight-h, straight-v, cross, corner-tr, corner-tl, corner-br, corner-bl, tee-t, tee-r, tee-b, tee-l, end-r, end-l, end-t, end-b, isolated.'),
  label:   z.string().optional(),
});

server.registerTool(
  'render_iso_scene',
  {
    title: 'Render Iso Scene (Named or Custom)',
    description:
      'Render a pre-defined named scene or a custom scene descriptor as an isometric assembly PNG. ' +
      'Named scenes include: wall-h-run, wall-v-run, fence-perimeter, river-crossing, ' +
      'tall-grass-patch, homestead, mixed-biomes, all-nanos. ' +
      'Each entry resolves its kind slug to the correct demo SVG, Z mode, Z offset, and walkability ' +
      'using the same logic as the Iso 2.0 game engine. ' +
      'Use this to quickly call up a reference scene to test your new SVG or nano against. ' +
      'Call with listScenes=true to get a JSON list of all available built-in scenes.',
    inputSchema: {
      sceneName: z
        .string()
        .optional()
        .describe('Name of a built-in scene. If provided, entries is ignored.'),
      entries: z
        .array(SCENE_ENTRY_SCHEMA)
        .optional()
        .describe('Custom scene entries. Used when sceneName is not provided.'),
      listScenes: z
        .boolean()
        .optional()
        .describe('If true, return a list of all available built-in scene names (no render performed).'),
      width:  z.number().int().min(200).max(4096).optional().describe('Canvas width. Default from scene or 1024.'),
      height: z.number().int().min(150).max(4096).optional().describe('Canvas height. Default from scene or 512.'),
      background: z.string().optional().describe('Background color. Default: "#0d1117".'),
      debug:  z.boolean().optional().describe('Show walkable overlays and tile bounds.'),
      players: z
        .array(z.object({
          col:   z.number().describe('World tile column (fractional ok for boundary positions).'),
          row:   z.number().describe('World tile row (fractional ok for boundary positions).'),
          label: z.string().optional().describe('Label drawn above the sprite.'),
        }))
        .optional()
        .describe('Player sprites at world grid coords for walkability boundary validation.'),
      outputPath: z.string().optional().describe('Absolute or workspace-relative path to write the PNG file to disk (e.g. \'experiment/isometric-2.0/ProgressEvaluations/my-scene.png\').'),

    },
  },
  async ({ sceneName, entries, listScenes: doList, width, height, background, debug, players, outputPath }) => {
    try {
      // List-only mode
      if (doList) {
        const scenes = listScenes();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(scenes, null, 2) }],
          structuredContent: { scenes },
        };
      }

      let chain: ReturnType<typeof resolveScene>;
      let descriptor: { name: string; canvasWidth?: number; canvasHeight?: number } | null = null;

      if (sceneName) {
        const resolved = resolveNamedScene(sceneName);
        chain = resolved.chain;
        descriptor = resolved.descriptor;
      } else if (entries && entries.length > 0) {
        // Custom scene: resolve each entry via scene-registry
        chain = resolveScene({ name: 'custom', description: 'Custom scene', entries: entries as SceneEntry[] });
      } else {
        throw new Error('Provide either sceneName or entries.');
      }

      const outW = width  ?? descriptor?.canvasWidth  ?? 1024;
      const outH = height ?? descriptor?.canvasHeight ?? 512;

      const result = renderSvg('<svg/>', {
        mode: 'isometric_assembly',
        width: outW,
        height: outH,
        background,
        debug,
        assemblyChain: chain,
        players,
      });

      // Write PNG to disk if outputPath requested
      if (outputPath) {
        const absPath = outputPath.startsWith('/') || /^[A-Za-z]:[/\\]/.test(outputPath)
          ? outputPath
          : `${process.cwd()}/${outputPath}`;
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, result.png);
      }

      const meta: Record<string, unknown> = {
        scene: sceneName ?? 'custom',
        tileCount: chain.length,
        playerCount: players?.length ?? 0,
        width: result.width,
        height: result.height,
        renderTimeMs: result.renderTimeMs,
        bytes: result.png.length,
        savedTo: outputPath ?? null,
      };
      return {
        content: [
          { type: 'image' as const, data: result.base64, mimeType: 'image/png' },
          { type: 'text' as const, text: JSON.stringify(meta) },
        ],
        structuredContent: meta,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], structuredContent: { error: message } };
    }
  },
);

// ─── Tool: render_game_tile ──────────────────────────────────
// Primary tool for visual validation — uses actual game engine SVG generators.
// Eliminates the need to hand-craft SVG strings for known game kinds.

server.registerTool(
  'render_game_tile',
  {
    title: 'Render Game Tile (kind + variant)',
    description:
      'Render any game tile kind + variant to a PNG by calling the ACTUAL game engine ' +
      'SVG generators from solver.ts, then wrapping in the correct isometric projection. ' +
      'This is the preferred tool for validating any tile asset — no SVG markup required. ' +
      '\n\nExtruded kinds (stone-wall, cathedral-wall, homestead-wall): renders full 3-face ' +
      'box using the same matrix math as drawExtrudedNano() in nano-tile.ts.' +
      '\n\nBillboard kinds (fence, gate, troll-bridge, bridge): Z-pinned standing billboard.' +
      '\n\nNegative kinds (river, river-bank): sunken flat iso projection.' +
      '\n\nFlat kinds (tall-grass): semi-transparent flat iso overlay.',
    inputSchema: {
      kind: z
        .enum(['stone-wall', 'fence', 'river', 'river-bank', 'tall-grass', 'gate', 'troll-bridge', 'bridge', 'cathedral-wall', 'homestead-wall'])
        .describe('The NanoTileKind to render. Each has a canonical rendering pathway.'),
      variant: z
        .string()
        .optional()
        .describe(
          'Feature variant. Valid values: straight-h, straight-v, cross, end-r, end-l, end-t, end-b, ' +
          'corner-tr, corner-tl, corner-br, corner-bl, tee-t, tee-r, tee-b, tee-l, isolated. ' +
          'Default: straight-h.',
        ),
      zOffset: z
        .number()
        .optional()
        .describe('Z height level. Default: 4 for walls, 2 for fences/river. NANO_Z_SCALE=12px/level.'),
      connections: z
        .object({
          top:    z.boolean().optional(),
          right:  z.boolean().optional(),
          bottom: z.boolean().optional(),
          left:   z.boolean().optional(),
        })
        .optional()
        .describe('Which sides are connected to a neighbor of the same kind. Auto-inferred from variant if omitted.'),
      width: z
        .number().int().min(64).max(1024).optional()
        .describe('Output canvas width in pixels. Default: 320.'),
      height: z
        .number().int().min(64).max(1024).optional()
        .describe('Output canvas height in pixels. Default: 320.'),
      background: z
        .string().optional()
        .describe('Background color CSS string. Default: "#0d1117".'),
      worldCol: z.number().optional().describe('World col (for tall-grass procedural variation). Default: 0.'),
      worldRow: z.number().optional().describe('World row (for tall-grass procedural variation). Default: 0.'),
      svgOnly: z
        .boolean().optional()
        .describe('When true, return the generated SVG markup as text instead of rendering to PNG. Useful for debugging the SVG generator output.'),
    },
  },
  async (args) => {
    try {
      const { kind, svgOnly, ...rest } = args;
      const opts = {
        ...rest,
        variant: rest.variant as Parameters<typeof renderGameTile>[1]['variant'],
        connections: rest.connections
          ? { top: rest.connections.top ?? false, right: rest.connections.right ?? false, bottom: rest.connections.bottom ?? false, left: rest.connections.left ?? false }
          : undefined,
      };

      if (svgOnly) {
        const svg = buildGameTileSvg(kind, opts);
        return { content: [{ type: 'text' as const, text: svg }] };
      }

      const result = renderGameTile(kind, opts);
      const meta: Record<string, unknown> = {
        kind,
        variant: opts.variant ?? 'straight-h',
        zOffset: opts.zOffset,
        width: result.width,
        height: result.height,
        renderTimeMs: result.renderTimeMs,
        bytes: result.png.length,
      };
      return {
        content: [
          { type: 'image' as const, data: result.base64, mimeType: 'image/png' },
          { type: 'text' as const, text: JSON.stringify(meta) },
        ],
        structuredContent: meta,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], structuredContent: { error: message } };
    }
  },
);

// ─── Start ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
