import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useReaderStore } from '@/store/readerStore';
import * as api from '@/lib/api';
import ReaderOverlay from '@/components/layout/ReaderOverlay';
import { Loader2 } from 'lucide-react';

import ComicReader from '@/components/reader/ComicReader';
import EpubReader from '@/components/reader/EpubReader';
import PdfReader from '@/components/reader/PdfReader';

export default function ReaderPage() {
  const { id, page } = useParams<{ id: string; page?: string }>();
  const comicId = Number(id);
  const navigate = useNavigate();

  const { currentPage, setCurrentPage, resetReader } = useReaderStore();
  const [extraControls, setExtraControls] = React.useState<React.ReactNode>(null);

  // Query to fetch comic record details
  const { data: record, isLoading, error } = useQuery<api.WebComicRecord>({
    queryKey: ['comic', comicId],
    queryFn: () => api.fetchComic(comicId),
    enabled: !isNaN(comicId),
    staleTime: 30000,
  });

  // Sync initial page parameter from URL route or database history on load
  useEffect(() => {
    if (!record) return;

    if (page) {
      const pageNum = parseInt(page, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        setCurrentPage(pageNum);
      }
    } else if (record.lastPage !== null) {
      // Restore progress: DB lastPage is 0-indexed, UI is 1-indexed
      setCurrentPage(record.lastPage + 1);
    } else {
      setCurrentPage(1);
    }

    return () => {
      resetReader();
    };
  }, [page, record, setCurrentPage, resetReader]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center w-screen h-screen bg-black text-zinc-400 gap-3 select-none">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Opening book...</span>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="flex flex-col items-center justify-center w-screen h-screen bg-black text-zinc-400 gap-4 select-none">
        <p className="text-sm font-medium text-red-500">Failed to load reader.</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs transition-colors"
        >
          Go Back to Library
        </button>
      </div>
    );
  }

  // Determine which format view to mount
  const format = determineFormat(record);

  const handlePageChange = (pageNum: number) => {
    setCurrentPage(pageNum);
    // Update the URL hash route to keep it synchronized (EPUB might use location string, handled in Phase 8)
    navigate(`/read/${comicId}/${pageNum}`, { replace: true });
  };

  const handleBack = () => {
    // Navigates back to the preceding library location (retains scroll position due to AppShell freezing)
    navigate(-1);
  };

  return (
    <ReaderOverlay
      title={record.title}
      currentPage={currentPage}
      pageCount={record.pageCount}
      onPageChange={handlePageChange}
      onBack={handleBack}
      extraControls={extraControls}
    >
      {format === 'comic' && (
        <ComicReader
          record={record}
          initialPage={currentPage}
          setExtraControls={setExtraControls}
        />
      )}
      {format === 'epub' && (
        <EpubReader
          record={record}
          initialLocation={page}
          setExtraControls={setExtraControls}
        />
      )}
      {format === 'pdf' && (
        <PdfReader
          record={record}
          initialPage={currentPage}
          setExtraControls={setExtraControls}
        />
      )}
    </ReaderOverlay>
  );
}

function determineFormat(record: api.WebComicRecord): 'comic' | 'epub' | 'pdf' {
  const ext = (record.fileExt || '').toLowerCase();
  if (record.mediaType === 'comic' || ext === 'cbz' || ext === 'cbr') {
    return 'comic';
  }
  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';

  // Guess logic if extension is unavailable (matching original client-side guestimation)
  if (record.pageCount === 0 && !record.lastPage) return 'epub';
  if (record.lastLocation && record.lastLocation.includes('epubcfi')) return 'epub';
  if (record.pageCount > 0 && !record.lastLocation) return 'pdf';
  return 'epub'; // default fallback
}
