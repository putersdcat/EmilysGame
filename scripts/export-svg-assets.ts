/**
 * export-svg-assets.ts - Export all embedded SVG game assets
 * 
 * Scans TypeScript source files for embedded SVG assets, exports them to
 * asset-dev/Export/embedded/, and generates comprehensive  documentation.
 * 
 * Usage: npx tsx scripts/export-svg-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── Configuration ──────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const EXPORT_ROOT = path.join(WORKSPACE_ROOT, 'asset-dev', 'Export');
const EMBEDDED_ROOT = path.join(EXPORT_ROOT, 'embedded');

interface EmbeddedAsset {
  id: string;
  sourceType: 'embedded-svg-string';
  sourcePathRelative: string;
  sourcePathAbsolute: string;
  symbolName: string;
  startLine: number;
  endLine: number;
  exportPathRelative: string;
  exportPathAbsolute: string;
  category: string;
  usage: string[];
  svgContent: string;
}

interface AssetInventory {
  generatedAt: string;
  workspaceRoot: string;
  exportRootAbsolute: string;
  summary: {
    embeddedSvgCount: number;
    categories: Record<string, number>;
  };
  embeddedAssets: EmbeddedAsset[];
}

// ─── Asset Extraction Logic ────────────────────────────────

/**
 * Find all SVG constants in a file

 */
function findAllSvgConstants(content: string): Array<{ name: string; line: number }> {
  const lines = content.split('\n');
  const results: Array<{ name: string; line: number }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Match: const NAME_SVG = `<svg...
    const constMatch = line.match(/^const\s+(\w+_SVG)\s*=\s*`<svg/);
    if (constMatch) {
      results.push({ name: constMatch[1], line: lineNum });
      continue;
    }
    
    // Match array elements in ROCK_SVGS or FIRE_FRAME_SVGS
    // Look for lines with just whitespace followed by `<svg (array elements)
    const arrayMatch = line.match(/^\s+`<svg/);
    if (arrayMatch) {
      // Look backwards to find the array name
      let arrayName = '';
      let arrayStartLine = i;
      for (let j = i - 1; j >= 0; j--) {
        const prevLine = lines[j];
        if (prevLine.match(/const\s+(ROCK_SVGS|FIRE_FRAME_SVGS)\s*=\s*\[/)) {
          arrayName = RegExp.$1;
          arrayStartLine = j;
          break;
        }
        // Stop if we hit another const or export
        if (prevLine.match(/^(const|export|\/\/)/)) break;
      }
      
      if (arrayName) {
        // Count which index this is
        let index = 0;
        for (let j = arrayStartLine + 1; j < i; j++) {
          if (lines[j].match(/^\s+`<svg/)) index++;
        }
        
        if (arrayName === 'ROCK_SVGS') {
          results.push({ name: `ROCK_V${index}_SVG`, line: lineNum });
        } else if (arrayName === 'FIRE_FRAME_SVGS') {
          results.push({ name: `FIRE_FRAME_${index}_SVG`, line: lineNum });
        }
      }
    }
  }
  
  return results;
}

/**
 * Extract SVG content starting from a specific line
 */
