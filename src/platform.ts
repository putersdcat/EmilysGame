/**
 * platform.ts — Platform detection: Tesla in-car browser, Apple mobile, touch auto-show.
 * Centralizes UA heuristics and URL-param overrides for #185 (Tesla mode) and #126 (touch auto-show).
 * TODO: DOC — Tesla detection heuristics, URL params, localStorage keys
 */

const TESLA_MODE_KEY = 'emilys_game_tesla_mode';

// ═══════════════════════════════════════════════════════════════
//  TESLA DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Conservative Tesla browser auto-detection.
 * The 2025 Tesla Model S reports: "Mozilla/5.0 (X11; Linux x86_64) ... Chrome/136 ..."
 * with NO "Tesla" token. We match: Linux x86_64 + Chrome + large viewport + no other browser identifiers.
 * This is intentionally conservative — may miss some Tesla models, won't false-positive on typical desktop Linux.
 * See Docs/Tesla-Browser-UA-Strings.md for reference UA data.
 */
export function detectTeslaBrowser(): boolean {
  const ua = navigator.userAgent;
  // Must be X11/Linux x86_64 Chrome, not Edge/Firefox/Opera/Samsung
  const isLinuxChrome = /X11;\s*Linux\s+x86_64/.test(ua)
    && /Chrome\/\d/.test(ua)
    && !/Edg|Firefox|OPR|SamsungBrowser/.test(ua);
  if (!isLinuxChrome) return false;
  // Tesla screens are ≥ 15" (Model S/X: ~1920×1200, Model 3/Y: ~1920×1080)
  // Require large viewport as secondary signal
  return window.innerWidth >= 1200 && window.innerHeight >= 600;
}

/** Check ?tesla=1 URL parameter (force-enable) */
export function hasTeslaUrlParam(): boolean {
  return new URLSearchParams(window.location.search).get('tesla') === '1';
}

/** Check ?tesla=0 URL parameter (force-disable) */
function hasTeslaDisabledParam(): boolean {
  return new URLSearchParams(window.location.search).get('tesla') === '0';
}

/** Read stored Tesla mode preference from localStorage */
function getTeslaPreference(): boolean | null {
  const val = localStorage.getItem(TESLA_MODE_KEY);
  if (val === '1') return true;
  if (val === '0') return false;
  return null;
}

/**
 * Is Tesla mode currently active?
 * Priority: ?tesla=0 → false; ?tesla=1 → true; localStorage → stored; else → detectTeslaBrowser().
 * Auto-detection is the fallback when no explicit preference is stored (#188).
 */
export function isTeslaMode(): boolean {
  if (hasTeslaDisabledParam()) return false;
  if (hasTeslaUrlParam()) return true;
  const pref = getTeslaPreference();
  if (pref !== null) return pref;
  // No stored preference — fall back to conservative auto-detection.
  // detectTeslaBrowser() only matches Linux x86_64 + Chrome + large viewport,
  // so false-positives on real desktop Linux are unlikely.
  return detectTeslaBrowser();
}

/** Set and persist Tesla mode preference */
export function setTeslaMode(enabled: boolean): void {
  localStorage.setItem(TESLA_MODE_KEY, enabled ? '1' : '0');
}

// ═══════════════════════════════════════════════════════════════
//  APPLE MOBILE DETECTION
// ═══════════════════════════════════════════════════════════════

/** Detect iOS / iPadOS devices (iPhone, iPad, iPod) */
export function isMobileApple(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ═══════════════════════════════════════════════════════════════
//  TOUCH AUTO-SHOW
// ═══════════════════════════════════════════════════════════════

/**
 * Should touch controls auto-show without explicit user opt-in?
 * True on Apple mobile (iPhone/iPad/iPod) or when Tesla mode is active.
 * Desktop/Android users must manually enable touch controls in settings.
 */
export function shouldAutoShowTouchOverlay(): boolean {
  return isMobileApple() || isTeslaMode();
}
