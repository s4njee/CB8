import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { gatherFromDrop } from '@/lib/dropUtils';
import { showToast } from '@/hooks/useToast';

interface UseDropProps {
  onFilesDropped: (files: { file: File; relPath: string }[]) => void;
}

export function useDrop({ onFilesDropped }: UseDropProps) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  // Check authentication status
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
  });

  const isAuthenticated = session?.authenticated ?? false;

  useEffect(() => {
    if (!isAuthenticated) {
      setDragging(false);
      dragCounter.current = 0;
      return;
    }

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      setDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);

      if (!e.dataTransfer) return;

      try {
        const items = await gatherFromDrop(e.dataTransfer);
        if (items.length === 0) {
          showToast('No supported files in drop (.cbz, .cbr, .epub, .pdf, .mobi)');
          return;
        }
        onFilesDropped(items);
      } catch (err: any) {
        showToast(err.message || 'Drop failed');
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [isAuthenticated, onFilesDropped]);

  return { dragging };
}
