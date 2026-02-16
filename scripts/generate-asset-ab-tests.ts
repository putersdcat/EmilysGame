/**
 * generate-asset-ab-tests.ts - Generate A/B test variants for SVG assets
 *
 * Reads SVG assets from asset-dev/Export/svg-asset-map.json and generates:
 * - Two artistic variants for each asset (different styles)
 * - Interactive HTML gallery for ranking assets
 * - JSON manifest for tracking test runs
 *
 * Output structure:
 *   asset-dev/Export/A-B-Tests/
 *     run-{timestamp}/
 *       assets/
 *         original/
 *         variant-aurora/
 *         variant-ink/
 *       manifest.json
 *       index.html
 *
 * Usage: npm run generate:ab-tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── Configuration ──────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const EXPORT_ROOT = path.join(WORKSPACE_ROOT, 'asset-dev', 'Export');
const AB_TEST_ROOT = path.join(EXPORT_ROOT, 'A-B-Tests');
const SVG_MAP_PATH = path.join(EXPORT_ROOT, 'svg-asset-map.json');

interface SVGAsset {
  id: string;
  symbolName: string;
  exportPathRelative: string;
  exportPathAbsolute: string;
  category: string;
}

interface AssetVariant {
  original: string;
  aurora: string;
  ink: string;
}

interface TestRunManifest {
  runId: string;
  timestamp: string;
  totalAssets: number;
  styles: {
    variant1: { name: string; description: string };
    variant2: { name: string; description: string };
  };
  assets: Array<{
    id: string;
    symbolName: string;
    category: string;
    originalPath: string;
    variant1Path: string;
    variant2Path: string;
  }>;
}

// ─── SVG Style Transformations ─────────────────────────────

/**
 * Aurora Glow Style - Adds vibrant gradients, glows, and luminous effects
 */
function applyAuroraGlowStyle(svgContent: string, assetId: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.documentElement;

  // Create unique gradient IDs for this asset
  const gradId = `aurora-grad-${assetId}`;
  const glowId = `aurora-glow-${assetId}`;

  // Add defs if not exists
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  // Create luminous gradient
  const gradient = doc.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradient.setAttribute('id', gradId);
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '100%');
  gradient.setAttribute('y2', '100%');

  const colors = [
    { offset: '0%', color: '#FF6EC7', opacity: '0.8' },
    { offset: '33%', color: '#8B5CF6', opacity: '0.9' },
    { offset: '66%', color: '#3B82F6', opacity: '0.85' },
    { offset: '100%', color: '#10B981', opacity: '0.8' }
  ];

  colors.forEach(c => {
    const stop = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', c.offset);
    stop.setAttribute('stop-color', c.color);
    stop.setAttribute('stop-opacity', c.opacity);
    gradient.appendChild(stop);
  });
  defs.appendChild(gradient);

  // Create glow filter
  const filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', glowId);
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');

  const blur = doc.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '2');
  blur.setAttribute('result', 'coloredBlur');

  const merge = doc.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
  const mergeNode1 = doc.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mergeNode1.setAttribute('in', 'coloredBlur');
  const mergeNode2 = doc.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mergeNode2.setAttribute('in', 'SourceGraphic');

  merge.appendChild(mergeNode1);
  merge.appendChild(mergeNode2);
  filter.appendChild(blur);
  filter.appendChild(merge);
  defs.appendChild(filter);

  // Apply effects to elements
  const shapes = svg.querySelectorAll('circle, rect, ellipse, polygon, path, line');
  shapes.forEach((shape, idx) => {
    const fill = shape.getAttribute('fill');
    if (fill && fill !== 'none' && !fill.startsWith('url(')) {
      // Alternate between gradient and enhanced colors
      if (idx % 2 === 0) {
        shape.setAttribute('fill', `url(#${gradId})`);
      } else {
        // Enhance existing colors with more saturation
        shape.setAttribute('fill', enhanceColor(fill));
      }
      shape.setAttribute('filter', `url(#${glowId})`);
    }

    const stroke = shape.getAttribute('stroke');
    if (stroke && stroke !== 'none') {
      shape.setAttribute('stroke', enhanceColor(stroke));
      const strokeWidth = parseFloat(shape.getAttribute('stroke-width') || '1');
      shape.setAttribute('stroke-width', String(strokeWidth * 1.5));
    }
  });

  // Add outer glow to entire SVG
  svg.setAttribute('filter', `url(#${glowId})`);

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Ink Etching Style - Detailed line work with cross-hatching and fine details
 */
