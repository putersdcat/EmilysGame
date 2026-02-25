// sheet.js — Sprite sheet export + import/re-slice pipeline
// TODO: DOC - sprite sheet round-trip format, metadata JSON schema

// ─── Constants ───────────────────────────────────────────────────────────────
// Cell sizes per view mode (pre-upscaled for external editing)
const CELL_SIZES = {
  'iso-tile': { w: 256, h: 128 }, // 4× of 64×32 iso diamond
  'sprite':   { w: 96,  h: 96  }, // 2× of 48×48 raw sprite
  'raw':      { w: 96,  h: 96  }, // same as sprite
};
const DEFAULT_MARGIN = 20;   // px margin around each cell (both sides)
const LABEL_H = 18;          // px label area below cell
const LABEL_FONT = '11px "Segoe UI", system-ui, sans-serif';
const SHEET_BG = null;       // null = transparent

// ─── State ───────────────────────────────────────────────────────────────────
const sheetState = {
  selected: new Set(),   // Set of asset IDs currently selected for sheet
  cols: 4,
  margin: DEFAULT_MARGIN,
  lastExported: null,   // { metadata, blobUrl } — for round-trip re-import
};

// ─── Selection management ─────────────────────────────────────────────────────
window.SheetManager = {
  toggleSelect(id) {
    if (sheetState.selected.has(id)) sheetState.selected.delete(id);
    else sheetState.selected.add(id);
    updateSelectionUI();
    updateSheetCount();
  },
  selectAll() {
    window.ASSET_MANIFEST.forEach(e => sheetState.selected.add(e.id));
    updateSelectionUI();
    updateSheetCount();
  },
  clearSelection() {
    sheetState.selected.clear();
    updateSelectionUI();
    updateSheetCount();
  },
  getSelected() { return [...sheetState.selected]; },
  isSelected(id) { return sheetState.selected.has(id); },
};

function updateSelectionUI() {
  document.querySelectorAll('.sidebar-check').forEach(cb => {
    cb.checked = sheetState.selected.has(cb.dataset.id);
  });
}

function updateSheetCount() {
  const n = sheetState.selected.size;
  const el = document.getElementById('sheet-count');
  if (el) el.textContent = n === 0 ? 'No assets selected' : `${n} asset${n !== 1 ? 's' : ''} selected`;
  const btn = document.getElementById('btn-export-sheet');
  if (btn) btn.disabled = n === 0;
}

// ─── Shared render helper (must be available before sheet.js loads) ───────────
async function renderCellCanvas(entry) {
  // Re-use editor.js renderIsoDiamond / renderSpriteOnTile via globals
  if (entry.viewMode === 'iso-tile') {
    return window._editorRenderIsoDiamond(entry.svg, 32);
  } else if (entry.viewMode === 'sprite') {
    return window._editorRenderSpriteOnTile(entry.svg);
  } else {
    // raw: rasterize SVG to canvas
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(entry.svg);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 48;
    c.height = img.naturalHeight || 48;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }
}

// ─── Resolved cell geometry ───────────────────────────────────────────────────
function resolveCellSize(assets) {
  // Find max cell size needed (in case of mixed modes)
  let w = 0, h = 0;
  for (const a of assets) {
    const s = CELL_SIZES[a.viewMode] || CELL_SIZES['sprite'];
    w = Math.max(w, s.w);
    h = Math.max(h, s.h);
  }
  return { w: Math.max(w, 64), h: Math.max(h, 32) };
}

