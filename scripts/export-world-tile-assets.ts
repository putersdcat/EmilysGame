/**
 * export-world-tile-assets.ts
 *
 * Exports world micro-tile primitives as PNG (alpha) for replacement workflows.
 * Output root: asset-dev/Export/WorldTileAssets
 *
 * Run: npx tsx scripts/export-world-tile-assets.ts
 *
 * TODO: DOC - handoff notes and integration flow for replacing generated world tiles.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page } from '@playwright/test';

import { ASSET_DEFS } from '../src/config/assets.config';
import { BIOME_DEFS } from '../src/config/biomes.config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const OUTPUT_ROOT = path.join(WORKSPACE_ROOT, 'asset-dev', 'Export', 'WorldTileAssets');
const RAW_ROOT = path.join(OUTPUT_ROOT, 'micro-tiles', 'raw-32x32');
const ISO_ROOT = path.join(OUTPUT_ROOT, 'micro-tiles', 'iso-64x32');
const BIOME_ROOT = path.join(OUTPUT_ROOT, 'by-biome');
const OVERLAY_ROOT = path.join(OUTPUT_ROOT, 'animated-overlays', 'water-wave-64x32');

const TILE_SOURCE_FILE = path.join(WORKSPACE_ROOT, 'src', 'tiles.ts');
const ASSETS_SOURCE_FILE = path.join(WORKSPACE_ROOT, 'src', 'config', 'assets.config.ts');
const BIOMES_SOURCE_FILE = path.join(WORKSPACE_ROOT, 'src', 'config', 'biomes.config.ts');
const GEN_SOURCE_FILE = path.join(WORKSPACE_ROOT, 'src', 'gen.ts');
const TERRAIN_CACHE_SOURCE_FILE = path.join(WORKSPACE_ROOT, 'src', 'terrain-cache.ts');
const MICRO_TILE_SOURCE_FILE = path.join(WORKSPACE_ROOT, 'src', 'config', 'tiles.config.ts');

const RAW_SIZE = { width: 32, height: 32 };
const ISO_SIZE = { width: 64, height: 32 };

interface SourceLineRange {
  file: string;
  startLine: number;
  endLine: number;
  description: string;
}

interface ExtractedTileSvg {
  tileType: string;
  family: string;
  variantIndex: number;
  symbolName: string;
  svg: string;
  source: {
    file: string;
    startLine: number;
    endLine: number;
  };
}

interface ExportedTileAsset {
  id: string;
  tileType: string;
  family: string;
  variantIndex: number;
  category: 'base' | 'variant';
  size: {
    raw: string;
    iso: string;
  };
  files: {
    rawPng: string;
    isoPng: string;
    biomeIsoCopies: string[];
  };
  usedByBiomes: Array<{
    biomeId: number;
    biomeName: string;
    matchingAssetKeys: string[];
    referencedIn: string[];
  }>;
  source: {
    definition: SourceLineRange;
    runtime: SourceLineRange[];
  };
}

interface ExportManifest {
  generatedAt: string;
  outputRoot: string;
  summary: {
    microTileCount: number;
    biomeCopyCount: number;
    waterOverlayFrameCount: number;
  };
  sourceFiles: string[];
  sizeReference: {
    raw: string;
    isometric: string;
    waterOverlay: string;
  };
  tiles: ExportedTileAsset[];
  waterOverlayFrames: Array<{
    frame: number;
    file: string;
    source: SourceLineRange[];
  }>;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  ensureDir(dirPath);
}

function toRel(absPath: string): string {
  return path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, '/');
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractSvgFromLine(lines: string[], startLine: number): { svg: string; endLine: number } {
  let svg = '';
  let inSvg = false;

  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];

    if (!inSvg && line.includes('<svg')) {
      inSvg = true;
      const svgStart = line.indexOf('<svg');
      svg = line.substring(svgStart);

      if (line.includes('</svg>')) {
        const svgEnd = line.indexOf('</svg>') + 6;
        svg = line.substring(svgStart, svgEnd);
        return { svg: cleanSvg(svg), endLine: i + 1 };
      }
      continue;
    }

    if (inSvg) {
      svg += ' ' + line.trim();
      if (line.includes('</svg>')) {
        const endIdx = svg.indexOf('</svg>') + 6;
        return { svg: cleanSvg(svg.substring(0, endIdx)), endLine: i + 1 };
      }

      if (line.match(/`\s*[,;\]]/)) {
        const backtickIdx = svg.lastIndexOf('`');
        if (backtickIdx >= 0) {
          svg = svg.substring(0, backtickIdx);
        }
        return { svg: cleanSvg(svg), endLine: i + 1 };
      }
    }
  }

  return { svg: cleanSvg(svg), endLine: startLine };
}

function cleanSvg(svg: string): string {
  return svg
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '> <')
    .trim();
}

function getLineRangeBySnippet(content: string, snippet: string, file: string, description: string): SourceLineRange | null {
  const idx = content.indexOf(snippet);
  if (idx < 0) return null;

  const before = content.slice(0, idx);
  const startLine = before.split('\n').length;
  const lineSpan = snippet.split('\n').length - 1;
  const endLine = startLine + Math.max(0, lineSpan);

  return { file, startLine, endLine, description };
}

function collectSourceLinesByRegex(filePath: string, regex: RegExp): number[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const out: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) out.push(i + 1);
  }
  return out;
}

function extractTileSvgs(): ExtractedTileSvg[] {
  const content = fs.readFileSync(TILE_SOURCE_FILE, 'utf-8');
  const lines = content.split('\n');
  const results: ExtractedTileSvg[] = [];

  const arrayNameToFamily: Record<string, string> = {
    GRASS_VARIANT_SVGS: 'grass',
    DIRT_VARIANT_SVGS: 'dirt',
    ROCK_VARIANT_SVGS: 'rock',
    SAND_VARIANT_SVGS: 'sand',
    STONE_FLOOR_VARIANT_SVGS: 'stone_floor',
  };

  let inTileSources = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/const\s+TILE_SVG_SOURCES\s*:/.test(line)) {
      inTileSources = true;
      continue;
    }

    if (inTileSources && /^};\s*$/.test(line.trim())) {
      inTileSources = false;
    }

    if (inTileSources) {
      const baseMatch = line.match(/^\s*(\w+):\s*`<svg/);
      if (baseMatch) {
        const tileType = baseMatch[1];
        const { svg, endLine } = extractSvgFromLine(lines, i + 1);
        results.push({
          tileType,
          family: tileType,
          variantIndex: 0,
          symbolName: `${tileType.toUpperCase()}_BASE_SVG`,
          svg,
          source: { file: toRel(TILE_SOURCE_FILE), startLine: i + 1, endLine },
        });
      }
      continue;
    }

    const arrMatch = line.match(/^const\s+([A-Z_]+_SVGS)\s*:\s*string\[\]\s*=\s*\[/);
    if (!arrMatch) continue;

    const arrayName = arrMatch[1];
    const family = arrayNameToFamily[arrayName];
    if (!family) continue;

    let variantIdx = 0;
    for (let j = i + 1; j < lines.length; j++) {
      const inner = lines[j];
      if (/^];\s*$/.test(inner.trim())) {
        i = j;
        break;
      }

      if (/^\s*`<svg/.test(inner)) {
        const { svg, endLine } = extractSvgFromLine(lines, j + 1);
        results.push({
          tileType: family,
          family,
          variantIndex: variantIdx,
          symbolName: `${family.toUpperCase()}_VARIANT_${variantIdx}_SVG`,
          svg,
          source: { file: toRel(TILE_SOURCE_FILE), startLine: j + 1, endLine },
        });
        variantIdx++;
        j = endLine - 1;
      }
    }
  }

  return results;
}

async function renderTilePng(page: Page, svg: string, mode: 'raw' | 'iso'): Promise<Buffer> {
  const dataUrl = await page.evaluate(async ({ inputSvg, outputMode }) => {
    const sourceSize = 32;
    const tw = 64;
    const th = 32;

    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(inputSvg);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image load failed'));
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create 2D context');

    if (outputMode === 'raw') {
      canvas.width = sourceSize;
      canvas.height = sourceSize;
      ctx.drawImage(img, 0, 0, sourceSize, sourceSize);
    } else {
      canvas.width = tw;
      canvas.height = th;
      ctx.setTransform(
        tw / (2 * sourceSize),
        th / (2 * sourceSize),
        -tw / (2 * sourceSize),
        th / (2 * sourceSize),
        tw / 2,
        0,
      );
      ctx.drawImage(img, 0, 0, sourceSize, sourceSize);
    }

    return canvas.toDataURL('image/png');
  }, { inputSvg: svg, outputMode: mode });

  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function renderWaterOverlayFrames(page: Page): Promise<Buffer[]> {
  const dataUrls = await page.evaluate(async () => {
    const TW = 64;
    const TH = 32;
    const WATER_FRAME_COUNT = 4;
    const out: string[] = [];

    for (let f = 0; f < WATER_FRAME_COUNT; f++) {
      const c = document.createElement('canvas');
      c.width = TW;
      c.height = TH;
      const cx = c.getContext('2d');
      if (!cx) throw new Error('Could not create frame context');

      cx.beginPath();
      cx.moveTo(TW / 2, 0);
      cx.lineTo(TW, TH / 2);
      cx.lineTo(TW / 2, TH);
      cx.lineTo(0, TH / 2);
      cx.closePath();
      cx.clip();

      const phase = (f / WATER_FRAME_COUNT) * Math.PI * 2;

      cx.strokeStyle = 'rgba(255,255,255,0.35)';
      cx.lineWidth = 1.5;
      for (let row = 0; row < 3; row++) {
        const baseY = 8 + row * 10;
        cx.beginPath();
        for (let px = 0; px <= TW; px += 2) {
          const wy = baseY + Math.sin((px / 16) * Math.PI + phase + row * 1.2) * 2.5;
          if (px === 0) cx.moveTo(px, wy);
          else cx.lineTo(px, wy);
        }
        cx.stroke();
      }

      cx.fillStyle = 'rgba(255,255,255,0.3)';
      const sparkleX = 16 + Math.cos(phase) * 12;
      const sparkleY = 12 + Math.sin(phase * 0.7) * 6;
      cx.beginPath();
      cx.arc(sparkleX, sparkleY, 1.5, 0, Math.PI * 2);
      cx.fill();

      const sparkle2X = 48 + Math.cos(phase + 2) * 10;
      const sparkle2Y = 20 + Math.sin(phase * 0.5 + 1) * 5;
      cx.beginPath();
      cx.arc(sparkle2X, sparkle2Y, 1, 0, Math.PI * 2);
      cx.fill();

      out.push(c.toDataURL('image/png'));
    }

    return out;
  });

  return dataUrls.map((url) => Buffer.from(url.split(',')[1], 'base64'));
}

function getTileTypeAssetKeys(tileType: string): string[] {
  const entries = Object.entries(ASSET_DEFS);
  const keys: string[] = [];
  for (const [assetKey, def] of entries) {
    if (def.tileType === tileType) keys.push(assetKey);
  }
  return keys;
}

function biomeRefsForAssetKey(assetKey: string): Array<'terrainWeights' | 'obstacleWeights' | 'featureWeights'> {
  const refs: Array<'terrainWeights' | 'obstacleWeights' | 'featureWeights'> = [];
  for (const group of ['terrainWeights', 'obstacleWeights', 'featureWeights'] as const) {
    for (const biome of BIOME_DEFS) {
      const rec = biome[group] as Record<string, number>;
      if ((rec[assetKey] ?? 0) > 0 && !refs.includes(group)) refs.push(group);
    }
  }
  return refs;
}

function getBiomesForTile(tileType: string): Array<{
  biomeId: number;
  biomeName: string;
  matchingAssetKeys: string[];
  referencedIn: string[];
}> {
  const tileAssetKeys = getTileTypeAssetKeys(tileType);
  if (tileAssetKeys.length === 0) return [];

  const out: Array<{
    biomeId: number;
    biomeName: string;
    matchingAssetKeys: string[];
    referencedIn: string[];
  }> = [];

  for (const biome of BIOME_DEFS) {
    const matchKeys: string[] = [];
    const refs = new Set<string>();

    for (const assetKey of tileAssetKeys) {
      if ((biome.terrainWeights[assetKey] ?? 0) > 0) {
        matchKeys.push(assetKey);
        refs.add('terrainWeights');
      }
      if ((biome.obstacleWeights[assetKey] ?? 0) > 0) {
        matchKeys.push(assetKey);
        refs.add('obstacleWeights');
      }
      if ((biome.featureWeights[assetKey] ?? 0) > 0) {
        matchKeys.push(assetKey);
        refs.add('featureWeights');
      }
    }

    if (matchKeys.length > 0) {
      out.push({
        biomeId: biome.id,
        biomeName: biome.name,
        matchingAssetKeys: Array.from(new Set(matchKeys)),
        referencedIn: Array.from(refs),
      });
    }
  }

  return out;
}

function buildRuntimeSourceRanges(tileType: string): SourceLineRange[] {
  const ranges: SourceLineRange[] = [];

  const genContent = fs.readFileSync(GEN_SOURCE_FILE, 'utf-8');
  const terrainContent = fs.readFileSync(TERRAIN_CACHE_SOURCE_FILE, 'utf-8');

  const assignTerrainSnippet = `let assetKey = weightedPick(biome.terrainWeights, typeNoise);`;
  const assignRange = getLineRangeBySnippet(genContent, assignTerrainSnippet, toRel(GEN_SOURCE_FILE), 'World-gen weighted terrain pick');
  if (assignRange) ranges.push(assignRange);

  const drawSnippet = `if (def.tileType) {`;
  const drawRange = getLineRangeBySnippet(terrainContent, drawSnippet, toRel(TERRAIN_CACHE_SOURCE_FILE), 'Terrain cache chooses tile variant and draws isometric tile');
  if (drawRange) {
    ranges.push({
      ...drawRange,
      endLine: drawRange.startLine + 22,
    });
  }

  for (const ln of collectSourceLinesByRegex(ASSETS_SOURCE_FILE, new RegExp(`tileType:\\s*'${tileType}'`))) {
    ranges.push({
      file: toRel(ASSETS_SOURCE_FILE),
      startLine: ln,
      endLine: ln,
      description: `Asset definition maps to tileType '${tileType}'`,
    });
  }

  const assetKeys = getTileTypeAssetKeys(tileType);
  for (const assetKey of assetKeys) {
    for (const ln of collectSourceLinesByRegex(BIOMES_SOURCE_FILE, new RegExp(`\\b${assetKey}:\\s*`))) {
      ranges.push({
        file: toRel(BIOMES_SOURCE_FILE),
        startLine: ln,
        endLine: ln,
        description: `Biome weights reference asset '${assetKey}'`,
      });
    }
  }

  for (const ln of collectSourceLinesByRegex(MICRO_TILE_SOURCE_FILE, new RegExp(`type:\\s*'${tileType}'`))) {
    ranges.push({
      file: toRel(MICRO_TILE_SOURCE_FILE),
      startLine: ln,
      endLine: ln,
      description: `Micro-tile metadata for '${tileType}'`,
    });
  }

  return dedupeRanges(ranges);
}

function dedupeRanges(ranges: SourceLineRange[]): SourceLineRange[] {
  const seen = new Set<string>();
  const out: SourceLineRange[] = [];
  for (const r of ranges) {
    const key = `${r.file}:${r.startLine}-${r.endLine}:${r.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function main(): Promise<void> {
  console.log('🧩 Exporting world tile assets...');

  cleanDir(OUTPUT_ROOT);
  ensureDir(RAW_ROOT);
  ensureDir(ISO_ROOT);
  ensureDir(BIOME_ROOT);
  ensureDir(OVERLAY_ROOT);

  const tileSvgs = extractTileSvgs();
  console.log(`   Found ${tileSvgs.length} tile SVG primitives/variants in src/tiles.ts`);

  let browser: Browser | null = null;
  let page: Page | null = null;

  const exported: ExportedTileAsset[] = [];
  let biomeCopyCount = 0;

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');

    for (const item of tileSvgs) {
      const baseName = `tile-${slug(item.tileType)}--family-${slug(item.family)}--variant-${item.variantIndex}`;
      const rawName = `${baseName}--raw-${RAW_SIZE.width}x${RAW_SIZE.height}.png`;
      const isoName = `${baseName}--iso-${ISO_SIZE.width}x${ISO_SIZE.height}.png`;

      const rawAbs = path.join(RAW_ROOT, rawName);
      const isoAbs = path.join(ISO_ROOT, isoName);

      const rawPng = await renderTilePng(page, item.svg, 'raw');
      const isoPng = await renderTilePng(page, item.svg, 'iso');

      fs.writeFileSync(rawAbs, rawPng);
      fs.writeFileSync(isoAbs, isoPng);

      const biomes = getBiomesForTile(item.tileType);
      const biomeIsoCopies: string[] = [];

      for (const biome of biomes) {
        const biomeDir = path.join(BIOME_ROOT, slug(biome.biomeName));
        ensureDir(biomeDir);

        const biomeFile = `biome-${slug(biome.biomeName)}__tile-${slug(item.tileType)}__family-${slug(item.family)}__variant-${item.variantIndex}__iso-${ISO_SIZE.width}x${ISO_SIZE.height}.png`;
        const biomeAbs = path.join(biomeDir, biomeFile);

        fs.writeFileSync(biomeAbs, isoPng);
        biomeIsoCopies.push(toRel(biomeAbs));
        biomeCopyCount++;
      }

      exported.push({
        id: `${slug(item.tileType)}-${item.family}-${item.variantIndex}`,
        tileType: item.tileType,
        family: item.family,
        variantIndex: item.variantIndex,
        category: item.symbolName.includes('BASE') ? 'base' : 'variant',
        size: {
          raw: `${RAW_SIZE.width}x${RAW_SIZE.height}`,
          iso: `${ISO_SIZE.width}x${ISO_SIZE.height}`,
        },
        files: {
          rawPng: toRel(rawAbs),
          isoPng: toRel(isoAbs),
          biomeIsoCopies,
        },
        usedByBiomes: biomes,
        source: {
          definition: {
            file: item.source.file,
            startLine: item.source.startLine,
            endLine: item.source.endLine,
            description: `${item.symbolName} definition in src/tiles.ts`,
          },
          runtime: buildRuntimeSourceRanges(item.tileType),
        },
      });
    }

    const waterFrames = await renderWaterOverlayFrames(page);
    const waterManifest: ExportManifest['waterOverlayFrames'] = [];
    for (let i = 0; i < waterFrames.length; i++) {
      const frameFile = `overlay-water-wave-frame-${i}--iso-${ISO_SIZE.width}x${ISO_SIZE.height}.png`;
      const frameAbs = path.join(OVERLAY_ROOT, frameFile);
      fs.writeFileSync(frameAbs, waterFrames[i]);

      waterManifest.push({
        frame: i,
        file: toRel(frameAbs),
        source: [
          {
            file: toRel(TERRAIN_CACHE_SOURCE_FILE),
            startLine: 193,
            endLine: 257,
            description: 'buildWaterOverlayFrames() procedural frame generation',
          },
          {
            file: toRel(TERRAIN_CACHE_SOURCE_FILE),
            startLine: 261,
            endLine: 280,
            description: 'drawWaterOverlays() runtime frame usage',
          },
        ],
      });
    }

    const manifest: ExportManifest = {
      generatedAt: new Date().toISOString(),
      outputRoot: toRel(OUTPUT_ROOT),
      summary: {
        microTileCount: exported.length,
        biomeCopyCount,
        waterOverlayFrameCount: waterManifest.length,
      },
      sourceFiles: [
        toRel(TILE_SOURCE_FILE),
        toRel(ASSETS_SOURCE_FILE),
        toRel(BIOMES_SOURCE_FILE),
        toRel(GEN_SOURCE_FILE),
        toRel(TERRAIN_CACHE_SOURCE_FILE),
        toRel(MICRO_TILE_SOURCE_FILE),
      ],
      sizeReference: {
        raw: `${RAW_SIZE.width}x${RAW_SIZE.height}`,
        isometric: `${ISO_SIZE.width}x${ISO_SIZE.height}`,
        waterOverlay: `${ISO_SIZE.width}x${ISO_SIZE.height}`,
      },
      tiles: exported,
      waterOverlayFrames: waterManifest,
    };

    const manifestPath = path.join(OUTPUT_ROOT, 'world-tile-assets.mapping.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

    const quickIndex = {
      generatedAt: manifest.generatedAt,
      outputRoot: manifest.outputRoot,
      counts: manifest.summary,
      mappingFile: toRel(manifestPath),
    };
    fs.writeFileSync(
      path.join(OUTPUT_ROOT, 'index.json'),
      JSON.stringify(quickIndex, null, 2) + '\n',
      'utf-8',
    );

    console.log('✅ World tile export complete');
    console.log(`   Micro tiles: ${manifest.summary.microTileCount}`);
    console.log(`   Biome copies: ${manifest.summary.biomeCopyCount}`);
    console.log(`   Water overlays: ${manifest.summary.waterOverlayFrameCount}`);
    console.log(`   Mapping: ${toRel(manifestPath)}`);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
