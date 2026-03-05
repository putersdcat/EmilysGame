/**
 * nano-tile-svgs.ts — SVG texture generators for nano tile rendering.
 * Ported from experiment/isometric-2.0/src/solver.ts SVG generation functions.
 *
 * Produces 128×128 SVG strings for:
 *  - Stone wall side texture (stoneWallSvg)
 *  - Stone wall top cap (stoneWallTopSvg)
 *  - Wooden fence side texture (woodenFenceSvg)
 *
 * All outputs are transparent-background 128×128 SVGs suitable for
 * loadSvgImage / drawExtrudedNano / drawPositiveNano render paths.
 *
 * TODO: DOC — brick course direction rationale, variant footprint math
 * @see experiment/isometric-2.0/src/solver.ts — original source
 */

import type { IsoFeatureVariant as FeatureVariant } from './types/iso-renderer.types.js';

// ─── Stone Block Helpers ──────────────────────────────────────────────────────

/** Random stone blocks filling (x,y,w,h) — horizontal brick courses. */
function stoneBlocks(x: number, y: number, w: number, h: number, seed: number, baseRowH = 12): string {
  const blocks: string[] = [];
  const gap = 2;
  const rowH = baseRowH;
  let row = 0;
  for (let ry = y; ry < y + h - 2; ry += rowH + gap) {
    const remainH = Math.min(rowH, y + h - ry - gap);
    if (remainH < 4) break;
    const offset = (row % 2 === 0) ? 0 : 14;
    let bx = x + offset;
    let stoneIdx = 0;
    while (bx < x + w - 2) {
      const hash = ((seed * 7919 + row * 6581 + stoneIdx * 3571) >>> 0);
      const bw = 20 + (hash % 18);
      const actualW = Math.min(bw, x + w - bx - gap);
      if (actualW < 8) break;
      const base = 145 + (hash >> 8) % 30;
      const r = base + ((hash >> 12) % 10) - 5;
      const g = base + ((hash >> 16) % 8) - 4;
      const b = base + ((hash >> 20) % 12) - 2;
      blocks.push(`<rect x="${bx}" y="${ry}" width="${actualW}" height="${remainH}" rx="1.5" fill="rgb(${r},${g},${b})" />`);
      blocks.push(`<rect x="${bx}" y="${ry}" width="${actualW}" height="${Math.min(3, remainH)}" rx="1" fill="rgba(255,255,255,0.15)" />`);
      blocks.push(`<rect x="${bx}" y="${ry + remainH - 2}" width="${actualW}" height="2" rx="0.5" fill="rgba(0,0,0,0.08)" />`);
      if ((hash >> 24) % 5 === 0 && actualW > 14) {
        const cx1 = bx + 4 + (hash % (actualW - 8));
        const cx2 = cx1 + ((hash >> 4) % 5) - 2;
        blocks.push(`<line x1="${cx1}" y1="${ry + 2}" x2="${cx2}" y2="${ry + remainH - 2}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8" />`);
      }
      bx += actualW + gap;
      stoneIdx++;
    }
    row++;
  }
  return blocks.join('\n    ');
}

/** Cap stones row along top of component. */
function capStones(x: number, _y: number, w: number, seed: number, capH = 6): string {
  const caps: string[] = [];
  let bx = x;
  let idx = 0;
  while (bx < x + w - 2) {
    const hash = ((seed * 4271 + idx * 9137) >>> 0);
    const bw = 16 + (hash % 14);
    const actualW = Math.min(bw, x + w - bx - 2);
    if (actualW < 6) break;
    const grey = 150 + (hash >> 8) % 20;
    caps.push(`<rect x="${bx}" y="0" width="${actualW}" height="${capH}" rx="1.5" fill="rgb(${grey},${grey - 2},${grey - 5})" stroke="rgba(0,0,0,0.1)" stroke-width="0.5" />`);
    bx += actualW + 2;
    idx++;
  }
  return caps.join('\n    ');
}

