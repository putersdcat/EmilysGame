/**
 * trading.ts - NPC Trade panel state machine + DOM sync.
 * Opens after NPC dialog when trades are available.
 * Keyboard: ↑↓ navigate, Space/Enter buy, Escape close.
 * TODO: DOC - trading system API
 */

import type { NpcPersona, NpcTrade } from './config/npc.config';
import type { Inventory } from './inventory';
import { ITEM_DEFS } from './config/items.config';

// ─── Types ───────────────────────────────────────────────────

export interface TradeState {
  active: boolean;
  persona: NpcPersona | null;
  trades: NpcTrade[];
  selectedIndex: number;
  /** Last transaction result for feedback display */
  lastResult: TradeResult | null;
  /** Timestamp of last result (for auto-clear) */
  lastResultAt: number;
}

export type TradeResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// ─── State ───────────────────────────────────────────────────

export function createTradeState(): TradeState {
  return {
    active: false,
    persona: null,
    trades: [],
    selectedIndex: 0,
    lastResult: null,
    lastResultAt: 0,
  };
}

// ─── Actions ─────────────────────────────────────────────────

export function openTrade(ts: TradeState, persona: NpcPersona): boolean {
  if (!persona.trades.length) return false;
  ts.active = true;
  ts.persona = persona;
  ts.trades = persona.trades;
  ts.selectedIndex = 0;
  ts.lastResult = null;
  ts.lastResultAt = 0;
  return true;
}

export function closeTrade(ts: TradeState): void {
  ts.active = false;
  ts.persona = null;
  ts.trades = [];
  ts.selectedIndex = 0;
  ts.lastResult = null;
  ts.lastResultAt = 0;
}

export function tradeNavigate(ts: TradeState, dir: 'up' | 'down'): void {
  if (!ts.active || ts.trades.length === 0) return;
  if (dir === 'up') {
    ts.selectedIndex = (ts.selectedIndex - 1 + ts.trades.length) % ts.trades.length;
  } else {
    ts.selectedIndex = (ts.selectedIndex + 1) % ts.trades.length;
  }
}

/**
 * Attempt to execute the currently selected trade.
 * Returns a TradeResult for UI feedback.
 */
export function executeTrade(ts: TradeState, inventory: Inventory): TradeResult {
  if (!ts.active || ts.trades.length === 0) {
    const r: TradeResult = { ok: false, message: 'No trade available' };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }

  const trade = ts.trades[ts.selectedIndex];

  // Check affordability
  if (trade.wants === 'coin') {
    const coins = inventory.countItem('coin');
    if (coins < trade.cost) {
      const r: TradeResult = { ok: false, message: `Not enough coins! Need ${trade.cost}, have ${coins}` };
      ts.lastResult = r;
      ts.lastResultAt = Date.now();
      return r;
    }
  } else {
    const count = inventory.countItem(trade.wants);
    if (count < trade.cost) {
      const wantDef = ITEM_DEFS[trade.wants];
      const wantName = wantDef?.displayName || trade.wants;
      const r: TradeResult = { ok: false, message: `Need ${trade.cost} ${wantName}, have ${count}` };
      ts.lastResult = r;
      ts.lastResultAt = Date.now();
      return r;
    }
  }

  // Check if inventory can hold the item
  const giveDef = ITEM_DEFS[trade.gives];
  const giveCount = inventory.countItem(trade.gives);
  if (giveDef && !giveDef.stackable && giveCount >= 1) {
    const r: TradeResult = { ok: false, message: `Already have ${giveDef.displayName}!` };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }
  if (giveDef && giveDef.stackable && giveCount >= giveDef.maxStack) {
    const r: TradeResult = { ok: false, message: `${giveDef.displayName} stack is full!` };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }

  // Execute: remove cost, add item
  inventory.removeItem(trade.wants === 'coin' ? 'coin' : trade.wants, trade.cost);
  const added = inventory.addItem(trade.gives, 1);

  if (!added) {
    // Rollback — shouldn't happen if checks above passed
    inventory.addItem(trade.wants === 'coin' ? 'coin' : trade.wants, trade.cost);
    const r: TradeResult = { ok: false, message: 'Inventory full!' };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }

  const itemName = giveDef?.displayName || trade.gives;
  const r: TradeResult = { ok: true, message: `Bought ${itemName}!` };
  ts.lastResult = r;
  ts.lastResultAt = Date.now();
  return r;
}

// ─── DOM Sync ────────────────────────────────────────────────

const RESULT_DISPLAY_MS = 2000;

export function syncTradeDOM(ts: TradeState, inventory: Inventory): void {
  const overlay = document.getElementById('tradeOverlay');
  if (!overlay) return;

  if (!ts.active) {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';

  const nameEl = document.getElementById('tradeNpcName');
  const coinsEl = document.getElementById('tradeCoins');
  const listEl = document.getElementById('tradeList');
  const resultEl = document.getElementById('tradeResult');
  const hintEl = document.getElementById('tradeHint');

  if (nameEl && ts.persona) {
    nameEl.textContent = `${ts.persona.displayName}'s Shop`;
  }

  if (coinsEl) {
    coinsEl.textContent = `💰 ${inventory.countItem('coin')} coins`;
  }

  if (listEl) {
    listEl.innerHTML = '';
    ts.trades.forEach((trade, i) => {
      const div = document.createElement('div');
      div.className = 'trade-item';
      const selected = i === ts.selectedIndex;
      if (selected) div.classList.add('selected');

      // Affordability check
      const canAfford = trade.wants === 'coin'
        ? inventory.countItem('coin') >= trade.cost
        : inventory.countItem(trade.wants) >= trade.cost;
      if (!canAfford) div.classList.add('unaffordable');

      const giveDef = ITEM_DEFS[trade.gives];
      const giveEmoji = getItemEmoji(trade.gives);
      const marker = selected ? '▸ ' : '  ';
      const costText = trade.wants === 'coin'
        ? `💰${trade.cost}`
        : `${trade.cost}× ${ITEM_DEFS[trade.wants]?.displayName || trade.wants}`;

      div.textContent = `${marker}${giveEmoji} ${giveDef?.displayName || trade.gives} — ${costText}`;
      listEl.appendChild(div);
    });
  }

  // Transaction result feedback
  if (resultEl) {
    if (ts.lastResult && (Date.now() - ts.lastResultAt) < RESULT_DISPLAY_MS) {
      resultEl.textContent = ts.lastResult.ok
        ? `✅ ${ts.lastResult.message}`
        : `❌ ${ts.lastResult.message}`;
      resultEl.style.color = ts.lastResult.ok ? '#4caf50' : '#f44336';
    } else {
      resultEl.textContent = '';
    }
  }

  if (hintEl) {
    hintEl.textContent = '↑↓ Browse  ·  Space Buy  ·  Esc Close';
  }
}

// ─── Helpers ─────────────────────────────────────────────────

const ITEM_EMOJI: Record<string, string> = {
  coin: '💰',
  key: '🔑',
  crowbar: '🔧',
  potion: '⚗️',
  mushroom: '🍄',
  bandage: '🩹',
  water: '💧',
  snack: '🍎',
  map_scroll: '🗺️',
  torch: '🔥',
};

function getItemEmoji(itemId: string): string {
  return ITEM_EMOJI[itemId] || '📦';
}
