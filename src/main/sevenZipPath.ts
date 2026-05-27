import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let cachedPath: string | null = null;
let verified = false;

function resourceCandidates(): string[] {
  const resourcesPath = process.resourcesPath;
  if (!resourcesPath) return [];
  const exe = process.platform === 'win32' ? '.exe' : '';
  return [
    join(resourcesPath, '7z', `7zz${exe}`),
    join(resourcesPath, '7z', `7z${exe}`),
    join(resourcesPath, '7z', `7za${exe}`),
  ];
}

export function getSevenZipPath(): string {
  if (cachedPath) return cachedPath;

  const fromEnv = process.env.CB8_SEVENZIP_PATH?.trim();
  if (fromEnv) {
    cachedPath = fromEnv;
    return cachedPath;
  }

  const packaged = resourceCandidates().find((candidate) => existsSync(candidate));
  cachedPath = packaged ?? '7z';
  return cachedPath;
}

export function assertSevenZipAvailable(): string {
  const bin = getSevenZipPath();
  if (verified) return bin;

  const result = spawnSync(bin, ['i'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(
      `7-Zip binary is not available at "${bin}". Install 7-Zip or set CB8_SEVENZIP_PATH to a working 7z/7zz executable.`,
    );
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`7-Zip probe failed at "${bin}"${stderr ? `: ${stderr}` : ''}`);
  }

  verified = true;
  return bin;
}
