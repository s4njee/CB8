import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface ReaderToolbarProps {
  title: string;
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onBack: () => void;
  visible: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  extraControls?: React.ReactNode;
}

export default function ReaderToolbar({
  title,
  currentPage,
  pageCount,
  onPageChange,
  onBack,
  visible,
  onMouseEnter,
  onMouseLeave,
  extraControls,
}: ReaderToolbarProps) {
  const safePageCount = Math.max(1, pageCount);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safePageCount));

  return (
    <header
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "absolute top-0 left-0 right-0 h-13 z-50 flex items-center justify-between gap-4 px-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 text-zinc-100 select-none transition-all duration-300 ease-in-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
      )}
    >
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 flex items-center gap-1.5 shrink-0"
      >
        <ArrowLeft className="h-4.5 w-4.5" />
        <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">Back</span>
      </Button>

      {/* Title */}
      <div className="text-xs font-semibold truncate max-w-[200px] md:max-w-xs text-zinc-300">
        {title}
      </div>

      {/* Scrubbing Slider (1-indexed for reader page navigation) */}
      {pageCount > 1 && (
        <div className="flex-1 max-w-md mx-2 flex items-center gap-3">
          <Slider
            value={[safeCurrentPage]}
            min={1}
            max={safePageCount}
            step={1}
            onValueChange={(val) => onPageChange(val[0])}
            className="flex-1 cursor-pointer [&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary [&_.bg-primary]:bg-primary [&_.bg-secondary]:bg-zinc-800"
          />
        </div>
      )}

      {/* Page Count Info */}
      <div className="text-xs font-mono text-zinc-400 shrink-0 select-none">
        {pageCount > 0 ? `${safeCurrentPage} / ${safePageCount}` : ''}
      </div>

      {/* Extra settings (format specific options) */}
      {extraControls && (
        <div className="flex items-center shrink-0">
          {extraControls}
        </div>
      )}
    </header>
  );
}
