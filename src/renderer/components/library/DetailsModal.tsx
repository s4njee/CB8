import React from 'react';
import type { ComicEntry } from './types';
import { getFileExtension, formatPageDetails, formatBytes } from './utils';

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#9ca3af' }}>{children}</div>;
}

export function DetailsModal({
  comic,
  loading,
  onClose,
}: {
  comic: ComicEntry;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        backgroundColor: 'rgba(0,0,0,0.58)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          backgroundColor: '#202020',
          color: '#e5e7eb',
          border: '1px solid #3f3f46',
          borderRadius: 8,
          boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #333' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comic.title}</div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2, textTransform: 'uppercase' }}>{getFileExtension(comic.filePath) || comic.mediaType}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #444', backgroundColor: '#2a2a2a', color: '#ddd', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            aria-label="Close details"
          >x</button>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: '10px 14px', fontSize: 13 }}>
          <DetailLabel>Path</DetailLabel>
          <div style={{ overflowWrap: 'anywhere', color: '#d1d5db' }}>{comic.filePath}</div>
          <DetailLabel>Pages</DetailLabel>
          <div>{loading ? 'Reading metadata...' : formatPageDetails(comic)}</div>
          <DetailLabel>Size</DetailLabel>
          <div>{formatBytes(comic.fileSize)}</div>
        </div>
      </div>
    </div>
  );
}
