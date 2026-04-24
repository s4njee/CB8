import React, { useEffect, useCallback, useState } from 'react';
import type { ComicRecord } from '../../shared/types';
import { getRecentlyRead } from '../ipcClient';

interface Props {
  mediaType?: 'comic' | 'book';
  onOpenFile: (filePath: string) => void;
  refreshKey: number;
}

function parseThumb(data: unknown): string | null {
  if (!data) return null;
  try {
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (typeof data === 'object' && data !== null && 'type' in data && (data as { type?: string }).type === 'Buffer' && Array.isArray((data as unknown as { data?: number[] }).data))
      bytes = new Uint8Array((data as unknown as { data: number[] }).data);
    else if (data instanceof Uint8Array) bytes = data;
    else if (typeof data === 'object') bytes = new Uint8Array(Object.values(data as Record<string, number>) as number[]);
    else return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy.buffer]));
  } catch {
    return null;
  }
}

function formatProgress(comic: ComicRecord): string {
  if (comic.mediaType === 'book') {
    if (comic.lastPage != null && comic.pageCount > 0) {
      const pct = Math.round(((comic.lastPage + 1) / comic.pageCount) * 100);
      return `${pct}%`;
    }
    if (comic.lastLocation) return 'Resume';
    return 'Book';
  }
  if (comic.lastPage != null && comic.pageCount > 0) {
    const pct = Math.round(((comic.lastPage + 1) / comic.pageCount) * 100);
    return pct >= 100 ? 'Finished' : `${pct}%`;
  }
  return 'Comic';
}

export const ContinueReadingShelf: React.FC<Props> = ({ mediaType, onOpenFile, refreshKey }) => {
  const [records, setRecords] = useState<(ComicRecord & { thumbUrl: string | null })[]>([]);

  const load = useCallback(async () => {
    try {
      const recent = await getRecentlyRead(12, mediaType);
      setRecords(recent.map((record) => ({ ...record, thumbUrl: parseThumb(record.coverThumbnail) })));
    } catch {
      setRecords([]);
    }
  }, [mediaType]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => () => {
    for (const record of records) {
      if (record.thumbUrl) URL.revokeObjectURL(record.thumbUrl);
    }
  }, [records]);

  if (records.length === 0) return null;

  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid #333', padding: '10px 12px 8px' }}>
      <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8, fontWeight: 'bold' }}>Continue Reading</div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {records.map((record) => (
          <div
            key={record.id}
            onClick={() => onOpenFile(record.filePath)}
            style={{
              flexShrink: 0,
              width: 120,
              cursor: 'pointer',
              textAlign: 'center',
              borderRadius: 6,
              overflow: 'hidden',
              backgroundColor: '#252525',
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ width: 120, height: 168, backgroundColor: '#333', position: 'relative' }}>
              {record.thumbUrl ? (
                <img src={record.thumbUrl} alt={record.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#555', fontSize: 32 }}>{record.mediaType === 'book' ? '📘' : '📖'}</span>
                </div>
              )}
              {record.lastPage != null && record.pageCount > 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round(((record.lastPage + 1) / record.pageCount) * 100))}%`,
                      backgroundColor: '#5b9aff',
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{ padding: '4px 6px', fontSize: 11, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {record.title}
            </div>
            <div style={{ padding: '0 6px 4px', fontSize: 10, color: '#888' }}>
              {formatProgress(record)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
