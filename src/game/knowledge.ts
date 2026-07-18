/**
 * knowledge.ts - Book of Knowledge + Word Bag system.
 * Manages subject selection, article browsing, term saving, and quiz integration.
 * TODO: DOC - Book of Knowledge feature overview and user guide
 */

import {
  SUBJECTS,
  type SubjectId, type KnowledgeArticle,
} from '../config/knowledge.config';
import {
  getBookArticleById, searchBookArticles,
  getBookArticlesBySubject,
} from '../ui/book-content';
import { renderMarkdown, escapeHtml, renderBookImageFigure } from '../ui/markdown';

// ─── Types ───────────────────────────────────────────────────

export interface KnowledgeState {
  /** Selected subjects (persisted) */
  selectedSubjects: SubjectId[];
  /** Word Bag — saved unfamiliar terms */
  wordBag: SavedWord[];
  /** Currently reading article id */
  currentArticleId: string | null;
  /** Articles marked as read */
  readArticles: Set<string>;
  /** Discovery points earned from lookups */
  discoveryPoints: number;
  /** Whether subject selection has been completed */
  subjectsChosen: boolean;
  /** Book UI open? */
  bookOpen: boolean;
  /** Current search query */
  searchQuery: string;
  /** Active tab in book: 'browse' | 'wordbag' | 'search' */
  activeTab: 'browse' | 'wordbag' | 'search';
}

export interface SavedWord {
  term: string;
  /** Article where it was encountered */
  sourceArticleId?: string;
  /** When it was saved */
  savedAt: number;
  /** Has the player looked it up in the Book? */
  lookedUp: boolean;
}

// ─── State Management ────────────────────────────────────────

export function createKnowledgeState(): KnowledgeState {
  return {
    selectedSubjects: [],
    wordBag: [],
    currentArticleId: null,
    readArticles: new Set(),
    discoveryPoints: 0,
    subjectsChosen: false,
    bookOpen: false,
    searchQuery: '',
    activeTab: 'browse',
  };
}

// ─── Subject Selection ──────────────────────────────────────

export function toggleSubject(state: KnowledgeState, subjectId: SubjectId): void {
  const idx = state.selectedSubjects.indexOf(subjectId);
  if (idx >= 0) {
    state.selectedSubjects.splice(idx, 1);
  } else {
    if (state.selectedSubjects.length < SUBJECTS.length) {
      state.selectedSubjects.push(subjectId);
    }
  }
}

export function confirmSubjects(state: KnowledgeState): void {
  // Default to all subjects if none selected
  if (state.selectedSubjects.length === 0) {
    state.selectedSubjects = SUBJECTS.map(s => s.id);
  }
  state.subjectsChosen = true;
}

// ─── Book Browsing ──────────────────────────────────────────

export function getSubjectArticles(state: KnowledgeState): KnowledgeArticle[] {
  return getBookArticlesBySubject(
    state.selectedSubjects.length > 0 ? state.selectedSubjects : undefined
  );
}

export function openArticle(state: KnowledgeState, articleId: string): KnowledgeArticle | null {
  const article = getBookArticleById(articleId) ?? null;
  if (!article) return null;
  state.currentArticleId = articleId;
  if (!state.readArticles.has(articleId)) {
    state.readArticles.add(articleId);
    state.discoveryPoints += 5;
  }
  return article;
}

export function closeArticle(state: KnowledgeState): void {
  state.currentArticleId = null;
}

export function searchBook(state: KnowledgeState, query: string): KnowledgeArticle[] {
  state.searchQuery = query;
  return searchBookArticles(query, state.selectedSubjects.length > 0 ? state.selectedSubjects : undefined);
}

// ─── Word Bag ────────────────────────────────────────────────

export function saveWord(state: KnowledgeState, term: string, sourceArticleId?: string): boolean {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return false;
  // Don't add duplicates
  if (state.wordBag.some(w => w.term.toLowerCase() === normalized)) return false;
  state.wordBag.push({
    term: normalized,
    sourceArticleId,
    savedAt: Date.now(),
    lookedUp: false,
  });
  state.discoveryPoints += 2;
  return true;
}

export function removeWord(state: KnowledgeState, term: string): void {
  state.wordBag = state.wordBag.filter(w => w.term.toLowerCase() !== term.toLowerCase());
}

