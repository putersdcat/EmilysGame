import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,           // 60s default (some tests walk across chunks)
  workers: 1, // Sequential for stability
  use: {
    baseURL: 'http://localhost:5173/',
    headless: true,
  },
  webServer: {
    command: 'npx vite',
    port: 5173,
    reuseExistingServer: true,
  },
});
