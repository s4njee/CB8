<script lang="ts">
  import { goto } from '$app/navigation';
  import { adminAddPath, adminListDir, adminPickPath, adminUploadFile } from '../../lib/api';
  import { showErrorToast, showToast } from '$lib/ui/toast';
  import type { IngestProgressEvent, ListDirResponse } from '../../lib/api';

  let { data } = $props<{
    data: {
      hostInfo: { homePath: string; lanIp: string; lanPort: number | null; lanUrl: string } | null;
      hostInfoError: string | null;
    };
  }>();

  // --- Tabs ---
  let activeTab = $state<'path' | 'upload'>('upload');

  // --- Path-based add ---
  let path = $state('');
  let pathLoading = $state(false);
  let pathError = $state<string | null>(null);
  let suggestions = $state<ListDirResponse['entries']>([]);
  let suggestionsOpen = $state(false);
  let highlightedIndex = $state(-1);
  let browseBusy = $state(false);
  let resultSummary = $state<string | null>(null);
  let scanProgress = $state<IngestProgressEvent | null>(null);
  let fetchToken = 0;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;

  const progressPercent = $derived(
    scanProgress && scanProgress.discovered > 0
      ? Math.min(100, Math.round((scanProgress.processed / scanProgress.discovered) * 100))
      : 0,
  );

  $effect(() => {
    if (!path && data.hostInfo?.homePath) path = data.hostInfo.homePath;
  });

  function phaseLabel(phase: IngestProgressEvent['phase'] | undefined): string {
    if (phase === 'books') return 'Scanning books';
    if (phase === 'file') return 'Adding file';
    return 'Scanning comics';
  }

  async function browseHostDirectory(): Promise<void> {
    browseBusy = true;
    pathError = null;
    try {
      const result = await adminPickPath('directory');
      if (result.path) { path = result.path; await refreshSuggestions(); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pathError = msg; showErrorToast(msg);
    } finally { browseBusy = false; }
  }

  async function refreshSuggestions(): Promise<void> {
    const value = path.trim();
    if (!value) { suggestions = []; suggestionsOpen = false; highlightedIndex = -1; return; }
    const token = ++fetchToken;
    try {
      const response = await adminListDir(value);
      if (token !== fetchToken) return;
      suggestions = response.entries;
      suggestionsOpen = response.entries.length > 0;
      highlightedIndex = response.entries.length > 0 ? 0 : -1;
    } catch {
      if (token !== fetchToken) return;
      suggestions = []; suggestionsOpen = false; highlightedIndex = -1;
    }
  }

  function scheduleSuggestions(): void {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => void refreshSuggestions(), 140);
  }

  function applySuggestion(index: number): void {
    const next = suggestions[index];
    if (!next) return;
    path = next.path; suggestionsOpen = false;
  }

  async function submitPath(): Promise<void> {
    const trimmed = path.trim();
    if (!trimmed) return;
    pathLoading = true; pathError = null; resultSummary = null; scanProgress = null;
    try {
      const result = await adminAddPath(trimmed, (event) => { scanProgress = event; });
      resultSummary = result.added > 0
        ? `Indexed ${result.added.toLocaleString()} item${result.added === 1 ? '' : 's'}.`
        : 'Scan completed with no new items found.';
      if (result.errors.length > 0) showErrorToast(`Completed with ${result.errors.length} warning(s).`);
      else showToast('Scan complete');
      await goto('/', { invalidateAll: true });
    } catch (err) {
      pathError = err instanceof Error ? err.message : String(err);
      showErrorToast(pathError ?? '');
    } finally { pathLoading = false; }
  }

  // --- File upload ---
  const ACCEPTED = ['.cbz', '.cbr', '.epub', '.pdf', '.mobi'];

  interface UploadItem {
    file: File;
    relPath: string;
    status: 'pending' | 'uploading' | 'done' | 'error';
    progress: number; // 0–100
    error?: string;
  }

  let uploadItems = $state<UploadItem[]>([]);
  let uploadRunning = $state(false);
  let dropTarget = $state(false);

  function isAccepted(file: File): boolean {
    return ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext));
  }

  function gatherFiles(items: DataTransferItemList | FileList | null, prefix = ''): UploadItem[] {
    if (!items) return [];
    const result: UploadItem[] = [];
    const list = items instanceof FileList ? Array.from(items) : Array.from(items)
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter(Boolean) as File[];
    for (const file of list) {
      if (isAccepted(file)) result.push({ file, relPath: prefix ? `${prefix}/${file.name}` : file.name, status: 'pending', progress: 0 });
    }
    return result;
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dropTarget = false;
    const added = gatherFiles(event.dataTransfer?.items ?? null);
    uploadItems = [...uploadItems, ...added];
  }

  function handleFilePick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const added = gatherFiles(input.files);
    uploadItems = [...uploadItems, ...added];
    input.value = '';
  }

  function removeItem(index: number): void {
    uploadItems = uploadItems.filter((_, i) => i !== index);
  }

  function clearDone(): void {
    uploadItems = uploadItems.filter((i) => i.status !== 'done');
  }

  async function startUpload(): Promise<void> {
    if (uploadRunning) return;
    uploadRunning = true;
    const pending = uploadItems.filter((i) => i.status === 'pending');
    for (const item of pending) {
      item.status = 'uploading';
      item.progress = 0;
      uploadItems = [...uploadItems]; // trigger reactivity
      try {
        await adminUploadFile(item.file, item.relPath, (loaded, total) => {
          item.progress = Math.round((loaded / total) * 100);
          uploadItems = [...uploadItems];
        });
        item.status = 'done';
        item.progress = 100;
      } catch (err) {
        item.status = 'error';
        item.error = err instanceof Error ? err.message : String(err);
      }
      uploadItems = [...uploadItems];
    }
    uploadRunning = false;
    const doneCount = uploadItems.filter((i) => i.status === 'done').length;
    if (doneCount > 0) {
      showToast(`Uploaded ${doneCount} file${doneCount === 1 ? '' : 's'}`);
      await goto('/', { invalidateAll: true });
    }
  }

  const uploadPending = $derived(uploadItems.filter((i) => i.status === 'pending').length);
  const uploadDone = $derived(uploadItems.filter((i) => i.status === 'done').length);
  const uploadError = $derived(uploadItems.filter((i) => i.status === 'error').length);
