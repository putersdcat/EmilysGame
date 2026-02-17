/**
 * SVG test fixtures — from trivial to adversarial.
 */

/** Minimal valid SVG */
export const TINY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>`;

/** Standard mid-complexity SVG */
export const STANDARD_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff6b6b"/>
      <stop offset="100%" stop-color="#4ecdc4"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="16" fill="url(#g1)"/>
  <circle cx="64" cy="50" r="20" fill="#fff" opacity="0.9"/>
  <rect x="34" y="80" width="60" height="12" rx="6" fill="#fff" opacity="0.9"/>
  <text x="64" y="115" font-size="10" text-anchor="middle" fill="#fff">Preview</text>
</svg>`;

/** Heavy SVG — lots of paths and gradients */
export function generateHeavySvg(elementCount: number = 200): string {
  const elements: string[] = [];
  for (let i = 0; i < elementCount; i++) {
    const x = Math.random() * 500;
    const y = Math.random() * 500;
    const r = 2 + Math.random() * 20;
    const hue = Math.floor(Math.random() * 360);
    elements.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="hsl(${hue},70%,50%)" opacity="0.6"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${elements.join('\n')}</svg>`;
}

/** SVG near the 100k char limit */
export function generateGiantSvg(): string {
  const elements: string[] = [];
  // Each circle element ≈ ~90 chars. Need ~1000 to approach 90k.
  for (let i = 0; i < 1000; i++) {
    const x = (i * 7) % 1000;
    const y = (i * 13) % 1000;
    const color = ((i * 171) % 0xFFFFFF).toString(16).padStart(6, '0');
    elements.push(`<circle cx="${x}" cy="${y}" r="5" fill="#${color}" opacity="0.5"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${elements.join('')}</svg>`;
}

/** SVG that exceeds the 100k char limit */
export function generateOversizeSvg(): string {
  const base = generateGiantSvg();
  // Pad with comments to exceed limit
  const pad = '<!-- ' + 'x'.repeat(100_001 - base.length) + ' -->';
  return base.replace('</svg>', pad + '</svg>');
}

/** Simple animated SVG with SMIL */
export const ANIMATED_SVG_SMIL = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="20" fill="#1f6feb">
    <animate attributeName="r" values="20;40;20" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`;

/** Animated SVG with CSS animation */
export const ANIMATED_SVG_CSS = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <style>
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; transform-origin: 50px 50px; }
  </style>
  <rect class="spinner" x="30" y="30" width="40" height="40" fill="#e74c3c"/>
</svg>`;

/** Animated SVG with explicit dur */
export const ANIMATED_SVG_DUR = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="40" width="20" height="20" fill="blue">
    <animateTransform attributeName="transform" type="translate" from="0 0" to="60 0" dur="3s" fill="freeze"/>
  </rect>
</svg>`;

/** Animated SVG with multiple overlapping animations */
export const ANIMATED_SVG_COMPLEX = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="30" fill="#e74c3c">
    <animate attributeName="r" values="30;60;30" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="fill" values="#e74c3c;#3498db;#2ecc71;#e74c3c" dur="4s" repeatCount="indefinite"/>
  </circle>
  <rect x="50" y="150" width="100" height="10" rx="5" fill="#333">
    <animate attributeName="width" values="100;50;100" dur="1.5s" repeatCount="indefinite"/>
  </rect>
  <line x1="20" y1="20" x2="180" y2="20" stroke="#999" stroke-width="2">
    <animate attributeName="y1" values="20;180;20" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="y2" values="20;180;20" dur="3s" begin="0.5s" repeatCount="indefinite"/>
  </line>
</svg>`;

/** Malformed SVG (not valid XML) */
export const MALFORMED_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"`;

/** Empty string */
export const EMPTY_SVG = '';

/** SVG with no visual content */
export const INVISIBLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;

/** SVG with special characters / CDATA */
export const SPECIAL_CHARS_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="10" y="50" font-size="8"><![CDATA[Hello & "World" <test>]]></text>
  <rect width="100" height="100" fill="none" stroke="black"/>
</svg>`;

/** SVG with emoji / unicode text */
export const UNICODE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#ffeaa7"/>
  <text x="50" y="60" text-anchor="middle" font-size="40">🎨</text>
</svg>`;

/** SVG with massive viewBox (adversarial) */
export const HUGE_VIEWBOX_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 99999 99999">
  <rect width="99999" height="99999" fill="red"/>
</svg>`;
