/**
 * markdown.ts - Safe, lightweight markdown-to-HTML renderer.
 * Supports the subset used by Book of Knowledge articles:
 *   - **bold** text
 *   - *italic* text
 *   - Paragraphs (double newline)
 *   - Unordered lists (- or • prefix)
 *   - Ordered lists (1. 2. 3. prefix)
 *   - **Header:** patterns (bold text ending in colon → <h4>)
 *   - Inline emoji preserved
 *
 * All output is sanitized through a strict allow-list.
 * No raw innerHTML from user/pack content passes through unsanitized.
 *
 * TODO: DOC - Markdown renderer feature overview
 */

// ─── Sanitizer ──────────────────────────────────────────────

/** Allowed HTML tags in rendered output */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h4', 'span',
]);

/** Allowed attributes per tag */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  span: new Set(['class']),
};

/**
 * Strip any HTML tags/attributes not in the allow-list.
 * Prevents XSS from content pack injection.
 */
export function sanitizeHtml(html: string): string {
  // Replace all < with entity, then selectively restore allowed tags
  let safe = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore allowed self-closing and paired tags
  for (const tag of ALLOWED_TAGS) {
    // Opening tag with optional attributes: &lt;tag ...&gt;
    const openRe = new RegExp(`&lt;(${tag})(\\s[^&]*?)?&gt;`, 'gi');
    safe = safe.replace(openRe, (_match, tagName: string, attrsRaw: string | undefined) => {
      const cleanAttrs = filterAttributes(tagName.toLowerCase(), attrsRaw || '');
      return `<${tagName}${cleanAttrs}>`;
    });
    // Closing tag: &lt;/tag&gt;
    const closeRe = new RegExp(`&lt;/${tag}&gt;`, 'gi');
    safe = safe.replace(closeRe, `</${tag}>`);
  }

  return safe;
}

/** Filter attributes to only those on the allow-list */
function filterAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed || !raw.trim()) return '';

  const result: string[] = [];
  // Match attr="value" or attr='value' patterns
  const attrRe = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? '';
    if (allowed.has(name)) {
      // Extra safety: no javascript: in values
      if (!/javascript\s*:/i.test(value) && !/on\w+\s*=/i.test(value)) {
        result.push(`${name}="${escapeAttrValue(value)}"`);
      }
    }
  }
  return result.length ? ' ' + result.join(' ') : '';
}

function escapeAttrValue(v: string): string {
  return v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Markdown Parser ────────────────────────────────────────

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

    // Check if this paragraph is entirely a list
    const listResult = tryParseList(lines);
    if (listResult) {
      blocks.push(listResult);
      continue;
    }

    // Check if first line is a standalone bold header (e.g. "**Parts of an Atom:**")
    // followed by list items
    const headerListResult = tryParseHeaderWithList(lines);
    if (headerListResult) {
      blocks.push(headerListResult);
      continue;
    }

    // Regular paragraph — apply inline formatting
    const formattedLines = lines.map(l => formatInline(l.trim()));
    blocks.push(`<p>${formattedLines.join('<br>')}</p>`);
  }

  return blocks.join('');
}

// ─── List Detection ─────────────────────────────────────────

const UL_RE = /^[-•]\s+(.+)$/;
const OL_RE = /^(\d+)[.)]\s+(.+)$/;

function isUnorderedListLine(line: string): boolean {
  return UL_RE.test(line.trim());
}

function isOrderedListLine(line: string): boolean {
  return OL_RE.test(line.trim());
}

function tryParseList(lines: string[]): string | null {
  // Check unordered list
  if (lines.every(l => isUnorderedListLine(l))) {
    const items = lines.map(l => {
      const m = l.trim().match(UL_RE);
      return `<li>${formatInline(m![1])}</li>`;
    });
    return `<ul>${items.join('')}</ul>`;
  }

  // Check ordered list
  if (lines.every(l => isOrderedListLine(l))) {
    const items = lines.map(l => {
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
  // Check if first line is a bold header pattern: **Something:**
  const headerMatch = firstLine.match(/^\*\*(.+?):\*\*\s*$/);
  if (!headerMatch) return null;

  const restLines = lines.slice(1);

  // Rest should be a list
  if (restLines.every(l => isUnorderedListLine(l))) {
    const items = restLines.map(l => {
      const m = l.trim().match(UL_RE);
      return `<li>${formatInline(m![1])}</li>`;
    });
    return `<h4>${formatInline(headerMatch[1])}</h4><ul>${items.join('')}</ul>`;
  }

  if (restLines.every(l => isOrderedListLine(l))) {
    const items = restLines.map(l => {
      const m = l.trim().match(OL_RE);
      return `<li>${formatInline(m![2])}</li>`;
    });
    return `<h4>${formatInline(headerMatch[1])}</h4><ol>${items.join('')}</ol>`;
  }

  return null;
}

// ─── Inline Formatting ──────────────────────────────────────

/**
 * Apply inline markdown formatting to a single line.
 * Handles **bold**, *italic*, and escapes HTML entities.
 */
function formatInline(text: string): string {
  // First escape any raw HTML
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // **bold** → <strong>
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // *italic* (but not **) → <em>
  safe = safe.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  return safe;
}

// ─── Public Helpers ─────────────────────────────────────────

/**
 * Escape a string for safe use in HTML text content.
 * Use for titles, summaries, and any single-line text.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
