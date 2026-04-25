import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: path.resolve(__dirname, 'build'),
      assets: path.resolve(__dirname, 'build'),
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
    files: {
      assets: path.resolve(__dirname, 'static'),
      hooks: { client: path.resolve(__dirname, 'src/hooks.client') },
      lib: path.resolve(__dirname, 'src/lib'),
      params: path.resolve(__dirname, 'src/params'),
      routes: path.resolve(__dirname, 'src/routes'),
      serviceWorker: path.resolve(__dirname, 'src/service-worker'),
      appTemplate: path.resolve(__dirname, 'src/app.html'),
      errorTemplate: path.resolve(__dirname, 'src/error.html'),
    },
    outDir: path.resolve(__dirname, '.svelte-kit'),
    typescript: {
      config: (config) => {
        config.include = config.include ?? [];
        return config;
      },
    },
  },
};
