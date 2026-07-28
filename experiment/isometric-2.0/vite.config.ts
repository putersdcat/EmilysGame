// 2.0 Experiment — Vite config (mirrors main codebase style)
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,    // Avoid conflict with main game on 5173
    open: true,
  },
});
