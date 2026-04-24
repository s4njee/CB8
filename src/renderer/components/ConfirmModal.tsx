import React, { useEffect } from 'react';

interface Props {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmModal({ message, confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}
    >
      <div style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: 8, padding: '24px 28px', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
        <p style={{ margin: '0 0 20px', color: '#eee', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {cancelLabel && onCancel && (
            <button onClick={onCancel} style={{ padding: '6px 16px', cursor: 'pointer', background: '#444', border: '1px solid #555', color: '#ddd', borderRadius: 4 }}>
              {cancelLabel}
            </button>
          )}
          <button onClick={onConfirm} autoFocus style={{ padding: '6px 16px', cursor: 'pointer', background: '#c44', border: 'none', color: '#fff', borderRadius: 4 }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