export function lookupWord(state: KnowledgeState, term: string): KnowledgeArticle[] {
  const word = state.wordBag.find(w => w.term.toLowerCase() === term.toLowerCase());
  if (word && !word.lookedUp) {
    word.lookedUp = true;
    state.discoveryPoints += 3;
  }
  return searchBookArticles(term, state.selectedSubjects.length > 0 ? state.selectedSubjects : undefined);
}

// ─── Book Toggle ─────────────────────────────────────────────

export function toggleBook(state: KnowledgeState): boolean {
  state.bookOpen = !state.bookOpen;
  if (!state.bookOpen) {
    state.currentArticleId = null;
    state.searchQuery = '';
  }
  return state.bookOpen;
}

// ─── Quiz Integration ───────────────────────────────────────

/**
 * Get quiz category bias weights based on selected subjects.
 * Maps SubjectId → QuizCategory for the quiz system.
 */
export function getQuizBias(state: KnowledgeState): Record<string, number> {
  const bias: Record<string, number> = {};
  // Map subjects to quiz categories
  const subjectToCategory: Record<SubjectId, string> = {
    math: 'math',
    science: 'science',
    history: 'history',
    language: 'language',
    technology: 'logic', // technology maps to logic quizzes
    geography: 'science', // geography maps to science quizzes for now
    art: 'language', // art maps to language quizzes for now
  };
  for (const s of state.selectedSubjects) {
    bias[subjectToCategory[s]] = 2; // 2x weight for selected subjects
  }
  return bias;
}

// ─── Key Terms Extraction ───────────────────────────────────

/** Get all key terms from articles matching selected subjects */
export function getAllKeyTerms(state: KnowledgeState): string[] {
  const articles = getSubjectArticles(state);
  const terms = new Set<string>();
  for (const a of articles) {
    for (const t of a.keyTerms) terms.add(t.toLowerCase());
  }
  return [...terms];
}

// ─── Persistence ─────────────────────────────────────────────

export interface KnowledgeSaveData {
  selectedSubjects: SubjectId[];
  wordBag: SavedWord[];
  readArticles: string[];
  discoveryPoints: number;
  subjectsChosen: boolean;
}

export function serializeKnowledge(state: KnowledgeState): KnowledgeSaveData {
  return {
    selectedSubjects: state.selectedSubjects,
    wordBag: state.wordBag,
    readArticles: [...state.readArticles],
    discoveryPoints: state.discoveryPoints,
    subjectsChosen: state.subjectsChosen,
  };
}

export function deserializeKnowledge(data: KnowledgeSaveData): Partial<KnowledgeState> {
  return {
    selectedSubjects: data.selectedSubjects || [],
    wordBag: data.wordBag || [],
    readArticles: new Set(data.readArticles || []),
    discoveryPoints: data.discoveryPoints || 0,
    subjectsChosen: data.subjectsChosen || false,
  };
}

// ─── DOM Rendering ───────────────────────────────────────────

/** Last paint signature — avoid wiping focus/scroll every frame */
let _bookPaintKey = '';
let _bookWasOpen = false;

function bookPaintKey(state: KnowledgeState): string {
  const words = state.wordBag.map((w) => `${w.term}:${w.lookedUp ? 1 : 0}`).join(',');
  const reads = [...state.readArticles].sort().join(',');
  return [
    state.bookOpen ? 1 : 0,
    state.activeTab,
    state.currentArticleId || '',
    state.searchQuery,
    state.discoveryPoints,
    state.selectedSubjects.join(','),
    words,
    reads,
  ].join('|');
}

function articleCardHtml(a: KnowledgeArticle, isRead: boolean, showSubjectIcon = false): string {
  const subject = SUBJECTS.find((s) => s.id === a.subject);
  const thumb = a.image?.url
    ? `<img class="book-card-thumb" src="${escapeHtml(a.image.url)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="book-card-thumb-ph" aria-hidden="true">${subject?.icon || '📖'}</div>`;
  const icon = showSubjectIcon
    ? `<span style="color:${subject?.color || '#fff'}">${subject?.icon || ''}</span> `
    : '';
  return `<div class="book-article-card ${isRead ? 'read' : ''}" data-article-id="${escapeHtml(a.id)}" role="button" tabindex="0">
    ${thumb}
    <div class="book-card-body">
      <div class="book-article-title">${icon}${escapeHtml(a.title)}${isRead ? ' ✓' : ''}</div>
      <div class="book-article-summary">${escapeHtml(a.summary)}</div>
      <span class="book-card-badge">${subject?.name || a.subject}${a.image ? ' · illustrated' : ''}</span>
    </div>
  </div>`;
}

