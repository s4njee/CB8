import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReaderToolbar from '../reader/ReaderToolbar';
import { cn } from '@/lib/utils';
import useWakeLock from '@/hooks/useWakeLock';

interface ReaderOverlayProps {
  title: string;
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onBack: () => void;
  children: React.ReactNode;
  extraControls?: React.ReactNode;
}

export default function ReaderOverlay({
  title,
  currentPage,
  pageCount,
  onPageChange,
  onBack,
  children,
  extraControls,
}: ReaderOverlayProps) {
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [isHoveringToolbar, setIsHoveringToolbar] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Wake Lock Lifecycle
  useWakeLock();

  // 2. Toolbar visibility timer (auto-hide after 3 seconds of inactivity)
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (isHoveringToolbar) {
      setToolbarVisible(true);
      return;
    }
    setToolbarVisible(true);
    hideTimerRef.current = setTimeout(() => {
      setToolbarVisible(false);
    }, 3000);
  }, [isHoveringToolbar]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHideTimer]);

  const handleMouseMove = () => {
    resetHideTimer();
  };

  // Keyboard navigation overrides (like Escape to exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  // Handle manual click center tap to toggle toolbar
  const handleOverlayClick = (e: React.MouseEvent) => {
    // If clicking a button or interactable elements inside toolbar, don't toggle
    const target = e.target as HTMLElement;
    if (target.closest('header') || target.closest('button') || target.closest('[role="slider"]')) {
      return;
    }
    setToolbarVisible((prev) => !prev);
  };

  return (
    <div
      onClick={handleOverlayClick}
      onMouseMove={handleMouseMove}
      className={cn(
        "relative w-screen h-screen bg-black text-white overflow-hidden flex flex-col transition-all select-none",
        toolbarVisible ? "cursor-default" : "cursor-none"
      )}
    >
      {/* Immersive Toolbar Header */}
      <ReaderToolbar
        title={title}
        currentPage={currentPage}
        pageCount={pageCount}
        onPageChange={onPageChange}
        onBack={onBack}
        visible={toolbarVisible}
        onMouseEnter={() => setIsHoveringToolbar(true)}
        onMouseLeave={() => setIsHoveringToolbar(false)}
        extraControls={extraControls}
      />

      {/* Reader Active Content Canvas */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
