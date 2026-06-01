import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { invalidateLibraryQueries } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { showToast } from '@/hooks/useToast';
import { Folder, File, AlertTriangle, ArrowLeft } from 'lucide-react';

interface AddPathPanelProps {
  onSuccess: () => void;
  onBack: () => void;
}

interface SuggestionItem {
  name: string;
  path: string;
  isDir: boolean;
}

export default function AddPathPanel({ onSuccess, onBack }: AddPathPanelProps) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState('');
  const [folder, setFolder] = useState('');
  const [useFolderSeries, setUseFolderSeries] = useState(false);
  const [folders, setFolders] = useState<api.Folder[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({
    phase: '',
    processed: 0,
    discovered: 0,
    currentFile: '',
  });

  // Failures report state
  const [failureReport, setFailureReport] = useState<{
    added: number;
    failuresSummary: api.IngestFailuresSummaryEvent | null;
  } | null>(null);

  const fetchSeqRef = useRef(0);
  const suggestionListRef = useRef<HTMLUListElement>(null);

  // Fetch initial home path & folder suggestions
  useEffect(() => {
    api.fetchFolders()
      .then(setFolders)
      .catch(() => {});

    api.adminHostInfo()
      .then(({ homePath }) => {
        if (homePath) {
          setPath(homePath);
          fetchSuggestions(homePath);
        }
      })
      .catch(() => {});
  }, []);

  const fetchSuggestions = async (val: string) => {
    if (!val) {
      setSuggestions([]);
      return;
    }
    const mySeq = ++fetchSeqRef.current;
    try {
      const resp = await api.adminListDir(val);
      if (mySeq !== fetchSeqRef.current) return;
      setSuggestions(resp.entries);
      setShowSuggestions(resp.entries.length > 0);
    } catch {
      if (mySeq === fetchSeqRef.current) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }
  };

  const handlePathChange = (val: string) => {
    setPath(val);
    fetchSuggestions(val);
  };

  const applySuggestion = (item: SuggestionItem) => {
    setPath(item.path);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    if (item.isDir) {
      fetchSuggestions(item.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Tab' || (e.key === 'Enter' && highlightedIndex >= 0)) {
      e.preventDefault();
      const index = highlightedIndex >= 0 ? highlightedIndex : 0;
      applySuggestion(suggestions[index]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }

    // Scroll active item into view
    setTimeout(() => {
      const activeEl = suggestionListRef.current?.querySelector('.is-active');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }, 10);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }, 150);
  };

  const getPhaseLabel = (phase: string) => {
    if (phase === 'books') return 'Scanning books…';
    if (phase === 'file') return 'Adding file…';
    return 'Scanning comics…';
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFailureReport(null);

    const trimmedPath = path.trim();
    if (!trimmedPath) return;

    setScanning(true);
    setScanProgress({
      phase: 'Starting…',
      processed: 0,
      discovered: 0,
      currentFile: '',
    });

    try {
      const folderName = folder.trim();
      const result = await api.adminAddPath(
        trimmedPath,
        (msg) => {
          setScanProgress({
            phase: getPhaseLabel(msg.phase),
            processed: msg.processed,
            discovered: msg.discovered,
            currentFile: msg.currentFile || '',
          });
        },
        { folderName, useFolderNamesAsSeries: useFolderSeries }
      );

      await invalidateLibraryQueries(queryClient);

      const failureTotal = result.failuresSummary?.total ?? 0;
      if (failureTotal > 0) {
        setFailureReport({
          added: result.added,
          failuresSummary: result.failuresSummary,
        });
        setScanning(false);
        return;
      }

      const msg = result.added > 0
        ? `Added ${result.added.toLocaleString()} item${result.added === 1 ? '' : 's'}`
        : 'No new items found';
      showToast(msg);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add path');
      setScanning(false);
    }
  };

  const handleClearIngestErrors = async () => {
    try {
      await api.adminClearIngestErrors();
      showToast('Ingest error log cleared');
      // Update/reset failure report
      setFailureReport(null);
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Failed to clear log');
    }
  };

  const getFailureLabel = (errClass: string) => {
    switch (errClass) {
      case 'wasm_oom':
        return 'WASM out-of-memory (try CB8_INGEST_CONCURRENCY=4)';
      case 'archive_open':
        return 'Archive open failed (corrupt / encrypted / unsupported)';
      case 'fs_missing':
        return 'File disappeared between scan and ingest';
      case 'fs_permission':
        return 'Permission denied';
      case 'timeout':
        return 'Cover / page-count extraction timed out';
      case 'unknown':
        return 'Other / unclassified';
      default:
        return errClass;
    }
  };

  // Render failure report view if errors occurred
  if (failureReport) {
    const summary = failureReport.failuresSummary;
    const byClass = Object.entries(summary?.byClass || {})
      .sort((a, b) => b[1] - a[1]);
    const samples = (summary?.sample || []).slice(0, 8);

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground text-left">Scan finished with errors</h2>
        <p className="text-sm text-muted-foreground">
          Added <strong>{failureReport.added.toLocaleString()}</strong> item{failureReport.added === 1 ? '' : 's'} ·{' '}
          <strong>{summary?.total.toLocaleString()}</strong> file{summary?.total === 1 ? '' : 's'} failed.
          Full list is in <code>ingest-errors.jsonl</code> under the app's user-data directory.
        </p>

        {byClass.length > 0 && (
          <div className="bg-secondary/40 border border-border p-3 rounded-lg space-y-1.5 text-left">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">By reason</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {byClass.map(([k, v]) => (
                <li key={k}>
                  <strong>{v.toLocaleString()}</strong> &middot; {getFailureLabel(k)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {samples.length > 0 && (
          <div className="bg-secondary/40 border border-border p-3 rounded-lg space-y-1.5 text-left">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              First {Math.min(summary?.sample.length || 0, 8)} failures
            </div>
            <ul className="text-xs font-mono space-y-2 max-h-48 overflow-y-auto pr-1">
              {samples.map((f, i) => {
                const name = f.path.split(/[\\/]/).pop();
                return (
                  <li key={i} className="border-b border-border/50 pb-1.5 last:border-0 last:pb-0" title={f.path}>
                    <span className="text-primary font-semibold">{name}</span>
                    <div className="text-muted-foreground mt-0.5">
                      [{f.errorClass}] {f.message}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex gap-2 justify-between pt-2 border-t border-border">
          <Button variant="outline" className="border-border text-foreground hover:bg-muted" onClick={handleClearIngestErrors}>
            Clear log
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={onSuccess}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const pct = scanProgress.discovered > 0
    ? Math.min(100, Math.round((scanProgress.processed / scanProgress.discovered) * 100))
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          disabled={scanning}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-foreground text-left">Add from server path</h2>
      </div>

      <p className="text-xs text-muted-foreground text-left">
        Enter a file or directory path on the server host. Files are indexed in place.
      </p>

      <form onSubmit={handleScanSubmit} className="space-y-3" autoComplete="off">
        <div className="space-y-1 relative">
          <Label htmlFor="admin-path" className="text-foreground">Server path</Label>
          <Input
            id="admin-path"
            type="text"
            className="bg-secondary border-border font-mono text-sm"
            placeholder="Loading host path…"
            required
            disabled={scanning}
            value={path}
            onChange={(e) => handlePathChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={() => {
              if (path) setShowSuggestions(true);
            }}
          />

          {showSuggestions && suggestions.length > 0 && (
            <ul
              ref={suggestionListRef}
              className="absolute top-full left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto mt-1 py-1"
            >
              {suggestions.map((item, idx) => (
                <li
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer select-none text-foreground hover:bg-muted ${
                    idx === highlightedIndex ? 'bg-muted is-active font-semibold' : ''
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(item);
                  }}
                >
                  {item.isDir ? (
                    <Folder className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{item.name}{item.isDir ? '/' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="admin-folder" className="text-foreground">Folder (optional)</Label>
          <Input
            id="admin-folder"
            type="text"
            className="bg-secondary border-border"
            placeholder="Leave empty to add to main library"
            disabled={scanning}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            list="admin-folder-options"
          />
          <datalist id="admin-folder-options">
            {folders.map((f) => (
              <option key={f.id} value={f.name} />
            ))}
          </datalist>
          <p className="text-[10px] text-muted-foreground leading-normal mt-1">
            Existing folders are suggested; a new name creates an empty folder. Foldered items don't appear in the main library view.
          </p>
        </div>

        <div className="flex items-center space-x-2 pt-1.5">
          <Checkbox
            id="admin-use-folder-series"
            checked={useFolderSeries}
            onCheckedChange={(val) => setUseFolderSeries(val === true)}
            disabled={scanning}
            className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label htmlFor="admin-use-folder-series" className="text-foreground cursor-pointer select-none">
            Use folder names as series
          </Label>
        </div>
        <p className="text-[10px] text-muted-foreground leading-normal ml-6 mt-[-4px]">
          Leave off for omnibus folders where each archive should stand alone.
        </p>

        {errorMsg && (
          <div className="text-destructive text-xs font-semibold leading-relaxed bg-destructive/10 p-2.5 rounded border border-destructive/20">
            {errorMsg}
          </div>
        )}

        {scanning && (
          <div className="bg-secondary/40 border border-border p-3.5 rounded-lg space-y-2 text-left animate-pulse">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-foreground">{scanProgress.phase}</span>
              <span className="text-muted-foreground">
                {scanProgress.discovered > 0
                  ? `${scanProgress.processed.toLocaleString()} / ${scanProgress.discovered.toLocaleString()}`
                  : 'Discovering files…'}
              </span>
            </div>
            <Progress value={pct} className="h-1.5 bg-muted" />
            {scanProgress.currentFile && (
              <div className="text-[10px] font-mono text-muted-foreground truncate" title={scanProgress.currentFile}>
                {scanProgress.currentFile}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 justify-between border-t border-border">
          <Button
            type="button"
            variant="outline"
            className="border-border text-foreground hover:bg-muted"
            onClick={onBack}
            disabled={scanning}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            disabled={scanning || !path.trim()}
          >
            {scanning ? 'Scanning…' : 'Add'}
          </Button>
        </div>
      </form>
    </div>
  );
}