function applyInkEtchingStyle(svgContent: string, assetId: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.documentElement;

  const hatchId = `ink-hatch-${assetId}`;

  // Add defs if not exists
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  // Create hatching pattern
  const pattern = doc.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pattern.setAttribute('id', hatchId);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', '4');
  pattern.setAttribute('height', '4');

  // Diagonal lines for hatching
  const line1 = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '0');
  line1.setAttribute('y1', '0');
  line1.setAttribute('x2', '4');
  line1.setAttribute('y2', '4');
  line1.setAttribute('stroke', '#1a1a1a');
  line1.setAttribute('stroke-width', '0.5');

  const line2 = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '4');
  line2.setAttribute('y1', '0');
  line2.setAttribute('x2', '0');
  line2.setAttribute('y2', '4');
  line2.setAttribute('stroke', '#1a1a1a');
  line2.setAttribute('stroke-width', '0.3');

  pattern.appendChild(line1);
  pattern.appendChild(line2);
  defs.appendChild(pattern);

  // Apply ink style to elements
  const shapes = svg.querySelectorAll('circle, rect, ellipse, polygon, path');
  shapes.forEach((shape) => {
    const fill = shape.getAttribute('fill');
    if (fill && fill !== 'none' && !fill.startsWith('url(')) {
      // Convert to sepia/ink tones
      const inkColor = convertToInkTone(fill);
      shape.setAttribute('fill', inkColor);

      // Add hatching for darker areas
      if (isColorDark(fill)) {
        shape.setAttribute('fill', `url(#${hatchId})`);
      }
    }

    // Enhance strokes to look like pen strokes
    const stroke = shape.getAttribute('stroke');
    if (stroke && stroke !== 'none') {
      shape.setAttribute('stroke', '#000000');
      const strokeWidth = parseFloat(shape.getAttribute('stroke-width') || '1');
      shape.setAttribute('stroke-width', String(strokeWidth * 1.3));
      shape.setAttribute('stroke-linecap', 'round');
      shape.setAttribute('stroke-linejoin', 'round');
    } else {
      // Add outline to filled shapes
      shape.setAttribute('stroke', '#000000');
      shape.setAttribute('stroke-width', '1');
    }
  });

  // Add fine detail lines
  const lines = svg.querySelectorAll('line');
  lines.forEach((line) => {
    line.setAttribute('stroke', '#000000');
    const strokeWidth = parseFloat(line.getAttribute('stroke-width') || '1');
    line.setAttribute('stroke-width', String(Math.max(0.8, strokeWidth * 1.2)));
  });

  return new XMLSerializer().serializeToString(svg);
}

// ─── Helper Functions ───────────────────────────────────────

function enhanceColor(color: string): string {
  // Simple color enhancement - increase saturation/brightness
  if (color.startsWith('#')) {
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);

    // Increase each channel by 20%, cap at 255
    const nr = Math.min(255, Math.floor(r * 1.3));
    const ng = Math.min(255, Math.floor(g * 1.3));
    const nb = Math.min(255, Math.floor(b * 1.3));

    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }
  return color;
}

function convertToInkTone(color: string): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);

    // Convert to grayscale with sepia tint
    const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
    const sepia = {
      r: Math.min(255, Math.floor(gray * 1.1)),
      g: Math.min(255, Math.floor(gray * 0.95)),
      b: Math.min(255, Math.floor(gray * 0.8))
    };

    return `#${sepia.r.toString(16).padStart(2, '0')}${sepia.g.toString(16).padStart(2, '0')}${sepia.b.toString(16).padStart(2, '0')}`;
  }
  return color;
}

