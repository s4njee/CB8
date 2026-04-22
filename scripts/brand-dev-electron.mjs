import {
  copyFileSync,
  existsSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'darwin') {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const electronPackage = join(repoRoot, 'node_modules/electron');
  const electronDist = join(electronPackage, 'dist');
  const electronApp = join(electronDist, 'Electron.app');
  const cb8App = join(electronDist, 'CB8.app');
  const pathFile = join(electronPackage, 'path.txt');
  const plistPath = join(electronApp, 'Contents/Info.plist');
  const iconSource = join(repoRoot, 'book.icns');
  const iconTarget = join(electronApp, 'Contents/Resources/book.icns');
  const helperPlists = [
    ['Electron Helper.app', 'CB8 Helper', 'com.s4njee.CB8.dev.helper'],
    ['Electron Helper (GPU).app', 'CB8 Helper (GPU)', 'com.s4njee.CB8.dev.helper.GPU'],
    ['Electron Helper (Plugin).app', 'CB8 Helper (Plugin)', 'com.s4njee.CB8.dev.helper.Plugin'],
    ['Electron Helper (Renderer).app', 'CB8 Helper (Renderer)', 'com.s4njee.CB8.dev.helper.Renderer'],
  ];

  ensureCb8AppPath(cb8App);

  if (existsSync(pathFile)) {
    writeFileSync(pathFile, 'CB8.app/Contents/MacOS/Electron');
  }

  if (existsSync(plistPath)) {
    let plist = readFileSync(plistPath, 'utf8');
    plist = replacePlistString(plist, 'CFBundleDisplayName', 'CB8');
    plist = replacePlistString(plist, 'CFBundleName', 'CB8');
    plist = replacePlistString(plist, 'CFBundleIdentifier', 'com.s4njee.CB8.dev');
    plist = replacePlistString(plist, 'CFBundleIconFile', 'book.icns');
    writeFileSync(plistPath, plist);
  }

  for (const [helperApp, helperName, helperIdentifier] of helperPlists) {
    const helperPlistPath = join(electronApp, 'Contents/Frameworks', helperApp, 'Contents/Info.plist');
    if (!existsSync(helperPlistPath)) continue;

    let plist = readFileSync(helperPlistPath, 'utf8');
    plist = replacePlistString(plist, 'CFBundleName', helperName);
    plist = replacePlistString(plist, 'CFBundleIdentifier', helperIdentifier);
    writeFileSync(helperPlistPath, plist);
  }

  if (existsSync(iconSource)) {
    copyFileSync(iconSource, iconTarget);
  }
}

function ensureCb8AppPath(cb8App) {
  if (existsSync(cb8App)) return;

  symlinkSync('Electron.app', cb8App);
}

function replacePlistString(plist, key, value) {
  const pattern = new RegExp(`(<key>${escapeRegExp(key)}</key>\\s*<string>)[^<]*(</string>)`);
  return plist.replace(pattern, `$1${value}$2`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