function wireArticleCards(container: HTMLElement, state: KnowledgeState): void {
  container.querySelectorAll('.book-article-card').forEach((card) => {
    const open = () => {
      const id = (card as HTMLElement).dataset.articleId;
      if (id) openArticle(state, id);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        open();
      }
    });
  });
}

/**
 * Sync Book overlay DOM.
 * Called from renderUI — only repaints when book state actually changes
 * (so search focus and scroll position survive).
 */
export function syncBookUI(state: KnowledgeState): void {
  const overlay = document.getElementById('bookOverlay');
  if (!overlay) return;

  if (!state.bookOpen) {
    if (_bookWasOpen) {
      overlay.style.display = 'none';
      _bookWasOpen = false;
      _bookPaintKey = '';
    }
    return;
  }

  overlay.style.display = 'flex';
  _bookWasOpen = true;

  const key = bookPaintKey(state);
  if (key === _bookPaintKey) {
    updateTabHighlights(state);
    return;
  }
  _bookPaintKey = key;

  const content = document.getElementById('bookContent');
  if (!content) return;

  if (state.currentArticleId) {
    const article = getBookArticleById(state.currentArticleId);
    if (article) {
      renderArticleView(content, article, state);
      updateTabHighlights(state);
      return;
    }
  }

  switch (state.activeTab) {
    case 'browse':
      renderBrowseView(content, state);
      break;
    case 'wordbag':
      renderWordBagView(content, state);
      break;
    case 'search':
      renderSearchView(content, state);
      break;
  }

  updateTabHighlights(state);
}

function renderBrowseView(container: HTMLElement, state: KnowledgeState): void {
  const articles = getSubjectArticles(state);
  const subjectGroups = new Map<SubjectId, KnowledgeArticle[]>();

  for (const a of articles) {
    const group = subjectGroups.get(a.subject) || [];
    group.push(a);
    subjectGroups.set(a.subject, group);
  }

  let html = `<div class="book-toolbar">
    <span style="font:11px monospace;color:#9a8ab8">${articles.length} articles · offline images</span>
    <div class="book-points">✦ ${state.discoveryPoints} discovery</div>
  </div>`;

  let body = '';
  for (const subject of SUBJECTS) {
    const group = subjectGroups.get(subject.id);
    if (!group || group.length === 0) continue;

    body += `<div class="book-subject-group">
      <div class="book-subject-header" style="color:${subject.color}">${subject.icon} ${subject.name}
        <span style="opacity:0.55;font-weight:normal"> · ${group.length}</span>
      </div>
      <div class="book-card-grid">`;

    for (const a of group) {
      body += articleCardHtml(a, state.readArticles.has(a.id));
    }
    body += '</div></div>';
  }

  if (!body) {
    body = `<div class="book-empty">
      <div style="font-size:28px;margin-bottom:8px">📚</div>
      <div>No articles for your subjects yet.</div>
      <div style="margin-top:8px;font-size:11px;color:#7a7090">Pick subjects at the start, or switch tabs to search the whole codex.</div>
    </div>`;
  }

  container.innerHTML = html + body;
  wireArticleCards(container, state);
}

