import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { invalidateLibraryQueries } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showToast } from '@/hooks/useToast';
import { ACCEPT_ATTR, isAccepted, formatBytes, gatherFromDrop } from '@/lib/dropUtils';
import { ArrowLeft, Upload, FileUp, FolderUp } from 'lucide-react';

interface UploadPanelProps {
  initialFiles?: { file: File; relPath: string }[];
  onSuccess: () => void;
  onBack: () => void;
}

interface QueueItem {
  file: File;
  relPath: string;
  status: 'pending' | 'uploading' | 'done' | 'skipped' | 'error';
  loaded: number;
  error?: string;
}

export default function UploadPanel({ initialFiles, onSuccess, onBack }: UploadPanelProps) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Load initial dropped files on mount
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      addFiles(initialFiles);
    }
  }, [initialFiles]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [overallPhase, setOverallPhase] = useState('');
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (items: { file: File; relPath: string }[]) => {
    setErrorMsg(null);
    setQueue((prev) => {
      const seen = new Set(prev.map((q) => q.relPath));
      const next = [...prev];
      for (const item of items) {
        if (!isAccepted(item.file)) continue;
        if (seen.has(item.relPath)) continue;
        seen.add(item.relPath);
        next.push({ ...item, status: 'pending', loaded: 0 });
      }
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const items = await gatherFromDrop(e.dataTransfer);
      if (items.length === 0) {
        setErrorMsg('No supported files in drop (.cbz, .cbr, .epub, .pdf, .mobi)');
      } else {
        addFiles(items);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to read dropped files');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const items = Array.from(e.target.files).map((file) => ({ file, relPath: file.name }));
    addFiles(items);
    e.target.value = '';
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const items = Array.from(e.target.files).map((file) => ({
      file,
      relPath: file.webkitRelativePath || file.name,
    }));
    addFiles(items);
    e.target.value = '';
  };

  const startUpload = async () => {
    if (uploading || queue.length === 0) return;
    setUploading(true);
    setErrorMsg(null);

    let addedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Use snapshot of current queue
    const currentQueue = [...queue];

    for (let i = 0; i < currentQueue.length; i++) {
      const item = currentQueue[i];
      if (item.status === 'done' || item.status === 'skipped') continue;

      // Update active item state
      setQueue((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'uploading' };
        return next;
      });

      setOverallPhase(`Uploading ${i + 1} of ${currentQueue.length} — ${item.relPath}`);
      setOverallProgress(Math.round((i / currentQueue.length) * 100));

      try {
        const result = await api.adminUploadFile(item.file, item.relPath, (loaded) => {
          setQueue((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], loaded };
            return next;
          });
        });

        // Set status to done or skipped
        const finalStatus = (result.skipped || !result.added) ? 'skipped' : 'done';
        if (finalStatus === 'done') addedCount++;
        else skippedCount++;

        setQueue((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: finalStatus, loaded: item.file.size };
          return next;
        });
      } catch (err: any) {
        failedCount++;
        setQueue((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'error', error: err.message || 'Upload failed' };
          return next;
        });
      }
    }

    setOverallProgress(100);
    setOverallPhase(`Done — ${addedCount} added, ${skippedCount} skipped, ${failedCount} failed`);
    setUploading(false);

    if (addedCount > 0) {
      showToast(`Added ${addedCount} item${addedCount === 1 ? '' : 's'}`);
      await invalidateLibraryQueries(queryClient);
    }

    if (failedCount === 0) {
      setTimeout(onSuccess, 1000);
    }
  };

  const totalBytes = queue.reduce((s, q) => s + q.file.size, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          disabled={uploading}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-foreground text-left">Upload comics</h2>
      </div>

      <p className="text-xs text-muted-foreground text-left">
        Drop files or folders here. Supported: .cbz .cbr .epub .pdf .mobi
      </p>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition cursor-pointer ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20 hover:bg-secondary/40'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className={`h-8 w-8 transition ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-sm font-semibold text-foreground">Drop files or folders</span>
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex gap-2 mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            disabled={uploading}
          >
            <FileUp className="h-4 w-4 mr-1 text-primary" />
            Files…
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
            disabled={uploading}
          >
            <FolderUp className="h-4 w-4 mr-1 text-primary" />
            Folder…
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFolderChange}
          {...{ webkitdirectory: '', directory: '' }}
        />
      </div>

      {/* Queue Summary */}
      {queue.length > 0 && (
        <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground px-1 text-left">
          <span>{queue.length} file{queue.length === 1 ? '' : 's'} queued</span>
          <span>{formatBytes(totalBytes)}</span>
        </div>
      )}

      {/* Overall Progress */}
      {(uploading || overallPhase) && (
        <div className="bg-secondary/40 border border-border p-3 rounded-lg space-y-1.5 text-left">
          <div className="text-xs font-semibold text-foreground truncate">{overallPhase}</div>
          <Progress value={overallProgress} className="h-1.5 bg-muted" />
        </div>
      )}

      {/* Queue List */}
      {queue.length > 0 && (
        <ScrollArea className="h-44 border border-border rounded-lg bg-secondary/10 p-2">
          <div className="space-y-2">
            {queue.map((item, idx) => {
              const pct = item.file.size > 0 ? Math.round((item.loaded / item.file.size) * 100) : 0;
              let statusText = '';
              let statusColor = 'text-muted-foreground';

              if (item.status === 'uploading') {
                statusText = `${pct}%`;
                statusColor = 'text-primary font-bold';
              } else if (item.status === 'done') {
                statusText = 'Added';
                statusColor = 'text-emerald-500 font-bold';
              } else if (item.status === 'skipped') {
                statusText = 'Already in library';
                statusColor = 'text-amber-500';
              } else if (item.status === 'error') {
                statusText = item.error || 'Failed';
                statusColor = 'text-destructive font-semibold';
              }

              return (
                <div key={idx} className="text-left border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="truncate max-w-[70%] text-foreground" title={item.relPath}>
                      {item.relPath}
                    </span>
                    <span className="text-muted-foreground shrink-0">{formatBytes(item.file.size)}</span>
                  </div>
                  {item.status === 'uploading' && (
                    <Progress value={pct} className="h-1 bg-muted my-1" />
                  )}
                  <div className={`text-[10px] ${statusColor} mt-0.5`}>{statusText}</div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {errorMsg && (
        <div className="text-destructive text-xs font-semibold leading-relaxed bg-destructive/10 p-2.5 rounded border border-destructive/20 text-left">
          {errorMsg}
        </div>
      )}

      <div className="flex gap-2 pt-2 justify-between border-t border-border">
        <Button
          type="button"
          variant="outline"
          className="border-border text-foreground hover:bg-muted"
          onClick={onBack}
          disabled={uploading}
        >
          Back
        </Button>
        <Button
          type="button"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          onClick={queue.some(q => q.status === 'pending' || q.status === 'error') ? startUpload : onSuccess}
          disabled={uploading || queue.length === 0}
        >
          {queue.some(q => q.status === 'pending' || q.status === 'error') ? 'Upload' : 'Done'}
        </Button>
      </div>
    </div>
  );
}
