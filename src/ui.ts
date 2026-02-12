/**
 * ui.ts - HTML-based HUD overlay system.
 * Manages toasts, dialog, quiz display, debug info, inventory tray,
 * and bottom HUD bar — all via DOM elements (no canvas drawing).
 * TODO: DOC - UI layout diagram
 */

import { ASSET_DEFS } from './config/assets.config';
import { ITEM_DEFS } from './config/items.config';
import { isLlmAvailable } from './llm';
import type { Inventory } from './inventory';
import type { QuizState } from './quiz';

// ─── Types ───────────────────────────────────────────────────

export interface DialogState {
  active: boolean;
  npcName: string;
  lines: string[];
  currentLine: number;
}

export interface ToastMessage {
  text: string;
  color: string;
  expiresAt: number;
}

export interface UIState {
  dialog: DialogState;
  toasts: ToastMessage[];
  showDebug: boolean;
  showInventory: boolean;
}

// ─── Create State ────────────────────────────────────────────

export function createUIState(): UIState {
  return {
    dialog: { active: false, npcName: '', lines: [], currentLine: 0 },
    toasts: [],
    showDebug: false,
    showInventory: false,
  };
}

// ─── Toast Messages ──────────────────────────────────────────

export function addToast(ui: UIState, text: string, color = '#fff', durationMs = 2000): void {
  ui.toasts.push({ text, color, expiresAt: Date.now() + durationMs });
  // Inject into DOM immediately
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.style.color = color;
  container.appendChild(el);
  setTimeout(() => el.remove(), durationMs + 600);
}

function pruneToasts(ui: UIState): void {
  const now = Date.now();
  ui.toasts = ui.toasts.filter((t) => t.expiresAt > now);
}

// ─── Dialog ──────────────────────────────────────────────────

export function showDialog(ui: UIState, npcName: string, lines: string[]): void {
  ui.dialog = { active: true, npcName, lines, currentLine: 0 };
}

export function advanceDialog(ui: UIState): boolean {
  if (!ui.dialog.active) return false;
  ui.dialog.currentLine++;
  if (ui.dialog.currentLine >= ui.dialog.lines.length) {
    ui.dialog.active = false;
    return false;
  }
  return true;
}

export function closeDialog(ui: UIState): void {
  ui.dialog.active = false;
}

// ─── DOM Sync: called every frame from main ──────────────────

/**
 * Synchronize the entire HTML HUD with current game state.
 * Replaces the old canvas-based renderUI.
 */
export function renderUI(
  _ctx: CanvasRenderingContext2D,
  ui: UIState,
  inventory: Inventory,
  quiz: QuizState,
  playerPos: { x: number; y: number },
  fps: number,
): void {
  pruneToasts(ui);
  syncHUD(inventory);
  syncDialog(ui.dialog);
  syncQuiz(quiz);
  syncDebug(ui.showDebug, playerPos, fps);
  syncInventoryTray(ui.showInventory, inventory);
}

// --- HUD bar (coins, keys, LLM dot) ---

function syncHUD(inv: Inventory): void {
  const coinEl = document.getElementById('coinStat');
  const keyEl = document.getElementById('keyStat');
  const llmDot = document.getElementById('llmDot');
  if (coinEl) coinEl.textContent = `💰 ${inv.countItem('coin')}`;
  if (keyEl) keyEl.textContent = `🔑 ${inv.countItem('key')}`;
  if (llmDot) {
    const ok = isLlmAvailable();
    llmDot.className = ok ? '' : 'off';
    llmDot.id = 'llmDot';
    llmDot.title = ok ? 'LLM: connected' : 'LLM: disconnected';
  }
}

// --- Dialog ---

function syncDialog(dialog: DialogState): void {
  const el = document.getElementById('dialogOverlay');
  if (!el) return;
  if (!dialog.active) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  const nameEl = document.getElementById('dialogName');
  const textEl = document.getElementById('dialogText');
  const hintEl = document.getElementById('dialogHint');
  if (nameEl) nameEl.textContent = dialog.npcName;
  if (textEl) textEl.textContent = dialog.lines[dialog.currentLine] || '';
  if (hintEl) {
    hintEl.textContent = dialog.currentLine < dialog.lines.length - 1
      ? '▼ Space to continue'
      : 'Space to close';
  }
}

