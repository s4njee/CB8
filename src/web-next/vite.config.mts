import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const apiTarget = process.env.CB8_API_TARGET ?? 'http://localhost:8008';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: process.env.CB8_WEB_HOST ?? 'localhost',
    port: Number(process.env.CB8_WEB_PORT ?? 5173),
    strictPort: true,
    fs: {
      // node_modules lives at repo root, outside src/web-next.
      allow: [repoRoot],
    },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, ws: false },
    },
  },
});
