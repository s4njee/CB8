import React from 'react';
import type { QueryOptions } from '../../shared/types';

interface FilterBarProps {
  readStatus: QueryOptions['readStatus'] | undefined;
  fileExt: string | undefined;
  tag: string | undefined;
  availableTags: string[];
  onReadStatusChange: (status: QueryOptions['readStatus'] | undefined) => void;
  onFileExtChange: (ext: string | undefined) => void;
  onTagChange: (tag: string | undefined) => void;
}

const READ_STATUS_OPTIONS: { value: QueryOptions['readStatus'] | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

const FILE_TYPE_OPTIONS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'cbz', label: 'CBZ' },
  { value: 'cbr', label: 'CBR' },
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
];

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '3px 10px',
  fontSize: 12,
  borderRadius: 999,
  border: active ? '1px solid #5b9aff' : '1px solid #444',
  backgroundColor: active ? '#5b9aff' : '#333',
  color: active ? '#fff' : '#ccc',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: '18px',
});

export const FilterBar: React.FC<FilterBarProps> = ({
  readStatus,
  fileExt,
  tag,
  availableTags,
  onReadStatusChange,
  onFileExtChange,
  onTagChange,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '5px 12px',
        backgroundColor: '#252525',
        borderBottom: '1px solid #333',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      {/* Read status pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {READ_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onReadStatusChange(opt.value)}
            style={pillStyle(readStatus === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 18, backgroundColor: '#444' }} />

      {/* File type pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {FILE_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onFileExtChange(opt.value)}
            style={pillStyle(fileExt === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tag selector */}
      {availableTags.length > 0 && (
        <>
          <div style={{ width: 1, height: 18, backgroundColor: '#444' }} />
          <select
            value={tag ?? ''}
            onChange={(e) => onTagChange(e.target.value || undefined)}
            style={{
              padding: '3px 8px',
              backgroundColor: '#333',
              color: '#eee',
              border: '1px solid #444',
              borderRadius: 4,
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">All Tags</option>
            {availableTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
};