// ─── Sprite Sheet Export ──────────────────────────────────────────────────────
async function exportSpriteSheet() {
  const ids = SheetManager.getSelected();
  if (ids.length === 0) { showSheetStatus('No assets selected', 'err'); return; }

  const assets = ids.map(id => window.ASSET_MANIFEST.find(e => e.id === id)).filter(Boolean);
  if (assets.length === 0) { showSheetStatus('Assets not found in manifest', 'err'); return; }

  const cols = Math.min(parseInt(document.getElementById('sheet-cols').value) || 4, assets.length);
  const margin = parseInt(document.getElementById('sheet-margin').value) || DEFAULT_MARGIN;
  const cellSize = resolveCellSize(assets);
  const rows = Math.ceil(assets.length / cols);

  const slotW = cellSize.w + margin * 2;
  const slotH = cellSize.h + margin * 2 + LABEL_H;

  const sheetW = cols * slotW;
  const sheetH = rows * slotH;

  showSheetStatus('Rendering sheet…', 'info');

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d');
  // transparent bg — no fillRect

  // Draw cells
  const metadata = {
    version: 1,
    sheetName: `sheet-${new Date().toISOString().slice(0,10)}`,
    cellW: cellSize.w,
    cellH: cellSize.h,
    margin,
    labelH: LABEL_H,
    cols,
    rows,
    slotW,
    slotH,
    sheetW,
    sheetH,
    assets: [],
  };

  // Subtle grid guidelines (light grey) at 20% opacity so external editors can see cell boundaries
  ctx.strokeStyle = 'rgba(180,180,180,0.3)';
  ctx.lineWidth = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * slotW;
      const y = r * slotH;
      ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);
    }
  }

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const slotX = col * slotW;
    const slotY = row * slotH;
    const cellX = slotX + margin;
    const cellY = slotY + margin;

    metadata.assets.push({ id: a.id, label: a.label, viewMode: a.viewMode, category: a.category, col, row });

    try {
      const cellCanvas = await renderCellCanvas(a);
      // Center the cell canvas within the cellSize area if smaller
      const drawX = cellX + Math.round((cellSize.w - cellCanvas.width) / 2);
      const drawY = cellY + Math.round((cellSize.h - cellCanvas.height) / 2);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cellCanvas, drawX, drawY, cellCanvas.width, cellCanvas.height);
      ctx.restore();

      // Label below cell
      ctx.fillStyle = 'rgba(50,55,75,0.85)';
      const labelY = cellY + cellSize.h + 2;
      ctx.fillRect(cellX, labelY, cellSize.w, LABEL_H - 2);
      ctx.fillStyle = '#ccd0e0';
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.id, cellX + cellSize.w / 2, labelY + (LABEL_H - 2) / 2, cellSize.w - 4);
    } catch(e) {
      // Draw error placeholder
      ctx.fillStyle = '#b84040';
      ctx.fillRect(cellX, cellY, cellSize.w, cellSize.h);
      ctx.fillStyle = '#fff';
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ERR', cellX + cellSize.w/2, cellY + cellSize.h/2);
    }
  }

  sheetState.lastExported = { metadata };

  // toDataURL is synchronous — no async callback, no browser download-blocker issue
  const sheetName = metadata.sheetName;
  savePng(canvas, `${sheetName}.png`);

  // JSON companion — tiny delay so browser queues as a separate download
  setTimeout(() => {
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    triggerDownload(jsonUrl, `${sheetName}.json`);
    setTimeout(() => URL.revokeObjectURL(jsonUrl), 5000);
  }, 300);

  showSheetStatus(`✅ Downloaded sheet + metadata (${assets.length} assets)`, 'ok');
}

/** Reliably trigger a file download by temporarily appending anchor to DOM */
function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Small defer to let browser initiate before removal
  setTimeout(() => document.body.removeChild(a), 200);
}

// ─── Sprite Sheet Re-import + Slice ──────────────────────────────────────────
const sliceState = {
  metadata: null,   // parsed JSON metadata
  image: null,      // HTMLImageElement from uploaded PNG
  slices: [],       // [{ asset: entry, canvas: HTMLCanvasElement }]
  approved: new Set(), // approved asset IDs
};

