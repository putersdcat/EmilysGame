/**
 * Persistent Chromium browser pool for animated SVG rendering.
 *
 * Instead of launching and tearing down Chromium for every render call,
 * we maintain a singleton browser instance that is reused across calls.
 * Pages are cheap to create/destroy; browsers are not.
 *
 * Features:
 * - Lazy launch on first use
 * - Auto-restart on crash
 * - Idle shutdown after configurable timeout
 * - Concurrency limit to prevent OOM from too many pages
 * - Graceful cleanup on process exit
 */

let _browserPromise: Promise<any> | null = null;
let _browser: any = null;
let _chromiumModule: any = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _activePages = 0;

/** How long (ms) to keep the browser alive after the last page closes. */
const IDLE_SHUTDOWN_MS = 30_000;

/** Maximum concurrent pages allowed. */
const MAX_CONCURRENT_PAGES = 8;

/** Semaphore queue for concurrency control. */
const _waitQueue: Array<() => void> = [];

/**
 * Acquire a Chromium browser instance.
 * Launches one if none exists; reuses existing otherwise.
 */
export async function acquireBrowser(): Promise<any> {
  // Concurrency gate
  if (_activePages >= MAX_CONCURRENT_PAGES) {
    await new Promise<void>((resolve) => _waitQueue.push(resolve));
  }
  _activePages++;

  // Cancel idle shutdown since we're active
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }

  // Lazy init chromium module
  if (!_chromiumModule) {
    try {
      const pw = await import('playwright');
      _chromiumModule = pw.chromium;
    } catch {
      _activePages--;
      releaseSlot();
      throw new Error(
        'Animated SVG rendering requires Playwright. Install it with `npm i playwright` and then run `npx playwright install chromium`.'
      );
    }
  }

  // Launch browser if needed (or if previous one crashed/closed)
  if (!_browserPromise || (_browser && !_browser.isConnected())) {
    _browser = null;
    _browserPromise = _chromiumModule.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',   // Prevent /dev/shm exhaustion in containers
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-extensions',
      ]
    }).then((b: any) => {
      _browser = b;

      // Auto-recover if browser crashes
      b.on('disconnected', () => {
        _browser = null;
        _browserPromise = null;
      });

      return b;
    }).catch((err: any) => {
      _browserPromise = null;
      _activePages--;
      releaseSlot();
      throw err;
    });
  }

  return _browserPromise;
}

/**
 * Signal that a page has been closed and the slot is free.
 */
export function releaseBrowser(): void {
  _activePages = Math.max(0, _activePages - 1);
  releaseSlot();

  // Schedule idle shutdown if no active pages
  if (_activePages === 0) {
    scheduleIdleShutdown();
  }
}

function releaseSlot(): void {
  if (_waitQueue.length > 0) {
    const next = _waitQueue.shift()!;
    next();
  }
}

function scheduleIdleShutdown(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(async () => {
    if (_activePages === 0 && _browser) {
      try {
        await _browser.close();
      } catch {
        // Browser may already be gone
      }
      _browser = null;
      _browserPromise = null;
    }
  }, IDLE_SHUTDOWN_MS);
}

/**
 * Force-close the browser immediately. Used for cleanup in tests or process exit.
 */
export async function shutdownBrowserPool(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      // ignore
    }
    _browser = null;
    _browserPromise = null;
  }
  _activePages = 0;
  _waitQueue.length = 0;
}

/** Get pool stats for diagnostics. */
export function getPoolStats(): { activePages: number; queueLength: number; browserAlive: boolean } {
  return {
    activePages: _activePages,
    queueLength: _waitQueue.length,
    browserAlive: _browser != null && _browser.isConnected()
  };
}

// Cleanup on process exit
process.on('beforeExit', () => {
  void shutdownBrowserPool();
});

// Also handle SIGINT/SIGTERM for graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void shutdownBrowserPool().then(() => process.exit(0));
  });
}