function extractSvgFromLine(lines: string[], startLine: number): { svg: string; endLine: number } {
  let svg = '';
  let inSvg = false;
  
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect start of SVG
    if (!inSvg && line.includes('<svg')) {
      inSvg = true;
      const svgStart = line.indexOf('<svg');
      svg = line.substring(svgStart);
      
      // Check if it also ends on same line
      if (line.includes('</svg>')) {
        const svgEnd = line.indexOf('</svg>') + 6;
        svg = line.substring(svgStart, svgEnd);
        return { svg: cleanSvg(svg), endLine: i + 1 };
      }
      continue;
    }
    
    if (inSvg) {
      svg += ' ' + line.trim();
      
      // Check for end of SVG
      if (line.includes('</svg>')) {
        const endIdx = svg.indexOf('</svg>') + 6;
        svg = svg.substring(0, endIdx);
        return { svg: cleanSvg(svg), endLine: i + 1 };
      }
      
      // Check for end of template literal (backtick followed by comma or semicolon or bracket)
      if (line.match(/`\s*[,;\]]/)) {
        // Extract up to the closing backtick
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

/**
 * Clean extracted SVG (remove backticks, normalize whitespace)
 */
function cleanSvg(svg: string): string {
  return svg
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '> <')
    .trim();
}

/**
 * Extract all SVG assets from asset-sprites.ts
 */
function extractAssetSprites(): EmbeddedAsset[] {
  const filePath = path.join(WORKSPACE_ROOT, 'src', 'asset-sprites.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const assets: EmbeddedAsset[] = [];
  const category = 'World object/item/wildlife sprites';
  const usage = [
    'preloadAssetSprites() pre-renders SVGs into canvas cache',
    'getAssetSprite()/getFireFrame() return cached canvases',
    'render.ts draws these in world object layer (with emoji fallback)'
  ];
  
  // Dynamically find all SVG constants
  const svgConstants = findAllSvgConstants(content);
  console.log(`   Debug: Found ${svgConstants.length} SVG constants in asset-sprites.ts`);
  
  let assetId = 1;
  
  for (const { name, line } of svgConstants) {
    const { svg, endLine } = extractSvgFromLine(lines, line);
    
    if (svg && svg.includes('<svg')) {
      const exportDir = path.join(EMBEDDED_ROOT, 'src__asset-sprites');
      const exportFile = `${String(assetId).padStart(3, '0')}-${name}.svg`;
      const exportPathAbs = path.join(exportDir, exportFile);
      
      let itemCategory = category;
      if (name.startsWith('ROCK_V')) {
        itemCategory = category + ' (rock variant)';
      } else if (name.startsWith('FIRE_FRAME_')) {
        itemCategory = category + ' (fire animation frame)';
      }
      
      assets.push({
        id: `embedded-${assetId}`,
        sourceType: 'embedded-svg-string',
        sourcePathRelative: 'src/asset-sprites.ts',
        sourcePathAbsolute: filePath,
        symbolName: name,
        startLine: line,
        endLine,
        exportPathRelative: path.relative(WORKSPACE_ROOT, exportPathAbs),
        exportPathAbsolute: exportPathAbs,
        category: itemCategory,
        usage,
        svgContent: svg,
      });
      assetId++;
    }
  }
  
  return assets;
}

/**
 * Extract all tile SVG assets from tiles.ts
 */
function extractTileSprites(): EmbeddedAsset[] {
  const filePath = path.join(WORKSPACE_ROOT, 'src', 'tiles.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const assets: EmbeddedAsset[] = [];
  const category = 'Terrain tiles (isometric world terrain)';
  const usage = [
    'preloadTiles() renders SVG->isometric cache',
    'getIsoTile() provides drawable canvases',
    'render.ts drawTile() + cached terrain pipeline'
  ];
  
  // Dynamically find all SVG strings in TILE_SVG_SOURCES object
  const tileSvgs: Array<{ name: string; line: number }> = [];
  
  // Look for lines in the TILE_SVG_SOURCES object that contain SVG
  let inTileSources = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/const\s+TILE_SVG_SOURCES/)) {
      inTileSources = true;
      continue;
    }
    
    if (inTileSources && line.match(/^\s*(\w+):\s*`<svg/)) {
      const tileKey = RegExp.$1;
      const symbolName = `${tileKey.toUpperCase()}_TILE_SVG`;
      tileSvgs.push({ name: symbolName, line: i + 1 });
    }
    
    if (inTileSources && line.match(/^};/)) {
      break;
    }
  }
  
  console.log(`   Debug: Found ${tileSvgs.length} tile SVGs in tiles.ts`);
  
  let assetId = 1;
  
  for (const { name, line } of tileSvgs) {
    const { svg, endLine } = extractSvgFromLine(lines, line);
    
    if (svg && svg.includes('<svg')) {
      const exportDir = path.join(EMBEDDED_ROOT, 'src__tiles');
      const exportFile = `${String(assetId).padStart(3, '0')}-${name}.svg`;
      const exportPathAbs = path.join(exportDir, exportFile);
      
      assets.push({
        id: `tile-${assetId}`,
        sourceType: 'embedded-svg-string',
        sourcePathRelative: 'src/tiles.ts',
        sourcePathAbsolute: filePath,
        symbolName: name,
        startLine: line,
        endLine,
        exportPathRelative: path.relative(WORKSPACE_ROOT, exportPathAbs),
        exportPathAbsolute: exportPathAbs,
        category,
        usage,
        svgContent: svg,
      });
      assetId++;
    }
  }
  
  return assets;
}

