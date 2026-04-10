// src/solver.ts
import {
  CHUNK_TILES
} from "./types";
var CONNECTABLE_KINDS = /* @__PURE__ */ new Set([
  "stone-wall",
  "fence",
  "river"
]);
function getNanoKind(tile) {
  return tile.nanos?.[0]?.kind ?? null;
}
function canConnect(source, neighbor) {
  if (!neighbor) return false;
  const neighborNano = getNanoKind(neighbor);
  if (neighborNano !== null && source === neighborNano) return true;
  if (source === "river" && neighbor.kind === "water") return true;
  return false;
}
function getNeighbors(chunk, col, row, lookup) {
  const worldCol = chunk.cx * CHUNK_TILES + col;
  const worldRow = chunk.cy * CHUNK_TILES + row;
  return {
    top: row > 0 ? chunk.tiles[(row - 1) * CHUNK_TILES + col] : lookup(worldCol, worldRow - 1),
    right: col < CHUNK_TILES - 1 ? chunk.tiles[row * CHUNK_TILES + col + 1] : lookup(worldCol + 1, worldRow),
    bottom: row < CHUNK_TILES - 1 ? chunk.tiles[(row + 1) * CHUNK_TILES + col] : lookup(worldCol, worldRow + 1),
    left: col > 0 ? chunk.tiles[row * CHUNK_TILES + col - 1] : lookup(worldCol - 1, worldRow)
  };
}
function resolveConnections(kind, neighbors) {
  return {
    top: canConnect(kind, neighbors.top),
    right: canConnect(kind, neighbors.right),
    bottom: canConnect(kind, neighbors.bottom),
    left: canConnect(kind, neighbors.left)
  };
}
function connCount(c) {
  return (c.top ? 1 : 0) + (c.right ? 1 : 0) + (c.bottom ? 1 : 0) + (c.left ? 1 : 0);
}
function selectVariant(conn) {
  const n = connCount(conn);
  if (n === 0) return "isolated";
  if (n === 1) {
    if (conn.top) return "end-t";
    if (conn.right) return "end-r";
    if (conn.bottom) return "end-b";
    return "end-l";
  }
  if (n === 2) {
    if (conn.top && conn.bottom) return "straight-v";
    if (conn.left && conn.right) return "straight-h";
    if (conn.top && conn.right) return "corner-tr";
    if (conn.top && conn.left) return "corner-tl";
    if (conn.bottom && conn.right) return "corner-br";
    return "corner-bl";
  }
  if (n === 3) {
    if (!conn.top) return "tee-t";
    if (!conn.right) return "tee-r";
    if (!conn.bottom) return "tee-b";
    return "tee-l";
  }
  return "cross";
}
function stoneBlocks(x, y, w, h, seed) {
  const blocks = [];
  const gap = 2;
  const rowH = 12;
  let row = 0;
  for (let ry = y; ry < y + h - 2; ry += rowH + gap) {
    const remainH = Math.min(rowH, y + h - ry - gap);
    if (remainH < 4) break;
    const offset = row % 2 === 0 ? 0 : 14;
    let bx = x + offset;
    let stoneIdx = 0;
    while (bx < x + w - 2) {
      const hash = seed * 7919 + row * 6581 + stoneIdx * 3571 >>> 0;
      const bw = 20 + hash % 18;
      const actualW = Math.min(bw, x + w - bx - gap);
      if (actualW < 8) break;
      const base = 88 + (hash >> 8) % 30;
      const r = base + (hash >> 12) % 10 - 5;
      const g = base + (hash >> 16) % 8 - 4;
      const b = base + (hash >> 20) % 12 - 2;
      blocks.push(
        `<rect x="${bx}" y="${ry}" width="${actualW}" height="${remainH}" rx="1.5" fill="rgb(${r},${g},${b})" />`
      );
      blocks.push(
        `<rect x="${bx}" y="${ry}" width="${actualW}" height="${Math.min(3, remainH)}" rx="1" fill="rgba(255,255,255,0.08)" />`
      );
      blocks.push(
        `<rect x="${bx}" y="${ry + remainH - 2}" width="${actualW}" height="2" rx="0.5" fill="rgba(0,0,0,0.12)" />`
      );
      if ((hash >> 24) % 5 === 0 && actualW > 14) {
        const cx1 = bx + 4 + hash % (actualW - 8);
        const cy1 = ry + 2;
        const cx2 = cx1 + (hash >> 4) % 5 - 2;
        const cy2 = ry + remainH - 2;
        blocks.push(
          `<line x1="${cx1}" y1="${cy1}" x2="${cx2}" y2="${cy2}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8" />`
        );
      }
      bx += actualW + gap;
      stoneIdx++;
    }
    row++;
  }
  return blocks.join("\n    ");
}
function capStones(x, y, w, seed) {
  const caps = [];
  const capH = 6;
  let bx = x;
  let idx = 0;
  while (bx < x + w - 2) {
    const hash = seed * 4271 + idx * 9137 >>> 0;
    const bw = 16 + hash % 14;
    const actualW = Math.min(bw, x + w - bx - 2);
    if (actualW < 6) break;
    const grey = 105 + (hash >> 8) % 20;
    caps.push(
      `<rect x="${bx}" y="${y}" width="${actualW}" height="${capH}" rx="1.5" fill="rgb(${grey},${grey - 2},${grey - 5})" stroke="rgba(0,0,0,0.1)" stroke-width="0.5" />`
    );
    bx += actualW + 2;
    idx++;
  }
  return caps.join("\n    ");
}
function wallBounds(variant) {
  const W = 48;
  const off = (128 - W) / 2;
  const rects = [];
  const arms = { top: false, right: false, bottom: false, left: false };
  switch (variant) {
    case "straight-h":
      arms.left = true;
      arms.right = true;
      break;
    case "straight-v":
      arms.top = true;
      arms.bottom = true;
      break;
    case "corner-tr":
      arms.top = true;
      arms.right = true;
      break;
    case "corner-tl":
      arms.top = true;
      arms.left = true;
      break;
    case "corner-br":
      arms.bottom = true;
      arms.right = true;
      break;
    case "corner-bl":
      arms.bottom = true;
      arms.left = true;
      break;
    case "cross":
      arms.top = arms.right = arms.bottom = arms.left = true;
      break;
    case "tee-t":
      arms.left = arms.right = arms.bottom = true;
      break;
    case "tee-b":
      arms.left = arms.right = arms.top = true;
      break;
    case "tee-r":
      arms.top = arms.bottom = arms.left = true;
      break;
    case "tee-l":
      arms.top = arms.bottom = arms.right = true;
      break;
    case "end-t":
      arms.bottom = true;
      break;
    case "end-b":
      arms.top = true;
      break;
    case "end-r":
      arms.left = true;
      break;
    case "end-l":
      arms.right = true;
      break;
    default:
      rects.push({ x: off, y: off, w: W, h: W });
      return { rects };
  }
  rects.push({ x: off, y: off, w: W, h: W });
  if (arms.top) rects.push({ x: off, y: 0, w: W, h: off });
  if (arms.bottom) rects.push({ x: off, y: off + W, w: W, h: off });
  if (arms.left) rects.push({ x: 0, y: off, w: off, h: W });
  if (arms.right) rects.push({ x: off + W, y: off, w: off, h: W });
  return { rects };
}
function stoneWallSvg(variant) {
  const { rects } = wallBounds(variant);
  const parts = [];
  const seed = variant.charCodeAt(0) * 137 + variant.charCodeAt(variant.length - 1) * 31;
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="30" cy="100" rx="18" ry="12" fill="#458550" opacity="0.4" />`);
  parts.push(`<ellipse cx="100" cy="30" rx="16" ry="10" fill="#2d6838" opacity="0.3" />`);
  for (const r of rects) {
    parts.push(
      `<rect x="${r.x + 3}" y="${r.y + 3}" width="${r.w}" height="${r.h}" fill="rgba(0,0,0,0.2)" rx="1" />`
    );
  }
  const clipId = `wc-${variant.replace(/[^a-z]/g, "")}`;
  let clipRects = "";
  for (const r of rects) {
    clipRects += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />`;
  }
  parts.push(`<defs><clipPath id="${clipId}">${clipRects}</clipPath></defs>`);
  for (const r of rects) {
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#6a6a72" rx="1" />`);
  }
  parts.push(`<g clip-path="url(#${clipId})">`);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  parts.push(stoneBlocks(minX, minY, maxX - minX, maxY - minY, seed));
  for (const r of rects) {
    parts.push(capStones(r.x, r.y, r.w, seed + r.x * 17 + r.y * 31));
  }
  parts.push(`</g>`);
  for (const r of rects) {
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1" rx="1" />`
    );
  }
  const grassSeeds = [
    { x: 8, y: 118 },
    { x: 35, y: 122 },
    { x: 90, y: 120 },
    { x: 115, y: 116 },
    { x: 60, y: 124 },
    { x: 20, y: 6 },
    { x: 75, y: 4 },
    { x: 110, y: 8 }
  ];
  parts.push(`<g stroke="#4a8a54" stroke-width="1.2" stroke-linecap="round" opacity="0.5">`);
  for (const gs of grassSeeds) {
    const insideWall = rects.some(
      (r) => gs.x >= r.x && gs.x <= r.x + r.w && gs.y >= r.y && gs.y <= r.y + r.h
    );
    if (!insideWall) {
      parts.push(`<line x1="${gs.x}" y1="${gs.y}" x2="${gs.x - 2}" y2="${gs.y - 6}" />`);
      parts.push(`<line x1="${gs.x + 4}" y1="${gs.y}" x2="${gs.x + 6}" y2="${gs.y - 5}" />`);
    }
  }
  parts.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function riverSvg(variant, conn) {
  const parts = [];
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="20" cy="20" rx="14" ry="10" fill="#458550" opacity="0.3" />`);
  parts.push(`<ellipse cx="108" cy="108" rx="12" ry="8" fill="#2d6838" opacity="0.25" />`);
  const chW = 64;
  const off = (128 - chW) / 2;
  const bankW = 10;
  function bankPath(x1, y1, x2, y2, waveSide) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(4, Math.floor(len / 16));
    let d = `M ${x1} ${y1}`;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mx = x1 + dx * t;
      const my = y1 + dy * t;
      const wave = Math.sin(t * Math.PI * 3) * 3 * waveSide;
      const nx = -dy / len * wave;
      const ny = dx / len * wave;
      d += ` L ${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)}`;
    }
    return d;
  }
  if (variant === "isolated") {
    parts.push(`<circle cx="64" cy="64" r="38" fill="#5a4a28" />`);
    parts.push(`<circle cx="64" cy="64" r="34" fill="#1a5588" />`);
    parts.push(`<circle cx="64" cy="64" r="24" fill="#2277aa" opacity="0.5" />`);
    parts.push(`<ellipse cx="58" cy="55" rx="10" ry="4" fill="rgba(255,255,255,0.1)" />`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
  }
  const waterDefsId = `wg-${variant.replace(/[^a-z]/g, "")}`;
  parts.push(`<defs>`);
  parts.push(`  <linearGradient id="${waterDefsId}-h" x1="0" y1="0" x2="0" y2="1">`);
  parts.push(`    <stop offset="0%" stop-color="#3a6a30" />`);
  parts.push(`    <stop offset="15%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="50%" stop-color="#0d3a6a" />`);
  parts.push(`    <stop offset="85%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="100%" stop-color="#3a6a30" />`);
  parts.push(`  </linearGradient>`);
  parts.push(`  <linearGradient id="${waterDefsId}-v" x1="0" y1="0" x2="1" y2="0">`);
  parts.push(`    <stop offset="0%" stop-color="#3a6a30" />`);
  parts.push(`    <stop offset="15%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="50%" stop-color="#0d3a6a" />`);
  parts.push(`    <stop offset="85%" stop-color="#1a5588" />`);
  parts.push(`    <stop offset="100%" stop-color="#3a6a30" />`);
  parts.push(`  </linearGradient>`);
  parts.push(`</defs>`);
  if (conn.top || conn.bottom) {
    const y1 = conn.top ? 0 : off;
    const y2 = conn.bottom ? 128 : off + chW;
    parts.push(`<rect x="${off - 4}" y="${y1}" width="${chW + 8}" height="${y2 - y1}" fill="url(#${waterDefsId}-v)" />`);
  }
  if (conn.left || conn.right) {
    const x1 = conn.left ? 0 : off;
    const x2 = conn.right ? 128 : off + chW;
    parts.push(`<rect x="${x1}" y="${off - 4}" width="${x2 - x1}" height="${chW + 8}" fill="url(#${waterDefsId}-h)" />`);
  }
  if (conn.top || conn.bottom) {
    const y1 = conn.top ? 0 : off + 8;
    const y2 = conn.bottom ? 128 : off + chW - 8;
    parts.push(`<rect x="${off + 14}" y="${y1}" width="${chW - 28}" height="${y2 - y1}" fill="#0d3a6a" opacity="0.4" rx="4" />`);
  }
  if (conn.left || conn.right) {
    const x1 = conn.left ? 0 : off + 8;
    const x2 = conn.right ? 128 : off + chW - 8;
    parts.push(`<rect x="${x1}" y="${off + 14}" width="${x2 - x1}" height="${chW - 28}" fill="#0d3a6a" opacity="0.4" rx="4" />`);
  }
  const bankColors = ["#6a5a28", "#5a4a20", "#7a6a34"];
  if (!conn.top) {
    const by = conn.left || conn.right ? off - 4 : off;
    parts.push(`<path d="${bankPath(off - 6, by, off + chW + 6, by, 1)} L ${off + chW + 6} ${by + bankW} L ${off - 6} ${by + bankW} Z" fill="${bankColors[0]}" />`);
    parts.push(`<circle cx="${off + 10}" cy="${by + 5}" r="2" fill="#8a7a48" opacity="0.5" />`);
    parts.push(`<circle cx="${off + chW - 8}" cy="${by + 4}" r="1.5" fill="#9a8a58" opacity="0.4" />`);
  }
  if (!conn.bottom) {
    const by = conn.left || conn.right ? off + chW + 4 : off + chW;
    parts.push(`<path d="${bankPath(off - 6, by, off + chW + 6, by, -1)} L ${off + chW + 6} ${by - bankW} L ${off - 6} ${by - bankW} Z" fill="${bankColors[1]}" />`);
    parts.push(`<circle cx="${off + 20}" cy="${by - 4}" r="2" fill="#8a7a48" opacity="0.4" />`);
  }
  if (!conn.left) {
    const bx = conn.top || conn.bottom ? off - 4 : off;
    parts.push(`<path d="${bankPath(bx, off - 6, bx, off + chW + 6, 1)} L ${bx + bankW} ${off + chW + 6} L ${bx + bankW} ${off - 6} Z" fill="${bankColors[2]}" />`);
    parts.push(`<circle cx="${bx + 5}" cy="${off + 14}" r="1.5" fill="#8a7a48" opacity="0.5" />`);
  }
  if (!conn.right) {
    const bx = conn.top || conn.bottom ? off + chW + 4 : off + chW;
    parts.push(`<path d="${bankPath(bx, off - 6, bx, off + chW + 6, -1)} L ${bx - bankW} ${off + chW + 6} L ${bx - bankW} ${off - 6} Z" fill="${bankColors[0]}" />`);
    parts.push(`<circle cx="${bx - 5}" cy="${off + chW - 10}" r="2" fill="#9a8a58" opacity="0.4" />`);
  }
  parts.push(`<g opacity="0.2">`);
  if (conn.top && conn.bottom) {
    for (let y = 10; y < 128; y += 18) {
      const x1 = off + 10 + Math.sin(y * 0.1) * 4;
      const x2 = off + chW - 10 + Math.sin(y * 0.1 + 1) * 4;
      parts.push(`<path d="M ${x1} ${y} Q ${64 + Math.sin(y * 0.08) * 6} ${y + 3} ${x2} ${y}" stroke="rgba(180,220,255,0.6)" stroke-width="1.2" fill="none" />`);
    }
  }
  if (conn.left && conn.right) {
    for (let x = 10; x < 128; x += 18) {
      const y1 = off + 10 + Math.sin(x * 0.1) * 4;
      const y2 = off + chW - 10 + Math.sin(x * 0.1 + 1) * 4;
      parts.push(`<path d="M ${x} ${y1} Q ${x + 3} ${64 + Math.sin(x * 0.08) * 6} ${x} ${y2}" stroke="rgba(180,220,255,0.6)" stroke-width="1.2" fill="none" />`);
    }
  }
  parts.push(`</g>`);
  parts.push(`<g opacity="0.15">`);
  if (conn.top || conn.bottom) {
    parts.push(`<ellipse cx="${64 - 6}" cy="40" rx="8" ry="3" fill="white" />`);
    parts.push(`<ellipse cx="${64 + 4}" cy="88" rx="6" ry="2.5" fill="white" />`);
  }
  if (conn.left || conn.right) {
    parts.push(`<ellipse cx="40" cy="${64 - 4}" rx="3" ry="7" fill="white" />`);
    parts.push(`<ellipse cx="90" cy="${64 + 2}" rx="2.5" ry="6" fill="white" />`);
  }
  parts.push(`</g>`);
  parts.push(`<g stroke="#4a9a44" stroke-width="1.2" stroke-linecap="round" opacity="0.45">`);
  if (!conn.top) {
    parts.push(`<line x1="${off - 2}" y1="${off + bankW + 2}" x2="${off - 5}" y2="${off + bankW - 5}" />`);
    parts.push(`<line x1="${off + chW + 2}" y1="${off + bankW + 3}" x2="${off + chW + 5}" y2="${off + bankW - 4}" />`);
  }
  if (!conn.bottom) {
    parts.push(`<line x1="${off + 4}" y1="${off + chW - bankW}" x2="${off + 1}" y2="${off + chW - bankW + 6}" />`);
    parts.push(`<line x1="${off + chW - 4}" y1="${off + chW - bankW - 1}" x2="${off + chW - 1}" y2="${off + chW - bankW + 5}" />`);
  }
  parts.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function tallGrassSvg(z, worldCol, worldRow) {
  const hash = (worldCol * 31337 ^ worldRow * 82139) >>> 0;
  const baseGreen = 42 + hash % 30;
  const parts = [];
  parts.push(`<rect width="128" height="128" fill="rgb(${baseGreen}, ${baseGreen + 50}, ${baseGreen - 8})" />`);
  const p1g = baseGreen + 10;
  parts.push(`<ellipse cx="40" cy="80" rx="28" ry="20" fill="rgb(${p1g - 5}, ${p1g + 45}, ${p1g - 12})" opacity="0.35" />`);
  parts.push(`<ellipse cx="95" cy="40" rx="22" ry="16" fill="rgb(${p1g - 15}, ${p1g + 35}, ${p1g - 18})" opacity="0.3" />`);
  parts.push(`<g fill="rgba(0,0,0,0.1)">`);
  parts.push(`<ellipse cx="35" cy="110" rx="24" ry="10" />`);
  parts.push(`<ellipse cx="80" cy="105" rx="28" ry="12" />`);
  parts.push(`<ellipse cx="110" cy="115" rx="16" ry="8" />`);
  parts.push(`</g>`);
  const bladeCount = 20 + z * 10;
  const blades = [];
  for (let i = 0; i < bladeCount; i++) {
    const h = hash * (i + 1) + i * 7717 >>> 0;
    const bx = 4 + h % 120;
    const by = 120 - (h >> 8) % (15 + z * 8);
    const height = 14 + z * 10 + (h >> 16) % 18;
    const sway = (h >> 20) % 12 - 6;
    const green = baseGreen + (h >> 24) % 25;
    const width = 1.2 + z * 0.6 + (h >> 4) % 3 * 0.3;
    const cpx = bx + sway * 0.6;
    const cpy = by - height * 0.5;
    const tipX = bx + sway;
    const tipY = by - height;
    const r = Math.max(0, green - 12);
    const g2 = Math.min(255, green + 48);
    const b2 = Math.max(0, green - 22);
    blades.push(
      `<path d="M ${bx} ${by} Q ${cpx} ${cpy} ${tipX} ${tipY}" stroke="rgb(${r},${g2},${b2})" stroke-width="${width}" stroke-linecap="round" fill="none" />`
    );
    if (z >= 2 && height > 28 && (h >> 28) % 3 === 0) {
      blades.push(
        `<ellipse cx="${tipX}" cy="${tipY}" rx="1.5" ry="3" fill="rgb(${green + 30}, ${green + 20}, ${green - 10})" opacity="0.6" transform="rotate(${sway * 3},${tipX},${tipY})" />`
      );
    }
  }
  parts.push(`<g>`);
  parts.push(blades.join("\n    "));
  parts.push(`</g>`);
  if ((hash >> 12) % 4 === 0) {
    const fx = 20 + hash % 88;
    const fy = 70 + (hash >> 6) % 30;
    const fc = (hash >> 10) % 3;
    const colors = ["#e8e040", "#e86080", "#d0a0e0"];
    parts.push(`<circle cx="${fx}" cy="${fy}" r="2.5" fill="${colors[fc]}" opacity="0.7" />`);
    parts.push(`<circle cx="${fx}" cy="${fy}" r="1" fill="white" opacity="0.5" />`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function woodenFenceSvg(variant) {
  const parts = [];
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="35" cy="95" rx="22" ry="14" fill="#458550" opacity="0.4" />`);
  parts.push(`<ellipse cx="95" cy="35" rx="18" ry="12" fill="#2d6838" opacity="0.35" />`);
  const railW = 6;
  const postW = 10;
  const postH = 48;
  const mid = 64;
  function post(x, y) {
    const px = x - postW / 2;
    const py = y - postH;
    return [
      // Post shadow
      `<rect x="${px + 2}" y="${py + 4}" width="${postW}" height="${postH}" rx="1" fill="rgba(0,0,0,0.15)" />`,
      // Post body (wood grain)
      `<rect x="${px}" y="${py}" width="${postW}" height="${postH}" rx="1.5" fill="#8B6914" />`,
      // Lighter strip (grain)
      `<rect x="${px + 2}" y="${py}" width="3" height="${postH}" fill="#a07820" opacity="0.4" />`,
      // Dark edge
      `<rect x="${px + postW - 2}" y="${py}" width="2" height="${postH}" fill="#6a5010" opacity="0.3" />`,
      // Top cap (rounded)
      `<ellipse cx="${x}" cy="${py}" rx="${postW / 2}" ry="3" fill="#9a7018" />`,
      `<ellipse cx="${x}" cy="${py}" rx="${postW / 2 - 1}" ry="2" fill="#b08828" opacity="0.5" />`
    ].join("\n    ");
  }
  function hRails(x1, x2, cy) {
    const topY = cy - 18;
    const botY = cy + 2;
    return [
      // Rail shadows
      `<rect x="${x1}" y="${topY + 2}" width="${x2 - x1}" height="${railW}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${x1}" y="${botY + 2}" width="${x2 - x1}" height="${railW}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      // Top rail
      `<rect x="${x1}" y="${topY}" width="${x2 - x1}" height="${railW}" rx="1" fill="#9a7018" />`,
      `<rect x="${x1}" y="${topY}" width="${x2 - x1}" height="2" fill="#b08828" opacity="0.3" />`,
      // Bottom rail
      `<rect x="${x1}" y="${botY}" width="${x2 - x1}" height="${railW}" rx="1" fill="#8B6914" />`,
      `<rect x="${x1}" y="${botY}" width="${x2 - x1}" height="2" fill="#a07820" opacity="0.3" />`
    ].join("\n    ");
  }
  function vRails(y1, y2, cx) {
    const leftX = cx - 18;
    const rightX = cx + 2;
    return [
      `<rect x="${leftX + 2}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${rightX + 2}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="rgba(0,0,0,0.12)" />`,
      `<rect x="${leftX}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="#9a7018" />`,
      `<rect x="${leftX}" y="${y1}" width="2" height="${y2 - y1}" fill="#b08828" opacity="0.3" />`,
      `<rect x="${rightX}" y="${y1}" width="${railW}" height="${y2 - y1}" rx="1" fill="#8B6914" />`,
      `<rect x="${rightX}" y="${y1}" width="2" height="${y2 - y1}" fill="#a07820" opacity="0.3" />`
    ].join("\n    ");
  }
  function dRailRight() {
    return [
      `<line x1="0" y1="${mid - 12}" x2="128" y2="${mid + 12}" stroke="rgba(0,0,0,0.12)" stroke-width="${railW + 2}" />`,
      `<line x1="0" y1="${mid + 8}" x2="128" y2="${mid + 32}" stroke="rgba(0,0,0,0.12)" stroke-width="${railW + 2}" />`,
      `<line x1="0" y1="${mid - 12}" x2="128" y2="${mid + 12}" stroke="#9a7018" stroke-width="${railW}" />`,
      `<line x1="0" y1="${mid + 8}" x2="128" y2="${mid + 32}" stroke="#8B6914" stroke-width="${railW}" />`
    ].join("\n    ");
  }
  function dRailLeft() {
    return [
      `<line x1="128" y1="${mid - 12}" x2="0" y2="${mid + 12}" stroke="rgba(0,0,0,0.12)" stroke-width="${railW + 2}" />`,
      `<line x1="128" y1="${mid + 8}" x2="0" y2="${mid + 32}" stroke="rgba(0,0,0,0.12)" stroke-width="${railW + 2}" />`,
      `<line x1="128" y1="${mid - 12}" x2="0" y2="${mid + 12}" stroke="#9a7018" stroke-width="${railW}" />`,
      `<line x1="128" y1="${mid + 8}" x2="0" y2="${mid + 32}" stroke="#8B6914" stroke-width="${railW}" />`
    ].join("\n    ");
  }
  if (variant === "diagonal-right") {
    parts.push(dRailRight());
    parts.push(post(mid, mid + postH / 2));
    parts.push(post(6, mid - 9 + postH / 2));
    parts.push(post(122, mid + 15 + postH / 2));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
  }
  if (variant === "diagonal-left") {
    parts.push(dRailLeft());
    parts.push(post(mid, mid + postH / 2));
    parts.push(post(122, mid - 9 + postH / 2));
    parts.push(post(6, mid + 15 + postH / 2));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
  }
  if (variant === "vertex") {
    parts.push(`<circle cx="${mid}" cy="${mid + postH / 2 + 6}" r="9" fill="#6a5010" opacity="0.3" />`);
    parts.push(post(mid, mid + postH / 2));
    parts.push(`<g stroke="#4a8a54" stroke-width="1" stroke-linecap="round" opacity="0.5">`);
    parts.push(`<line x1="${mid - 10}" y1="${mid + postH / 2 + 4}" x2="${mid - 14}" y2="${mid + postH / 2 - 4}" />`);
    parts.push(`<line x1="${mid + 10}" y1="${mid + postH / 2 + 3}" x2="${mid + 14}" y2="${mid + postH / 2 - 3}" />`);
    parts.push(`</g>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
  }
  const arms = { top: false, right: false, bottom: false, left: false };
  switch (variant) {
    case "straight-h":
      arms.left = arms.right = true;
      break;
    case "straight-v":
      arms.top = arms.bottom = true;
      break;
    case "corner-tr":
      arms.top = arms.right = true;
      break;
    case "corner-tl":
      arms.top = arms.left = true;
      break;
    case "corner-br":
      arms.bottom = arms.right = true;
      break;
    case "corner-bl":
      arms.bottom = arms.left = true;
      break;
    case "cross":
      arms.top = arms.right = arms.bottom = arms.left = true;
      break;
    case "tee-t":
      arms.left = arms.right = arms.bottom = true;
      break;
    case "tee-b":
      arms.left = arms.right = arms.top = true;
      break;
    case "tee-r":
      arms.top = arms.bottom = arms.left = true;
      break;
    case "tee-l":
      arms.top = arms.bottom = arms.right = true;
      break;
    case "end-t":
      arms.bottom = true;
      break;
    case "end-b":
      arms.top = true;
      break;
    case "end-r":
      arms.left = true;
      break;
    case "end-l":
      arms.right = true;
      break;
    default:
      break;
  }
  if (arms.left) parts.push(hRails(0, mid, mid));
  if (arms.right) parts.push(hRails(mid, 128, mid));
  if (arms.top) parts.push(vRails(0, mid, mid));
  if (arms.bottom) parts.push(vRails(mid, 128, mid));
  parts.push(post(mid, mid + postH / 2));
  if (arms.left) parts.push(post(postW / 2, mid + postH / 2));
  if (arms.right) parts.push(post(128 - postW / 2, mid + postH / 2));
  if (arms.top) parts.push(post(mid, postH / 2 + 4));
  if (arms.bottom) parts.push(post(mid, 128 - 4));
  parts.push(`<g stroke="#4a8a54" stroke-width="1" stroke-linecap="round" opacity="0.4">`);
  parts.push(`<line x1="${mid - 8}" y1="${mid + postH / 2 + 2}" x2="${mid - 11}" y2="${mid + postH / 2 - 4}" />`);
  parts.push(`<line x1="${mid + 8}" y1="${mid + postH / 2 + 1}" x2="${mid + 11}" y2="${mid + postH / 2 - 3}" />`);
  parts.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function tallGrassZ(worldCol, worldRow) {
  const hash = (worldCol * 48271 ^ worldRow * 67867) >>> 0;
  return 1 + hash % 3;
}
function getVariantSvg(nanoKind, variant, connections, zOffset, worldCol, worldRow) {
  switch (nanoKind) {
    case "stone-wall":
      return stoneWallSvg(variant);
    case "fence":
      return woodenFenceSvg(variant);
    case "river":
      return riverSvg(variant, connections);
    case "tall-grass":
      return tallGrassSvg(zOffset, worldCol, worldRow);
    default:
      return null;
  }
}
var WALL_EDGE_MASKS = {
  top: { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  right: { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  bottom: { samples: [1, 1, 1, 1, 1, 1, 1, 1] },
  left: { samples: [1, 1, 1, 1, 1, 1, 1, 1] }
};
var RIVER_EDGE_MASKS = {
  top: { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
  right: { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
  bottom: { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] },
  left: { samples: [0.9, 0.7, 0.4, 0.2, 0.2, 0.4, 0.7, 0.9] }
};
var GRASS_BLEND_MASKS = {
  top: { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
  right: { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
  bottom: { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] },
  left: { samples: [0.8, 0.6, 0.4, 0.2, 0.2, 0.4, 0.6, 0.8] }
};
function isWallPosition(worldCol, worldRow) {
  if (worldRow === 5 && worldCol >= -2 && worldCol <= 15) return true;
  if (worldCol === 15 && worldRow >= 5 && worldRow <= 18) return true;
  if (worldRow === 12 && worldCol >= 10 && worldCol <= 15) return true;
  return false;
}
function isRiverPosition(worldCol, worldRow) {
  const diagRow = 20 - worldCol;
  if (worldCol >= 0 && worldCol <= 8 && worldRow === diagRow) return true;
  if (worldRow === 12 && worldCol >= 8 && worldCol <= 22) return false;
  if (worldRow === 18 && worldCol >= 3 && worldCol <= 20) return true;
  if (worldCol === 3 && worldRow >= 18 && worldRow <= 24) return true;
  return false;
}
function isTallGrassPosition(worldCol, worldRow) {
  const hash = (worldCol * 92821 ^ worldRow * 41077) >>> 0;
  if (worldRow >= 0 && worldRow <= 10 && worldCol >= -5 && worldCol <= 5) {
    return hash % 7 === 0;
  }
  return false;
}
function isFencePosition(worldCol, worldRow) {
  if (worldRow >= 0 && worldRow <= 8 && worldCol >= 20 && worldCol <= 28) {
    if (worldRow === 0 || worldRow === 8 || worldCol === 20 || worldCol === 28) {
      return true;
    }
  }
  return false;
}
function solveChunkFeatures(chunk, lookup) {
  const newTiles = [];
  let changed = false;
  for (let row = 0; row < CHUNK_TILES; row++) {
    for (let col = 0; col < CHUNK_TILES; col++) {
      const tile = chunk.tiles[row * CHUNK_TILES + col];
      const worldCol = chunk.cx * CHUNK_TILES + col;
      const worldRow = chunk.cy * CHUNK_TILES + row;
      const nanoKind = getNanoKind(tile);
      if (nanoKind === "fence") {
        const nano = tile.nanos[0];
        const v = nano.variant;
        if (v === "diagonal-left" || v === "diagonal-right" || v === "vertex") {
          const updatedNano = { ...nano, svg: woodenFenceSvg(v) };
          newTiles.push({ ...tile, edgeMasks: GRASS_BLEND_MASKS, nanos: [updatedNano] });
          changed = true;
          continue;
        }
      }
      if (nanoKind && CONNECTABLE_KINDS.has(nanoKind)) {
        const nano = tile.nanos[0];
        const neighbors = getNeighbors(chunk, col, row, lookup);
        const connections = resolveConnections(nanoKind, neighbors);
        const variant = selectVariant(connections);
        const variantSvg = getVariantSvg(
          nanoKind,
          variant,
          connections,
          nano.zOffset,
          worldCol,
          worldRow
        );
        const edgeMasks = nanoKind === "river" ? RIVER_EDGE_MASKS : nanoKind === "fence" ? GRASS_BLEND_MASKS : WALL_EDGE_MASKS;
        const updatedNano = {
          ...nano,
          connections,
          variant,
          svg: variantSvg ?? nano.svg,
          // For extruded nanos (stone walls), use variant SVG as the visible side face
          ...nanoKind === "stone-wall" && variantSvg ? { sideTextureSvg: variantSvg } : {}
        };
        newTiles.push({
          ...tile,
          edgeMasks,
          nanos: [updatedNano]
        });
        changed = true;
        continue;
      }
      if (nanoKind === "tall-grass") {
        const nano = tile.nanos[0];
        const z = tallGrassZ(worldCol, worldRow);
        const svg = tallGrassSvg(z, worldCol, worldRow);
        const updatedNano = {
          ...nano,
          zOffset: z,
          svg
        };
        newTiles.push({
          ...tile,
          edgeMasks: GRASS_BLEND_MASKS,
          nanos: [updatedNano]
        });
        changed = true;
        continue;
      }
      newTiles.push(tile);
    }
  }
  if (!changed) {
    if (chunk.walkableMap.length === 0) {
      return { ...chunk, walkableMap: buildWalkableMap(chunk) };
    }
    return chunk;
  }
  const { tiles: gatedTiles, newConditions: gateConditions } = placeGatesInFenceRuns(newTiles, chunk.cx, chunk.cy);
  const { tiles: bridgedTiles, newConditions: bridgeConditions } = placeRiverCrossings(gatedTiles, chunk.cx, chunk.cy);
  for (const [id, state] of gateConditions) chunk.activeConditions.set(id, state);
  for (const [id, state] of bridgeConditions) chunk.activeConditions.set(id, state);
  const tempForWalkable = { ...chunk, tiles: bridgedTiles, activeConditions: chunk.activeConditions };
  const wm = buildWalkableMap(tempForWalkable);
  return {
    ...chunk,
    tiles: bridgedTiles,
    dirty: true,
    walkableMap: wm
    // activeConditions already mutated above — same Map reference carried via spread
  };
}
function getDiagonalFenceVariant(worldCol, worldRow) {
  if (worldCol === 17 && worldRow === 1) return "vertex";
  if (worldCol === 18 && worldRow === 2) return "diagonal-right";
  if (worldCol === 19 && worldRow === 3) return "diagonal-right";
  if (worldCol === 20 && worldRow === 4) return "vertex";
  if (worldCol === 25 && worldRow === 1) return "vertex";
  if (worldCol === 24 && worldRow === 2) return "diagonal-left";
  if (worldCol === 23 && worldRow === 3) return "diagonal-left";
  if (worldCol === 22 && worldRow === 4) return "vertex";
  return null;
}
function getFeatureKind(worldCol, worldRow) {
  if (isWallPosition(worldCol, worldRow)) return "stone-wall";
  if (isFencePosition(worldCol, worldRow)) return "fence";
  if (getDiagonalFenceVariant(worldCol, worldRow)) return "fence";
  if (isRiverPosition(worldCol, worldRow)) return "river";
  if (isTallGrassPosition(worldCol, worldRow)) return "tall-grass";
  return null;
}
function gateSvg(unlocked) {
  const parts = [];
  parts.push(`<rect width="128" height="128" fill="#3a7d44" />`);
  parts.push(`<ellipse cx="64" cy="100" rx="30" ry="16" fill="#458550" opacity="0.4" />`);
  const postH = 48;
  const mid = 64;
  const railW = 6;
  parts.push(`<rect x="4" y="${mid - postH}" width="10" height="${postH}" rx="1.5" fill="#8B6914" />`);
  parts.push(`<rect x="6" y="${mid - postH}" width="3" height="${postH}" fill="#a07820" opacity="0.4" />`);
  parts.push(`<ellipse cx="9" cy="${mid - postH}" rx="5" ry="3" fill="#9a7018" />`);
  parts.push(`<rect x="114" y="${mid - postH}" width="10" height="${postH}" rx="1.5" fill="#8B6914" />`);
  parts.push(`<rect x="116" y="${mid - postH}" width="3" height="${postH}" fill="#a07820" opacity="0.4" />`);
  parts.push(`<ellipse cx="119" cy="${mid - postH}" rx="5" ry="3" fill="#9a7018" />`);
  if (unlocked) {
    parts.push(`<rect x="4" y="${mid - railW - 18}" width="${railW}" height="44" rx="1" fill="#9a7018" transform="rotate(-30, 9, ${mid - railW})" />`);
    parts.push(`<rect x="114" y="${mid - railW - 18}" width="${railW}" height="44" rx="1" fill="#9a7018" transform="rotate(30, 119, ${mid - railW})" />`);
    parts.push(`<text x="64" y="${mid - 4}" text-anchor="middle" font-size="14" fill="#4a8a54" font-family="monospace">[ open ]</text>`);
  } else {
    const topY = mid - 18;
    const botY = mid + 2;
    parts.push(`<rect x="14" y="${topY}" width="100" height="${railW}" rx="1" fill="#9a7018" />`);
    parts.push(`<rect x="14" y="${topY}" width="100" height="2" fill="#b08828" opacity="0.3" />`);
    parts.push(`<rect x="14" y="${botY}" width="100" height="${railW}" rx="1" fill="#8B6914" />`);
    parts.push(`<rect x="61" y="${topY - 4}" width="${railW}" height="26" rx="1" fill="#a07820" />`);
    parts.push(`<rect x="58" y="${topY + 6}" width="12" height="9" rx="2" fill="#c0a020" />`);
    parts.push(`<path d="M61 ${topY + 6} Q61 ${topY + 2} 64 ${topY + 2} Q67 ${topY + 2} 67 ${topY + 6}" fill="none" stroke="#c0a020" stroke-width="2" />`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function bridgeSvg() {
  const parts = [];
  parts.push(`<rect width="128" height="128" fill="#1a5588" />`);
  parts.push(`<rect x="0" y="32" width="128" height="64" fill="#0d3a6a" />`);
  parts.push(`<g opacity="0.15">`);
  for (let y = 40; y < 96; y += 16) {
    parts.push(`<path d="M10 ${y} Q36 ${y - 4} 64 ${y} Q92 ${y + 4} 118 ${y}" stroke="rgba(180,220,255,0.8)" stroke-width="1" fill="none" />`);
  }
  parts.push(`</g>`);
  const plankColor = ["#8B6914", "#9a7818", "#7a5910"];
  for (let i = 0; i < 5; i++) {
    const py = 38 + i * 11;
    parts.push(`<rect x="16" y="${py}" width="96" height="8" rx="1" fill="${plankColor[i % 3]}" />`);
    parts.push(`<rect x="16" y="${py}" width="96" height="2" fill="#b08828" opacity="0.25" />`);
    parts.push(`<circle cx="22" cy="${py + 4}" r="1.5" fill="#5a4010" opacity="0.6" />`);
    parts.push(`<circle cx="106" cy="${py + 4}" r="1.5" fill="#5a4010" opacity="0.6" />`);
  }
  parts.push(`<rect x="14" y="34" width="6" height="60" rx="2" fill="#7a5010" />`);
  parts.push(`<rect x="108" y="34" width="6" height="60" rx="2" fill="#7a5010" />`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function trollBridgeSvg(unlocked) {
  const parts = [];
  parts.push(`<rect width="128" height="128" fill="#1a5588" />`);
  parts.push(`<rect x="0" y="32" width="128" height="64" fill="#0d3a6a" />`);
  parts.push(`<g opacity="0.15">`);
  parts.push(`<path d="M8 50 Q34 46 64 50 Q94 54 120 50" stroke="rgba(180,220,255,0.8)" stroke-width="1" fill="none" />`);
  parts.push(`<path d="M8 70 Q34 66 64 70 Q94 74 120 70" stroke="rgba(180,220,255,0.8)" stroke-width="1" fill="none" />`);
  parts.push(`</g>`);
  const roughColors = ["#6a4a10", "#8B6014", "#5a3a08", "#7a5518"];
  for (let i = 0; i < 5; i++) {
    const py = 38 + i * 11;
    const col = roughColors[i % 4];
    parts.push(`<rect x="18" y="${py}" width="94" height="7" rx="0.5" fill="${col}" />`);
    if (i === 1 || i === 3) {
      parts.push(`<rect x="55" y="${py}" width="4" height="7" fill="#2a1a04" opacity="0.5" />`);
    }
  }
  parts.push(`<rect x="14" y="32" width="7" height="64" rx="1" fill="#5a3a08" />`);
  parts.push(`<rect x="107" y="32" width="7" height="64" rx="1" fill="#5a3a08" />`);
  if (!unlocked) {
    parts.push(`<rect x="44" y="14" width="40" height="24" rx="2" fill="#8B4513" />`);
    parts.push(`<rect x="44" y="14" width="40" height="24" rx="2" fill="none" stroke="#6a3010" stroke-width="1.5" />`);
    parts.push(`<text x="64" y="23" text-anchor="middle" font-size="6" font-family="monospace" fill="#ffd700">TROLL</text>`);
    parts.push(`<text x="64" y="31" text-anchor="middle" font-size="5" font-family="monospace" fill="#ffa500">TOLL: QUIZ</text>`);
    parts.push(`<line x1="28" y1="38" x2="44" y2="26" stroke="#888" stroke-width="2" />`);
    parts.push(`<line x1="84" y1="26" x2="100" y2="38" stroke="#888" stroke-width="2" />`);
  } else {
    parts.push(`<text x="64" y="25" text-anchor="middle" font-size="9" font-family="monospace" fill="#4aff4a">OPEN</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    ${parts.join("\n    ")}
  </svg>`;
}
function placeGatesInFenceRuns(tiles, cx, cy) {
  const newConditions = /* @__PURE__ */ new Map();
  const result = [...tiles];
  const N = CHUNK_TILES;
  for (let row = 0; row < N; row++) {
    const runIndices = [];
    for (let col = 0; col < N; col++) {
      const idx = row * N + col;
      const tile = result[idx];
      const nano = tile.nanos?.[0];
      if (nano?.kind === "fence" && nano.variant === "straight-h") {
        runIndices.push(idx);
      } else {
        if (runIndices.length >= 3) {
          const seed = cx * 131 + cy * 97 + row * 7 >>> 0;
          const gatePos = runIndices[seed % runIndices.length];
          const gt = result[gatePos];
          const wc = cx * N + gatePos % N;
          const wr = cy * N + Math.floor(gatePos / N);
          const conditionId = `quiz:gate-${wc}-${wr}`;
          newConditions.set(conditionId, "locked");
          const gateNano = {
            ...gt.nanos[0],
            kind: "gate",
            svg: gateSvg(false),
            walkable: { type: "conditional", conditionId }
          };
          result[gatePos] = { ...gt, nanos: [gateNano] };
        }
        runIndices.length = 0;
      }
    }
    if (runIndices.length >= 3) {
      const seed = cx * 131 + cy * 97 + row * 7 >>> 0;
      const gatePos = runIndices[seed % runIndices.length];
      const gt = result[gatePos];
      const wc = cx * N + gatePos % N;
      const wr = cy * N + Math.floor(gatePos / N);
      const conditionId = `quiz:gate-${wc}-${wr}`;
      newConditions.set(conditionId, "locked");
      const gateNano = {
        ...gt.nanos[0],
        kind: "gate",
        svg: gateSvg(false),
        walkable: { type: "conditional", conditionId }
      };
      result[gatePos] = { ...gt, nanos: [gateNano] };
    }
  }
  for (let col = 0; col < N; col++) {
    const runIndices = [];
    for (let row = 0; row < N; row++) {
      const idx = row * N + col;
      const tile = result[idx];
      const nano = tile.nanos?.[0];
      if (nano?.kind === "fence" && nano.variant === "straight-v") {
        runIndices.push(idx);
      } else {
        if (runIndices.length >= 3) {
          const seed = cx * 97 + cy * 131 + col * 11 >>> 0;
          const gatePos = runIndices[seed % runIndices.length];
          const gt = result[gatePos];
          const wc = cx * N + gatePos % N;
          const wr = cy * N + Math.floor(gatePos / N);
          const conditionId = `quiz:gate-${wc}-${wr}`;
          newConditions.set(conditionId, "locked");
          const gateNano = {
            ...gt.nanos[0],
            kind: "gate",
            svg: gateSvg(false),
            walkable: { type: "conditional", conditionId }
          };
          result[gatePos] = { ...gt, nanos: [gateNano] };
        }
        runIndices.length = 0;
      }
    }
    if (runIndices.length >= 3) {
      const seed = cx * 97 + cy * 131 + col * 11 >>> 0;
      const gatePos = runIndices[seed % runIndices.length];
      const gt = result[gatePos];
      const wc = cx * N + gatePos % N;
      const wr = cy * N + Math.floor(gatePos / N);
      const conditionId = `quiz:gate-${wc}-${wr}`;
      newConditions.set(conditionId, "locked");
      const gateNano = {
        ...gt.nanos[0],
        kind: "gate",
        svg: gateSvg(false),
        walkable: { type: "conditional", conditionId }
      };
      result[gatePos] = { ...gt, nanos: [gateNano] };
    }
  }
  return { tiles: result, newConditions };
}
function placeRiverCrossings(tiles, cx, cy) {
  const newConditions = /* @__PURE__ */ new Map();
  const result = [...tiles];
  const N = CHUNK_TILES;
  const entropy = cx * 31 + cy * 17 >>> 0;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const idx = row * N + col;
      const tile = result[idx];
      const nano = tile.nanos?.[0];
      if (!nano || nano.kind !== "river") continue;
      const conn = nano.connections;
      if (!conn) continue;
      const isHorizontalRun = (conn.left || conn.right) && !(conn.top || conn.bottom);
      const isVerticalRun = (conn.top || conn.bottom) && !(conn.left || conn.right);
      if (!isHorizontalRun && !isVerticalRun) continue;
      const straightIdx = isHorizontalRun ? col : row;
      if (straightIdx % 5 !== 2) continue;
      const worldCol = cx * N + col;
      const worldRow = cy * N + row;
      const isTroll = (entropy + col * 7 + row * 13) % 3 === 0;
      if (isTroll) {
        const conditionId = `quiz:bridge-${worldCol}-${worldRow}`;
        newConditions.set(conditionId, "locked");
        const bridgeNano = {
          kind: "troll-bridge",
          zOffset: 0,
          zMode: "flat",
          svg: trollBridgeSvg(false),
          walkable: { type: "conditional", conditionId },
          blendEdges: false
        };
        result[idx] = { ...tile, nanos: [...tile.nanos, bridgeNano] };
      } else {
        const bridgeNano = {
          kind: "bridge",
          zOffset: 0,
          zMode: "flat",
          svg: bridgeSvg(),
          walkable: { type: "always" },
          blendEdges: false
        };
        result[idx] = { ...tile, nanos: [...tile.nanos, bridgeNano] };
      }
    }
  }
  return { tiles: result, newConditions };
}
function buildWalkableMap(chunk) {
  const N = CHUNK_TILES;
  const map = new Array(N * N).fill(true);
  for (let i = 0; i < N * N; i++) {
    const tile = chunk.tiles[i];
    if (!tile.nanos || tile.nanos.length === 0) continue;
    let hasNeverBlock = false;
    let hasAlwaysPass = false;
    let hasConditionalUnlocked = false;
    let hasConditionalLocked = false;
    for (const nano of tile.nanos) {
      switch (nano.walkable.type) {
        case "never":
          hasNeverBlock = true;
          break;
        case "always":
          hasAlwaysPass = true;
          break;
        case "conditional": {
          const state = chunk.activeConditions.get(nano.walkable.conditionId);
          if (state === "unlocked") hasConditionalUnlocked = true;
          else hasConditionalLocked = true;
          break;
        }
      }
    }
    if (hasConditionalLocked) {
      map[i] = false;
    } else if (hasConditionalUnlocked || hasAlwaysPass) {
      map[i] = true;
    } else if (hasNeverBlock) {
      map[i] = false;
    }
  }
  return map;
}
function validateChunkTraversability(chunk) {
  const N = CHUNK_TILES;
  const walkable = chunk.walkableMap.length === N * N ? chunk.walkableMap : buildWalkableMap(chunk);
  const visited = new Uint8Array(N * N);
  const queue = [];
  for (let col = 0; col < N; col++) {
    const idx = col;
    if (walkable[idx] && !visited[idx]) {
      visited[idx] = 1;
      queue.push(idx);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const r = Math.floor(cur / N);
    const c = cur % N;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const ni = nr * N + nc;
      if (!visited[ni] && walkable[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }
  for (let col = 0; col < N; col++) {
    if (visited[(N - 1) * N + col]) return true;
  }
  for (let row = 0; row < N; row++) {
    if (visited[row * N] || visited[row * N + N - 1]) return true;
  }
  return false;
}
function resolveCondition(chunk, conditionId) {
  if (!chunk.activeConditions.has(conditionId)) return;
  chunk.activeConditions.set(conditionId, "unlocked");
  chunk.dirty = true;
  const newMap = buildWalkableMap(chunk);
  chunk.walkableMap.length = 0;
  chunk.walkableMap.push(...newMap);
}
function resolveAllConditions(chunk) {
  for (const key of chunk.activeConditions.keys()) {
    chunk.activeConditions.set(key, "unlocked");
  }
  chunk.dirty = true;
  const newMap = buildWalkableMap(chunk);
  chunk.walkableMap.length = 0;
  chunk.walkableMap.push(...newMap);
}
function placeAssembly(assembly, originCol, originRow, chunk) {
  const chunkOriginCol = chunk.cx * CHUNK_TILES;
  const chunkOriginRow = chunk.cy * CHUNK_TILES;
  const zOrder = { "negative": 0, "flat": 1, "positive": 2 };
  for (const placement of assembly.placements) {
    const worldCol = originCol + placement.col;
    const worldRow = originRow + placement.row;
    const localCol = worldCol - chunkOriginCol;
    const localRow = worldRow - chunkOriginRow;
    if (localCol < 0 || localCol >= CHUNK_TILES || localRow < 0 || localRow >= CHUNK_TILES) {
      continue;
    }
    const idx = localRow * CHUNK_TILES + localCol;
    const tile = chunk.tiles[idx];
    const existing = tile.nanos ?? [];
    const merged = [...existing, ...placement.nanos];
    merged.sort((a, b) => (zOrder[a.zMode] ?? 1) - (zOrder[b.zMode] ?? 1));
    chunk.tiles[idx] = { ...tile, nanos: merged };
  }
  chunk.dirty = true;
}
export {
  buildWalkableMap,
  getDiagonalFenceVariant,
  getFeatureKind,
  getVariantSvg,
  isFencePosition,
  isRiverPosition,
  isTallGrassPosition,
  isWallPosition,
  placeAssembly,
  resolveAllConditions,
  resolveCondition,
  solveChunkFeatures,
  validateChunkTraversability,
  woodenFenceSvg
};
