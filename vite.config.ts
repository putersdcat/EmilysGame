import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src',
  publicDir: path.resolve(__dirname, 'public'),
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
  },
  // Include .wasm files as assets
  assetsInclude: ['**/*.wasm'],
});