function renderArticleView(container: HTMLElement, article: KnowledgeArticle, state: KnowledgeState): void {
  const subject = SUBJECTS.find((s) => s.id === article.subject);
  const formattedContent = renderMarkdown(article.content);
  const heroImageHtml = article.image ? renderBookImageFigure(article.image) : '';

  let keyTermsHtml = '';
  if (article.keyTerms.length > 0) {
    keyTermsHtml = `<div class="book-key-terms">
      <span class="book-terms-label">Key terms · tap + to save</span>
      ${article.keyTerms
        .map((t) => {
          const inBag = state.wordBag.some((w) => w.term.toLowerCase() === t.toLowerCase());
          return `<span class="book-term ${inBag ? 'saved' : ''}" data-term="${escapeHtml(t)}">${escapeHtml(t)} ${inBag ? '✓' : '+'}</span>`;
        })
        .join('')}
    </div>`;
  }

  let relatedHtml = '';
  if (article.related && article.related.length > 0) {
    const relatedArticles = article.related.map((id) => getBookArticleById(id)).filter(Boolean);
    if (relatedArticles.length > 0) {
      relatedHtml = `<div class="book-related">
        <span class="book-related-label">Keep reading</span>
        ${relatedArticles
          .map(
            (a) =>
              `<span class="book-related-link" data-article-id="${escapeHtml(a!.id)}">${escapeHtml(a!.title)}</span>`,
          )
          .join('')}
      </div>`;
    }
  }

  container.innerHTML = `
    <div class="book-article-view">
      <div class="book-back" id="bookBack" role="button" tabindex="0">← Back to shelves</div>
      <div class="book-article-header">
        <span style="color:${subject?.color || '#fff'};font-size:22px">${subject?.icon || '📖'}</span>
        <span class="book-article-full-title">${escapeHtml(article.title)}</span>
      </div>
      ${heroImageHtml}
      <div class="book-article-body">${formattedContent}</div>
      ${keyTermsHtml}
      ${relatedHtml}
    </div>
  `;

  const back = document.getElementById('bookBack');
  back?.addEventListener('click', () => closeArticle(state));
  back?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeArticle(state);
    }
  });

  container.querySelectorAll('.book-term:not(.saved)').forEach((el) => {
    el.addEventListener('click', () => {
      const term = (el as HTMLElement).dataset.term;
      if (term && saveWord(state, term, article.id)) {
        el.classList.add('saved');
        el.textContent = term + ' ✓';
        _bookPaintKey = ''; // allow next sync to pick up word bag if open later
      }
    });
  });

  container.querySelectorAll('.book-related-link').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.articleId;
      if (id) openArticle(state, id);
    });
  });

  // Fresh page: scroll to top of article
  container.scrollTop = 0;
}

