import React from 'react';
import type { QueryOptions } from '../../shared/types';

interface SortControlProps {
  sortBy: QueryOptions['sortBy'];
  sortOrder: 'asc' | 'desc';
  onSortByChange: (field: QueryOptions['sortBy']) => void;
  onSortOrderToggle: () => void;
}

const SORT_OPTIONS: { value: NonNullable<QueryOptions['sortBy']>; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'fileSize', label: 'File Size' },
  { value: 'pageCount', label: 'Pages' },
  { value: 'lastRead', label: 'Recently Read' },
];

export const SortControl: React.FC<SortControlProps> = ({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderToggle,
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <label style={{ fontSize: 12, color: '#999', marginRight: 2, whiteSpace: 'nowrap' }}>Sort:</label>
      <select
        value={sortBy ?? 'title'}
        onChange={(e) => onSortByChange(e.target.value as QueryOptions['sortBy'])}
        style={{
          padding: '4px 8px',
          backgroundColor: '#333',
          color: '#eee',
          border: '1px solid #444',
          borderRadius: 4,
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        onClick={onSortOrderToggle}
        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        style={{
          padding: '4px 8px',
          backgroundColor: '#333',
          color: '#5b9aff',
          border: '1px solid #444',
          borderRadius: 4,
          fontSize: 14,
          cursor: 'pointer',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {sortOrder === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
};