async function handleSheetUpload(pngFile, jsonFile) {
  showSheetStatus('Loading sheet…', 'info');
  sliceState.metadata = null;
  sliceState.image = null;
  sliceState.slices = [];
  sliceState.approved.clear();

  // Load JSON metadata
  let meta;
  if (jsonFile) {
    try {
      const text = await jsonFile.text();
      meta = JSON.parse(text);
      if (meta.version !== 1 || !meta.assets) throw new Error('Invalid metadata version');
    } catch(e) {
      showSheetStatus('Invalid JSON metadata: ' + e.message, 'err');
      return;
    }
  } else {
    // Try to use last exported metadata
    if (sheetState.lastExported?.metadata) {
      meta = sheetState.lastExported.metadata;
      showSheetStatus('Using last exported metadata (no JSON file provided)', 'info');
    } else {
      showSheetStatus('Please upload a .json metadata file alongside the PNG', 'err');
      return;
    }
  }

  // Load PNG
  const pngUrl = URL.createObjectURL(pngFile);
  const img = new Image();
  img.src = pngUrl;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

  sliceState.metadata = meta;
  sliceState.image = img;

  // Draw full sheet to canvas for slicing
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = img.naturalWidth;
  fullCanvas.height = img.naturalHeight;
  const fullCtx = fullCanvas.getContext('2d');
  fullCtx.drawImage(img, 0, 0);

  // Slice each asset
  sliceState.slices = [];
  for (const assetMeta of meta.assets) {
    const cellX = assetMeta.col * meta.slotW + meta.margin;
    const cellY = assetMeta.row * meta.slotH + meta.margin;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = meta.cellW;
    sliceCanvas.height = meta.cellH;
    const sliceCtx = sliceCanvas.getContext('2d');
    sliceCtx.drawImage(fullCanvas, cellX, cellY, meta.cellW, meta.cellH, 0, 0, meta.cellW, meta.cellH);

    const manifestEntry = window.ASSET_MANIFEST.find(e => e.id === assetMeta.id);
    sliceState.slices.push({
      assetMeta,
      manifestEntry,
      sliceCanvas,
    });
  }

  URL.revokeObjectURL(pngUrl);
  showSheetStatus(`Sliced ${sliceState.slices.length} assets — review below`, 'ok');
  renderSliceReview();
}

async function renderSliceReview() {
  const container = document.getElementById('slice-review');
  container.innerHTML = '';

  if (sliceState.slices.length === 0) {
    container.innerHTML = '<p class="hint">No slices loaded</p>';
    return;
  }

  // Approve All button
  const header = document.createElement('div');
  header.className = 'slice-header';
  const approveAllBtn = document.createElement('button');
  approveAllBtn.textContent = '✅ Approve All';
  approveAllBtn.className = 'btn-approve-all';
  approveAllBtn.onclick = () => {
    sliceState.slices.forEach(s => sliceState.approved.add(s.assetMeta.id));
    renderSliceReview();
  };
  const saveAllBtn = document.createElement('button');
  saveAllBtn.textContent = '⬇ Save Approved';
  saveAllBtn.className = 'btn-save-all';
  saveAllBtn.onclick = saveApprovedSlices;
  header.appendChild(approveAllBtn);
  header.appendChild(saveAllBtn);
  container.appendChild(header);

  for (const slice of sliceState.slices) {
    const approved = sliceState.approved.has(slice.assetMeta.id);
    const card = document.createElement('div');
    card.className = 'slice-card' + (approved ? ' slice-approved' : '');

    // Left: original game render
    const origDiv = document.createElement('div');
    origDiv.className = 'slice-orig';
    const origLabel = document.createElement('div');
    origLabel.className = 'slice-label';
    origLabel.textContent = 'Original';
    origDiv.appendChild(origLabel);
    if (slice.manifestEntry) {
      const origPreview = document.createElement('div');
      origPreview.className = 'slice-preview-pane';
      // Render original async
      (async () => {
        try {
          const c = await renderCellCanvas(slice.manifestEntry);
          c.style.imageRendering = 'pixelated';
          const sc = 256 / Math.max(c.width, 1);
          c.style.width = Math.round(c.width * Math.min(sc, 2)) + 'px';
          c.style.height = Math.round(c.height * Math.min(sc, 2)) + 'px';
          origPreview.appendChild(c);
        } catch(e) {
          origPreview.textContent = 'Error';
        }
      })();
      origDiv.appendChild(origPreview);
    } else {
      origDiv.innerHTML += '<p class="hint">Not in manifest</p>';
    }

    // Right: uploaded slice
    const newDiv = document.createElement('div');
    newDiv.className = 'slice-new';
    const newLabel = document.createElement('div');
    newLabel.className = 'slice-label';
    newLabel.textContent = 'Uploaded';
    newDiv.appendChild(newLabel);
    const slicePreview = document.createElement('div');
    slicePreview.className = 'slice-preview-pane';
    const sc2 = document.createElement('canvas');
    sc2.width = slice.sliceCanvas.width;
    sc2.height = slice.sliceCanvas.height;
    sc2.getContext('2d').drawImage(slice.sliceCanvas, 0, 0);
    const displayScale = 256 / Math.max(sc2.width, 1);
    sc2.style.width = Math.round(sc2.width * Math.min(displayScale, 2)) + 'px';
    sc2.style.height = Math.round(sc2.height * Math.min(displayScale, 2)) + 'px';
    sc2.style.imageRendering = 'pixelated';
    slicePreview.appendChild(sc2);
    newDiv.appendChild(slicePreview);

    // ID + actions
    const info = document.createElement('div');
    info.className = 'slice-info';
    info.innerHTML = `<span class="slice-id">${slice.assetMeta.id}</span>`;

    const approveBtn = document.createElement('button');
    approveBtn.textContent = approved ? '✅ Approved' : '👍 Approve';
    approveBtn.className = approved ? 'btn-approved' : 'btn-approve';
    approveBtn.onclick = () => {
      if (approved) sliceState.approved.delete(slice.assetMeta.id);
      else sliceState.approved.add(slice.assetMeta.id);
      renderSliceReview();
    };

    const skipBtn = document.createElement('button');
    skipBtn.textContent = '⊘ Skip';
    skipBtn.onclick = () => { sliceState.approved.delete(slice.assetMeta.id); renderSliceReview(); };

    info.appendChild(approveBtn);
    info.appendChild(skipBtn);

    card.appendChild(origDiv);
    card.appendChild(newDiv);
    card.appendChild(info);
    container.appendChild(card);
  }
}

