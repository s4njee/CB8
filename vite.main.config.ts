import { defineConfig, type Plugin } from 'vite';

// Modules to leave as runtime `require()` instead of bundling.
const extraExternals = [
  'better-sqlite3',
  '@napi-rs/canvas',
  'sharp',
  'node-unrar-js',
  'yauzl',
  '@jsquash/jxl',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
  'react',
  'react-dom',
  'scheduler',
  'electron-squirrel-startup',
  'pdfjs-dist',
  'bindings',
];

/**
 * Rollup plugin that intercepts module resolution and marks our externals.
 * This bypasses Vite's mergeConfig entirely — Rollup calls resolveId for
 * every import, and returning `{ id, external: true }` prevents bundling.
 */
function externalResolverPlugin(): Plugin {
  return {
    name: 'cb8-external-resolver',
    enforce: 'pre',
    resolveId(source) {
      for (const p of extraExternals) {
        if (source === p || source.startsWith(p + '/')) {
          return { id: source, external: true };
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [externalResolverPlugin()],
});