// --- Quiz ---

function syncQuiz(quiz: QuizState): void {
  const overlay = document.getElementById('quizOverlay');
  if (!overlay) return;

  if (!quiz.active) {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';

  const questionEl = document.getElementById('quizQuestion');
  const choicesEl = document.getElementById('quizChoices');
  const resultEl = document.getElementById('quizResult');
  const hintEl = document.getElementById('quizHint');
  const navEl = document.getElementById('quizNav');

  if (questionEl) questionEl.textContent = quiz.displayText;

  if (choicesEl) {
    choicesEl.innerHTML = '';
    quiz.choices.forEach((choice: string, i: number) => {
      const div = document.createElement('div');
      div.className = 'quiz-choice';
      const selected = i === quiz.selectedIndex;
      const isCorrect = i === quiz.correctIndex;

      if (selected) div.classList.add('selected');
      if (quiz.result !== 'pending') {
        if (isCorrect) div.classList.add('correct');
        else if (selected && quiz.result === 'wrong') div.classList.add('wrong');
      }

      const marker = selected ? '▸ ' : '  ';
      div.textContent = `${marker}${String.fromCharCode(65 + i)}) ${choice}`;
      choicesEl.appendChild(div);
    });
  }

  if (resultEl) {
    if (quiz.result === 'pending') {
      resultEl.textContent = '';
    } else if (quiz.result === 'correct') {
      resultEl.textContent = '✅ Correct!';
      resultEl.style.color = '#4caf50';
    } else {
      resultEl.textContent = '❌ Wrong!';
      resultEl.style.color = '#f44336';
    }
  }

  if (hintEl) {
    hintEl.textContent = (quiz.result === 'wrong' && quiz.question?.hint)
      ? `Hint: ${quiz.question.hint}` : '';
  }

  if (navEl) {
    navEl.textContent = quiz.result !== 'pending'
      ? 'Space to continue'
      : '↑↓ Navigate • Space to select';
  }
}

// --- Inventory tray ---

function syncInventoryTray(show: boolean, inv: Inventory): void {
  const overlay = document.getElementById('hudOverlay');
  const list = document.getElementById('invList');
  if (!overlay || !list) return;

  if (show) {
    overlay.classList.add('expanded');
  } else {
    overlay.classList.remove('expanded');
  }

  if (!show) return;

  list.innerHTML = '';
  if (inv.slots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inv-row';
    empty.style.color = '#888';
    empty.textContent = 'Inventory empty';
    list.appendChild(empty);
    return;
  }

  for (const slot of inv.slots) {
    const row = document.createElement('div');
    row.className = 'inv-row';

    const def = ITEM_DEFS[slot.itemId];
    const assetDef = ASSET_DEFS[slot.itemId];
    const emoji = assetDef?.emoji || '❓';
    const name = def?.displayName || slot.itemId;

    row.innerHTML = `<span class="emoji">${emoji}</span> ${name} <span class="qty">×${slot.quantity}</span>`;
    row.title = def?.description || name;
    list.appendChild(row);
  }
}

// --- Debug ---

function syncDebug(show: boolean, pos: { x: number; y: number }, fps: number): void {
  const el = document.getElementById('debugOverlay');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (!show) return;
  el.innerHTML = [
    `FPS: ${fps}`,
    `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}`,
    `Chunk: ${Math.floor(pos.x / 32)},${Math.floor(pos.y / 32)}`,
  ].map((l) => `<span>${l}</span>`).join('');
}

// ─── HUD Button Wiring (call once after init) ───────────────

export function wireHudButtons(
  onInventory: () => void,
  onDebug: () => void,
  onSave: () => void,
): void {
  const btnInv = document.getElementById('btnInventory');
  const btnDbg = document.getElementById('btnDebug');
  const btnSave = document.getElementById('btnSave');
  const btnExpand = document.getElementById('btnExpand');
  const hudOverlay = document.getElementById('hudOverlay');

  btnInv?.addEventListener('click', onInventory);
  btnDbg?.addEventListener('click', onDebug);
  btnSave?.addEventListener('click', onSave);

  btnExpand?.addEventListener('click', () => {
    const expanded = hudOverlay?.classList.toggle('expanded');
    if (btnExpand) btnExpand.textContent = expanded ? '▼' : '▲';
  });
}