async function saveApprovedSlices() {
  const toSave = sliceState.slices.filter(s => sliceState.approved.has(s.assetMeta.id));
  if (toSave.length === 0) { showSheetStatus('No approved slices to save', 'err'); return; }

  const snippets = [];

  for (const slice of toSave) {
    const filename = `${slice.assetMeta.id}.png`;
    savePng(slice.sliceCanvas, filename);
    snippets.push(`  '${slice.assetMeta.id}': { pngPath: 'sprites/${filename}', fallback: 'svg' },`);
  }

  // Show config snippet
  showConfigSnippet(snippets);
  showSheetStatus(`✅ Saved ${toSave.length} asset PNG${toSave.length !== 1 ? 's' : ''}`, 'ok');
}

// ─── Import PNG for single asset ─────────────────────────────────────────────
async function importSinglePng(file, currentEntry) {
  if (!currentEntry) { window.showToast?.('Select an asset first'); return; }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

  const uploadCanvas = document.createElement('canvas');
  uploadCanvas.width = img.naturalWidth;
  uploadCanvas.height = img.naturalHeight;
  uploadCanvas.getContext('2d').drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  // Show in import compare panel
  renderImportCompare(currentEntry, uploadCanvas);
}

async function renderImportCompare(entry, uploadCanvas) {
  const container = document.getElementById('import-compare');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'import-compare-grid';

  // Original
  const origCol = document.createElement('div');
  origCol.className = 'import-col';
  origCol.innerHTML = '<div class="import-col-label">Current Game Asset</div>';
  const origPreview = document.createElement('div');
  origPreview.className = 'import-preview';
  try {
    const oc = await renderCellCanvas(entry);
    oc.style.imageRendering = 'pixelated';
    oc.style.maxWidth = '100%';
    oc.style.height = 'auto';
    origPreview.appendChild(oc);
  } catch(e) {
    origPreview.textContent = 'Render error';
  }
  origCol.appendChild(origPreview);

  // Uploaded
  const newCol = document.createElement('div');
  newCol.className = 'import-col';
  newCol.innerHTML = '<div class="import-col-label">Uploaded PNG</div>';
  const newPreview = document.createElement('div');
  newPreview.className = 'import-preview';
  uploadCanvas.style.imageRendering = 'pixelated';
  uploadCanvas.style.maxWidth = '100%';
  uploadCanvas.style.height = 'auto';
  newPreview.appendChild(uploadCanvas);
  newCol.appendChild(newPreview);

  grid.appendChild(origCol);
  grid.appendChild(newCol);

  // Action row
  const actions = document.createElement('div');
  actions.className = 'import-actions';

  const approveBtn = document.createElement('button');
  approveBtn.textContent = '✅ Approve & Save';
  approveBtn.className = 'btn-approve-all';
  approveBtn.onclick = () => {
    const filename = `${entry.id}.png`;
    savePng(uploadCanvas, filename);
    showConfigSnippet([`  '${entry.id}': { pngPath: 'sprites/${filename}', fallback: 'svg' },`]);
    container.innerHTML = '<p class="hint ok-text">✅ Saved! Place the file in public/sprites/ and update asset-library.config.ts</p>';
  };

  const discardBtn = document.createElement('button');
  discardBtn.textContent = '✕ Discard';
  discardBtn.onclick = () => { container.innerHTML = '<p class="hint">Import discarded</p>'; };

  actions.appendChild(approveBtn);
  actions.appendChild(discardBtn);

  container.appendChild(grid);
  container.appendChild(actions);
}

