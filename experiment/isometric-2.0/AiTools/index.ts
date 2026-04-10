/**
 * index.ts — Iso 2.0 MCP Server (relay build).
 *
 * Tool schema registration only. All rendering dispatched to render-worker.ts
 * via child_process (tsx). Changes to any game engine .ts file are picked up
 * automatically on the next call — no rebuild, no restart.
 *
 * Rebuild only if tool SCHEMAS change (rare).
 * TODO: DOC
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ─── Worker relay ─────────────────────────────────────────────

const DIST_DIR = dirname(fileURLToPath(import.meta.url)); // .../AiTools/dist
const AITOOLS  = join(DIST_DIR, '..');                    // .../AiTools
const TSX_CLI  = join(AITOOLS, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const WORKER   = join(AITOOLS, 'render-worker.ts');

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

type WorkerResult =
  | { ok: true;  content: ToolContent[]; structuredContent: Record<string, unknown> }
  | { ok: false; error: string };

function spawnWorker(tool: string, args: unknown): {
  isError?: boolean;
  content: ToolContent[];
  structuredContent: Record<string, unknown>;
} {
  try {
    const out = execFileSync(process.execPath, [TSX_CLI, WORKER, tool], {
      input: JSON.stringify(args),
      maxBuffer: 50 * 1024 * 1024,
      cwd: AITOOLS,
      timeout: 45_000,
    });
    const res: WorkerResult = JSON.parse(out.toString('utf8'));
    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: res.error }) }],
        structuredContent: { error: res.error },
      };
    }
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      structuredContent: { error: message },
    };
  }
}

// ─── Server ───────────────────────────────────────────────────

const server = new McpServer({ name: 'iso2-svg-renderer', version: '1.0.0' });

// ─── render_nano_isometric ────────────────────────────────────
server.registerTool('render_nano_isometric', {
  title: 'Render Nano SVG (Z-Pinned)',
  description: 'Render SVG markup to a PNG preview using Z-Pinned isometric transform. Produces a "standing billboard" aligned to the left iso axis of the diamond grid.',
  inputSchema: {
    svg: z.string().min(1).describe('Full SVG markup string to render.'),
    width: z.number().int().min(16).max(2048).optional().describe('Override output width in pixels. Default: 256.'),
    height: z.number().int().min(16).max(2048).optional().describe('Override output height in pixels. Default: 256.'),
    background: z.string().optional().describe('Background color (CSS string).'),
    writePngBase64: z.boolean().optional().describe('When true, include raw pngBase64 in metadata. Default: false.'),
    zOffset: z.number().optional().describe('Z-offset layer.'),
    zMode: z.enum(['positive', 'negative', 'flat']).optional().describe("'positive' (standing), 'negative' (sunken), 'flat'."),
    walkable: z.boolean().optional().describe('Tile is walkable. Visible in debug mode.'),
    blendEdges: z.boolean().optional().describe('Whether negative-z edges are blended.'),
    includePlayer: z.array(z.enum(['front', 'behind', 'left', 'right'])).optional().describe('Player positions to test occlusion.'),
    debug: z.boolean().optional().describe('Render walkable overlay and Z-height edge lines.'),
  },
}, async (args) => spawnWorker('render_nano_isometric', args));

// ─── render_svg_isometric ─────────────────────────────────────
server.registerTool('render_svg_isometric', {
  title: 'Render SVG (Isometric)',
  description: 'Render SVG markup to a PNG preview. Supports flat (128×128) and isometric diamond (256×128) modes. Returns an MCP image content block for visual inspection plus metadata.',
  inputSchema: {
    svg: z.string().min(1).describe('Full SVG markup string to render (128×128 viewBox recommended for tiles).'),
    mode: z.enum(['flat', 'isometric', 'isometric_z_pinned']).optional().describe("'flat' renders as-is. 'isometric' applies diamond clip. 'isometric_z_pinned' applies upright skew. Default: flat."),
    width: z.number().int().min(16).max(2048).optional().describe('Override output width in pixels. Default: 128 (flat) or 256 (isometric).'),
    height: z.number().int().min(16).max(2048).optional().describe('Override output height in pixels. Default: 128.'),
    background: z.string().optional().describe('Background color (CSS string).'),
    writePngBase64: z.boolean().optional().describe('When true, include raw pngBase64 in metadata. Default: false.'),
    response: z.enum(['image', 'metadata', 'both']).optional().describe("'image' (default) returns image+metadata, 'metadata' returns only metadata."),
  },
}, async (args) => spawnWorker('render_svg_isometric', args));

// ─── render_nano_assembly ─────────────────────────────────────
server.registerTool('render_nano_assembly', {
  title: 'Render Nano Assembly (Multi-Tile)',
  description: 'Render a continuous chain or assembly of multi-tile SVGs into a single composite PNG. Evaluates connectivity, overlap, and Z-sorting.',
  inputSchema: {
    svgChain: z.array(z.object({
      svg: z.string(), col: z.number().int(), row: z.number().int(),
      zMode: z.enum(['positive', 'negative', 'flat']).optional(),
      zOffset: z.number().optional(), walkable: z.boolean().optional(),
    })).describe('Array of tile definitions to render together.'),
    width: z.number().int().optional().describe('Output width. Default: 512'),
    height: z.number().int().optional().describe('Output height. Default: 256'),
    background: z.string().optional(),
    debug: z.boolean().optional().describe('Show walkable overlays and bounds.'),
  },
}, async (args) => spawnWorker('render_nano_assembly', args));

// ─── render_svg_isometric_strip ───────────────────────────────
server.registerTool('render_svg_isometric_strip', {
  title: 'Render Animated SVG Strip (Isometric)',
  description: 'Render an animated or multi-frame SVG into a horizontal sprite strip PNG. Supports flat and isometric modes. Useful for previewing tile animations.',
  inputSchema: {
    svg: z.string().min(1).describe('Full SVG markup string to render.'),
    frameCount: z.number().int().min(1).max(32).optional().describe('Number of frames to extract. Default: 4.'),
    frameDurationMs: z.number().int().min(16).max(5000).optional().describe('Duration per frame in ms. Default: 250.'),
    mode: z.enum(['flat', 'isometric', 'isometric_z_pinned']).optional().describe("Render mode. Default: 'flat'."),
    response: z.enum(['image', 'metadata', 'both']).optional().describe("'metadata' avoids image payload for lightweight validation."),
    writeStripBase64: z.boolean().optional().describe('Include strip PNG base64 in metadata (large). Default: false.'),
  },
}, async (args) => spawnWorker('render_svg_isometric_strip', args));

// ─── render_geo_proof ─────────────────────────────────────────
server.registerTool('render_geo_proof', {
  title: 'Render Geometric Proof',
  description: 'Render an annotated isometric geometric proof image with compass rose, X/Y/Z axis arrows, face color-coding (TOP=lime, FRONT=yellow, CAP=cyan), Z-EDGE marker, and tile bound outline. Use "reference" variant for a canonical labeled 3D box (no SVG input needed). Use "overlay" variant to annotate your own SVG in z-pinned mode.',
  inputSchema: {
    variant: z.enum(['reference', 'overlay']).optional().describe('"reference" renders canonical 3D proof box. "overlay" applies z-pinned transform to your svg.'),
    svg: z.string().optional().describe('SVG to render in overlay mode.'),
    title: z.string().optional().describe('Title text shown at top-left.'),
    width: z.number().int().min(200).max(2048).optional().describe('Output width. Default: 520.'),
    height: z.number().int().min(150).max(2048).optional().describe('Output height. Default: 380.'),
    background: z.string().optional().describe('Background color. Default: "#0d1117".'),
    compassRose: z.boolean().optional().describe('Show compass rose. Default: true.'),
    axisArrows: z.boolean().optional().describe('Show X/Y/Z axis arrows. Default: true.'),
    faceLabels: z.boolean().optional().describe('Color-code and label TOP/FRONT/CAP faces. Default: true.'),
    coordLabels: z.boolean().optional().describe('Show col/row coordinate at tile center. Default: true.'),
    boundOutline: z.boolean().optional().describe('Show dashed diamond bound outline. Default: true.'),
    col: z.number().int().optional().describe('Col coordinate for overlay mode coord annotation.'),
    row: z.number().int().optional().describe('Row coordinate for overlay mode coord annotation.'),
  },
}, async (args) => spawnWorker('render_geo_proof', args));

// ─── render_variation_sweep ───────────────────────────────────
server.registerTool('render_variation_sweep', {
  title: 'Render Variation Sweep',
  description: 'Render N variants of an SVG with one parameter swept across given values, returned as a labelled horizontal strip PNG. Supported params: textureRotation (degrees 0/90/180/270), textureScale (0.5/1/1.5/2), zOffset (-2..+4), opacity (0.3..1.0).',
  inputSchema: {
    svg: z.string().min(1).describe('Base SVG template to sweep (128×128 viewBox recommended).'),
    param: z.enum(['textureRotation', 'textureScale', 'zOffset', 'opacity']).describe('Which parameter to sweep across values.'),
    values: z.array(z.number()).min(1).max(8).describe('Array of values to sweep. E.g. [0, 90, 180, 270] for textureRotation.'),
    background: z.string().optional().describe('Background color. Default: "#0d1117".'),
    frameSize: z.number().int().min(100).max(400).optional().describe('Width/height of each frame in pixels. Default: 200.'),
  },
}, async (args) => spawnWorker('render_variation_sweep', args));

// ─── render_iso_scene ─────────────────────────────────────────
server.registerTool('render_iso_scene', {
  title: 'Render Iso Scene (Named or Custom)',
  description: 'Render a pre-defined named scene or a custom scene descriptor as an isometric assembly PNG. Named scenes include: wall-h-run, wall-v-run, fence-perimeter, river-crossing, tall-grass-patch, homestead, mixed-biomes, all-nanos. Call with listScenes=true to get a JSON list of all available built-in scenes.',
  inputSchema: {
    sceneName: z.string().optional().describe('Name of a built-in scene. If provided, entries is ignored.'),
    entries: z.array(z.object({
      kind: z.string(), col: z.number().int(), row: z.number().int(),
      variant: z.string().optional(), label: z.string().optional(),
    })).optional().describe('Custom scene entries.'),
    listScenes: z.boolean().optional().describe('If true, return list of all built-in scene names (no render).'),
    width: z.number().int().min(200).max(4096).optional().describe('Canvas width. Default from scene or 1024.'),
    height: z.number().int().min(150).max(4096).optional().describe('Canvas height. Default from scene or 512.'),
    background: z.string().optional().describe('Background color. Default: "#0d1117".'),
    debug: z.boolean().optional().describe('Show walkable overlays and tile bounds.'),
    players: z.array(z.object({
      col: z.number(), row: z.number(), label: z.string().optional(),
    })).optional().describe('Player sprites at world grid coords for walkability boundary validation.'),
    outputPath: z.string().optional().describe('Absolute or workspace-relative path to write the PNG file to disk.'),
  },
}, async (args) => spawnWorker('render_iso_scene', args));

// ─── render_game_tile ─────────────────────────────────────────
server.registerTool('render_game_tile', {
  title: 'Render Game Tile (kind + variant)',
  description: 'Render any game tile kind + variant to a PNG by calling the ACTUAL game engine SVG generators from solver.ts, then wrapping in the correct isometric projection. Extruded kinds (stone-wall, cathedral-wall, homestead-wall): full 3-face box. Billboard kinds (fence, gate, troll-bridge, bridge): Z-pinned. Negative kinds (river, river-bank): sunken. Flat kinds (tall-grass): ground overlay.',
  inputSchema: {
    kind: z.enum(['stone-wall', 'fence', 'river', 'river-bank', 'tall-grass', 'gate', 'troll-bridge', 'bridge', 'cathedral-wall', 'homestead-wall']).describe('The NanoTileKind to render.'),
    variant: z.string().optional().describe('Feature variant. Valid values: straight-h, straight-v, cross, end-r, end-l, end-t, end-b, corner-tr, corner-tl, corner-br, corner-bl, tee-t, tee-r, tee-b, tee-l, isolated. Default: straight-h.'),
    zOffset: z.number().optional().describe('Z height level. Default: 4 for walls, 2 for fences/river. NANO_Z_SCALE=12px/level.'),
    connections: z.object({
      top: z.boolean().optional(), right: z.boolean().optional(),
      bottom: z.boolean().optional(), left: z.boolean().optional(),
    }).optional().describe('Which sides are connected to a neighbor of the same kind.'),
    width: z.number().int().min(64).max(1024).optional().describe('Output canvas width in pixels. Default: 320.'),
    height: z.number().int().min(64).max(1024).optional().describe('Output canvas height in pixels. Default: 320.'),
    background: z.string().optional().describe('Background color CSS string. Default: "#0d1117".'),
    worldCol: z.number().optional().describe('World col (for tall-grass procedural variation). Default: 0.'),
    worldRow: z.number().optional().describe('World row (for tall-grass procedural variation). Default: 0.'),
    svgOnly: z.boolean().optional().describe('When true, return the generated SVG markup as text. Useful for debugging.'),
  },
}, async (args) => spawnWorker('render_game_tile', args));

// ─── render_nano_tile ─────────────────────────────────────────
server.registerTool('render_nano_tile', {
  title: 'Render Nano Tile (Canvas-Native Engine)',
  description: 'Render a single NanoTile kind + variant to PNG by calling the ACTUAL game engine draw functions (drawExtrudedNano, drawPositiveNano, etc.) via @napi-rs/canvas. Zero math reimplemented — pixel-identical to browser output.',
  inputSchema: {
    kind: z.enum(['stone-wall', 'fence', 'river', 'river-bank', 'tall-grass', 'gate', 'troll-bridge', 'bridge', 'cathedral-wall', 'homestead-wall']).describe('The NanoTileKind to render.'),
    variant: z.enum(['straight-h', 'straight-v', 'cross', 'end-r', 'end-l', 'end-t', 'end-b', 'corner-tr', 'corner-tl', 'corner-br', 'corner-bl', 'tee-t', 'tee-r', 'tee-b', 'tee-l', 'isolated']).optional().describe('Feature variant. Default: straight-h.'),
    zOffset: z.number().optional().describe('Z height level. Default per kind.'),
    width: z.number().int().min(150).max(800).optional().describe('Canvas width. Default: 320.'),
    height: z.number().int().min(150).max(800).optional().describe('Canvas height. Default: 320.'),
    background: z.string().optional().describe('Background color CSS. Default: "#0d1117".'),
    wallDebugFlat: z.boolean().optional().describe('Render wall tiles as flat debug colors instead of textures. Default: false.'),
  },
}, async (args) => spawnWorker('render_nano_tile', args));

// ─── render_nano_scene ────────────────────────────────────────
server.registerTool('render_nano_scene', {
  title: 'Render Nano Scene (Canvas-Native Engine)',
  description: 'Render a multi-tile scene (terrain + nano overlay tiles + player sprites) PNG by calling the ACTUAL game engine draw functions directly via @napi-rs/canvas. Two-pass render: terrain diamonds first, then nano overlays in zMode order, then players. Pixel-identical to browser output.',
  inputSchema: {
    entries: z.array(z.object({
      kind: z.string().describe('Tile kind: terrain (grass/dirt/rock/water/sand/dry-grass) or nano kind.'),
      col: z.number().int(), row: z.number().int(),
      variant: z.string().optional(), zOffset: z.number().optional(),
      label: z.string().optional().describe('Unused for scene entries — use players array for labelled sprites.'),
    })).describe('Scene tile entries.'),
    players: z.array(z.object({
      col: z.number().int(), row: z.number().int(), label: z.string().optional(),
    })).optional().describe('Player sprite positions.'),
    width: z.number().int().min(200).max(2400).optional().describe('Canvas width. Default: 900.'),
    height: z.number().int().min(150).max(1600).optional().describe('Canvas height. Default: 600.'),
    debug: z.boolean().optional().describe('Draw walkability overlay + tile grid. Default: false.'),
    wallDebugFlat: z.boolean().optional().describe('Render wall tiles as flat debug colors (amber face, green/blue top) instead of brick textures. Default: false.'),
    background: z.string().optional().describe('Background color. Default: "#1a1f2b".'),
    outputPath: z.string().optional().describe('Absolute or workspace-relative path to write the PNG file to disk.'),
  },
}, async (args) => spawnWorker('render_nano_scene', args));

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
