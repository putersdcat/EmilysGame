// editor.js — Asset Editor core logic (v2 — PNG round-trip + sprite sheets)
// TODO: DOC - renderIsoDiamond matches tiles.ts renderIsoTile transform exactly

// ─── ISO Render Constants (from src/config/game.config.ts) ──────────────────
const TILE_SIZE = 96; // microTileSize
const TILE_W = 64;
const TILE_H = 32;

// Blank SVG templates for new assets
const BLANK_TILE_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <!-- New tile — edit me. 32x32 viewBox, projected to 64x32 iso diamond -->
  <rect width="32" height="32" fill="#7B9FC4"/>
  <rect x="0" y="28" width="32" height="4" fill="#000" opacity="0.15"/>
</svg>`;

const BLANK_SPRITE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <!-- New sprite — edit me. 48x48 viewBox for world objects/characters -->
  <ellipse cx="24" cy="44" rx="12" ry="3" fill="#000" opacity="0.2"/>
  <circle cx="24" cy="24" r="16" fill="#7B9FC4" stroke="#3a6090" stroke-width="1.5"/>
  <text x="24" y="29" text-anchor="middle" font-size="14" fill="#fff" font-family="sans-serif">?</text>
</svg>`;

/** Reliably trigger a file download — anchor must be in DOM for Chrome/Firefox */
function dlAnchor(href, filename) {
  const a = Object.assign(document.createElement('a'), { href, download: filename, style: 'display:none' });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);
}

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  current: null,         // current asset manifest entry
  svgText: '',           // raw SVG text being edited
  variants: [],          // array of { label, svg }
  votes: {},             // { variantKey: count } persisted to localStorage
  multiSelectMode: false,// true = sheet-export selection mode
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

// ─── Expose render fns for sheet.js ─────────────────────────────────────────
window._editorRenderIsoDiamond = renderIsoDiamond;
window._editorRenderSpriteOnTile = renderSpriteOnTile;
window._editorCurrentEntry = () => state.current;
// Note: window.showToast assigned in init() AFTER function declaration hoisting

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
  // Reset import panel for new asset
  const lbl = document.getElementById('import-tab-asset-label');
  if (lbl) lbl.textContent = `Import PNG for: ${entry.label}`;
  const compare = document.getElementById('import-compare');
  if (compare) compare.innerHTML = '<p class="hint">Drag-drop or upload a PNG to compare with current render</p>';
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

// ─── PNG Export: export the RENDERED canvas (not SVG re-render) ────────────────
async function exportRenderedPng(scale = 2) {
  const viewMode = document.getElementById('view-mode-select').value;
  let src;
  try {
    if (viewMode === 'iso-tile') {
      src = await renderIsoDiamond(state.svgText, 32);
    } else if (viewMode === 'sprite') {
      // Export raw 48x48 sprite (native size, no tile background)
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(state.svgText);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      src = document.createElement('canvas');
      src.width = 48; src.height = 48;
      src.getContext('2d').drawImage(img, 0, 0, 48, 48);
    } else {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(state.svgText);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      src = document.createElement('canvas');
      src.width = img.naturalWidth || 48;
      src.height = img.naturalHeight || 48;
      src.getContext('2d').drawImage(img, 0, 0);
    }
  } catch (e) { showToast('Render error: ' + e.message); return; }

  const out = document.createElement('canvas');
  out.width = src.width * scale; out.height = src.height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  // toDataURL is synchronous — avoids async-callback download-blocking in Chrome
  const id = state.current?.id || 'asset';
  const filename = `${id}_rendered_${scale}x.png`;
  dlAnchor(out.toDataURL('image/png'), filename);
  showToast(`Downloaded ${filename}`);
}

// Legacy alias used by variant export buttons
async function exportPng(scale = 2) { return exportRenderedPng(scale); }

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

  dlAnchor(out.toDataURL('image/png'), `${name}_${scale}x.png`);
}

// ─── New Asset Creation ──────────────────────────────────────────────────────
function newAsset(type) {
  const id = `custom_${type}_${Date.now()}`;
  const label = type === 'tile' ? 'New Tile' : 'New Sprite';
  const viewMode = type === 'tile' ? 'iso-tile' : 'sprite';
  const svg = type === 'tile' ? BLANK_TILE_SVG : BLANK_SPRITE_SVG;
  const entry = { id, label, category: 'custom', viewMode, svg, _isNew: true };
  window.ASSET_MANIFEST.unshift(entry);
  buildSidebar();
  const btn = document.querySelector(`.sidebar-item[data-id="${id}"]`);
  if (btn) btn.click();
  showToast(`New ${type} created — edit SVG, then export`);
}