</script>

<section class="surface-card add-shell">
  <div class="page-hero">
    <div class="page-eyebrow">Admin</div>
    <h1 class="page-title">Add Comics</h1>
  </div>

  <div class="tab-bar">
    <button class={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onclick={() => { activeTab = 'upload'; }}>
      Upload files
    </button>
    <button class={`tab-btn ${activeTab === 'path' ? 'active' : ''}`} onclick={() => { activeTab = 'path'; }}>
      Scan host path
    </button>
  </div>

  <!-- ── Upload tab ──────────────────────────── -->
  {#if activeTab === 'upload'}
    <div class="tab-body">
      <!-- Drop zone -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={`drop-zone ${dropTarget ? 'drag-over' : ''} ${uploadItems.length > 0 ? 'has-files' : ''}`}
        ondragover={(e) => { e.preventDefault(); dropTarget = true; }}
        ondragleave={() => { dropTarget = false; }}
        ondrop={handleDrop}
        onclick={() => document.getElementById('file-input')?.click()}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('file-input')?.click(); }}
        role="button"
        tabindex="0"
        aria-label="Drop files or click to browse"
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          style="display:none"
          onchange={handleFilePick}
        />
        {#if uploadItems.length === 0}
          <div class="drop-icon">⬆</div>
          <div class="drop-label">Drop files here or <span class="drop-link">browse</span></div>
          <div class="drop-hint">Accepts {ACCEPTED.join(', ')}</div>
        {:else}
          <div class="drop-hint">Drop more files or click to browse</div>
        {/if}
      </div>

      <!-- File list -->
      {#if uploadItems.length > 0}
        <div class="file-list">
          {#each uploadItems as item, i (item.relPath + i)}
            <div class={`file-row ${item.status}`}>
              <div class="file-info">
                <span class="file-name">{item.file.name}</span>
                <span class="file-size">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              {#if item.status === 'uploading'}
                <div class="file-bar-wrap">
                  <div class="file-bar" style={`width:${item.progress}%`}></div>
                </div>
              {:else if item.status === 'error'}
                <div class="file-error">{item.error}</div>
              {:else if item.status === 'done'}
                <span class="file-done">✓ Done</span>
              {/if}
              {#if item.status === 'pending'}
                <button class="file-remove" onclick={() => removeItem(i)} title="Remove">✕</button>
              {/if}
            </div>
          {/each}
        </div>

        <div class="upload-actions">
          {#if uploadPending > 0}
            <button class="auth-button primary" onclick={startUpload} disabled={uploadRunning}>
              {uploadRunning ? 'Uploading…' : `Upload ${uploadPending} file${uploadPending === 1 ? '' : 's'}`}
            </button>
          {/if}
          {#if uploadDone > 0}
            <button class="auth-button secondary" onclick={clearDone}>Clear done ({uploadDone})</button>
          {/if}
          {#if uploadError > 0}
            <span class="upload-error-count">{uploadError} error{uploadError === 1 ? '' : 's'}</span>
          {/if}
          <a class="auth-button secondary" href="/">Back to library</a>
        </div>
      {:else}
        <div class="upload-actions">
          <a class="auth-button secondary" href="/">Back to library</a>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ── Path tab ────────────────────────────── -->
  {#if activeTab === 'path'}
    <div class="tab-body">
      <div class="add-grid">
        <form class="info-card path-form" onsubmit={(e) => { e.preventDefault(); void submitPath(); }}>
          <label class="form-label" for="server-path">Host path</label>
          <div class="path-row">
            <input
              id="server-path"
              bind:value={path}
              class="path-input"
              placeholder={data.hostInfo?.homePath ?? '/comics'}
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              oninput={scheduleSuggestions}
              onfocus={() => { if (suggestions.length > 0) suggestionsOpen = true; }}
              onkeydown={(e) => {
                if (!suggestionsOpen || !suggestions.length) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); highlightedIndex = (highlightedIndex + 1) % suggestions.length; }
                else if (e.key === 'ArrowUp') { e.preventDefault(); highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length; }
                else if (e.key === 'Enter' && highlightedIndex >= 0) { e.preventDefault(); applySuggestion(highlightedIndex); }
                else if (e.key === 'Escape') suggestionsOpen = false;
              }}
              required
            />
            <button class="auth-button secondary" type="button" onclick={browseHostDirectory} disabled={browseBusy || pathLoading}>
              {browseBusy ? 'Opening…' : 'Browse'}
            </button>
          </div>

          {#if suggestionsOpen && suggestions.length > 0}
            <ul class="path-suggestions" role="listbox">
              {#each suggestions as suggestion, index}
                <li>
                  <button
                    class={`path-suggestion ${index === highlightedIndex ? 'active' : ''}`}
                    type="button"
                    onclick={() => applySuggestion(index)}
                  >
                    <span class="path-icon">{suggestion.isDir ? 'DIR' : 'FILE'}</span>
                    <span class="path-text">{suggestion.path}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          {#if pathError}
            <div class="status-banner" role="alert">{pathError}</div>
          {/if}

          {#if scanProgress}
            <div class="scan-progress" role="status" aria-live="polite">
              <div class="scan-head">
                <strong>{phaseLabel(scanProgress.phase)}…</strong>
                <span>{progressPercent}%</span>
              </div>
              <div class="scan-track"><div class="scan-fill" style={`width:${progressPercent}%`}></div></div>
              <div class="scan-meta">
                {#if scanProgress.discovered > 0}{scanProgress.processed.toLocaleString()} / {scanProgress.discovered.toLocaleString()}{:else}Discovering files…{/if}
              </div>
              {#if scanProgress.currentFile}<div class="scan-file">{scanProgress.currentFile}</div>{/if}
            </div>
          {/if}

          {#if resultSummary}
            <div class="success-banner" role="status">{resultSummary}</div>
          {/if}

          <div class="auth-actions">
            <button class="auth-button primary" type="submit" disabled={pathLoading}>
              {pathLoading ? 'Scanning…' : 'Scan path'}
            </button>
            <a class="auth-button secondary" href="/">Back</a>
          </div>
        </form>

        <article class="info-card path-notes">
          <h2>Host path behavior</h2>
          <ul>
            <li>The scan runs on the machine hosting CB8, not your browser device.</li>
            <li><strong>Browse</strong> only works when this browser is on the host machine.</li>
            <li>You can type or autocomplete a server path from any admin session.</li>
          </ul>
          {#if data.hostInfo}
            <div class="host-meta">
              <div><strong>Home path</strong></div>
              <code>{data.hostInfo.homePath}</code>
            </div>
          {/if}
          {#if data.hostInfoError}
            <div class="status-banner" role="alert">Host info unavailable: {data.hostInfoError}</div>
          {/if}
        </article>
      </div>
    </div>
  {/if}
</section>

<style>
  .add-shell { overflow: visible; }

  .tab-bar {
    display: flex;
    gap: 0.25rem;
    padding: 0 1.3rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 0;
  }

  .tab-btn {
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .tab-btn.active {
    background: rgba(74,158,255,0.12);
    border-color: rgba(74,158,255,0.2);
    color: var(--text);
  }

  .tab-body {
    padding: 1.25rem 1.3rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Drop zone */
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 160px;
    padding: 2rem 1rem;
    border: 2px dashed rgba(255,255,255,0.12);
    border-radius: var(--radius-lg);
    background: rgba(255,255,255,0.02);
    cursor: pointer;
    transition: border-color 150ms, background 150ms;
    text-align: center;
  }

  .drop-zone.has-files { min-height: 80px; padding: 1.1rem; }

  .drop-zone.drag-over {
    border-color: var(--accent);
    background: rgba(74,158,255,0.07);
  }

  .drop-zone:hover { border-color: rgba(255,255,255,0.22); }
  .drop-zone:focus { outline: 2px solid var(--accent); outline-offset: 2px; }

  .drop-icon { font-size: 2rem; opacity: 0.5; }

  .drop-label {
    color: var(--text-muted);
    font-size: 0.95rem;
  }

  .drop-link { color: var(--accent); }

  .drop-hint {
    color: var(--text-dim);
    font-size: 0.8rem;
  }

  /* File list */
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 360px;
    overflow-y: auto;
  }

  .file-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: var(--radius);
    background: rgba(255,255,255,0.02);
    position: relative;
  }

  .file-row.done { border-color: rgba(70,179,108,0.2); }
  .file-row.error { border-color: rgba(224,82,82,0.2); }

  .file-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .file-name {
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    color: var(--text-dim);
    font-size: 0.78rem;
    flex-shrink: 0;
  }

  .file-bar-wrap {
    height: 0.35rem;
    border-radius: 999px;
    background: rgba(255,255,255,0.07);
    overflow: hidden;
  }

  .file-bar {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent), #82c4ff);
    transition: width 100ms linear;
  }

  .file-done { color: var(--success); font-size: 0.82rem; }
  .file-error { color: var(--danger); font-size: 0.8rem; }

  .file-remove {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    background: transparent;
    border: 0;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.3rem;
  }

  .file-remove:hover { color: var(--danger); }

  .upload-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
  }

  .upload-error-count {
    color: var(--danger);
    font-size: 0.88rem;
  }

  /* Path form */
  .add-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
    gap: 1rem;
  }

  .path-form {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    overflow: visible;
  }

  .form-label { color: var(--text-muted); font-size: 0.88rem; }

  .path-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
  }

  .path-input {
    width: 100%;
    padding: 0.72rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(255,255,255,0.03);
    color: var(--text);
  }

  .path-input:focus { outline: none; border-color: var(--accent); }

  .path-suggestions {
    margin: -0.1rem 0 0;
    padding: 0.35rem;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: #111;
  }

  .path-suggestion {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.7rem;
    width: 100%;
    padding: 0.55rem 0.68rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    text-align: left;
  }

  .path-suggestion.active, .path-suggestion:hover { background: rgba(74,158,255,0.12); }

  .path-icon { color: var(--accent); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; }
  .path-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .scan-progress {
    padding: 0.9rem;
    border-radius: var(--radius);
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }

  .scan-head, .scan-meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  .scan-track {
    height: 0.6rem;
    margin: 0.65rem 0 0.5rem;
    border-radius: 999px;
    background: rgba(255,255,255,0.07);
    overflow: hidden;
  }

  .scan-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent), #82c4ff);
  }

  .scan-file, .host-meta code {
    display: block;
    margin-top: 0.5rem;
    color: var(--text-muted);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .success-banner {
    padding: 0.8rem 1rem;
    border-radius: var(--radius);
    background: rgba(70,179,108,0.1);
    border: 1px solid rgba(70,179,108,0.2);
    color: #d5ffe3;
  }

  .path-notes ul {
    margin: 0;
    padding-left: 1rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .host-meta { margin-top: 1rem; font-size: 0.9rem; }

  .auth-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 120px;
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .auth-button.primary { background: var(--accent); border-color: var(--accent); color: #061322; font-weight: 700; }
  .auth-button.secondary { background: rgba(255,255,255,0.03); color: var(--text); }
  .auth-button:disabled { opacity: 0.65; cursor: default; }

  .auth-actions { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-top: 0.2rem; }

  .status-banner {
    padding: 0.8rem 1rem;
    border-radius: var(--radius);
    border: 1px solid rgba(224,82,82,0.28);
    background: rgba(224,82,82,0.08);
    color: #ffd4d4;
    font-size: 0.9rem;
  }

  .info-card {
    padding: 1rem;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: var(--radius);
    background: rgba(255,255,255,0.02);
  }

  .info-card h2 { margin: 0 0 0.6rem; font-size: 0.95rem; }

  @media (max-width: 760px) {
    .add-grid { grid-template-columns: 1fr; }
    .path-row { grid-template-columns: 1fr; }
    .tab-body { padding: 1rem; }
  }
</style>
