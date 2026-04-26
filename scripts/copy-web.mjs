/**
 * copy-web.mjs — copies src/web/ into the packaged Electron app's resources.
 * Called by forge.config.ts packageAfterCopy hook.
 */
import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcWeb = join(__dirname, '..', 'src', 'web');

export function copyWebAssets(appDir) {
  const dest = join(appDir, 'web');
  mkdirSync(dest, { recursive: true });
  cpSync(srcWeb, dest, { recursive: true });
  console.log(`[CB8] Copied src/web → ${dest}`);
}
