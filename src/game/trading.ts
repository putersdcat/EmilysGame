/**
 * trading.ts - NPC Trade panel state machine + DOM sync.
 * Opens after NPC dialog when trades are available.
 * Keyboard: ↑↓ navigate, Space/Enter buy, Escape close.
 * TODO: DOC - trading system API
 */

import type { NpcPersona, NpcTrade } from '../config/npc.config';
import type { Inventory } from './inventory';
import { ITEM_DEFS } from '../config/items.config';

// ─── Types ───────────────────────────────────────────────────

/** Barter quiz question (#112 Phase 3) */
export interface BarterQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  itemName: string;
  /** Discount applied if answered correctly (fraction off price) */
  discount: number;
}

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
  /** Active barter quiz — if set, trade is pending quiz answer (#112 Phase 3) */
  barterQuiz: BarterQuestion | null;
  /** Index of selected barter answer */
  barterSelectedIndex: number;
  /** Total barter quizzes triggered */
  barterQuizCount: number;
  /** Total barter quizzes answered correctly */
  barterCorrectCount: number;
}

export type TradeResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// ─── State ───────────────────────────────────────────────────

/** Sell-back price ratio: items sell for 60% of their buy cost */
const SELL_RATIO = 0.6;

/** Items that cannot be sold */
const UNSELLABLE = new Set(['coin']);

/** Barter quiz trigger chance (30%) — #112 Phase 3 */
const BARTER_QUIZ_CHANCE = 0.30;
/** Discount for correct barter answer (10%) */
const BARTER_DISCOUNT = 0.10;

