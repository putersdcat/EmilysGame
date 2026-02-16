import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type AssetEntry = {
  id: string;
  symbolName?: string;
  exportPathRelative: string;
};

type Dimensions = {
  width: number;
  height: number;
};

type ManifestEntry = {
  assetId: string;
  name: string;
  fileBase: string;
  versions: {
    key: string;
    label: string;
    file: string;
  }[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(path.join(__dirname, '..'));
const exportRoot = path.join(repoRoot, 'asset-dev', 'Export');
const assetMapPath = path.join(exportRoot, 'svg-asset-map.json');

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readAssetMap(): AssetEntry[] {
  const raw = fs.readFileSync(assetMapPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.embeddedAssets as AssetEntry[];
}

function toPosix(p: string) {
  return p.replace(/\\/g, '/');
}

function extractDimensions(svg: string): Dimensions {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const widthMatch = svg.match(/width="([^"]+)"/i);
  const heightMatch = svg.match(/height="([^"]+)"/i);
  if (widthMatch && heightMatch) {
    const width = parseFloat(widthMatch[1]);
    const height = parseFloat(heightMatch[1]);
    if (!Number.isNaN(width) && !Number.isNaN(height)) {
      return { width, height };
    }
  }

  return { width: 128, height: 128 };
}

function encodeSvgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sanitizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'asset';
}