// ─── Config snippet modal ─────────────────────────────────────────────────────
function showConfigSnippet(lines) {
  const modal = document.getElementById('config-modal');
  const code = document.getElementById('config-snippet-code');
  code.textContent = `// In src/config/asset-library.config.ts, add to ASSET_LIBRARY:\n${lines.join('\n')}`;
  modal.style.display = 'flex';
}

// ─── Utilities ────────────────────────────────────────────────────────────────
/**
 * Synchronous PNG download — toDataURL() runs inline (no async callback)
 * so Chrome/Safari don't block it as a non-user-gesture download.
 */
function savePng(canvas, filename) {
  triggerDownload(canvas.toDataURL('image/png'), filename);
}

function showSheetStatus(msg, type) {
  const el = document.getElementById('sheet-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'sheet-status ' + type;
  if (type === 'ok' || type === 'info') {
    setTimeout(() => { if (el.textContent === msg) el.className = 'sheet-status'; }, 5000);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initSheet() {
  // Sheet export button
  document.getElementById('btn-export-sheet')?.addEventListener('click', exportSpriteSheet);
  document.getElementById('btn-select-all')?.addEventListener('click', () => SheetManager.selectAll());
  document.getElementById('btn-clear-selection')?.addEventListener('click', () => SheetManager.clearSelection());

  // Sheet PNG upload (PNG + JSON)
  const sheetPngInput = document.getElementById('sheet-png-input');
  const sheetJsonInput = document.getElementById('sheet-json-input');
  const sheetImportBtn = document.getElementById('btn-import-sheet');
  sheetImportBtn?.addEventListener('click', async () => {
    const pngFile = sheetPngInput?.files?.[0];
    if (!pngFile) { showSheetStatus('Please select a PNG file first', 'err'); return; }
    const jsonFile = sheetJsonInput?.files?.[0] || null;
    await handleSheetUpload(pngFile, jsonFile);
  });

  // Single PNG import
  const singleImportInput = document.getElementById('single-png-input');
  singleImportInput?.addEventListener('change', async () => {
    const f = singleImportInput.files?.[0];
    if (f) await importSinglePng(f, window._editorCurrentEntry?.());
    singleImportInput.value = '';
  });

  // Config modal close
  document.getElementById('config-modal-close')?.addEventListener('click', () => {
    document.getElementById('config-modal').style.display = 'none';
  });
  document.getElementById('btn-copy-snippet')?.addEventListener('click', () => {
    const code = document.getElementById('config-snippet-code').textContent;
    navigator.clipboard.writeText(code).then(() => window.showToast?.('Snippet copied!'));
  });

  // Drop zone for sheet PNG
  setupDropZone('sheet-drop-zone', async (files) => {
    const png = files.find(f => f.type === 'image/png');
    const json = files.find(f => f.name.endsWith('.json'));
    if (png) await handleSheetUpload(png, json || null);
  });

  // Drop zone for single PNG import
  setupDropZone('import-drop-zone', async (files) => {
    const png = files.find(f => f.type === 'image/png');
    if (png) await importSinglePng(png, window._editorCurrentEntry?.());
  });

  updateSheetCount();
}

function setupDropZone(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', async e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const files = [...e.dataTransfer.files];
    await handler(files);
  });
  el.addEventListener('click', () => {
    // Click to open file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,image/png,.json,application/json';
    input.multiple = true;
    input.onchange = async () => { if (input.files?.length) await handler([...input.files]); };
    input.click();
  });
}

document.addEventListener('DOMContentLoaded', initSheet);
