/**
 * cli.ts — 2.0 Experiment: CLI for manual SVG rendering.
 * Usage:
 *   npx tsx cli.ts --svg '<svg>...</svg>' --mode isometric --output tile.png
 *   npx tsx cli.ts --file input.svg --mode flat --output result.png
 *   npx tsx cli.ts --file input.svg --animated --frames 4 --output strip.png
 * TODO: DOC — full CLI reference
 */

import { readFileSync, writeFileSync } from 'fs';
import { renderSvg, renderAnimatedSvg, type RenderMode } from './svg-renderer-tool.js';

// ─── Argument Parsing ────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const name = key.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[name] = next;
        i++;
      } else {
        args[name] = 'true';
      }
    }
  }
  return args;
}

// ─── Main ────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv);

  // Help
  if (args['help'] || Object.keys(args).length === 0) {
    console.log(`
🔷 AiTools SVG Renderer CLI

Usage:
  npx tsx cli.ts --svg '<svg>...</svg>' [options]
  npx tsx cli.ts --file input.svg [options]

Options:
  --svg <string>     SVG markup to render (inline)
  --file <path>      Path to SVG file to render
  --mode <mode>      Render mode: flat | isometric (default: flat)
  --width <px>       Output width (default: 128/256)
  --height <px>      Output height (default: 128)
  --background <css> Background color
  --output <path>    Output PNG path (default: output.png)
  --animated         Render animated strip
  --frames <n>       Number of frames for animated (default: 4)
  --duration <ms>    Frame duration in ms (default: 250)
  --help             Show this help
`);
    return;
  }

  // Get SVG input
  let svg: string;
  if (args['svg']) {
    svg = args['svg'];
  } else if (args['file']) {
    svg = readFileSync(args['file'], 'utf-8');
  } else {
    console.error('❌ Must provide --svg or --file');
    process.exit(1);
  }

  const mode: RenderMode = (args['mode'] as RenderMode) ?? 'flat';
  const width = args['width'] ? Number(args['width']) : undefined;
  const height = args['height'] ? Number(args['height']) : undefined;
  const background = args['background'];
  const output = args['output'] ?? 'output.png';

  // Animated mode
  if (args['animated']) {
    const frames = args['frames'] ? Number(args['frames']) : 4;
    const duration = args['duration'] ? Number(args['duration']) : 250;

    console.log(`🎬 Rendering animated SVG: ${frames} frames, ${duration}ms each, mode=${mode}`);
    const result = renderAnimatedSvg(svg, frames, duration, { mode, width, height, background });

    writeFileSync(output, result.stripPng);
    console.log(`✅ Strip saved: ${output} (${result.frameWidth * result.frameCount}×${result.frameHeight}px, ${result.frameCount} frames)`);
    return;
  }

  // Static render
  console.log(`🎨 Rendering SVG: mode=${mode}, output=${output}`);
  const result = renderSvg(svg, { mode, width, height, background });

  writeFileSync(output, result.png);
  console.log(`✅ Saved: ${output} (${result.width}×${result.height}px, ${result.renderTimeMs}ms)`);
}

main();
