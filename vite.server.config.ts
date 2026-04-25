import { defineConfig } from 'vite';
import path from 'node:path';
import { builtinModules } from 'node:module';

/**
 * Build config for the Node server. Bundles `src/server/main.ts` to a single
 * CJS file under `dist/server/`. Native modules (better-sqlite3, sharp, etc.)
 * stay external so they load from node_modules at runtime.
 */
const externals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'better-sqlite3',
  'sharp',
  '@napi-rs/canvas',
  'node-unrar-js',
  'yauzl',
  'bcryptjs',
  'fastify',
  '@fastify/cookie',
  '@fastify/multipart',
  '@fastify/rate-limit',
  '@fastify/static',
  'pdfjs-dist',
  'bindings',
];

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, 'dist/server'),
    emptyOutDir: true,
    target: 'node22',
    ssr: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/server/main.ts'),
      output: {
        entryFileNames: 'main.cjs',
        format: 'cjs',
      },
      external: (id) => externals.some((e) => id === e || id.startsWith(`${e}/`)),
    },
    minify: false,
  },
});