/**
 * Note: Player sprites and NPC sprites are generated dynamically,
 * so we document them but don't extract static SVG files
 */
function documentDynamicSprites(): { player: any; npc: any } {
  return {
    player: {
      source: 'src/sprites.ts',
      type: 'dynamic-generated',
      description: 'Player character sprites (64x96px) with customizable appearance',
      generators: [
        'generateIdleCharacterSVG()',
        'generateWalkingCharacterSVG()',
        'generateBackIdleCharacterSVG()',
        'generateBackWalkingCharacterSVG()',
        'generateSideIdleCharacterSVG()',
        'generateSideWalkingCharacterSVG()'
      ],
      variations: [
        'hairStyle (6 styles: straight, pigtails, wavy, ponytail, braids, spiky)',
        'hairColor (customizable hex)',
        'dressColor (customizable hex)',
        'skinTone (customizable hex)',
        'eyeColor (customizable hex)',
        'accessory (7 types: none, bow, crown, glasses, cowboy_hat, wizard_hat, flower_crown)',
        'expression (4 types: happy, neutral, surprised, determined)',
        'outfitPattern (4 types: plain, floral, striped, starry)'
      ],
      usage: [
        'loadCharacterSpriteAsync() creates sprite images',
        'render.ts draws player at state.ego position',
        'customizer.ts preview in customization UI'
      ]
    },
    npc: {
      source: 'src/npc-sprites.ts',
      type: 'dynamic-generated',
      description: 'Human NPC sprites (64x64px) in paper-cut art style',
      generators: [
        'generateNpcSVG(assetKey, facing, mouth)'
      ],
      archetypes: [
        'npc_merchant', 'npc_villager', 'npc_guardian', 'npc_farmer',
        'npc_beekeeper', 'npc_ranger', 'npc_hermit', 'npc_miner', 'npc_knight'
      ],
      facing: ['south (front)', 'north (back)', 'east (right)', 'west (left)'],
      mouthStates: ['closed', 'open', 'wide'],
      usage: [
        'getNpcSprite() retrieves cached sprite',
        'render.ts object render pass with emoji fallback'
      ]
    }
  };
}

// ─── Export Functions ──────────────────────────────────────

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function exportSvgFiles(assets: EmbeddedAsset[]): void {
  for (const asset of assets) {
    const dir = path.dirname(asset.exportPathAbsolute);
    ensureDir(dir);
    fs.writeFileSync(asset.exportPathAbsolute, asset.svgContent, 'utf-8');
  }
}

