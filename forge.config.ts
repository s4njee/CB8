import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import MakerAppImage from '@reforged/maker-appimage';
import { VitePlugin } from '@electron-forge/plugin-vite';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

/** Modules that Vite externalises and the packaged app must ship. */
const nativeExternals = [
  'better-sqlite3',
  '@napi-rs/canvas',
  '@napi-rs/canvas-darwin-arm64',
  '@napi-rs/canvas-darwin-x64',
  '@napi-rs/canvas-linux-arm-gnueabihf',
  '@napi-rs/canvas-linux-arm64-gnu',
  '@napi-rs/canvas-linux-arm64-musl',
  '@napi-rs/canvas-linux-riscv64-gnu',
  '@napi-rs/canvas-linux-x64-gnu',
  '@napi-rs/canvas-linux-x64-musl',
  '@napi-rs/canvas-win32-arm64-msvc',
  '@napi-rs/canvas-win32-x64-msvc',
  'bindings',
  'bcryptjs',
  'sharp',
  '@img/colour',
  '@img/sharp-darwin-arm64',
  '@img/sharp-darwin-x64',
  '@img/sharp-libvips-darwin-arm64',
  '@img/sharp-libvips-darwin-x64',
  '@img/sharp-libvips-linux-arm',
  '@img/sharp-libvips-linux-arm64',
  '@img/sharp-libvips-linux-ppc64',
  '@img/sharp-libvips-linux-riscv64',
  '@img/sharp-libvips-linux-s390x',
  '@img/sharp-libvips-linux-x64',
  '@img/sharp-libvips-linuxmusl-arm64',
  '@img/sharp-libvips-linuxmusl-x64',
  '@img/sharp-linux-arm',
  '@img/sharp-linux-arm64',
  '@img/sharp-linux-ppc64',
  '@img/sharp-linux-riscv64',
  '@img/sharp-linux-s390x',
  '@img/sharp-linux-x64',
  '@img/sharp-linuxmusl-arm64',
  '@img/sharp-linuxmusl-x64',
  '@img/sharp-win32-arm64',
  '@img/sharp-win32-ia32',
  '@img/sharp-win32-x64',
  'detect-libc',
  'file-uri-to-path',
  'prebuild-install',
  'node-abi',
  'node-7z',
  'debug',
  'lodash.defaultsdeep',
  'lodash.defaultto',
  'lodash.flattendeep',
  'lodash.isempty',
  'lodash.negate',
  'normalize-path',
  'ms',
  '@jsquash/jxl',
  'pdfjs-dist',
  'semver',
  'yauzl',
  'fd-slicer',
  'pend',
  'buffer-crc32',
];

function copyModules(appDir: string) {
  const dest = path.join(appDir, 'node_modules');
  fs.mkdirSync(dest, { recursive: true });
  for (const mod of nativeExternals) {
    const src = path.join(__dirname, 'node_modules', mod);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(dest, mod), { recursive: true });
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack:
        '**/node_modules/{better-sqlite3,pdfjs-dist,sharp,@jsquash/jxl,@img/{colour,sharp-*,sharp-libvips-*},@napi-rs/canvas,@napi-rs/canvas-*}/**',
    },
    icon: 'book',
    executableName: 'cb8',
    extraResource: ['./book.png'],
  },
  hooks: {
    packageAfterCopy: async (_config, appDir) => {
      copyModules(appDir);
      // Copy web SPA assets into packaged app resources
      const webSrc = path.join(__dirname, 'src', 'web');
      const webDest = path.join(appDir, 'web');
      fs.mkdirSync(webDest, { recursive: true });
      fs.cpSync(webSrc, webDest, { recursive: true });
    },
    postPackage: async (_config, result) => {
      if (process.platform !== 'darwin') return;
      for (const outputPath of result.outputPaths) {
        const appPath = path.join(outputPath, 'CB8.app');
        if (fs.existsSync(appPath)) {
          console.log(`Ad-hoc signing ${appPath}`);
          execSync(`codesign --force --deep --sign - "${appPath}"`, {
            stdio: 'inherit',
          });
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ authors: 's4njee' }),
    new MakerDMG({}),
    new MakerAppImage({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      // No renderer target: PLAN10 collapsed the desktop UI onto the SPA
      // served by the embedded HTTP server (see hooks.packageAfterCopy).
      renderer: [],
    }),
  ],
};

export default config;