/** Stone blocks with VERTICAL mortar courses (for vertical wall arm tops). */
function stoneBlocksV(x: number, y: number, w: number, h: number, seed: number, baseColW = 12): string {
  const blocks: string[] = [];
  const gap = 2;
  const colW = baseColW;
  let col = 0;
  for (let cx = x; cx < x + w - 2; cx += colW + gap) {
    const remainW = Math.min(colW, x + w - cx - gap);
    if (remainW < 4) break;
    const offset = (col % 2 === 0) ? 0 : 14;
    let by = y + offset;
    let stoneIdx = 0;
    while (by < y + h - 2) {
      const hash = ((seed * 7919 + col * 6581 + stoneIdx * 3571) >>> 0);
      const bh = 20 + (hash % 18);
      const actualH = Math.min(bh, y + h - by - gap);
      if (actualH < 8) break;
      const base = 145 + (hash >> 8) % 30;
      const r = base + ((hash >> 12) % 10) - 5;
      const g = base + ((hash >> 16) % 8) - 4;
      const b = base + ((hash >> 20) % 12) - 2;
      blocks.push(`<rect x="${cx}" y="${by}" width="${remainW}" height="${actualH}" rx="1.5" fill="rgb(${r},${g},${b})" />`);
      blocks.push(`<rect x="${cx}" y="${by}" width="${Math.min(3, remainW)}" height="${actualH}" rx="1" fill="rgba(255,255,255,0.15)" />`);
      blocks.push(`<rect x="${cx + remainW - 2}" y="${by}" width="2" height="${actualH}" rx="0.5" fill="rgba(0,0,0,0.08)" />`);
      if ((hash >> 24) % 5 === 0 && actualH > 14) {
        const ly = by + 4 + (hash % (actualH - 8));
        blocks.push(`<line x1="${cx + 2}" y1="${ly}" x2="${cx + remainW - 2}" y2="${ly + ((hash >> 4) % 5) - 2}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8" />`);
      }
      by += actualH + gap;
      stoneIdx++;
    }
    col++;
  }
  return blocks.join('\n    ');
}

/** Cap stone column strip along left edge of a vertical arm. */
function capStonesV(x: number, y: number, h: number, seed: number, capW = 6): string {
  const caps: string[] = [];
  let by = y;
  let idx = 0;
  while (by < y + h - 2) {
    const hash = ((seed * 4271 + idx * 9137) >>> 0);
    const bh = 16 + (hash % 14);
    const actualH = Math.min(bh, y + h - by - 2);
    if (actualH < 6) break;
    const grey = 150 + (hash >> 8) % 20;
    caps.push(`<rect x="${x}" y="${by}" width="${capW}" height="${actualH}" rx="1.5" fill="rgb(${grey},${grey - 2},${grey - 5})" stroke="rgba(0,0,0,0.1)" stroke-width="0.5" />`);
    by += actualH + 2;
    idx++;
  }
  return caps.join('\n    ');
}

/** Wall footprint rects for each variant (tile-local 128×128 space). */
function wallBounds(variant: FeatureVariant): { rects: Array<{ x: number; y: number; w: number; h: number }> } {
  const W = 48;             // wall thickness
  const off = (128 - W) / 2; // 40
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const arms = { top: false, right: false, bottom: false, left: false };

  switch (variant) {
    case 'straight-h': arms.left = true;  arms.right = true;  break;
    case 'straight-v': arms.top = true;   arms.bottom = true; break;
    case 'corner-tr':  arms.top = true;   arms.right = true;  break;
    case 'corner-tl':  arms.top = true;   arms.left = true;   break;
    case 'corner-br':  arms.bottom = true; arms.right = true; break;
    case 'corner-bl':  arms.bottom = true; arms.left = true;  break;
    case 'cross':      arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t':  arms.left  = arms.right  = arms.bottom = true; break;
    case 'tee-b':  arms.left  = arms.right  = arms.top    = true; break;
    case 'tee-r':  arms.top   = arms.bottom = arms.left   = true; break;
    case 'tee-l':  arms.top   = arms.bottom = arms.right  = true; break;
    case 'end-t':  arms.bottom = true; break;
    case 'end-b':  arms.top    = true; break;
    case 'end-r':  arms.left   = true; break;
    case 'end-l':  arms.right  = true; break;
    default: // isolated — central block only
      rects.push({ x: off, y: off, w: W, h: W });
      return { rects };
  }

  rects.push({ x: off, y: off, w: W, h: W }); // central core
  if (arms.top)    rects.push({ x: off, y: 0,       w: W,   h: off });
  if (arms.bottom) rects.push({ x: off, y: off + W, w: W,   h: off });
  if (arms.left)   rects.push({ x: 0,   y: off,     w: off, h: W   });
  if (arms.right)  rects.push({ x: off + W, y: off, w: off, h: W   });

  return { rects };
}