function createAuroraVariant(svg: string, dims: Dimensions, uid: string) {
  const dataUri = encodeSvgDataUri(svg);
  const { width, height } = dims;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="aurora-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1dd3b0" stop-opacity="0.75"/>
      <stop offset="50%" stop-color="#7f5af0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ff8906" stop-opacity="0.6"/>
    </linearGradient>
    <filter id="grain-${uid}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" stitchTiles="stitch" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.3 0" result="grain"/>
      <feBlend in="SourceGraphic" in2="grain" mode="overlay"/>
    </filter>
    <filter id="bloom-${uid}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.4" result="blur"/>
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bloom"/>
      <feMerge>
        <feMergeNode in="bloom"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#aurora-${uid})" opacity="0.18"/>
  <g filter="url(#grain-${uid})">
    <image href="${dataUri}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <g filter="url(#bloom-${uid})" opacity="0.9">
    <image href="${dataUri}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>`;
}

function createEtchingVariant(svg: string, dims: Dimensions, uid: string) {
  const dataUri = encodeSvgDataUri(svg);
  const { width, height } = dims;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="inkwash-${uid}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#1e293b" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#f8fafc" stop-opacity="0.4"/>
    </linearGradient>
    <pattern id="hatch-${uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#0f172a" stroke-width="1.1" stroke-opacity="0.18"/>
    </pattern>
    <filter id="etch-${uid}" x="-5%" y="-5%" width="110%" height="110%">
      <feColorMatrix type="matrix" values="0.6 0 0 0 0.02  0 0.6 0 0 0.02  0 0 0.6 0 0.02  0 0 0 1 0" result="ink"/>
      <feComponentTransfer color-interpolation-filters="sRGB">
        <feFuncR type="gamma" amplitude="1" exponent="0.85" offset="0.02"/>
        <feFuncG type="gamma" amplitude="1" exponent="0.85" offset="0.02"/>
        <feFuncB type="gamma" amplitude="1" exponent="0.9" offset="0.02"/>
      </feComponentTransfer>
      <feComposite in2="SourceGraphic" operator="atop"/>
    </filter>
    <filter id="shadow-${uid}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.8" result="shadow"/>
      <feOffset dx="1.5" dy="1.5" result="offset"/>
      <feColorMatrix in="offset" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#inkwash-${uid})" opacity="0.35"/>
  <g filter="url(#shadow-${uid})">
    <image href="${dataUri}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" filter="url(#etch-${uid})"/>
  </g>
  <rect width="${width}" height="${height}" fill="url(#hatch-${uid})" opacity="0.28"/>
</svg>`;
}

function buildHtml(manifest: ManifestEntry[], runId: string) {
  const manifestJson = JSON.stringify(manifest, null, 2);
  const generatedAt = new Date().toISOString();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SVG A/B/C Tests - ${runId}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #0b1021;
      --panel: #11162a;
      --muted: #cbd5e1;
      --accent: #7f5af0;
      --accent-2: #2dd4bf;
      --accent-3: #f97316;
    }
    body {
      margin: 0;
      font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at 10% 10%, rgba(127,90,240,0.18), transparent 35%), radial-gradient(circle at 90% 10%, rgba(45,212,191,0.12), transparent 30%), #0b1021;
      color: #e2e8f0;
      min-height: 100vh;
    }
    header {
      padding: 16px 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      background: linear-gradient(180deg, rgba(11,16,33,0.96), rgba(11,16,33,0.88));
      border-bottom: 1px solid rgba(255,255,255,0.06);
      backdrop-filter: blur(10px);
    }
    .meta {
      display: grid;
      gap: 4px;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      background: #1f2937;
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 10px 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    }
    button:hover { transform: translateY(-1px); background: #273349; }
    button:active { transform: translateY(0); }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
      padding: 16px;
    }
    .row {
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 8px 18px rgba(0,0,0,0.28);
      display: grid;
      gap: 10px;
    }
    .row-header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    .title {
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .versions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .card {
      position: relative;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.02);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: border 120ms ease, transform 120ms ease;
    }
    .card:hover { border-color: rgba(255,255,255,0.16); transform: translateY(-1px); }
    .thumb {
      background: #0f172a;
      display: grid;
      place-items: center;
      height: 180px;
    }
    .thumb img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 3px 12px rgba(0,0,0,0.35));
    }
    .label {
      padding: 10px 12px;
      font-weight: 600;
      color: #e5e7eb;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
    }
    .rank-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      min-width: 36px;
      height: 36px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-weight: 700;
      color: #0b1021;
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow: 0 6px 16px rgba(0,0,0,0.26);
      transition: transform 120ms ease, background 120ms ease, color 120ms ease;
    }
    .rank-1 { background: var(--accent); color: #f8fafc; }
    .rank-2 { background: var(--accent-2); color: #0f172a; }
    .rank-3 { background: var(--accent-3); color: #0b1021; }
    @media (min-width: 960px) {
      .grid { padding: 24px; }
      .row { padding: 18px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="meta">
      <div class="title">SVG A/B/C Tests — Run ${runId}</div>
      <div style="color: var(--muted); font-size: 14px;">Cycle ranks with taps/clicks (1 → 2 → 3 → clear). Only one of each rank per asset row.</div>
      <div style="color: var(--muted); font-size: 12px;">Generated at ${generatedAt}</div>
    </div>
    <div class="toolbar">
      <button id="clear">Clear all ranks</button>
      <button id="download">Download selection JSON</button>
    </div>
  </header>
  <main class="grid" id="grid"></main>
  <script type="module">
    const manifest = ${manifestJson};
    const runId = ${JSON.stringify(runId)};
    const selections = manifest.map(() => ({ original: null, aurora: null, etching: null }));

    const rankCycle = [1, 2, 3, null];

    function nextRank(current) {
      const idx = rankCycle.indexOf(current);
      return rankCycle[(idx + 1) % rankCycle.length];
    }

    function applyRankStyles(card, rank) {
      const badge = card.querySelector('.rank-badge');
      badge.textContent = rank ? String(rank) : '–';
      badge.classList.remove('rank-1', 'rank-2', 'rank-3');
      if (rank === 1) badge.classList.add('rank-1');
      if (rank === 2) badge.classList.add('rank-2');
      if (rank === 3) badge.classList.add('rank-3');
    }

    function renderGrid() {
      const grid = document.getElementById('grid');
      grid.innerHTML = '';

      manifest.forEach((asset, assetIndex) => {
        const row = document.createElement('section');
        row.className = 'row';

        const header = document.createElement('div');
        header.className = 'row-header';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = asset.name || asset.assetId;
        const subtitle = document.createElement('div');
        subtitle.style.color = 'var(--muted)';
        subtitle.style.fontSize = '12px';
        subtitle.textContent = asset.fileBase;
        header.appendChild(title);
        header.appendChild(subtitle);
        row.appendChild(header);

        const versions = document.createElement('div');
        versions.className = 'versions';

        asset.versions.forEach((version) => {
          const card = document.createElement('article');
          card.className = 'card';
          card.dataset.key = version.key;

          const badge = document.createElement('div');
          badge.className = 'rank-badge';
          badge.textContent = '–';
          card.appendChild(badge);

          const thumb = document.createElement('div');
          thumb.className = 'thumb';
          const img = document.createElement('img');
          img.loading = 'lazy';
          img.src = version.file;
          img.alt = asset.name + ' ' + version.label;
          thumb.appendChild(img);
          card.appendChild(thumb);

          const label = document.createElement('div');
          label.className = 'label';
          label.textContent = version.label;
          card.appendChild(label);

          card.addEventListener('click', () => {
            const current = selections[assetIndex][version.key];
            const next = nextRank(current);
            selections[assetIndex][version.key] = next;

            if (next !== null) {
              for (const key of Object.keys(selections[assetIndex])) {
                if (key !== version.key && selections[assetIndex][key] === next) {
                  selections[assetIndex][key] = null;
                }
              }
            }

            // Refresh ranks for all versions in this row
            for (const sibling of versions.children) {
              const key = sibling.dataset.key;
              applyRankStyles(sibling as HTMLElement, selections[assetIndex][key]);
            }
          });

          applyRankStyles(card, selections[assetIndex][version.key]);
          versions.appendChild(card);
        });

        row.appendChild(versions);
        grid.appendChild(row);
      });
    }

    function downloadSelections() {
      const payload = {
        runId,
        generatedAt: new Date().toISOString(),
        selections: manifest.map((asset, idx) => ({
          assetId: asset.assetId,
          name: asset.name,
          fileBase: asset.fileBase,
          versions: asset.versions.map((v) => ({
            key: v.key,
            label: v.label,
            file: v.file,
            rank: selections[idx][v.key],
          })),
        })),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = \\\`ab-rankings-\${runId}.json\\\`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    document.getElementById('download')?.addEventListener('click', downloadSelections);
    document.getElementById('clear')?.addEventListener('click', () => {
      selections.forEach((row) => {
        for (const key of Object.keys(row)) row[key] = null;
      });
      renderGrid();
    });

    renderGrid();
  </script>
</body>
</html>`;
}

function main() {
  const runId =
    process.env.AB_RUN_ID ??
    new Date().toISOString().replace(/[:.]/g, '-').replace('T', '--').replace(/Z$/, '');

  const assets = readAssetMap();
  const runDir = path.join(exportRoot, 'A-B-Tests', runId);
  const assetsDir = path.join(runDir, 'assets');
  ensureDir(assetsDir);

  const manifest: ManifestEntry[] = [];

  assets.forEach((asset, index) => {
    const relativePath = toPosix(asset.exportPathRelative);
    const normalizedRelative = relativePath.startsWith('asset-dev/')
      ? relativePath
      : path.join('asset-dev/Export', relativePath);
    const originalPath = path.resolve(repoRoot, normalizedRelative);
    if (!fs.existsSync(originalPath)) {
      console.warn(`Skipping ${asset.id}: source not found at ${originalPath}`);
      return;
    }

    const svg = fs.readFileSync(originalPath, 'utf8');
    const dims = extractDimensions(svg);
    const slug = sanitizeName(asset.symbolName || path.parse(originalPath).name);
    const ordinal = String(index + 1).padStart(3, '0');
    const fileBase = `${ordinal}-${slug}`;

    const originalOut = path.join(assetsDir, `${fileBase}-original.svg`);
    const auroraOut = path.join(assetsDir, `${fileBase}-variant-aurora.svg`);
    const etchOut = path.join(assetsDir, `${fileBase}-variant-etching.svg`);

    fs.writeFileSync(originalOut, svg);
    fs.writeFileSync(auroraOut, createAuroraVariant(svg, dims, `${asset.id}-a`));
    fs.writeFileSync(etchOut, createEtchingVariant(svg, dims, `${asset.id}-e`));

    manifest.push({
      assetId: asset.id,
      name: asset.symbolName || slug,
      fileBase,
      versions: [
        { key: 'original', label: 'Original', file: path.relative(runDir, originalOut).replace(/\\/g, '/') },
        { key: 'aurora', label: 'Aurora Glow', file: path.relative(runDir, auroraOut).replace(/\\/g, '/') },
        { key: 'etching', label: 'Ink Etching', file: path.relative(runDir, etchOut).replace(/\\/g, '/') },
      ],
    });
  });

  const manifestPath = path.join(runDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const htmlPath = path.join(runDir, 'index.html');
  fs.writeFileSync(htmlPath, buildHtml(manifest, runId));

  console.log(`Generated ${manifest.length} assets into ${runDir}`);
  console.log(`Open ${path.relative(repoRoot, htmlPath)} to review rankings.`);
}

main();
