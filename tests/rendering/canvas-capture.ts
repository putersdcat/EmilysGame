import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

export async function writePngDataUrl(path: string, dataUrl: string): Promise<void> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(path, Buffer.from(base64, 'base64'));
}

/**
 * Capture the actual game canvas backing store, not a browser-composited screenshot.
 * Playwright element screenshots can pick up unrelated compositor surfaces on this
 * branch; canvas.toDataURL() is the honest renderer artifact for visual review.
 */
export async function writeGameCanvasPng(page: Page, path: string): Promise<void> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Game canvas not found');
    return canvas.toDataURL('image/png');
  });
  await writePngDataUrl(path, dataUrl);
}
