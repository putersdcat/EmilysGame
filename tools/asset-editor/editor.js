// editor.js — Asset Editor logic
// TODO: DOC - renderIsoDiamond matches tiles.ts renderIsoTile transform exactly

// ─── ISO Render Constants (from src/config/game.config.ts) ──────────────────
const TILE_SIZE = 96; // microTileSize
const TILE_W = 64;
const TILE_H = 32;

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  current: null,       // current asset manifest entry
  svgText: '',         // raw SVG text being edited
  variants: [],        // array of { label, svg }
  selectedVariant: -1, // index in variants (-1 = main edit)
  votes: {},           // { variantKey: count } persisted to localStorage
};

// ─── Iso rendering (mirrors tiles.ts renderIsoTile) ──────────────────────────
async function renderIsoDiamond(svgText, srcSize) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

  const canvas = document.createElement('canvas');
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  const ctx = canvas.getContext('2d');

  ctx.setTransform(
    TILE_W / (2 * srcSize),   //  0.333..
    TILE_H / (2 * srcSize),   //  0.1666..
    -TILE_W / (2 * srcSize),  // -0.333..
    TILE_H / (2 * srcSize),   //  0.1666..
    TILE_W / 2,               //  32
    0
  );
  ctx.drawImage(img, 0, 0, srcSize, srcSize);
  return canvas;
}