// ─── Tab switching (right panel) ─────────────────────────────────────────────
function switchRightTab(name) {
  document.querySelectorAll('.right-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.right-tab-btn').forEach(btn => btn.classList.remove('active'));
  const el = document.getElementById(`rtab-${name}`);
  if (el) el.style.display = 'flex';
  const btn = document.querySelector(`.right-tab-btn[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');
}

// ─── Multi-select / Sheet mode toggle ────────────────────────────────────────
function toggleMultiSelectMode(on) {
  state.multiSelectMode = on;
  document.querySelectorAll('.sidebar-check').forEach(cb => { cb.style.display = on ? '' : 'none'; });
  if (on) switchRightTab('sheet');
}

// ─── PNG Import (single) ─────────────────────────────────────────────────────
function handleSinglePngImport(file) {
  if (!file || !file.type.startsWith('image/')) { showToast('Not an image file'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const importedSrc = ev.target.result;
    const compare = document.getElementById('import-compare');
    if (!compare) return;
    // Render current ISO state for comparison
    const viewMode = document.getElementById('view-mode-select').value;
    const renderFn = viewMode === 'iso-tile'
      ? renderIsoDiamond(state.svgText, 32)
      : viewMode === 'sprite'
        ? (async () => { const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(state.svgText); await new Promise((r,j)=>{img.onload=r;img.onerror=j;}); const c=document.createElement('canvas');c.width=48;c.height=48;c.getContext('2d').drawImage(img,0,0,48,48);return c; })()
        : Promise.resolve(null);

    renderFn.then(currentCanvas => {
      compare.innerHTML = '';
      compare.style.display = 'flex';

      const makeCard = (title, src, isCanvas) => {
        const card = document.createElement('div');
        card.className = 'import-card';
        const lbl = document.createElement('div');
        lbl.className = 'import-card-label';
        lbl.textContent = title;
        const content = document.createElement('div');
        content.className = 'import-card-content';
        if (isCanvas) {
          src.style.imageRendering = 'pixelated';
          const scale = viewMode === 'iso-tile' ? 4 : 2;
          src.style.width = src.width * scale + 'px';
          src.style.height = src.height * scale + 'px';
          content.appendChild(src);
        } else {
          const img = document.createElement('img');
          img.src = src;
          img.style.maxWidth = '160px'; img.style.maxHeight = '160px';
          img.style.imageRendering = 'pixelated';
          content.appendChild(img);
        }
        card.appendChild(lbl);
        card.appendChild(content);
        return card;
      };

      if (currentCanvas) compare.appendChild(makeCard('Current (rendered)', currentCanvas, true));
      compare.appendChild(makeCard('Imported PNG', importedSrc, false));

      // Approve button
      const approveBtn = document.createElement('button');
      approveBtn.className = 'approve-btn';
      approveBtn.textContent = '✔ Download as In-Game Asset';
      approveBtn.title = `Save as public/sprites/${state.current?.id || 'asset'}.png`;
      approveBtn.onclick = () => {
        dlAnchor(importedSrc, `${state.current?.id || 'asset'}.png`);
        showToast(`Downloaded — place in public/sprites/ to use in-game`);
      };
      compare.appendChild(approveBtn);
    });
  };
  reader.readAsDataURL(file);
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
      const row = document.createElement('div');
      row.className = 'sidebar-row';

      // Checkbox for multi-select / sheet mode
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'sidebar-check';
      cb.dataset.id = entry.id;
      cb.style.display = state.multiSelectMode ? '' : 'none';
      cb.onclick = (e) => {
        e.stopPropagation();
        window.SheetManager?.toggleSelect(entry.id);
      };

      const btn = document.createElement('button');
      btn.className = 'sidebar-item';
      btn.dataset.id = entry.id;
      btn.textContent = entry._isNew ? '✨ ' + entry.label : entry.label;
      btn.title = entry.id;
      btn.onclick = () => {
        document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadAsset(entry);
      };

      row.appendChild(cb);
      row.appendChild(btn);
      sidebar.appendChild(row);
    }
  }
}

// ─── Toast notification ───────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
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

  // Right panel tab buttons
  document.querySelectorAll('.right-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRightTab(btn.dataset.tab));
  });

  // Toolbar: A/B variants
  document.getElementById('btn-add-variant').addEventListener('click', addVariant);
  document.getElementById('btn-copy-svg').addEventListener('click', copySvg);

  // PNG export buttons (exports the RENDERED canvas)
  document.getElementById('btn-export-1x').addEventListener('click', () => exportRenderedPng(1));
  document.getElementById('btn-export-2x').addEventListener('click', () => exportRenderedPng(2));
  document.getElementById('btn-export-4x').addEventListener('click', () => exportRenderedPng(4));

  // Sidebar collapse toggle
  document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
    const app = document.getElementById('app');
    const hidden = app.classList.toggle('sidebar-hidden');
    document.getElementById('btn-sidebar-toggle').textContent = hidden ? '▶' : '☰';
  });

  // New asset buttons
  document.getElementById('btn-new-tile').addEventListener('click', () => newAsset('tile'));
  document.getElementById('btn-new-sprite').addEventListener('click', () => newAsset('sprite'));

  // Sheet mode toggle
  document.getElementById('btn-toggle-multiselect').addEventListener('click', (e) => {
    const on = !state.multiSelectMode;
    toggleMultiSelectMode(on);
    e.currentTarget.textContent = on ? '✕ Exit Sheet Mode' : '📋 Sheet Mode';
    e.currentTarget.classList.toggle('active', on);
  });

  // Clear votes
  document.getElementById('btn-clear-votes').addEventListener('click', () => {
    localStorage.removeItem('asset-editor-votes');
    renderVariantPanel();
    showToast('Votes cleared');
  });

  // Reload preview
  document.getElementById('btn-load-custom').addEventListener('click', () => {
    state.current = state.current || { id: 'custom', label: 'Custom' };
    state.current.viewMode = document.getElementById('view-mode-select').value;
    document.getElementById('asset-label').textContent = state.current.label || 'Custom SVG';
    state.svgText = editor.value;
    state.variants = [];
    refreshPreviews();
    renderVariantPanel();
  });

  // PNG import: click btn-import-png → open file picker (change handled by sheet.js)
  const singleInput = document.getElementById('single-png-input');
  const importBtn = document.getElementById('btn-import-png');
  if (importBtn) importBtn.addEventListener('click', () => singleInput?.click());

  // PNG import: drag-drop on import-drop-zone is handled by sheet.js setupDropZone()

  // Default tab
  switchRightTab('variants');

  // Load first asset by default
  if (window.ASSET_MANIFEST.length > 0) {
    const firstBtn = document.querySelector('.sidebar-item');
    if (firstBtn) firstBtn.click();
  }
}

document.addEventListener('DOMContentLoaded', init);