function renderWordBagView(container: HTMLElement, state: KnowledgeState): void {
  if (state.wordBag.length === 0) {
    container.innerHTML = `
      <div class="book-toolbar"><div class="book-points">✦ ${state.discoveryPoints} discovery</div></div>
      <div class="book-empty">
        <div style="font-size:28px;margin-bottom:8px">🎒</div>
        <div>Your Word Bag is empty</div>
        <div style="margin-top:8px;font-size:11px;color:#7a7090">
          Open an article and tap <strong style="color:#c8b8e8">+</strong> on a key term to save it.
        </div>
      </div>
    `;
    return;
  }

  let html = `<div class="book-toolbar">
    <span class="wordbag-count">${state.wordBag.length} word${state.wordBag.length !== 1 ? 's' : ''} saved</span>
    <div class="book-points">✦ ${state.discoveryPoints} discovery</div>
  </div>`;

  for (const word of state.wordBag) {
    html += `<div class="wordbag-entry">
      <span class="wordbag-term">${escapeHtml(word.term)}</span>
      <span class="wordbag-actions">
        <span class="wordbag-lookup ${word.lookedUp ? 'looked-up' : ''}" data-term="${escapeHtml(word.term)}" title="Look up in Book">🔍</span>
        <span class="wordbag-remove" data-term="${escapeHtml(word.term)}" title="Remove from bag">✕</span>
      </span>
    </div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.wordbag-lookup').forEach((el) => {
    el.addEventListener('click', () => {
      const term = (el as HTMLElement).dataset.term;
      if (term) {
        const results = lookupWord(state, term);
        if (results.length > 0) openArticle(state, results[0].id);
      }
    });
  });

  container.querySelectorAll('.wordbag-remove').forEach((el) => {
    el.addEventListener('click', () => {
      const term = (el as HTMLElement).dataset.term;
      if (term) removeWord(state, term);
    });
  });
}

function renderSearchView(container: HTMLElement, state: KnowledgeState): void {
  const results = state.searchQuery ? searchBookArticles(
    state.searchQuery,
    state.selectedSubjects.length > 0 ? state.selectedSubjects : undefined,
  ) : [];

  let html = `<div class="book-search-box">
    <input type="text" id="bookSearchInput" class="book-search-input"
      placeholder="Search titles, summaries, key terms…"
      value="${escapeHtml(state.searchQuery)}"
      autocomplete="off" spellcheck="false" />
    <div class="book-search-hint">Tip: try “moon”, “ocean”, “fraction”, or “rocket”</div>
  </div>`;

  if (!state.searchQuery.trim()) {
    html += `<div class="book-empty">
      <div style="font-size:28px;margin-bottom:8px">🔍</div>
      <div>Search the whole codex</div>
      <div style="margin-top:8px;font-size:11px;color:#7a7090">Type a word above — results update as you type.</div>
    </div>`;
  } else if (results.length === 0) {
    html += '<div class="book-empty">No articles match. Try a shorter keyword!</div>';
  } else {
    html += `<div class="book-toolbar"><span style="font:11px monospace;color:#9a8ab8">${results.length} result${results.length !== 1 ? 's' : ''}</span></div>`;
    html += '<div class="book-card-grid">';
    for (const a of results) {
      html += articleCardHtml(a, state.readArticles.has(a.id), true);
    }
    html += '</div>';
  }

  container.innerHTML = html;

  const searchInput = document.getElementById('bookSearchInput') as HTMLInputElement | null;
  if (searchInput) {
    const caret = searchInput.value.length;
    searchInput.focus();
    try {
      searchInput.setSelectionRange(caret, caret);
    } catch {
      /* ignore */
    }
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      // Force repaint on next sync
      _bookPaintKey = '';
    });
  }

  wireArticleCards(container, state);
}

function updateTabHighlights(state: KnowledgeState): void {
  document.querySelectorAll('.book-tab').forEach(tab => {
    const tabName = (tab as HTMLElement).dataset.tab;
    tab.classList.toggle('active', tabName === state.activeTab);
  });
}

/**
 * Initialize Book UI event listeners.
 * Call once after DOM is ready.
 * @param onClose - optional callback when book is closed (e.g., to unpause game)
 */
export function wireBookUI(state: KnowledgeState, onClose?: () => void): void {
  // Tab buttons
  document.querySelectorAll('.book-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as KnowledgeState['activeTab'];
      if (tabName) {
        state.activeTab = tabName;
        state.currentArticleId = null;
      }
    });
  });

  // Close button
  document.getElementById('bookClose')?.addEventListener('click', () => {
    state.bookOpen = false;
    state.currentArticleId = null;
    if (onClose) onClose();
  });
}

// ─── Subject Selection UI ────────────────────────────────────

/**
 * Show subject selection overlay. Returns promise that resolves when confirmed.
 */
export function showSubjectSelection(state: KnowledgeState): Promise<void> {
  return new Promise(resolve => {
    const overlay = document.getElementById('subjectOverlay');
    if (!overlay) { resolve(); return; }

    overlay.style.display = 'flex';
    renderSubjectCheckboxes(state);

    const confirmBtn = document.getElementById('subjectConfirm');
    const listener = () => {
      confirmSubjects(state);
      overlay.style.display = 'none';
      confirmBtn?.removeEventListener('click', listener);
      resolve();
    };
    confirmBtn?.addEventListener('click', listener);
  });
}

function renderSubjectCheckboxes(state: KnowledgeState): void {
  const container = document.getElementById('subjectList');
  if (!container) return;

  container.innerHTML = SUBJECTS.map(s => {
    const checked = state.selectedSubjects.includes(s.id);
    return `<label class="subject-option ${checked ? 'selected' : ''}" data-subject="${s.id}">
      <span class="subject-check">${checked ? '☑' : '☐'}</span>
      <span class="subject-icon">${s.icon}</span>
      <span class="subject-info">
        <span class="subject-name">${s.name}</span>
        <span class="subject-desc">${s.description}</span>
      </span>
    </label>`;
  }).join('');

  // Wire toggle
  container.querySelectorAll('.subject-option').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.subject as SubjectId;
      if (id) {
        toggleSubject(state, id);
        renderSubjectCheckboxes(state); // Re-render
      }
    });
  });
}