function generateMarkdownInventory(
  allAssets: EmbeddedAsset[],
  dynamicSprites: ReturnType<typeof documentDynamicSprites>
): string {
  const now = new Date().toISOString();
  
  let md = `# Emily's Game — Art Asset Inventory\n\n`;
  md += `**Generated:** ${now}  \n`;
  md += `**Workspace:** \`${WORKSPACE_ROOT}\`  \n`;
  md += `**Export folder:** \`${EXPORT_ROOT}\`\n\n`;
  
  md += `## Summary\n\n`;
  md += `- **Total embedded SVG assets:** ${allAssets.length}\n`;
  md += `- **Dynamic sprite systems:** 2 (Player character, NPC sprites)\n\n`;
  
  md += `## Usage Pipeline Overview\n\n`;
  md += `### Runtime Asset Loading\n\n`;
  md += `| Asset domain | Source | Load/prepare path | Render/use path |\n`;
  md += `| --- | --- | --- | --- |\n`;
  md += `| Tiles | \`src/tiles.ts\` | \`preloadTiles()\` renders SVG->isometric cache, \`getIsoTile()\` provides drawables | \`src/render.ts\` drawTile() + cached terrain pipeline |\n`;
  md += `| World objects/items/wildlife | \`src/asset-sprites.ts\` | \`preloadAssetSprites()\` + \`getAssetSprite()\`/\`getFireFrame()\` | \`src/render.ts\` object command path + emoji fallback |\n`;
  md += `| Player character | \`src/sprites.ts\` | \`generate*CharacterSVG()\` + \`loadCharacterSprite*()\` | \`src/main.ts\` sets \`state.egoImg\`; \`src/render.ts\` draws player image |\n`;
  md += `| Human NPCs | \`src/npc-sprites.ts\` | \`generateNpcSVG()\` + \`getNpcSprite()\` cache | \`src/render.ts\` NPC draw path + fallback |\n`;
  md += `| Customizer preview UI | \`src/customizer.ts\` | \`generateIdleCharacterSVG()\` etc. injected as inline SVG into DOM | Customizer overlay preview (\`#customizerPreview\`) |\n\n`;
  
  // Group assets by source file
  const bySource = new Map<string, EmbeddedAsset[]>();
  for (const asset of allAssets) {
    const src = asset.sourcePathRelative;
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src)!.push(asset);
  }
  
  md += `## Embedded SVG Assets\n\n`;
  
  // Asset sprites
  const assetSprites = bySource.get('src/asset-sprites.ts') || [];
  if (assetSprites.length > 0) {
    md += `### src/asset-sprites.ts\n\n`;
    md += `World object/item/wildlife sprites (isometric world entities). 48x48px viewBox.\n\n`;
    md += `**Total assets:** ${assetSprites.length}\n\n`;
    md += `| Symbol | Lines | Exported File | Usage |\n`;
    md += `| --- | --- | --- | --- |\n`;
    for (const asset of assetSprites) {
      md += `| \`${asset.symbolName}\` | ${asset.startLine}–${asset.endLine} | \`${asset.exportPathRelative}\` | ${asset.usage[0]} |\n`;
    }
    md += `\n`;
  }
  
  // Tiles
  const tileSprites = bySource.get('src/tiles.ts') || [];
  if (tileSprites.length > 0) {
    md += `### src/tiles.ts\n\n`;
    md += `Terrain tiles (isometric world terrain). 32x32px micro tiles, rendered to 64x32 isometric diamonds.\n\n`;
    md += `**Total tiles:** ${tileSprites.length}\n\n`;
    md += `| Symbol | Lines | Exported File | Usage |\n`;
    md += `| --- | --- | --- | --- |\n`;
    for (const asset of tileSprites) {
      md += `| \`${asset.symbolName}\` | ${asset.startLine}–${asset.endLine} | \`${asset.exportPathRelative}\` | ${asset.usage[0]} |\n`;
    }
    md += `\n`;
  }
  
  // Dynamic sprites
  md += `## Dynamic Sprite Systems\n\n`;
  md += `### src/sprites.ts — Player Character\n\n`;
  md += `**Type:** ${dynamicSprites.player.type}  \n`;
  md += `**Description:** ${dynamicSprites.player.description}\n\n`;
  md += `**Generator functions:**\n`;
  for (const gen of dynamicSprites.player.generators) {
    md += `- \`${gen}\`\n`;
  }
  md += `\n**Customization options:**\n`;
  for (const variation of dynamicSprites.player.variations) {
    md += `- ${variation}\n`;
  }
  md += `\n**Usage:**\n`;
  for (const use of dynamicSprites.player.usage) {
    md += `- ${use}\n`;
  }
  md += `\n`;
  
  md += `### src/npc-sprites.ts — Human NPCs\n\n`;
  md += `**Type:** ${dynamicSprites.npc.type}  \n`;
  md += `**Description:** ${dynamicSprites.npc.description}\n\n`;
  md += `**Generator functions:**\n`;
  for (const gen of dynamicSprites.npc.generators) {
    md += `- \`${gen}\`\n`;
  }
  md += `\n**Archetypes:**\n`;
  for (const arch of dynamicSprites.npc.archetypes) {
    md += `- \`${arch}\`\n`;
  }
  md += `\n**Facing directions:**\n`;
  for (const face of dynamicSprites.npc.facing) {
    md += `- ${face}\n`;
  }
  md += `\n**Mouth states (dialog animation):**\n`;
  for (const mouth of dynamicSprites.npc.mouthStates) {
    md += `- ${mouth}\n`;
  }
  md += `\n**Usage:**\n`;
  for (const use of dynamicSprites.npc.usage) {
    md += `- ${use}\n`;
  }
  md += `\n`;
  
  md += `---\n\n`;
  md += `*This inventory is auto-generated. All embedded SVG assets are exported to \`${EMBEDDED_ROOT}\` for reference.*\n`;
  
  return md;
}

