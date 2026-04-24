import React, { useState, useCallback } from 'react';
import { ConfirmModal } from './ConfirmModal';

type DialogState =
  | { kind: 'confirm'; message: string; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; resolve: () => void };

export function useConfirm() {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => setDialog({ kind: 'confirm', message, resolve }));
  }, []);

  const alert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => setDialog({ kind: 'alert', message, resolve }));
  }, []);

  const modal = dialog ? (
    dialog.kind === 'confirm' ? (
      <ConfirmModal
        message={dialog.message}
        onConfirm={() => { dialog.resolve(true); setDialog(null); }}
        onCancel={() => { dialog.resolve(false); setDialog(null); }}
      />
    ) : (
      <ConfirmModal
        message={dialog.message}
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => { dialog.resolve(); setDialog(null); }}
      />
    )
  ) : null;

  return { confirm, alert, modal };
}
