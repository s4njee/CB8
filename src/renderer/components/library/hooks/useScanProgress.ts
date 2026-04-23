import { useEffect, useState } from 'react';
import { onScanProgress } from '../../../ipcClient';

export function useScanProgress() {
  const [scanProgress, setScanProgress] = useState<{ discovered: number; processed: number } | null>(null);

  useEffect(() => {
    const unsub = onScanProgress((progress) => {
      setScanProgress({ discovered: progress.discovered, processed: progress.processed });
    });
    return unsub;
  }, []);

  return { scanProgress, setScanProgress };
}