// ─── Sprite preview: draw on grass tile bg then place sprite ─────────────────
async function renderSpriteOnTile(spriteSvg) {
  const SPRITE_SIZE = 48;
  const CANVAS_W = 128;
  const CANVAS_H = 96;

  // grass bg
  const grassEntry = window.ASSET_MANIFEST.find(e => e.id === 'tile_grass');
  const grassCanvas = await renderIsoDiamond(grassEntry.svg, 32);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  // draw 2 grass tiles side-by-side as a small scene
  ctx.drawImage(grassCanvas, 32, 48); // bottom tile
  ctx.drawImage(grassCanvas, 0, 32);  // left tile
  ctx.drawImage(grassCanvas, 64, 32); // right tile
  ctx.drawImage(grassCanvas, 32, 16); // top tile
  ctx.drawImage(grassCanvas, 32, 32); // center tile

  // load and draw sprite centered over center tile
  const sImg = new Image();
  sImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(spriteSvg);
  await new Promise((res, rej) => { sImg.onload = res; sImg.onerror = rej; });

  const spriteX = CANVAS_W / 2 - SPRITE_SIZE / 2;
  const spriteY = CANVAS_H / 2 - SPRITE_SIZE + 8; // offset up for iso look
  ctx.drawImage(sImg, spriteX, spriteY, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

// ─── Render a preview into a given container ─────────────────────────────────
async function renderPreview(svgText, viewMode, container) {
  container.innerHTML = '';
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  container.appendChild(spinner);

  try {
    let canvas;
    if (viewMode === 'iso-tile') {
      canvas = await renderIsoDiamond(svgText, 32);
    } else if (viewMode === 'sprite') {
      canvas = await renderSpriteOnTile(svgText);
    } else {
      // raw — just show the SVG as an img at natural size
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      container.innerHTML = '';
      img.className = 'preview-img';
      container.appendChild(img);
      return;
    }

    // Scale up for visibility (css: image-rendering: pixelated)
    canvas.style.imageRendering = 'pixelated';
    const scale = viewMode === 'iso-tile' ? 4 : 2;
    canvas.style.width = canvas.width * scale + 'px';
    canvas.style.height = canvas.height * scale + 'px';
    container.innerHTML = '';
    container.appendChild(canvas);
  } catch (e) {
    container.innerHTML = `<span class="err">Render error: ${e.message}</span>`;
  }
}

// ─── SVG raw preview (actual SVG element, no canvas) ─────────────────────────
function showRawSvg(svgText, container) {
  container.innerHTML = svgText;
  const svgEl = container.querySelector('svg');
  if (svgEl) {
    svgEl.style.width = '192px';
    svgEl.style.height = '192px';
  }
}

// ─── Load asset from manifest ─────────────────────────────────────────────────
async function loadAsset(entry) {
  state.current = entry;
  state.svgText = entry.svg;
  document.getElementById('svg-editor').value = entry.svg;
  document.getElementById('view-mode-select').value = entry.viewMode;
  document.getElementById('asset-label').textContent = entry.label;
  await refreshPreviews();
}

// ─── Refresh both preview panels ─────────────────────────────────────────────
async function refreshPreviews() {
  const svgText = state.svgText;
  const viewMode = document.getElementById('view-mode-select').value;

  const isoContainer = document.getElementById('preview-iso');
  const rawContainer = document.getElementById('preview-raw');

  // Run both renders in parallel
  await Promise.all([
    renderPreview(svgText, viewMode, isoContainer),
    Promise.resolve(showRawSvg(svgText, rawContainer)),
  ]);
}

// ─── Variants / A-B panel ────────────────────────────────────────────────────
function addVariant() {
  const svg = state.svgText;
  const label = `Variant ${state.variants.length + 1}`;
  state.variants.push({ label, svg });
  renderVariantPanel();
}

function removeVariant(idx) {
  state.variants.splice(idx, 1);
  renderVariantPanel();
}

async function renderVariantPanel() {
  const panel = document.getElementById('variants-panel');
  panel.innerHTML = '';

  if (state.variants.length === 0) {
    panel.innerHTML = '<p class="hint">Click "Add Variant" to save the current SVG as a comparison variant.</p>';
    return;
  }

  const viewMode = document.getElementById('view-mode-select').value;
  const votes = loadVotes();

  for (let i = 0; i < state.variants.length; i++) {
    const v = state.variants[i];
    const key = variantKey(i);
    const voteCount = votes[key] || 0;

    const card = document.createElement('div');
    card.className = 'variant-card';

    const labelEl = document.createElement('input');
    labelEl.className = 'variant-label';
    labelEl.value = v.label;
    labelEl.oninput = () => { v.label = labelEl.value; };

    const previewEl = document.createElement('div');
    previewEl.className = 'variant-preview';

    const actions = document.createElement('div');
    actions.className = 'variant-actions';

    const voteBtn = document.createElement('button');
    voteBtn.textContent = `👍 ${voteCount}`;
    voteBtn.title = 'Vote for this variant';
    voteBtn.onclick = () => {
      const v2 = loadVotes();
      v2[key] = (v2[key] || 0) + 1;
      saveVotes(v2);
      renderVariantPanel();
    };

    const loadBtn = document.createElement('button');
    loadBtn.textContent = '← Edit';
    loadBtn.title = 'Load this variant into editor';
    loadBtn.onclick = () => {
      state.svgText = v.svg;
      document.getElementById('svg-editor').value = v.svg;
      refreshPreviews();
    };

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '🗑';
    removeBtn.title = 'Remove variant';
    removeBtn.onclick = () => removeVariant(i);

    const exportBtn = document.createElement('button');
    exportBtn.textContent = '⬇ PNG';
    exportBtn.title = 'Export variant as PNG';
    exportBtn.onclick = () => exportVariantPng(v.svg, viewMode, v.label);

    actions.appendChild(voteBtn);
    actions.appendChild(loadBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(removeBtn);

    card.appendChild(labelEl);
    card.appendChild(previewEl);
    card.appendChild(actions);
    panel.appendChild(card);

    // Render preview async (don't block the DOM update)
    renderPreview(v.svg, viewMode, previewEl);
  }
}

function variantKey(idx) {
  return `${state.current?.id || 'custom'}_v${idx}`;
}

function loadVotes() {
  try { return JSON.parse(localStorage.getItem('asset-editor-votes') || '{}'); }
  catch { return {}; }
}

function saveVotes(v) {
  localStorage.setItem('asset-editor-votes', JSON.stringify(v));
}

// ─── PNG Export ───────────────────────────────────────────────────────────────
async function exportPng(scale = 2) {
  const viewMode = document.getElementById('view-mode-select').value;
  await exportVariantPng(state.svgText, viewMode, state.current?.id || 'asset', scale);
}

async function exportVariantPng(svgText, viewMode, name, scale = 2) {
  let canvas;
  if (viewMode === 'iso-tile') {
    canvas = await renderIsoDiamond(svgText, 32);
  } else if (viewMode === 'sprite') {
    canvas = await renderSpriteOnTile(svgText);
  } else {
    // Raw: rasterize SVG to canvas
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 48;
    canvas.height = img.naturalHeight || 48;
    canvas.getContext('2d').drawImage(img, 0, 0);
  }

  // Scale up
  const out = document.createElement('canvas');
  out.width = canvas.width * scale;
  out.height = canvas.height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);

  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${scale}x.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

// ─── Copy SVG to clipboard ────────────────────────────────────────────────────
async function copySvg() {
  try {
    await navigator.clipboard.writeText(state.svgText);
    showToast('SVG copied to clipboard!');
  } catch {
    // Fallback: select textarea
    document.getElementById('svg-editor').select();
    showToast('Press Ctrl+C to copy (clipboard API denied)');
  }
}

// ─── Toast notification ───────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Build sidebar from manifest ─────────────────────────────────────────────
function buildSidebar() {
  const sidebar = document.getElementById('sidebar-list');
  sidebar.innerHTML = '';

  const categories = {};
  for (const entry of window.ASSET_MANIFEST) {
    if (!categories[entry.category]) categories[entry.category] = [];
    categories[entry.category].push(entry);
  }

  for (const [cat, entries] of Object.entries(categories)) {
    const header = document.createElement('div');
    header.className = 'sidebar-category';
    header.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    sidebar.appendChild(header);

    for (const entry of entries) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-item';
      btn.textContent = entry.label;
      btn.title = entry.id;
      btn.onclick = () => {
        document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadAsset(entry);
      };
      sidebar.appendChild(btn);
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  buildSidebar();

  // Wire editor textarea
  const editor = document.getElementById('svg-editor');
  let debounceTimer = null;
  editor.addEventListener('input', () => {
    state.svgText = editor.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshPreviews, 400);
  });

  // Wire view mode selector
  document.getElementById('view-mode-select').addEventListener('change', refreshPreviews);

  // Wire buttons
  document.getElementById('btn-add-variant').addEventListener('click', addVariant);
  document.getElementById('btn-copy-svg').addEventListener('click', copySvg);
  document.getElementById('btn-export-1x').addEventListener('click', () => exportPng(1));
  document.getElementById('btn-export-2x').addEventListener('click', () => exportPng(2));
  document.getElementById('btn-export-4x').addEventListener('click', () => exportPng(4));
  document.getElementById('btn-clear-votes').addEventListener('click', () => {
    localStorage.removeItem('asset-editor-votes');
    renderVariantPanel();
    showToast('Votes cleared');
  });

  // Custom SVG paste via textarea
  document.getElementById('btn-load-custom').addEventListener('click', () => {
    state.current = { id: 'custom', label: 'Custom', viewMode: document.getElementById('view-mode-select').value };
    document.getElementById('asset-label').textContent = 'Custom SVG';
    state.svgText = editor.value;
    state.variants = [];
    refreshPreviews();
    renderVariantPanel();
  });

  // Load first asset by default
  if (window.ASSET_MANIFEST.length > 0) {
    const firstBtn = document.querySelector('.sidebar-item');
    if (firstBtn) firstBtn.click();
  }
}

document.addEventListener('DOMContentLoaded', init);
