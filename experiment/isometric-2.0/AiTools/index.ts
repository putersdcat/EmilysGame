/**
 * index.ts — 2.0 Experiment: MCP Server for isometric SVG rendering.
 * Registers `render_svg_isometric` tool via @modelcontextprotocol/sdk stdio transport.
 * Accepts SVG markup, renders to PNG with optional isometric diamond transform.
 * TODO: DOC — tool schema auto-published via MCP protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { renderSvg, renderAnimatedSvg } from './svg-renderer-tool.js';

const server = new McpServer({
  name: 'iso2-svg-renderer',
  version: '1.0.0',
});

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
        .enum(['flat', 'isometric'])
        .optional()
        .describe(
          "Render mode. 'flat' renders as-is (128×128). 'isometric' applies diamond clip + " +
          "matrix(1,0.5,-1,0.5,128,0) transform to produce a 256×128 isometric tile. Default: flat."
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
    },
  },
  async ({ svg, mode, width, height, background, writePngBase64 }) => {
    try {
      const result = renderSvg(svg, { mode, width, height, background });

      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      > = [];

      // Image content block — lets the VS Code UI render the preview
      content.push({
        type: 'image',
        data: result.base64,
        mimeType: 'image/png',
      });

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
        .enum(['flat', 'isometric'])
        .optional()
        .describe("Render mode. Default: 'flat'."),
    },
  },
  async ({ svg, frameCount, frameDurationMs, mode }) => {
    try {
      const result = renderAnimatedSvg(svg, frameCount, frameDurationMs, { mode });

      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      > = [];

      content.push({
        type: 'image',
        data: result.stripBase64,
        mimeType: 'image/png',
      });

      const meta: Record<string, unknown> = {
        frameCount: result.frameCount,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        frameDurationMs: result.frameDurationMs,
        mode: result.mode,
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
