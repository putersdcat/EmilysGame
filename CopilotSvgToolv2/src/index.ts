import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderSvgPreview, renderSvgToPng } from './renderSvg.js';
import { renderAnimatedSvgPreview } from './renderAnimatedSvg.js';
import { shutdownBrowserPool } from './browserPool.js';

const server = new McpServer({
  name: 'copilot-svg-tool',
  version: '1.0.0'
});

server.registerTool(
  'render_svg_preview',
  {
    title: 'Render SVG Preview',
    description:
      'Render SVG markup into a compact PNG preview for visual validation in Copilot Chat. Returns base64 and image metadata.',
    inputSchema: {
      svg: z.string().min(1).describe('Full SVG markup to render.'),
      size: z
        .number()
        .int()
        .min(16)
        .max(1024)
        .optional()
        .describe('Target width in pixels. Default is 128.'),
      background: z
        .string()
        .optional()
        .describe('Optional background color, e.g. #ffffff or rgba(0,0,0,0).'),

      // New (v2) response shaping options.
      response: z
        .enum(['image', 'metadata', 'both', 'json'])
        .optional()
        .describe(
          "Response shape. 'image' returns an MCP image content block + small metadata text (default). 'metadata' returns only metadata. 'both' returns image + metadata. 'json' returns legacy JSON with base64/dataUri."
        ),
      includePngBase64: z
        .boolean()
        .optional()
        .describe('When true, include pngBase64 in structuredContent (can be very large).'),
      includeDataUri: z
        .boolean()
        .optional()
        .describe('When true, include dataUri in structuredContent (can be very large).'),
      writePngToDisk: z
        .boolean()
        .optional()
        .describe('When true, write the PNG to a temp file and include its path in structuredContent.')
    }
  },
  async ({ svg, size, background, response, includePngBase64, includeDataUri, writePngToDisk }) => {
    try {
      const mode = response ?? 'image';

      // Legacy behavior (kept for compatibility): JSON contains base64/dataUri.
      if (mode === 'json') {
        const legacy = renderSvgPreview(svg, { size, background });
        return {
          content: [{ type: 'text', text: JSON.stringify(legacy) }],
          structuredContent: legacy
        };
      }

      const binary = renderSvgToPng(svg, { size, background });

      const out: Record<string, unknown> = {
        ...binary.metadata
      };

      // Optional large fields (off by default to avoid token blow-ups).
      if (includePngBase64) {
        out.pngBase64 = binary.pngBuffer.toString('base64');
      }
      if (includeDataUri) {
        const b64 = (out.pngBase64 as string | undefined) ?? binary.pngBuffer.toString('base64');
        out.dataUri = `data:image/png;base64,${b64}`;
      }

      if (writePngToDisk) {
        const dir = path.join(os.tmpdir(), 'copilot-svg-tool', 'previews');
        await fs.mkdir(dir, { recursive: true });

        const fileName = `${binary.metadata.sha256}.png`;
        const filePath = path.join(dir, fileName);
        await fs.writeFile(filePath, binary.pngBuffer);

        out.pngFilePath = filePath;
      }

      // Tool content: prefer MCP image content so the client can display the preview without
      // forcing the model to ingest base64 as text.
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

      if (mode === 'metadata') {
        content.push({ type: 'text', text: JSON.stringify(out) });
        return { content, structuredContent: out };
      }

      const pngBase64ForImage = binary.pngBuffer.toString('base64');

      if (mode === 'image' || mode === 'both') {
        // Put the image first so the UI renders it prominently.
        content.push({ type: 'image', data: pngBase64ForImage, mimeType: 'image/png' });
      }

      // Always include compact metadata as text.
      content.push({ type: 'text', text: JSON.stringify(out) });

      return {
        content,
        structuredContent: out
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SVG rendering error.';

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message })
          }
        ],
        structuredContent: {
          error: message
        }
      };
    }
  }
);

server.registerTool(
  'render_svg_animation_preview',
  {
    title: 'Render Animated SVG Preview',
    description:
      'Render an animated SVG by sampling its timeline and returning either a storyboard PNG, individual frames, or both. Uses headless Chromium (Playwright).',
    inputSchema: {
      svg: z.string().min(1).describe('Full SVG markup to render.'),
      size: z
        .number()
        .int()
        .min(16)
        .max(1024)
        .optional()
        .describe('Target width in pixels. Default is 128.'),
      background: z
        .string()
        .optional()
        .describe('Optional background color, e.g. #ffffff or rgba(0,0,0,0).'),

      frameCount: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe('Number of frames to sample across the timeline (ignored if timesMs is provided). Default 6.'),
      durationMs: z
        .number()
        .int()
        .min(1)
        .max(120_000)
        .optional()
        .describe('Timeline duration to sample in milliseconds. If omitted, best-effort detection from SVG dur="...".'),
      timesMs: z
        .array(z.number().int().min(0).max(120_000))
        .optional()
        .describe('Explicit sample times (ms). Overrides frameCount/durationMs.'),
      storyboardLayout: z
        .enum(['grid', 'strip'])
        .optional()
        .describe("Storyboard layout. 'grid' (default) or 'strip'."),
      output: z
        .enum(['storyboard', 'frames', 'both', 'metadata'])
        .optional()
        .describe(
          "Output mode. 'storyboard' (default) returns one combined PNG; 'frames' returns each frame; 'both' returns both; 'metadata' returns timeline metadata only."
        ),
      writeToDisk: z
        .boolean()
        .optional()
        .describe('When true, write the sampled frames (and storyboard if generated) to a temp directory and return file paths.')
    }
  },
  async ({ svg, size, background, frameCount, durationMs, timesMs, storyboardLayout, output, writeToDisk }) => {
    try {
      const mode = output ?? 'storyboard';

      const result = await renderAnimatedSvgPreview(svg, {
        size,
        background,
        frameCount,
        durationMs,
        timesMs,
        storyboardLayout,
        writeToDisk
      });

      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

      if (mode === 'metadata') {
        content.push({ type: 'text', text: JSON.stringify(result.metadata) });
        return { content, structuredContent: result.metadata as unknown as Record<string, unknown> };
      }

      if ((mode === 'storyboard' || mode === 'both') && result.storyboard) {
        content.push({ type: 'image', data: result.storyboard.toString('base64'), mimeType: 'image/png' });
      }

      if (mode === 'frames' || mode === 'both') {
        for (const frame of result.frames) {
          content.push({ type: 'image', data: frame.toString('base64'), mimeType: 'image/png' });
        }
      }

      // Always include small metadata text for timeline inspection.
      content.push({ type: 'text', text: JSON.stringify(result.metadata) });

      return { content, structuredContent: result.metadata as unknown as Record<string, unknown> };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown animated SVG rendering error.';

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message })
          }
        ],
        structuredContent: {
          error: message
        }
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  void shutdownBrowserPool().finally(() => process.exit(1));
});
