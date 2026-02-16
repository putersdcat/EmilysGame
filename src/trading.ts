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
  /** Current trade mode: buy or sell (#112) */
  mode: 'buy' | 'sell';
}

export type TradeResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// ─── State ───────────────────────────────────────────────────

/** Sell-back price ratio: items sell for 60% of their buy cost */
const SELL_RATIO = 0.6;

/** Items that cannot be sold */
const UNSELLABLE = new Set(['coin']);

export function createTradeState(): TradeState {
  return {
    active: false,
    persona: null,
    trades: [],
    selectedIndex: 0,
    lastResult: null,
    lastResultAt: 0,
    mode: 'buy',
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
  ts.mode = 'buy';
  return true;
}

export function closeTrade(ts: TradeState): void {
  ts.active = false;
  ts.persona = null;
  ts.trades = [];
  ts.selectedIndex = 0;
  ts.mode = 'buy';
  ts.lastResult = null;
  ts.lastResultAt = 0;
}

export function tradeNavigate(ts: TradeState, dir: 'up' | 'down'): void {
  if (!ts.active) return;
  // In buy mode, navigate trades; in sell mode, navigate player items
  // Navigation count is handled by syncTradeDOM (which reads selectedIndex)
  // Just clamp here
  if (dir === 'up') {
    ts.selectedIndex = Math.max(0, ts.selectedIndex - 1);
  } else {
    ts.selectedIndex = ts.selectedIndex + 1; // clamped during render
  }
}

/**
 * Toggle between buy and sell mode (#112).
 */
export function toggleTradeMode(ts: TradeState): void {
  if (!ts.active) return;
  ts.mode = ts.mode === 'buy' ? 'sell' : 'buy';
  ts.selectedIndex = 0;
  ts.lastResult = null;
  ts.lastResultAt = 0;
}

/**
 * Get sell price for an item (based on cheapest trade cost in current shop).
 * Returns 0 if not sellable.
 */
export function getSellPrice(itemId: string, ts: TradeState): number {
  if (UNSELLABLE.has(itemId)) return 0;
  // Find the buy cost from this shop's trades
  const trade = ts.trades.find(t => t.gives === itemId && t.wants === 'coin');
  if (trade) {
    return Math.max(1, Math.floor(trade.cost * SELL_RATIO));
  }
  // Default sell value for items not sold in this shop
  const def = ITEM_DEFS[itemId];
  if (!def) return 0;
  // Base value estimate from item rarity
  return 1;
}

/**
 * Get list of sellable items from player inventory.
 */
export function getSellableItems(inventory: Inventory): { itemId: string; quantity: number; displayName: string }[] {
  return inventory.serialize()
    .filter(s => !UNSELLABLE.has(s.itemId) && s.quantity > 0)
    .map(s => ({
      itemId: s.itemId,
      quantity: s.quantity,
      displayName: ITEM_DEFS[s.itemId]?.displayName || s.itemId,
    }));
}

/**
 * Execute sell at current selectedIndex (#112).
 */
export function executeSell(ts: TradeState, inventory: Inventory): TradeResult {
  if (!ts.active || ts.mode !== 'sell') {
    const r: TradeResult = { ok: false, message: 'Not in sell mode' };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }

  const sellable = getSellableItems(inventory);
  if (ts.selectedIndex >= sellable.length) {
    const r: TradeResult = { ok: false, message: 'Nothing to sell' };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }

  const item = sellable[ts.selectedIndex];
  const price = getSellPrice(item.itemId, ts);
  if (price <= 0) {
    const r: TradeResult = { ok: false, message: `Can't sell ${item.displayName}` };
    ts.lastResult = r;
    ts.lastResultAt = Date.now();
    return r;
  }

  // Remove item, add coins
  inventory.removeItem(item.itemId, 1);
  inventory.addItem('coin', price);

  const r: TradeResult = { ok: true, message: `Sold ${item.displayName} for ${price} coins!` };
  ts.lastResult = r;
  ts.lastResultAt = Date.now();

  // Re-clamp selectedIndex
  const newSellable = getSellableItems(inventory);
  if (ts.selectedIndex >= newSellable.length) {
    ts.selectedIndex = Math.max(0, newSellable.length - 1);
  }

  return r;
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
    const modeLabel = ts.mode === 'buy' ? '🛒 Buy' : '💰 Sell';
    nameEl.textContent = `${ts.persona.displayName}'s Shop — ${modeLabel}`;
  }

  if (coinsEl) {
    coinsEl.textContent = `💰 ${inventory.countItem('coin')} coins`;
  }

  if (listEl) {
    listEl.innerHTML = '';

    if (ts.mode === 'buy') {
      // Buy mode: show merchant's trade items
      ts.trades.forEach((trade, i) => {
        const div = document.createElement('div');
        div.className = 'trade-item';
        const selected = i === ts.selectedIndex;
        if (selected) div.classList.add('selected');

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
    } else {
      // Sell mode (#112): show player's sellable items
      const sellable = getSellableItems(inventory);
      // Clamp selectedIndex
      if (ts.selectedIndex >= sellable.length) {
        ts.selectedIndex = Math.max(0, sellable.length - 1);
      }

      if (sellable.length === 0) {
        const div = document.createElement('div');
        div.className = 'trade-item';
        div.style.color = '#666';
        div.textContent = '  Nothing to sell';
        listEl.appendChild(div);
      } else {
        sellable.forEach((item, i) => {
          const div = document.createElement('div');
          div.className = 'trade-item';
          const selected = i === ts.selectedIndex;
          if (selected) div.classList.add('selected');

          const emoji = getItemEmoji(item.itemId);
          const price = getSellPrice(item.itemId, ts);
          const marker = selected ? '▸ ' : '  ';
          div.textContent = `${marker}${emoji} ${item.displayName} ×${item.quantity} → 💰${price}`;
          listEl.appendChild(div);
        });
      }
    }
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
    const modeAction = ts.mode === 'buy' ? 'Space Buy' : 'Space Sell';
    hintEl.textContent = `↑↓ Browse  ·  ${modeAction}  ·  Tab Buy/Sell  ·  Esc Close`;
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
  soap: '🧼',
};

function getItemEmoji(itemId: string): string {
  return ITEM_EMOJI[itemId] || '📦';
}
