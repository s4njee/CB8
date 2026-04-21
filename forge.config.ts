import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import path from 'node:path';
import fs from 'node:fs';

/** Modules that Vite externalises and the packaged app must ship. */
const nativeExternals = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  'prebuild-install',
  'node-abi',
  'node-unrar-js',
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
      unpack: '**/node_modules/{better-sqlite3,node-unrar-js}/**',
    },
    icon: 'book',
    executableName: 'cb8',
  },
  hooks: {
    packageAfterCopy: async (_config, appDir) => {
      copyModules(appDir);
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ authors: 's4njee' }),
    new MakerZIP({}, ['linux']),
    new MakerDMG({}),
    new MakerDeb({}),
    new MakerRpm({}),
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
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