// ─── Public SVG Generators ────────────────────────────────────────────────────

/**
 * Side/front face texture SVG for a stone wall tile.
 * 128×128, transparent background. Used as `sideTextureSvg` in IsoNanoTile.
 * Variant seeds block variation so adjacent tiles look different.
 */
export function stoneWallSvg(variant: FeatureVariant): string {
  const seed = variant.charCodeAt(0) * 137 + variant.charCodeAt(variant.length - 1) * 31;
  const parts: string[] = [
    stoneBlocks(0, 0, 128, 128, seed),
    capStones(0, 0, 128, seed + 999),
    `<rect x="0" y="0" width="128" height="128" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="0.5" />`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n    ${parts.join('\n    ')}\n  </svg>`;
}

/**
 * Top cap texture SVG for a stone wall tile.
 * 128×128, transparent background. Used as `topTextureSvg` in IsoNanoTile.
 * Only the wall footprint strip is filled; surrounding area is transparent.
 *
 * Brick course direction is matched to wall orientation:
 *  - N/S arms → vertical courses (/ direction on screen)
 *  - E/W arms + center → horizontal courses (\ direction on screen)
 */
export function stoneWallTopSvg(variant: FeatureVariant): string {
  const { rects } = wallBounds(variant);
  const parts: string[] = [];
  const seed = variant.charCodeAt(0) * 53 + 7;
  const off = 40;
  const W = 48;
  const hasVArm = variant !== 'straight-h' && variant !== 'end-r'
               && variant !== 'end-l' && variant !== 'isolated';

  for (const r of rects) {
    const id = `wp${r.x}_${r.y}`;
    parts.push(`<clipPath id="${id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`);
    const isNSArm   = r.y < off || r.y >= off + W;
    const isCenter  = r.x === off && r.y === off;
    const useVertical = isNSArm || (isCenter && hasVArm);
    parts.push(`<g clip-path="url(#${id})">`);
    if (useVertical) {
      parts.push(stoneBlocksV(r.x, r.y, r.w, r.h, seed + r.x + r.y * 7, 5));
      parts.push(capStonesV(r.x, r.y, r.h, seed + r.x * 3, 2.5));
    } else {
      parts.push(stoneBlocks(r.x, r.y, r.w, r.h, seed + r.x + r.y * 7, 5));
      parts.push(capStones(r.x, r.y, r.w, seed + r.x * 3, 2.5));
    }
    parts.push(`</g>`);
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="0.8" rx="1" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n    ${parts.join('\n    ')}\n  </svg>`;
}

/**
 * Side-view fence SVG for a wooden fence tile.
 * 128×128, transparent background. Used as `svg` in IsoNanoTile.
 * Posts and rails visible from the front (iso billboarded via drawPositiveNano).
 */
export function woodenFenceSvg(variant: FeatureVariant): string {
  const parts: string[] = [];
  const postW = 10;
  const railH = 7;
  const capRy = 3;
  const postTopY = 10;
  const topRailY = 30;
  const botRailY = 80;

  function sidePost(cx: number, topY: number): string {
    const px = cx - postW / 2;
    const h = 128 - topY;
    return [
      `<rect x="${px + 2}" y="${topY + 3}" width="${postW}" height="${h}" rx="1.5" fill="rgba(0,0,0,0.15)" />`,
      `<rect x="${px}" y="${topY}" width="${postW}" height="${h}" rx="2" fill="#8B6914" />`,
      `<rect x="${px + 2}" y="${topY}" width="3" height="${h}" fill="#a07820" opacity="0.4" />`,
      `<rect x="${px + postW - 2}" y="${topY}" width="2" height="${h}" fill="#6a5010" opacity="0.3" />`,
      `<ellipse cx="${cx}" cy="${topY}" rx="${postW / 2}" ry="${capRy}" fill="#9a7018" />`,
      `<ellipse cx="${cx}" cy="${topY}" rx="${postW / 2 - 1}" ry="${capRy - 1}" fill="#b08828" opacity="0.5" />`,
    ].join('\n    ');
  }

  function sideRail(x1: number, x2: number, y: number, lighter: boolean): string {
    const fill = lighter ? '#9a7018' : '#8B6914';
    const high = lighter ? '#b08828' : '#a07820';
    return [
      `<rect x="${x1}" y="${y + 2}" width="${x2 - x1}" height="${railH}" rx="1.5" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${railH}" rx="1.5" fill="${fill}" />`,
      `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="2" rx="1" fill="${high}" opacity="0.3" />`,
    ].join('\n    ');
  }

  // Diagonal / vertex variants
  if (variant === 'diagonal-right' || variant === 'diagonal-left' || variant === 'vertex') {
    const diagParts: string[] = [];
    if (variant === 'vertex') {
      diagParts.push(sidePost(64, postTopY));
    } else {
      const [yL, yR]  = variant === 'diagonal-right' ? [topRailY + 22, topRailY - 8]  : [topRailY - 8,  topRailY + 22];
      const [yL2, yR2] = variant === 'diagonal-right' ? [botRailY + 18, botRailY - 8] : [botRailY - 8, botRailY + 18];
      diagParts.push(
        `<polygon points="0,${yL + railH} 128,${yR + railH} 128,${yR} 0,${yL}" fill="#9a7018" />`,
        `<polygon points="0,${yL + 2} 128,${yR + 2} 128,${yR} 0,${yL}" fill="#b08828" opacity="0.3" />`,
        `<polygon points="0,${yL2 + railH} 128,${yR2 + railH} 128,${yR2} 0,${yL2}" fill="#8B6914" />`,
        `<polygon points="0,${yL2 + 2} 128,${yR2 + 2} 128,${yR2} 0,${yL2}" fill="#a07820" opacity="0.3" />`,
      );
      diagParts.push(sidePost(6,   Math.min(yL,  yL2)  - 6));
      diagParts.push(sidePost(122, Math.min(yR,  yR2) - 6));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n    ${diagParts.join('\n    ')}\n  </svg>`;
  }

  // Orthogonal arm presence
  const arms = { left: false, right: false };
  switch (variant) {
    case 'straight-h': case 'cross': case 'tee-t': case 'tee-b':
    case 'straight-v': case 'end-t': case 'end-b':
      arms.left = arms.right = true; break;
    case 'corner-tr': case 'end-r': case 'tee-l': case 'corner-br':
      arms.right = true; break;
    case 'corner-tl': case 'end-l': case 'tee-r': case 'corner-bl':
      arms.left = true; break;
    default:
      arms.left = arms.right = true; break;
  }

  // Rails behind posts
  if (arms.left && arms.right) {
    parts.push(sideRail(0, 128, topRailY, true));
    parts.push(sideRail(0, 128, botRailY, false));
  } else if (arms.right) {
    parts.push(sideRail(64, 128, topRailY, true));
    parts.push(sideRail(64, 128, botRailY, false));
  } else if (arms.left) {
    parts.push(sideRail(0, 64, topRailY, true));
    parts.push(sideRail(0, 64, botRailY, false));
  }

  // Posts in front of rails
  if (arms.left && arms.right) {
    parts.push(sidePost(6, postTopY));
    parts.push(sidePost(64, postTopY));
    parts.push(sidePost(122, postTopY));
  } else if (arms.right) {
    parts.push(sidePost(64, postTopY));
    parts.push(sidePost(122, postTopY));
  } else if (arms.left) {
    parts.push(sidePost(6, postTopY));
    parts.push(sidePost(64, postTopY));
  } else {
    parts.push(sidePost(64, postTopY));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n    ${parts.join('\n    ')}\n  </svg>`;
}
