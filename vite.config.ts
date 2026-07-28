import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  root: 'src',
  publicDir: path.resolve(__dirname, 'public'),
  // Set base path for GitHub Pages deployment
  base: mode === 'pages' ? '/EmilysGame/' : '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  // Allow Vite to serve files from project root (for index.html in src/) and wasm/build/
  server: {
    fs: {
      allow: [
        path.resolve(__dirname),
      ],
    },
    // Proxy LLM API to avoid CORS in dev mode.
    // NOTE (2026-07-10): the port a local BitNet server actually runs on
    // is machine/session-dependent (docs have historically said 8000,
    // 8001, or 8002 at different points -- see Docs/LLM-API-README.md and
    // .github/instructions/llm-integration.instructions.md) -- always
    // verify with `GET http://127.0.0.1:<port>/health` before assuming a
    // number here is current, rather than trusting any single doc.
    proxy: {
      '/api/llm': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/llm/, ''),
      },
    },
  },
  // Include .wasm files as assets
  assetsInclude: ['**/*.wasm'],
}));
