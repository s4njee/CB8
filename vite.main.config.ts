import { defineConfig } from 'vite';

const externals = [
  'electron',
  'electron/main',
  'better-sqlite3',
  '@napi-rs/canvas',
  'node-unrar-js',
  'yauzl',
  '@jsquash/jxl',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'scheduler',
  'electron-squirrel-startup',
];

export default defineConfig({
  build: {
    rollupOptions: {
      external: externals,
    },
  },
  ssr: {
    external: externals,
  },
  optimizeDeps: {
    exclude: externals,
  },
});
