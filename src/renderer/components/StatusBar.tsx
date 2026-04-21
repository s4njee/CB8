import React from 'react';
import { formatStatusBar } from '../../shared/statusFormat';

interface StatusBarProps {
  currentPage: number;
  totalPages: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ currentPage, totalPages }) => {
  if (totalPages <= 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '4px 12px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: '#fff',
        fontSize: '14px',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {formatStatusBar(currentPage, totalPages)}
    </div>
  );
};
