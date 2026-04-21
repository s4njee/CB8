import React, { useEffect, useState, useCallback } from 'react';
import type { ComicRecord } from '../../shared/types';
import { getRecentlyRead } from '../ipcClient';

interface Props {
  onOpenComic: (filePath: string, resumePage?: number) => void;
  refreshKey: number;
}

function parseThumb(data: unknown): string | null {
  if (!data) return null;
  try {
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (typeof data === 'object' && data !== null && 'type' in data && (data as any).type === 'Buffer' && Array.isArray((data as any).data))
      bytes = new Uint8Array((data as any).data);
    else if (data instanceof Uint8Array) bytes = data;
    else if (typeof data === 'object') bytes = new Uint8Array(Object.values(data as any) as number[]);
    else return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy.buffer]));
  } catch { return null; }
}

export const ContinueReadingShelf: React.FC<Props> = ({ onOpenComic, refreshKey }) => {
  const [comics, setComics] = useState<(ComicRecord & { thumbUrl: string | null })[]>([]);

  const load = useCallback(async () => {
    try {
      const recent = await getRecentlyRead(12);
      setComics(recent.map((c) => ({ ...c, thumbUrl: parseThumb(c.coverThumbnail) })));
    } catch { setComics([]); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (comics.length === 0) return null;

  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid #333', padding: '10px 12px 8px' }}>
      <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8, fontWeight: 'bold' }}>Continue Reading</div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {comics.map((comic) => {
          const progress = comic.lastPage != null && comic.pageCount > 0
            ? Math.round(((comic.lastPage + 1) / comic.pageCount) * 100)
            : 0;
          return (
            <div key={comic.id}
              onClick={() => onOpenComic(comic.filePath, comic.lastPage ?? undefined)}
              style={{
                flexShrink: 0, width: 120, cursor: 'pointer', textAlign: 'center',
                borderRadius: 6, overflow: 'hidden', backgroundColor: '#252525',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ width: 120, height: 168, backgroundColor: '#333', position: 'relative' }}>
                {comic.thumbUrl ? (
                  <img src={comic.thumbUrl} alt={comic.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#555', fontSize: 32 }}>📖</span>
                  </div>
                )}
                {/* Progress bar */}
                {progress > 0 && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progress >= 100 ? '#4ade80' : '#5b9aff', transition: 'width 0.2s' }} />
                  </div>
                )}
              </div>
              <div style={{ padding: '4px 6px', fontSize: 11, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {comic.title}
              </div>
              <div style={{ padding: '0 6px 4px', fontSize: 10, color: '#888' }}>
                {progress >= 100 ? 'Finished' : `${progress}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