function isColorDark(color: string): boolean {
  if (color.startsWith('#')) {
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  return false;
}

// ─── Browser-based transformations (Node.js compatible) ────

// Since we're in Node.js, we need to use a simpler approach without DOM
function applyAuroraGlowStyleSimple(svgContent: string, assetId: string): string {
  const gradId = `aurora-grad-${assetId}`;
  const glowId = `aurora-glow-${assetId}`;

  // Create gradient definition
  const gradientDef = `
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6EC7" stop-opacity="0.8"/>
      <stop offset="33%" stop-color="#8B5CF6" stop-opacity="0.9"/>
      <stop offset="66%" stop-color="#3B82F6" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#10B981" stop-opacity="0.8"/>
    </linearGradient>
    <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>`;

  // Insert gradient into defs
  let result = svgContent;
  if (result.includes('<defs>')) {
    result = result.replace('<defs>', `<defs>${gradientDef}`);
  } else if (result.includes('</svg>')) {
    result = result.replace('<svg', `<svg><defs>${gradientDef}</defs>`);
  }

  // Apply glow filter to SVG
  result = result.replace(/<svg([^>]*)>/, `<svg$1 filter="url(#${glowId})">`);

  // Enhance colors - replace some fills with gradient
  let fillCount = 0;
  result = result.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (match, color) => {
    fillCount++;
    if (fillCount % 2 === 0) {
      return `fill="url(#${gradId})"`;
    }
    return `fill="${enhanceColor(color)}"`;
  });

  return result;
}

function applyInkEtchingStyleSimple(svgContent: string, assetId: string): string {
  const hatchId = `ink-hatch-${assetId}`;

  // Create hatching pattern
  const patternDef = `
    <pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="4" height="4">
      <line x1="0" y1="0" x2="4" y2="4" stroke="#1a1a1a" stroke-width="0.5"/>
      <line x1="4" y1="0" x2="0" y2="4" stroke="#1a1a1a" stroke-width="0.3"/>
    </pattern>`;

  // Insert pattern into defs
  let result = svgContent;
  if (result.includes('<defs>')) {
    result = result.replace('<defs>', `<defs>${patternDef}`);
  } else if (result.includes('</svg>')) {
    result = result.replace('<svg', `<svg><defs>${patternDef}</defs>`);
  }

  // Convert fills to ink tones
  result = result.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (match, color) => {
    const inkColor = convertToInkTone(color);
    if (isColorDark(color)) {
      return `fill="url(#${hatchId})"`;
    }
    return `fill="${inkColor}"`;
  });

  // Enhance strokes
  result = result.replace(/stroke="([^"]+)"/g, 'stroke="#000000"');
  result = result.replace(/stroke-width="([0-9.]+)"/g, (match, width) => {
    return `stroke-width="${parseFloat(width) * 1.3}"`;
  });

  // Add strokes to shapes without them
  result = result.replace(/<(circle|rect|ellipse|polygon|path)([^>]*?)(?!stroke=)>/g,
    '<$1$2 stroke="#000000" stroke-width="1">');

  return result;
}

// ─── Main Processing Logic ─────────────────────────────────

