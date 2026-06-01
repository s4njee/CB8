#!/usr/bin/env node
/**
 * build-standalone.mjs — bundle src/main/standalone.ts → dist/standalone.cjs.
 *
 * All node_modules deps stay external (resolved at runtime against the
 * installed node_modules tree). Only first-party TypeScript is bundled.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const externals = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
  'electron',
  'better-sqlite3',
  'sharp',
  'bindings',
  'node-7z',
  'yauzl',
  '@jsquash/jxl',
  '@napi-rs/canvas',
  'pdfjs-dist',
];

await build({
  entryPoints: [join(root, 'src/main/standalone.ts')],
  outfile: join(root, 'dist/standalone.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...new Set(externals)],
  logLevel: 'info',
  banner: {
    // Make CJS-only deps requireable from this ESM bundle, and emit a shebang.
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __cb8_createRequire } from 'node:module';",
      "import { fileURLToPath as __cb8_fileURLToPath } from 'node:url';",
      "import { dirname as __cb8_dirname } from 'node:path';",
      'const require = __cb8_createRequire(import.meta.url);',
      'const __filename = __cb8_fileURLToPath(import.meta.url);',
      'const __dirname = __cb8_dirname(__filename);',
    ].join('\n'),
  },
});

console.log('[build-standalone] dist/standalone.mjs ready');