function generateJsonMap(
  allAssets: EmbeddedAsset[],
  dynamicSprites: ReturnType<typeof documentDynamicSprites>
): AssetInventory {
  const categoryCount: Record<string, number> = {};
  for (const asset of allAssets) {
    categoryCount[asset.category] = (categoryCount[asset.category] || 0) + 1;
  }
  
  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot: WORKSPACE_ROOT,
    exportRootAbsolute: EXPORT_ROOT,
    summary: {
      embeddedSvgCount: allAssets.length,
      categories: categoryCount
    },
    embeddedAssets: allAssets.map(a => ({ ...a, svgContent: undefined as any })) // Omit SVG content from JSON
  };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('🎨 Emily\'s Game — SVG Asset Export Tool\n');
  
  // Ensure export directories exist
  ensureDir(EMBEDDED_ROOT);
  
  console.log('📦 Extracting embedded SVG assets...');
  const assetSprites = extractAssetSprites();
  console.log(`   ✓ Found ${assetSprites.length} assets in src/asset-sprites.ts`);
  
  const tileSprites = extractTileSprites();
  console.log(`   ✓ Found ${tileSprites.length} assets in src/tiles.ts`);
  
  const allAssets = [...assetSprites, ...tileSprites];
  console.log(`   ✓ Total embedded SVG assets: ${allAssets.length}\n`);
  
  console.log('💾 Exporting SVG files...');
  exportSvgFiles(allAssets);
  console.log(`   ✓ Exported to ${EMBEDDED_ROOT}\n`);
  
  console.log('📝 Documenting dynamic sprite systems...');
  const dynamicSprites = documentDynamicSprites();
  console.log(`   ✓ Documented player character sprite system`);
  console.log(`   ✓ Documented NPC sprite system\n`);
  
  console.log('📄 Generating inventory files...');
  const markdownPath = path.join(EXPORT_ROOT, 'game-art-asset-inventory.md');
  const markdown = generateMarkdownInventory(allAssets, dynamicSprites);
  fs.writeFileSync(markdownPath, markdown, 'utf-8');
  console.log(`   ✓ ${markdownPath}`);
  
  const jsonPath = path.join(EXPORT_ROOT, 'svg-asset-map.json');
  const json = generateJsonMap(allAssets, dynamicSprites);
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`   ✓ ${jsonPath}\n`);
  
  console.log('✅ Export complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   - Embedded SVG assets: ${allAssets.length}`);
  console.log(`   - Dynamic sprite systems: 2`);
  console.log(`   - Export location: ${EXPORT_ROOT}`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