async function generateABTests() {
  console.log('🎨 Starting A/B Test Generation...\n');

  // Read SVG asset map
  if (!fs.existsSync(SVG_MAP_PATH)) {
    console.error('❌ Error: svg-asset-map.json not found');
    console.error('   Please run: npx tsx scripts/export-svg-assets.ts');
    process.exit(1);
  }

  const svgMap = JSON.parse(fs.readFileSync(SVG_MAP_PATH, 'utf-8'));
  const assets: SVGAsset[] = svgMap.embeddedAssets;

  console.log(`📦 Found ${assets.length} assets\n`);

  // Create test run directory
  const runId = `run-${Date.now()}`;
  const runDir = path.join(AB_TEST_ROOT, runId);
  const assetsDir = path.join(runDir, 'assets');
  const originalDir = path.join(assetsDir, 'original');
  const auroraDir = path.join(assetsDir, 'variant-aurora');
  const inkDir = path.join(assetsDir, 'variant-ink');

  [runDir, assetsDir, originalDir, auroraDir, inkDir].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });

  console.log(`📁 Created test run: ${runId}\n`);

  // Process each asset
  const manifestAssets: TestRunManifest['assets'] = [];

  for (const asset of assets) {
    const assetPath = path.join(WORKSPACE_ROOT, asset.exportPathRelative.replace(/\\/g, '/'));

    if (!fs.existsSync(assetPath)) {
      console.log(`⚠️  Skipping ${asset.symbolName} (file not found)`);
      continue;
    }

    const svgContent = fs.readFileSync(assetPath, 'utf-8');
    const baseName = `${asset.id}-${asset.symbolName}.svg`;

    // Save original
    fs.writeFileSync(path.join(originalDir, baseName), svgContent);

    // Generate Aurora Glow variant
    const auroraContent = applyAuroraGlowStyleSimple(svgContent, asset.id);
    fs.writeFileSync(path.join(auroraDir, baseName), auroraContent);

    // Generate Ink Etching variant
    const inkContent = applyInkEtchingStyleSimple(svgContent, asset.id);
    fs.writeFileSync(path.join(inkDir, baseName), inkContent);

    manifestAssets.push({
      id: asset.id,
      symbolName: asset.symbolName,
      category: asset.category,
      originalPath: `assets/original/${baseName}`,
      variant1Path: `assets/variant-aurora/${baseName}`,
      variant2Path: `assets/variant-ink/${baseName}`
    });

    console.log(`✓ ${asset.symbolName}`);
  }

  // Create manifest
  const manifest: TestRunManifest = {
    runId,
    timestamp: new Date().toISOString(),
    totalAssets: manifestAssets.length,
    styles: {
      variant1: {
        name: 'Aurora Glow',
        description: 'Vibrant gradients with luminous glowing effects and enhanced saturation'
      },
      variant2: {
        name: 'Ink Etching',
        description: 'Detailed line work with cross-hatching and sepia tones'
      }
    },
    assets: manifestAssets
  };

  fs.writeFileSync(
    path.join(runDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Generate HTML gallery
  const html = generateGalleryHTML(manifest);
  fs.writeFileSync(path.join(runDir, 'index.html'), html);

  // Create README
  const readme = generateReadme(runId);
  fs.writeFileSync(path.join(AB_TEST_ROOT, 'README.md'), readme);

  console.log(`\n✅ Complete!`);
  console.log(`\n📂 Output: asset-dev/Export/A-B-Tests/${runId}/`);
  console.log(`🌐 Open: asset-dev/Export/A-B-Tests/${runId}/index.html\n`);
}

// ─── HTML Gallery Generation ───────────────────────────────

function generateGalleryHTML(manifest: TestRunManifest): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A/B Test Gallery - ${manifest.runId}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
    }

    .header {
      text-align: center;
      margin-bottom: 3rem;
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(to right, #ff6ec7, #8b5cf6, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 1.1rem;
    }

    .instructions {
      background: #1e293b;
      padding: 1.5rem;
      border-radius: 0.75rem;
      margin-bottom: 2rem;
      border: 1px solid #334155;
    }

    .instructions h2 {
      margin-bottom: 1rem;
      color: #f1f5f9;
    }

    .instructions ol {
      margin-left: 1.5rem;
      color: #cbd5e1;
    }

    .instructions li {
      margin-bottom: 0.5rem;
    }

    .style-legend {
      display: flex;
      gap: 2rem;
      justify-content: center;
      margin-bottom: 2rem;
    }

    .style-tag {
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-weight: 600;
    }

    .style-tag.original {
      background: #334155;
      color: #f1f5f9;
    }

    .style-tag.aurora {
      background: linear-gradient(135deg, #ff6ec7, #8b5cf6);
      color: white;
    }

    .style-tag.ink {
      background: #d4c5b9;
      color: #1a1a1a;
    }

    .gallery {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .asset-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      background: #1e293b;
      padding: 1rem;
      border-radius: 0.75rem;
      border: 2px solid #334155;
      transition: border-color 0.2s;
    }

    .asset-card {
      background: #0f172a;
      border: 3px solid transparent;
      border-radius: 0.5rem;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }

    .asset-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    }

    .asset-card.rank-1 {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }

    .asset-card.rank-2 {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
    }

    .asset-card.rank-3 {
      border-color: #8b5cf6;
      background: rgba(139, 92, 246, 0.1);
    }

    .rank-badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1rem;
      z-index: 10;
    }

    .rank-badge.rank-1 {
      background: #10b981;
      color: white;
    }

    .rank-badge.rank-2 {
      background: #3b82f6;
      color: white;
    }

    .rank-badge.rank-3 {
      background: #8b5cf6;
      color: white;
    }

    .asset-preview {
      width: 100%;
      height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      border-radius: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .asset-preview img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .asset-label {
      text-align: center;
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 0.25rem;
    }

    .asset-name {
      text-align: center;
      font-size: 0.75rem;
      color: #64748b;
      font-family: monospace;
    }

    .export-section {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .export-button {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      transition: all 0.2s;
    }

    .export-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
    }

    .stats {
      background: #1e293b;
      padding: 1rem;
      border-radius: 0.5rem;
      text-align: center;
      font-size: 0.875rem;
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>SVG Asset A/B Test Gallery</h1>
    <p class="subtitle">Compare and rank artistic variations</p>
  </div>

  <div class="instructions">
    <h2>How to Use:</h2>
    <ol>
      <li><strong>Tap/Click</strong> an asset variant to rank it</li>
      <li><strong>1st tap</strong> = Rank 1 (green) | <strong>2nd tap</strong> = Rank 2 (blue) | <strong>3rd tap</strong> = Rank 3 (purple)</li>
      <li><strong>4th tap</strong> = Reset (removes ranking)</li>
      <li>Click <strong>Export Results</strong> when done to download your rankings as JSON</li>
    </ol>
  </div>

  <div class="style-legend">
    <div class="style-tag original">Original</div>
    <div class="style-tag aurora">${manifest.styles.variant1.name}</div>
    <div class="style-tag ink">${manifest.styles.variant2.name}</div>
  </div>

  <div class="gallery" id="gallery">
    ${manifest.assets.map((asset, idx) => `
      <div class="asset-row" data-asset-id="${asset.id}">
        ${['original', 'variant1', 'variant2'].map((variant, vIdx) => `
          <div class="asset-card" data-variant="${variant}" data-asset-idx="${idx}">
            <div class="asset-preview">
              <img src="${asset[variant === 'original' ? 'originalPath' : variant === 'variant1' ? 'variant1Path' : 'variant2Path']}" alt="${asset.symbolName}">
            </div>
            <div class="asset-label">${variant === 'original' ? 'Original' : variant === 'variant1' ? manifest.styles.variant1.name : manifest.styles.variant2.name}</div>
            <div class="asset-name">${asset.symbolName}</div>
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>

  <div class="export-section">
    <div class="stats" id="stats">
      Ranked: <strong>0</strong> / ${manifest.assets.length * 3}
    </div>
    <button class="export-button" onclick="exportResults()">
      📥 Export Results
    </button>
  </div>

  <script>
    const manifest = ${JSON.stringify(manifest)};
    const rankings = {};

    // Initialize rankings
    manifest.assets.forEach((asset, idx) => {
      rankings[asset.id] = {
        original: null,
        variant1: null,
        variant2: null
      };
    });

    // Handle card clicks
    document.querySelectorAll('.asset-card').forEach(card => {
      card.addEventListener('click', function() {
        const assetId = this.closest('.asset-row').dataset.assetId;
        const variant = this.dataset.variant;

        const currentRank = rankings[assetId][variant];

        // Cycle through ranks: null -> 1 -> 2 -> 3 -> null
        let newRank = null;
        if (currentRank === null) newRank = 1;
        else if (currentRank === 1) newRank = 2;
        else if (currentRank === 2) newRank = 3;
        else if (currentRank === 3) newRank = null;

        // Update ranking
        rankings[assetId][variant] = newRank;

        // Update UI
        updateCardUI(this, newRank);
        updateStats();
      });
    });

    function updateCardUI(card, rank) {
      // Remove all rank classes
      card.classList.remove('rank-1', 'rank-2', 'rank-3');

      // Remove existing badge
      const existingBadge = card.querySelector('.rank-badge');
      if (existingBadge) existingBadge.remove();

      // Add new rank
      if (rank !== null) {
        card.classList.add(\`rank-\${rank}\`);

        const badge = document.createElement('div');
        badge.className = \`rank-badge rank-\${rank}\`;
        badge.textContent = rank;
        card.appendChild(badge);
      }
    }

    function updateStats() {
      const totalRanked = Object.values(rankings).reduce((sum, asset) => {
        return sum + Object.values(asset).filter(r => r !== null).length;
      }, 0);

      document.getElementById('stats').innerHTML =
        \`Ranked: <strong>\${totalRanked}</strong> / \${manifest.assets.length * 3}\`;
    }

    function exportResults() {
      const results = {
        runId: manifest.runId,
        timestamp: new Date().toISOString(),
        styles: manifest.styles,
        rankings: []
      };

      manifest.assets.forEach(asset => {
        const assetRankings = rankings[asset.id];
        results.rankings.push({
          assetId: asset.id,
          symbolName: asset.symbolName,
          category: asset.category,
          originalRank: assetRankings.original,
          variant1Rank: assetRankings.variant1,
          variant2Rank: assetRankings.variant2,
          originalName: \`\${asset.id}-\${asset.symbolName}-original.svg\`,
          variant1Name: \`\${asset.id}-\${asset.symbolName}-aurora.svg\`,
          variant2Name: \`\${asset.id}-\${asset.symbolName}-ink.svg\`
        });
      });

      // Download as JSON
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`ab-test-results-\${Date.now()}.json\`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('✅ Results exported successfully!');
    }
  </script>
</body>
</html>`;
}

function generateReadme(latestRunId: string): string {
  return `# A/B Test Runs

This directory contains A/B test runs for SVG asset variations.

## Latest Run

- **Run ID**: ${latestRunId}
- **Gallery**: [${latestRunId}/index.html](${latestRunId}/index.html)

## How It Works

Each test run generates:
1. **Original assets** - Copied from the main export
2. **Variant 1 (Aurora Glow)** - Vibrant gradients with luminous effects
3. **Variant 2 (Ink Etching)** - Detailed line work with cross-hatching
4. **Interactive Gallery** - HTML page for ranking preferences
5. **Manifest** - JSON metadata about the test run

## Usage

### Generate a New Test Run

\`\`\`bash
npm run generate:ab-tests
\`\`\`

### Review Results

1. Open \`{run-id}/index.html\` in a browser
2. Click assets to rank them (1 = best, 2 = good, 3 = okay)
3. Export results as JSON when complete

### Iterate on Feedback

Use the exported JSON to:
- Analyze which styles perform best
- Generate new variants based on preferences
- Track artistic direction over multiple runs

## Directory Structure

\`\`\`
A-B-Tests/
├── README.md
└── run-{timestamp}/
    ├── manifest.json
    ├── index.html
    └── assets/
        ├── original/
        ├── variant-aurora/
        └── variant-ink/
\`\`\`
`;
}

// ─── Run ────────────────────────────────────────────────────

generateABTests().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
