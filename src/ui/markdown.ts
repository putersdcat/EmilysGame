/**
 * markdown.ts - Safe, lightweight markdown-to-HTML renderer.
 * Supports the subset used by Book of Knowledge articles:
 *   - **bold** text
 *   - *italic* text
 *   - Paragraphs (double newline)
 *   - Unordered lists (- or • prefix)
 *   - Ordered lists (1. 2. 3. prefix)
 *   - **Header:** patterns (bold text ending in colon → <h4>)
 *   - Images: ![alt](url) — only allow-listed URL prefixes
 *   - Inline emoji preserved
 *
 * All output is sanitized through a strict allow-list.
 */

// ─── Safe image URLs (Book illustrations) ───────────────────

/**
 * Offline-first: Book images must live under the game origin content tree.
 * No remote http(s) hosts — packs ship files in public/content/… so the game
 * stays playable with no network.
 */
export const BOOK_IMAGE_ALLOWLIST: readonly string[] = [
  '/content/',
  'content/',
];

/**
 * Return true if `url` is safe to use in a Book <img src>.
 */
export function isAllowedBookImageUrl(url: string): boolean {
  const u = (url || '').trim();
  if (!u) return false;
  // Block remote / script / data abuse — offline-only pack assets
  if (/^\s*javascript:/i.test(u) || /^\s*data:/i.test(u)) return false;
  if (/^\s*https?:\/\//i.test(u)) return false;
  return BOOK_IMAGE_ALLOWLIST.some((prefix) => u.startsWith(prefix));
}

/**
 * Render a markdown-subset string to sanitized HTML.
 * Input should be article.content from knowledge config or content pack.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  // Split into paragraphs on double-newline
  const paragraphs = text.split(/\n{2,}/);
  const blocks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');

    // Standalone image paragraph: ![alt](url)
    if (lines.length === 1) {
      const imgHtml = tryParseImageLine(lines[0].trim());
      if (imgHtml) {
        blocks.push(imgHtml);
        continue;
      }
    }

    // Check if this paragraph is entirely a list
    const listResult = tryParseList(lines);
    if (listResult) {
      blocks.push(listResult);
      continue;
    }

    // Check if first line is a standalone bold header followed by list items
    const headerListResult = tryParseHeaderWithList(lines);
    if (headerListResult) {
      blocks.push(headerListResult);
      continue;
    }

    // Regular paragraph — apply inline formatting (including inline images)
    const formattedLines = lines.map((l) => formatInline(l.trim()));
    blocks.push(`<p>${formattedLines.join('<br>')}</p>`);
  }

  return blocks.join('');
}

// ─── List Detection ─────────────────────────────────────────

const UL_RE = /^[-•]\s+(.+)$/;
const OL_RE = /^(\d+)[.)]\s+(.+)$/;
const IMG_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

function isUnorderedListLine(line: string): boolean {
  return UL_RE.test(line.trim());
}

function isOrderedListLine(line: string): boolean {
  return OL_RE.test(line.trim());
}

function tryParseImageLine(line: string): string | null {
  const m = line.match(IMG_RE);
  if (!m) return null;
  const alt = m[1];
  const url = m[2].trim();
  if (!isAllowedBookImageUrl(url)) return null;
  return (
    `<figure class="book-md-figure">` +
    `<img class="book-md-img" src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" />` +
    `</figure>`
  );
}

function tryParseList(lines: string[]): string | null {
  if (lines.every((l) => isUnorderedListLine(l))) {
    const items = lines.map((l) => {
      const m = l.trim().match(UL_RE);
      return `<li>${formatInline(m![1])}</li>`;
    });
    return `<ul>${items.join('')}</ul>`;
  }

  if (lines.every((l) => isOrderedListLine(l))) {
    const items = lines.map((l) => {
      const m = l.trim().match(OL_RE);
      return `<li>${formatInline(m![2])}</li>`;
    });
    return `<ol>${items.join('')}</ol>`;
  }

  return null;
}

function tryParseHeaderWithList(lines: string[]): string | null {
  if (lines.length < 2) return null;

  const firstLine = lines[0].trim();
  const headerMatch = firstLine.match(/^\*\*(.+?):\*\*\s*$/);
  if (!headerMatch) return null;

  const restLines = lines.slice(1);

  if (restLines.every((l) => isUnorderedListLine(l))) {
    const items = restLines.map((l) => {
      const m = l.trim().match(UL_RE);
      return `<li>${formatInline(m![1])}</li>`;
    });
    return `<h4>${formatInline(headerMatch[1])}</h4><ul>${items.join('')}</ul>`;
  }

  if (restLines.every((l) => isOrderedListLine(l))) {
    const items = restLines.map((l) => {
      const m = l.trim().match(OL_RE);
      return `<li>${formatInline(m![2])}</li>`;
    });
    return `<h4>${formatInline(headerMatch[1])}</h4><ol>${items.join('')}</ol>`;
  }

  return null;
}

// ─── Inline Formatting ──────────────────────────────────────

function formatInline(text: string): string {
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Images first (so brackets inside alt/url aren't mangled by bold)
  safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_full, alt: string, url: string) => {
    const u = url.trim();
    if (!isAllowedBookImageUrl(u)) {
      return escapeHtml(alt || 'image');
    }
    return (
      `<img class="book-md-img book-md-img-inline" src="${escapeAttr(u)}" ` +
      `alt="${escapeAttr(alt)}" loading="lazy" decoding="async" />`
    );
  });

  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  return safe;
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape a string for safe use in HTML text content.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a safe figure HTML block for a structured article image field.
 * Returns empty string if URL is not allow-listed.
 */
export function renderBookImageFigure(image: {
  url: string;
  alt: string;
  credit?: string;
  license?: string;
}): string {
  if (!isAllowedBookImageUrl(image.url)) return '';
  const creditBits = [image.credit, image.license].filter(Boolean).join(' · ');
  const cap = creditBits
    ? `<figcaption class="book-image-credit">${escapeHtml(creditBits)}</figcaption>`
    : '';
  return (
    `<figure class="book-article-figure">` +
    `<img class="book-article-img" src="${escapeAttr(image.url)}" ` +
    `alt="${escapeAttr(image.alt)}" loading="lazy" decoding="async" />` +
    cap +
    `</figure>`
  );
}