export function createTradeState(): TradeState {
  return {
    active: false,
    persona: null,
    trades: [],
    selectedIndex: 0,
    lastResult: null,
    lastResultAt: 0,
    mode: 'buy',
    barterQuiz: null,
    barterSelectedIndex: 0,
    barterQuizCount: 0,
    barterCorrectCount: 0,
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
  ts.barterQuiz = null;
  ts.barterSelectedIndex = 0;
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
  ts.barterQuiz = null;
  ts.barterSelectedIndex = 0;
}

export function tradeNavigate(ts: TradeState, dir: 'up' | 'down'): void {
  if (!ts.active) return;
  const maxIdx = ts.trades.length;  // works for buy mode; sell mode clamped in syncTradeDOM
  if (dir === 'up') {
    ts.selectedIndex = ts.selectedIndex <= 0 ? Math.max(0, maxIdx - 1) : ts.selectedIndex - 1;
  } else {
    ts.selectedIndex = ts.selectedIndex >= maxIdx - 1 ? 0 : ts.selectedIndex + 1;
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

// ─── Barter Quiz System (#112 Phase 3) ──────────────────────

/** Generate a barter quiz question about item value */
export function generateBarterQuiz(itemName: string, actualPrice: number): BarterQuestion {
  // Random question type
  const type = Math.floor(Math.random() * 3);
  if (type === 0) {
    // "Is this worth X coins?" — correct is Yes if X matches
    const isCorrect = Math.random() < 0.5;
    const shownPrice = isCorrect ? actualPrice : actualPrice + (Math.random() < 0.5 ? Math.ceil(actualPrice * 0.3) : -Math.floor(actualPrice * 0.3));
    return {
      question: `Is a ${itemName} worth ${shownPrice} coins?`,
      options: ['Yes, that\'s right!', 'No, that\'s wrong!'],
      correctIndex: isCorrect ? 0 : 1,
      itemName,
      discount: BARTER_DISCOUNT,
    };
  } else if (type === 1) {
    // Multiple choice: "How much is X worth?"
    const wrong1 = Math.max(1, actualPrice + Math.ceil(Math.random() * 3));
    const wrong2 = Math.max(1, actualPrice - Math.ceil(Math.random() * 2));
    const options = [
      `${actualPrice} coins`,
      `${wrong1} coins`,
      `${wrong2} coins`,
    ];
    // Shuffle options deterministically
    const correctLabel = options[0];
    options.sort(() => Math.random() - 0.5);
    return {
      question: `How much is a ${itemName} worth?`,
      options,
      correctIndex: options.indexOf(correctLabel),
      itemName,
      discount: BARTER_DISCOUNT,
    };
  } else {
    // Comparison: "Which costs more?"
    const otherPrice = Math.max(1, actualPrice + (Math.random() < 0.5 ? 2 : -2));
    const otherItem = actualPrice > otherPrice ? 'a wooden stick' : 'a magic gem';
    return {
      question: `Which costs more: a ${itemName} or ${otherItem}?`,
      options: [itemName, otherItem],
      correctIndex: actualPrice >= otherPrice ? 0 : 1,
      itemName,
      discount: BARTER_DISCOUNT,
    };
  }
}

/** Check if barter quiz should trigger (30% chance) */
export function shouldTriggerBarter(): boolean {
  return Math.random() < BARTER_QUIZ_CHANCE;
}

/** Navigate barter quiz answer selection */
export function barterNavigate(ts: TradeState, dir: 'up' | 'down'): void {
  if (!ts.barterQuiz) return;
  const maxIdx = ts.barterQuiz.options.length - 1;
  if (dir === 'up') {
    ts.barterSelectedIndex = Math.max(0, ts.barterSelectedIndex - 1);
  } else {
    ts.barterSelectedIndex = Math.min(maxIdx, ts.barterSelectedIndex + 1);
  }
}

/** Submit barter quiz answer. Returns discount fraction if correct, 0 if wrong. */
export function submitBarterAnswer(ts: TradeState): { correct: boolean; discount: number; feedback: string } {
  if (!ts.barterQuiz) return { correct: false, discount: 0, feedback: '' };
  const quiz = ts.barterQuiz;
  const correct = ts.barterSelectedIndex === quiz.correctIndex;
  ts.barterQuizCount++;
  if (correct) ts.barterCorrectCount++;
  const feedback = correct
    ? `✅ Correct! You saved ${Math.round(quiz.discount * 100)}%!`
    : `❌ Not quite! The right answer was: ${quiz.options[quiz.correctIndex]}`;
  ts.barterQuiz = null;
  ts.barterSelectedIndex = 0;
  return { correct, discount: correct ? quiz.discount : 0, feedback };
}

/** NPC personality-driven trade dialog (#112 Phase 3) */
export function getTradeDialog(persona: NpcPersona | null, result: TradeResult): string {
  if (!persona) return result.message;
  const dn = persona.displayName.toLowerCase();
  if (result.ok) {
    if (dn.includes('chef') || dn.includes('snack')) return `🎉 Great choice! ${result.message}`;
    if (dn.includes('trader') || dn.includes('trading')) return `🤝 Fair deal! ${result.message}`;
    if (dn.includes('keeper') || dn.includes('general')) return `👍 Pleasure doing business! ${result.message}`;
    return `😊 ${result.message}`;
  } else {
    if (dn.includes('chef') || dn.includes('snack')) return `😅 Sorry, maybe next time! ${result.message}`;
    if (dn.includes('trader')) return `🤨 Hmm, can't do that one. ${result.message}`;
    if (dn.includes('keeper')) return `😐 ${result.message}`;
    return `😕 ${result.message}`;
  }
}

/** Sync barter quiz DOM overlay */
export function syncBarterQuizDOM(ts: TradeState): void {
  const overlay = document.getElementById('barterQuizOverlay');
  if (!overlay) return;

  if (!ts.barterQuiz) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'flex';
  const quiz = ts.barterQuiz;

  overlay.innerHTML = `
    <div class="barter-modal">
      <h3>💰 Barter Challenge!</h3>
      <p class="barter-question">${quiz.question}</p>
      <div class="barter-options">
        ${quiz.options.map((opt, i) => `
          <button class="barter-option${i === ts.barterSelectedIndex ? ' selected' : ''}" 
                  data-idx="${i}">
            ${opt}
          </button>
        `).join('')}
      </div>
      <div class="barter-hint">↑↓ Choose · Space Submit</div>
    </div>
  `;

  overlay.querySelectorAll('.barter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      ts.barterSelectedIndex = parseInt((btn as HTMLElement).dataset.idx ?? '0');
      syncBarterQuizDOM(ts);
    });
  });
}
