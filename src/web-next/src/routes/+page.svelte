<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { showErrorToast, showToast } from '$lib/ui/toast';
  import {
    addFavorite,
    removeFavorite,
    createLibrary,
    renameLibrary,
    deleteLibrary,
    createFolder,
    renameFolder,
    deleteFolder,
    renameTag,
    deleteTag,
    setCompleted,
    clearProgress,
    deleteComic,
    addComicsToLibrary,
    addComicsToFolder,
    removeComicsFromLibrary,
    removeComicsFromFolder,
  } from '$lib/api';
  import { fetchBatch } from '$lib/libraryQuery';
  import type { ComicListRecord } from '$lib/api';

  let { data } = $props<{
    data: {
      folders: Array<{ id: number; name: string; comicCount: number; thumbnailUrl: string | null }>;
      libraries: Array<{ id: number; name: string; comicCount: number; mediaType: 'comic' | 'book' }>;
      records: ComicListRecord[];
      totalCount: number;
      continueReading: ComicListRecord[];
      selection: {
        fileExt: string;
        folderId: number | null;
        libraryId: number | null;
        mediaType: '' | 'comic' | 'book';
        mode: 'all' | 'continue' | 'recent';
        search: string;
        tag: string;
        sortBy: 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead';
        sortOrder: 'asc' | 'desc';
        readStatus: '' | 'unread' | 'in-progress' | 'completed';
        favorites: boolean;
      };
      session: { authenticated: boolean; user: { isAdmin: boolean } | null } | null;
      tags: string[];
    };
  }>();

  const PLACEHOLDER_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" preserveAspectRatio="xMidYMid slice">
         <rect width="64" height="96" fill="#1c1c1c"/>
         <g fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
           <path d="M18 24h28v48H18z"/>
           <path d="M18 24v48"/><path d="M22 32h20"/><path d="M22 40h20"/><path d="M22 48h14"/>
         </g>
       </svg>`,
    );

  const isAuthenticated = $derived(Boolean(data.session?.authenticated && data.session?.user));
  const isAdmin = $derived(Boolean(data.session?.user?.isAdmin));

  // --- Reactive record list with infinite scroll ---
  let allRecords = $state<ComicListRecord[]>([...data.records]);
  let totalCount = $state(data.totalCount);
  let loadingMore = $state(false);
  let sentinelEl = $state<HTMLDivElement | undefined>(undefined);

  $effect(() => {
    allRecords = [...data.records];
    totalCount = data.totalCount;
  });

  const hasMore = $derived(allRecords.length < totalCount);

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    try {
      const result = await fetchBatch(data.selection, allRecords.length, 48);
      allRecords = [...allRecords, ...result.records];
      totalCount = result.totalCount;
    } catch {
      // silently fail; user can scroll again
    } finally {
      loadingMore = false;
    }
  }

  $effect(() => {
    const el = sentinelEl;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  // --- Favorites ---
  let favoritedIds = $state(new Set(data.records.filter((r: ComicListRecord) => r.favorited).map((r: ComicListRecord) => r.id)));

  $effect(() => {
    favoritedIds = new Set(data.records.filter((r: ComicListRecord) => r.favorited).map((r: ComicListRecord) => r.id));
  });

  async function toggleFavorite(event: MouseEvent, id: number): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const wasFav = favoritedIds.has(id);
    favoritedIds = new Set(favoritedIds);
    if (wasFav) favoritedIds.delete(id); else favoritedIds.add(id);
    try {
      if (wasFav) await removeFavorite(id); else await addFavorite(id);
    } catch {
      if (wasFav) favoritedIds.add(id); else favoritedIds.delete(id);
      favoritedIds = new Set(favoritedIds);
      showErrorToast('Failed to update favorite');
    }
  }

  // --- Modal state ---
  type ModalMode =
    | null
    | 'create-library'
    | 'rename-library'
    | 'delete-library'
    | 'create-folder'
    | 'rename-folder'
    | 'delete-folder'
    | 'rename-tag'
    | 'delete-tag';

  let modalMode = $state<ModalMode>(null);
  let modalTarget = $state<{ id?: number; name?: string; mediaType?: 'comic' | 'book' } | null>(null);
  let modalInput = $state('');
  let modalType = $state<'comic' | 'book'>('comic');
  let modalBusy = $state(false);
  let sidebarOpen = $state(false);

  // --- Context menu ---
  interface CtxMenu {
    record: ComicListRecord;
    x: number;
    y: number;
    sub: null | 'library' | 'folder';
    busy: boolean;
  }
  let ctxMenu = $state<CtxMenu | null>(null);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  let completedIds = $state(new Set(data.records.filter((r: ComicListRecord) => r.completed).map((r: ComicListRecord) => r.id)));
  $effect(() => {
    completedIds = new Set(data.records.filter((r: ComicListRecord) => r.completed).map((r: ComicListRecord) => r.id));
  });

  function openCtxMenu(record: ComicListRecord, clientX: number, clientY: number): void {
    const menuW = 230, menuH = 320;
    const x = Math.min(clientX, window.innerWidth - menuW - 8);
    const y = Math.min(clientY, window.innerHeight - menuH - 8);
    ctxMenu = { record, x, y, sub: null, busy: false };
  }

  function closeCtxMenu(): void { ctxMenu = null; }

  function handleContextMenu(event: MouseEvent, record: ComicListRecord): void {
    event.preventDefault();
    event.stopPropagation();
    openCtxMenu(record, event.clientX, event.clientY);
  }

  function startLongPress(event: PointerEvent, record: ComicListRecord): void {
    if (event.pointerType !== 'touch') return;
    longPressTimer = setTimeout(() => {
      openCtxMenu(record, event.clientX, event.clientY);
    }, 500);
  }

  function cancelLongPress(): void {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  async function ctxMarkRead(completed: boolean): Promise<void> {
    if (!ctxMenu || ctxMenu.busy) return;
    const id = ctxMenu.record.id;
    ctxMenu.busy = true;
    try {
      if (completed) { await setCompleted(id, true); completedIds.add(id); }
      else { await clearProgress(id); completedIds.delete(id); }
      completedIds = new Set(completedIds);
      showToast(completed ? 'Marked as read' : 'Progress cleared');
      closeCtxMenu();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
      ctxMenu.busy = false;
    }
  }

  async function ctxDelete(): Promise<void> {
    if (!ctxMenu || ctxMenu.busy) return;
    const record = ctxMenu.record;
    closeCtxMenu();
    if (!confirm(`Delete "${record.title}"? This cannot be undone.`)) return;
    try {
      await deleteComic(record.id);
      allRecords = allRecords.filter((r) => r.id !== record.id);
      totalCount = Math.max(0, totalCount - 1);
      showToast('Comic deleted');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function ctxAddToLibrary(libraryId: number): Promise<void> {
    if (!ctxMenu || ctxMenu.busy) return;
    const id = ctxMenu.record.id;
    ctxMenu.busy = true;
    try {
      await addComicsToLibrary(libraryId, [id]);
      showToast('Added to library');
      closeCtxMenu();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
      ctxMenu.busy = false;
    }
  }

  async function ctxRemoveFromLibrary(): Promise<void> {
    if (!ctxMenu || ctxMenu.busy || !data.selection.libraryId) return;
    const id = ctxMenu.record.id;
    ctxMenu.busy = true;
    try {
      await removeComicsFromLibrary(data.selection.libraryId, [id]);
      allRecords = allRecords.filter((r) => r.id !== id);
      totalCount = Math.max(0, totalCount - 1);
      showToast('Removed from library');
      closeCtxMenu();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
      ctxMenu.busy = false;
    }
  }

  async function ctxAddToFolder(folderId: number): Promise<void> {
    if (!ctxMenu || ctxMenu.busy) return;
    const id = ctxMenu.record.id;
    ctxMenu.busy = true;
    try {
      await addComicsToFolder(folderId, [id]);
      showToast('Added to folder');
      closeCtxMenu();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
      ctxMenu.busy = false;
    }
  }

  async function ctxRemoveFromFolder(): Promise<void> {
    if (!ctxMenu || ctxMenu.busy || !data.selection.folderId) return;
    const id = ctxMenu.record.id;
    ctxMenu.busy = true;
    try {
      await removeComicsFromFolder(data.selection.folderId, [id]);
      allRecords = allRecords.filter((r) => r.id !== id);
      totalCount = Math.max(0, totalCount - 1);
      showToast('Removed from folder');
      closeCtxMenu();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
      ctxMenu.busy = false;
    }
  }

  $effect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeCtxMenu(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openModal(mode: ModalMode, target: typeof modalTarget = null, initialInput = ''): void {
    modalMode = mode;
    modalTarget = target;
    modalInput = initialInput;
    modalType = 'comic';
    modalBusy = false;
  }

  function closeModal(): void {
    modalMode = null;
    modalTarget = null;
    modalInput = '';
    modalBusy = false;
  }

  async function submitModal(): Promise<void> {
    if (modalBusy) return;
    modalBusy = true;
    try {
      if (modalMode === 'create-library') {
        await createLibrary(modalInput.trim(), modalType);
        showToast(`Library "${modalInput.trim()}" created`);
      } else if (modalMode === 'rename-library' && modalTarget?.id) {
        await renameLibrary(modalTarget.id, modalInput.trim());
        showToast('Library renamed');
      } else if (modalMode === 'delete-library' && modalTarget?.id) {
        await deleteLibrary(modalTarget.id);
        showToast('Library deleted');
      } else if (modalMode === 'create-folder') {
        await createFolder(modalInput.trim());
        showToast(`Folder "${modalInput.trim()}" created`);
      } else if (modalMode === 'rename-folder' && modalTarget?.id) {
        await renameFolder(modalTarget.id, modalInput.trim());
        showToast('Folder renamed');
      } else if (modalMode === 'delete-folder' && modalTarget?.id) {
        await deleteFolder(modalTarget.id);
        showToast('Folder deleted');
      } else if (modalMode === 'rename-tag' && modalTarget?.name) {
        await renameTag(modalTarget.name, modalInput.trim());
        showToast('Tag renamed');
      } else if (modalMode === 'delete-tag' && modalTarget?.name) {
        await deleteTag(modalTarget.name);
        showToast('Tag deleted');
      }
      closeModal();
      await invalidateAll();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      modalBusy = false;
    }
  }

  // --- Helpers ---
  type Library = { id: number; name: string; comicCount: number; mediaType: 'comic' | 'book' };
  type Folder = { id: number; name: string; comicCount: number; thumbnailUrl: string | null };

  const selectedLibrary = $derived(
    (data.libraries as Library[]).find((l) => l.id === data.selection.libraryId) ?? null,
  );
  const selectedFolder = $derived(
    (data.folders as Folder[]).find((f) => f.id === data.selection.folderId) ?? null,
  );
  const pageTitle = $derived.by(() => {
    if (selectedLibrary) return selectedLibrary.name;
    if (selectedFolder) return selectedFolder.name;
    if (data.selection.tag) return `Tag: ${data.selection.tag}`;
    if (data.selection.mode === 'continue') return 'Continue Reading';
    if (data.selection.mode === 'recent') return 'Recently Read';
    return 'Library';
  });

  function hrefFor(next: Partial<typeof data.selection>): string {
    const query = new URLSearchParams();
    const merged = { ...data.selection, ...next };
    if (merged.mode !== 'all') query.set('mode', merged.mode);
    if (merged.libraryId) query.set('library', String(merged.libraryId));
    if (merged.folderId) query.set('folder', String(merged.folderId));
    if (merged.tag) query.set('tag', merged.tag);
    if (merged.search) query.set('search', merged.search);
    if (merged.mediaType) query.set('mediaType', merged.mediaType);
    if (merged.fileExt) query.set('fileExt', merged.fileExt);
    if (merged.sortBy !== 'title') query.set('sortBy', merged.sortBy);
    if (merged.sortOrder !== 'asc') query.set('sortOrder', merged.sortOrder);
    if (merged.readStatus) query.set('readStatus', merged.readStatus);
    if (merged.favorites) query.set('favorites', '1');
    const s = query.toString();
    return s ? `/?${s}` : '/';
  }

  function clearScopeForMode(mode: 'all' | 'continue' | 'recent'): string {
    return hrefFor({ mode, folderId: null, libraryId: null, tag: '' });
  }

  function progressLabel(record: ComicListRecord): string | null {
    if (record.pageCount > 0 && record.lastPage != null && record.lastPage >= 0) {
      const pct = Math.min(100, Math.max(1, Math.round(((record.lastPage + 1) / record.pageCount) * 100)));
      return `${pct}%`;
    }
    return null;
  }

  const isDestructive = $derived(
    modalMode === 'delete-library' || modalMode === 'delete-folder' || modalMode === 'delete-tag',
  );
  const modalTitle = $derived.by(() => {
    if (modalMode === 'create-library') return 'New Library';
    if (modalMode === 'rename-library') return 'Rename Library';
    if (modalMode === 'delete-library') return `Delete "${modalTarget?.name}"?`;
    if (modalMode === 'create-folder') return 'New Folder';
    if (modalMode === 'rename-folder') return 'Rename Folder';
    if (modalMode === 'delete-folder') return `Delete "${modalTarget?.name}"?`;
    if (modalMode === 'rename-tag') return 'Rename Tag';
    if (modalMode === 'delete-tag') return `Delete tag "${modalTarget?.name}"?`;
    return '';
  });
  const needsInput = $derived(
    modalMode === 'create-library' ||
    modalMode === 'rename-library' ||
    modalMode === 'create-folder' ||
    modalMode === 'rename-folder' ||
    modalMode === 'rename-tag',
  );
  const confirmLabel = $derived(isDestructive ? 'Delete' : modalMode?.startsWith('create') ? 'Create' : 'Rename');
</script>

<!-- Context menu -->
{#if ctxMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="ctx-backdrop" onclick={closeCtxMenu}></div>
  <div class="ctx-menu" style={`left:${ctxMenu.x}px;top:${ctxMenu.y}px`} role="menu">
    <a class="ctx-item" href={`/read/${ctxMenu.record.id}/${Math.max(0, ctxMenu.record.lastPage ?? 0)}`} onclick={closeCtxMenu}>
      Open reader
    </a>
    <div class="ctx-sep"></div>

    {#if completedIds.has(ctxMenu.record.id)}
      <button class="ctx-item" onclick={() => ctxMarkRead(false)} disabled={ctxMenu.busy}>Clear progress</button>
    {:else}
      <button class="ctx-item" onclick={() => ctxMarkRead(true)} disabled={ctxMenu.busy}>Mark as read</button>
    {/if}

    {#if isAuthenticated}
      <button class="ctx-item" onclick={(e) => { e.stopPropagation(); toggleFavorite(e as unknown as MouseEvent, ctxMenu!.record.id); closeCtxMenu(); }}>
        {favoritedIds.has(ctxMenu.record.id) ? 'Remove favorite' : 'Add to favorites'}
      </button>
    {/if}

    <div class="ctx-sep"></div>

    <!-- Add to library -->
    {#if data.libraries.length > 0}
      {#if ctxMenu.sub === 'library'}
        <div class="ctx-sub-label">Add to library:</div>
        {#each data.libraries as lib}
          <button class="ctx-item ctx-sub-item" onclick={() => ctxAddToLibrary(lib.id)} disabled={ctxMenu.busy}>
            {lib.name}
          </button>
        {/each}
        <button class="ctx-item ctx-back" onclick={() => { ctxMenu!.sub = null; }}>← Back</button>
      {:else if ctxMenu.sub === 'folder'}
        <div class="ctx-sub-label">Add to folder:</div>
        {#each data.folders as folder}
          <button class="ctx-item ctx-sub-item" onclick={() => ctxAddToFolder(folder.id)} disabled={ctxMenu.busy}>
            {folder.name}
          </button>
        {/each}
        <button class="ctx-item ctx-back" onclick={() => { ctxMenu!.sub = null; }}>← Back</button>
      {:else}
        <button class="ctx-item" onclick={() => { ctxMenu!.sub = 'library'; }}>Add to library…</button>
        {#if data.folders.length > 0}
          <button class="ctx-item" onclick={() => { ctxMenu!.sub = 'folder'; }}>Add to folder…</button>
        {/if}
        {#if data.selection.libraryId}
          <button class="ctx-item ctx-danger" onclick={ctxRemoveFromLibrary} disabled={ctxMenu.busy}>Remove from library</button>
        {/if}
        {#if data.selection.folderId}
          <button class="ctx-item ctx-danger" onclick={ctxRemoveFromFolder} disabled={ctxMenu.busy}>Remove from folder</button>
        {/if}
      {/if}
    {/if}

    {#if isAdmin}
      <div class="ctx-sep"></div>
      <button class="ctx-item ctx-danger" onclick={ctxDelete}>Delete comic</button>
    {/if}
  </div>
{/if}

<!-- Modal overlay -->
{#if modalMode}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={closeModal}>
    <div class="modal-card surface-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={modalTitle}>
      <h2 class="modal-title">{modalTitle}</h2>

      {#if modalMode === 'create-library'}
        <label class="modal-label" for="modal-type">Type</label>
        <select id="modal-type" class="filter-select" bind:value={modalType}>
          <option value="comic">Comics</option>
          <option value="book">Books</option>
        </select>
      {/if}

      {#if needsInput}
        <label class="modal-label" for="modal-input">Name</label>
        <input
          id="modal-input"
          class="filter-input"
          bind:value={modalInput}
          placeholder={modalMode?.includes('library') ? 'Library name' : modalMode?.includes('folder') ? 'Folder name' : 'New tag name'}
          autofocus
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitModal(); } if (e.key === 'Escape') closeModal(); }}
        />
      {:else}
        <p class="modal-desc">This action cannot be undone.</p>
      {/if}

      <div class="modal-actions">
        <button class={`auth-button ${isDestructive ? 'danger' : 'primary'}`} onclick={submitModal} disabled={modalBusy || (needsInput && !modalInput.trim())}>
          {modalBusy ? '…' : confirmLabel}
        </button>
        <button class="auth-button secondary" onclick={closeModal} disabled={modalBusy}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<!-- Mobile sidebar overlay -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onclick={() => { sidebarOpen = false; }}></div>

<section class="library-shell">
  <aside class={`library-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} onclick={() => { sidebarOpen = false; }}>
    <div class="sidebar-section">
      <div class="sidebar-heading">Browse</div>
      <a class:active={data.selection.mode === 'all' && !data.selection.libraryId && !data.selection.folderId && !data.selection.tag} class="sidebar-link" href={clearScopeForMode('all')}>All items</a>
      <a class:active={data.selection.mode === 'continue'} class="sidebar-link" href={clearScopeForMode('continue')}>Continue reading</a>
      <a class:active={data.selection.mode === 'recent'} class="sidebar-link" href={clearScopeForMode('recent')}>Recently read</a>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-heading-row">
        <span class="sidebar-heading">Libraries</span>
        {#if isAdmin}
          <button class="sidebar-add-btn" title="New library" onclick={() => openModal('create-library')}>+</button>
        {/if}
      </div>
      {#if data.libraries.length === 0}
        <div class="sidebar-empty">No libraries yet.</div>
      {:else}
        {#each data.libraries as library}
          <div class="sidebar-item-row">
            <a
              class:active={data.selection.libraryId === library.id}
              class="sidebar-link sidebar-link-grow"
              href={hrefFor({ folderId: null, libraryId: library.id, mode: 'all', tag: '' })}
            >
              <span class="sidebar-link-name">{library.name}</span>
              <span class="sidebar-count">{library.comicCount}</span>
            </a>
            {#if isAdmin}
              <button class="sidebar-icon-btn" title="Rename" onclick={() => openModal('rename-library', { id: library.id, name: library.name }, library.name)}>✎</button>
              <button class="sidebar-icon-btn danger" title="Delete" onclick={() => openModal('delete-library', { id: library.id, name: library.name })}>✕</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="sidebar-section">
      <div class="sidebar-heading-row">
        <span class="sidebar-heading">Folders</span>
        {#if isAdmin}
          <button class="sidebar-add-btn" title="New folder" onclick={() => openModal('create-folder')}>+</button>
        {/if}
      </div>
      {#if data.folders.length === 0}
        <div class="sidebar-empty">No folders yet.</div>
      {:else}
        {#each data.folders as folder}
          <div class="sidebar-item-row">
            <a
              class:active={data.selection.folderId === folder.id}
              class="sidebar-link sidebar-link-grow"
              href={hrefFor({ folderId: folder.id, libraryId: null, mode: 'all', tag: '' })}
            >
              <span class="sidebar-link-name">{folder.name}</span>
              <span class="sidebar-count">{folder.comicCount}</span>
            </a>
            {#if isAdmin}
              <button class="sidebar-icon-btn" title="Rename" onclick={() => openModal('rename-folder', { id: folder.id, name: folder.name }, folder.name)}>✎</button>
              <button class="sidebar-icon-btn danger" title="Delete" onclick={() => openModal('delete-folder', { id: folder.id, name: folder.name })}>✕</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    {#if data.tags.length > 0}
      <div class="sidebar-section">
        <div class="sidebar-heading">Tags</div>
        <div class="tag-list">
          {#each data.tags.slice(0, 36) as tag}
            <div class="tag-row">
              <a class:active={data.selection.tag === tag} class="tag-pill" href={hrefFor({ folderId: null, libraryId: null, mode: 'all', tag })}>
                {tag}
              </a>
              {#if isAdmin}
                <button class="tag-icon-btn" title="Rename tag" onclick={() => openModal('rename-tag', { name: tag }, tag)}>✎</button>
                <button class="tag-icon-btn danger" title="Delete tag" onclick={() => openModal('delete-tag', { name: tag })}>✕</button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </aside>

  <section class="library-main">
    <button class="sidebar-toggle" onclick={() => { sidebarOpen = !sidebarOpen; }}>
      ☰ Browse
    </button>

    <div class="library-toolbar">
      <div class="library-topline">
        <span class="library-topline-title">{pageTitle}</span>
        <span class="library-topline-count">{totalCount.toLocaleString()} item{totalCount === 1 ? '' : 's'}{data.selection.search ? ` for "${data.selection.search}"` : ''}</span>
      </div>

      <form class="library-filters" method="GET">
        {#if data.selection.mode !== 'all'}
          <input type="hidden" name="mode" value={data.selection.mode} />
        {/if}
        {#if data.selection.libraryId}
          <input type="hidden" name="library" value={data.selection.libraryId} />
        {/if}
        {#if data.selection.folderId}
          <input type="hidden" name="folder" value={data.selection.folderId} />
        {/if}
        {#if data.selection.tag}
          <input type="hidden" name="tag" value={data.selection.tag} />
        {/if}

        <input class="filter-input" type="search" name="search" placeholder="Search…" value={data.selection.search} />

        <select class="filter-select" name="mediaType" value={data.selection.mediaType}>
          <option value="">All media</option>
          <option value="comic">Comics</option>
          <option value="book">Books</option>
        </select>

        <select class="filter-select" name="fileExt" value={data.selection.fileExt}>
          <option value="">All formats</option>
          <option value="cbz">CBZ</option>
          <option value="cbr">CBR</option>
          <option value="epub">EPUB</option>
          <option value="pdf">PDF</option>
          <option value="mobi">MOBI</option>
        </select>

        <select class="filter-select" name="readStatus" value={data.selection.readStatus}>
          <option value="">Any status</option>
          <option value="unread">Unread</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
        </select>

        <select class="filter-select" name="sortBy" value={data.selection.sortBy}>
          <option value="title">Title</option>
          <option value="dateAdded">Date added</option>
          <option value="fileSize">File size</option>
          <option value="pageCount">Page count</option>
          <option value="lastRead">Last read</option>
        </select>

        <select class="filter-select" name="sortOrder" value={data.selection.sortOrder}>
          <option value="asc">A→Z / Oldest</option>
          <option value="desc">Z→A / Newest</option>
        </select>

        {#if isAuthenticated}
          <label class="favorites-label">
            <input type="checkbox" name="favorites" value="1" checked={data.selection.favorites} />
            Favorites
          </label>
        {/if}

        <button class="filter-submit" type="submit">Apply</button>
      </form>
    </div>

    <!-- Continue-reading shelf (main 'all' view only) -->
    {#if data.continueReading.length > 0 && data.selection.mode === 'all' && !data.selection.libraryId && !data.selection.folderId && !data.selection.tag}
      <div class="surface-card shelf-card">
        <div class="shelf-heading">Continue reading</div>
        <div class="shelf-row">
          {#each data.continueReading as record}
            <a class="shelf-item" href={`/read/${record.id}/${Math.max(0, record.lastPage ?? 0)}`}>
              <div class="shelf-thumb">
                <img src={record.thumbnailUrl || PLACEHOLDER_SVG} alt={record.title} loading="lazy" />
                {#if progressLabel(record)}
                  <div class="shelf-progress">{progressLabel(record)}</div>
                {/if}
              </div>
              <div class="shelf-title">{record.title}</div>
            </a>
          {/each}
        </div>
      </div>
    {/if}

    {#if allRecords.length === 0 && !loadingMore && (data.selection.folderId !== null || data.selection.libraryId !== null || data.folders.length === 0 || data.selection.mode !== 'all')}
      <div class="surface-card empty-library">
        <h2>No items match this view.</h2>
        <p>Adjust filters, switch collections, or add comics via <a href="/add-comics">Add Comics</a>.</p>
        <div class="auth-actions">
          <a class="auth-button secondary" href="/">Clear filters</a>
        </div>
      </div>
    {:else}
      <div class="library-grid">
        <!-- Folder cards — shown in the root 'all' view only -->
        {#if data.selection.mode === 'all' && !data.selection.libraryId && !data.selection.folderId && !data.selection.tag}
          {#each data.folders as folder (folder.id)}
            <a class="library-card folder-card surface-card" href={hrefFor({ folderId: folder.id, libraryId: null, mode: 'all', tag: '' })}>
              <div class="card-art">
                {#if folder.thumbnailUrl}
                  <img src={folder.thumbnailUrl} alt={folder.name} loading="lazy" onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                {:else}
                  <div class="folder-art-placeholder">
                    <span class="folder-icon">📁</span>
                  </div>
                {/if}
                <div class="card-badge folder-badge">FOLDER</div>
              </div>
              <div class="card-copy">
                <h2>{folder.name}</h2>
                <p>{folder.comicCount} item{folder.comicCount === 1 ? '' : 's'}</p>
              </div>
            </a>
          {/each}
        {/if}

        {#each allRecords as record (record.id)}
          <a
            class="library-card surface-card"
            href={`/read/${record.id}/${Math.max(0, record.lastPage ?? 0)}`}
            oncontextmenu={(e) => handleContextMenu(e, record)}
            onpointerdown={(e) => startLongPress(e, record)}
            onpointerup={cancelLongPress}
            onpointermove={cancelLongPress}
          >
            <div class="card-art">
              <img
                src={record.thumbnailUrl || PLACEHOLDER_SVG}
                alt={record.title}
                loading="lazy"
                onerror={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_SVG; }}
              />
              <div class={`card-badge ${record.mediaType === 'book' ? 'book' : ''}`}>
                {(record.fileExt || record.mediaType).toUpperCase()}
              </div>
              {#if progressLabel(record)}
                <div class="card-progress">{progressLabel(record)}</div>
              {/if}
              {#if isAuthenticated}
                <button
                  class={`card-fav ${favoritedIds.has(record.id) ? 'active' : ''}`}
                  title={favoritedIds.has(record.id) ? 'Remove favorite' : 'Add favorite'}
                  onclick={(e) => toggleFavorite(e, record.id)}
                >♥</button>
              {/if}
            </div>

            <div class="card-copy">
              <h2>{record.title}</h2>
              <p>{record.pageCount > 0 ? `${record.pageCount} pages` : record.mediaType}</p>
              {#if record.tags.length > 0}
                <div class="card-tags">
                  {#each record.tags.slice(0, 3) as tag}
                    <span>{tag}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </a>
        {/each}
      </div>

      <!-- Infinite scroll sentinel -->
      {#if hasMore || loadingMore}
        <div class="load-more-sentinel" bind:this={sentinelEl}>
          {#if loadingMore}<span class="load-more-spinner"></span>{/if}
        </div>
      {/if}
    {/if}
  </section>
</section>

<style>
  /* ── Shell ─────────────────────────────────────── */
  .library-shell {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    min-height: calc(100svh - var(--nav-h, 52px));
    align-items: start;
  }

  /* ── Sidebar ────────────────────────────────────── */
  .library-sidebar {
    position: sticky;
    top: var(--nav-h, 52px);
    height: calc(100svh - var(--nav-h, 52px));
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem 0.75rem;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    background: var(--surface);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
  }

  .sidebar-section + .sidebar-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .sidebar-heading {
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .sidebar-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .sidebar-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .sidebar-add-btn:hover {
    background: rgba(74, 158, 255, 0.15);
    color: var(--text);
    border-color: var(--accent);
  }

  .sidebar-item-row {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.42rem 0.55rem;
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 0.88rem;
    transition: background 150ms ease, color 150ms ease;
  }

  .sidebar-link:hover,
  .sidebar-link.active {
    background: rgba(74, 158, 255, 0.1);
    color: var(--text);
  }

  .sidebar-link-grow {
    flex: 1;
    min-width: 0;
  }

  .sidebar-link-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-count {
    color: var(--text-dim);
    font-size: 0.74rem;
    flex-shrink: 0;
  }

  .sidebar-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.3rem;
    height: 1.3rem;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-dim);
    font-size: 0.74rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 150ms ease, background 150ms ease, color 150ms ease;
  }

  .sidebar-item-row:hover .sidebar-icon-btn {
    opacity: 1;
  }

  .sidebar-icon-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
  }

  .sidebar-icon-btn.danger:hover {
    background: rgba(224, 82, 82, 0.15);
    color: var(--danger);
  }

  .sidebar-empty {
    color: var(--text-dim);
    font-size: 0.86rem;
    padding: 0.2rem 0.55rem;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag-row {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
  }

  .tag-pill {
    padding: 0.24rem 0.48rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-muted);
    font-size: 0.76rem;
    transition: background 150ms ease, color 150ms ease;
  }

  .tag-pill.active,
  .tag-pill:hover {
    background: rgba(74, 158, 255, 0.12);
    color: var(--text);
  }

  .tag-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
    height: 1.1rem;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--text-dim);
    font-size: 0.68rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 150ms ease, background 150ms ease;
  }

  .tag-row:hover .tag-icon-btn {
    opacity: 1;
  }

  .tag-icon-btn.danger:hover {
    color: var(--danger);
  }

  /* ── Main content ───────────────────────────────── */
  .library-main {
    display: grid;
    gap: 0.65rem;
    padding: 0.65rem 0.9rem 3rem;
    min-width: 0;
    align-content: start;
  }

  /* Mobile sidebar toggle */
  .sidebar-toggle {
    display: none;
  }

  .library-toolbar {
    display: grid;
    gap: 0.45rem;
  }

  .library-topline {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
  }

  .library-topline-title {
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--text);
  }

  .library-topline-count {
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .library-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .filter-input {
    flex: 1 1 140px;
    min-width: 80px;
  }

  .filter-select {
    flex: 0 1 120px;
    min-width: 80px;
  }

  .filter-input,
  .filter-select {
    padding: 0.38rem 0.55rem;
    border: 1px solid rgba(74, 158, 255, 0.35);
    border-radius: var(--radius);
    background: rgba(74, 158, 255, 0.04);
    color: var(--text);
    font-size: 0.82rem;
  }

  .filter-input:focus,
  .filter-select:focus {
    outline: none;
    border-color: rgba(74, 158, 255, 0.7);
    background: rgba(74, 158, 255, 0.07);
  }

  .filter-submit {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.38rem 0.75rem;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .filter-submit:hover {
    background: rgba(74, 158, 255, 0.12);
  }

  .favorites-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  /* ── Shelf ──────────────────────────────────────── */
  .shelf-card {
    padding: 0.65rem 0.85rem 0.75rem;
    overflow: hidden;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: var(--radius);
  }

  .shelf-heading {
    margin-bottom: 0.55rem;
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .shelf-row {
    display: flex;
    gap: 0.55rem;
    overflow-x: auto;
    padding-bottom: 0.4rem;
  }

  .shelf-item {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex-shrink: 0;
    width: 120px;
    color: var(--text);
  }

  .shelf-thumb {
    position: relative;
    aspect-ratio: 2/3;
    border-radius: 6px;
    overflow: hidden;
    background: #111;
  }

  .shelf-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .shelf-progress {
    position: absolute;
    bottom: 0.35rem;
    right: 0.35rem;
    padding: 0.2rem 0.4rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .shelf-title {
    font-size: 0.8rem;
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    color: var(--text-muted);
  }

  /* Grid */
  .library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.55rem;
  }

  .library-card {
    overflow: hidden;
    transition: transform 140ms ease, border-color 140ms ease;
  }

  .library-card:hover {
    transform: translateY(-2px);
    border-color: rgba(74, 158, 255, 0.2);
  }

  .card-art {
    position: relative;
    aspect-ratio: 2/3;
    background: #111;
  }

  .card-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .card-badge,
  .card-progress,
  .card-fav {
    position: absolute;
    border-radius: 999px;
  }

  .card-badge {
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.28rem 0.48rem;
    background: rgba(9, 15, 21, 0.85);
    color: #dbe9ff;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .card-badge.book {
    background: rgba(60, 44, 19, 0.85);
    color: #ffe0ad;
  }

  .card-progress {
    right: 0.5rem;
    bottom: 0.5rem;
    padding: 0.28rem 0.48rem;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .card-fav {
    top: 0.5rem;
    right: 0.5rem;
    width: 1.6rem;
    height: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.9rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 140ms ease, color 140ms ease, background 140ms ease;
  }

  .library-card:hover .card-fav,
  .card-fav.active {
    opacity: 1;
  }

  .card-fav.active {
    color: #f87171;
    background: rgba(0, 0, 0, 0.72);
  }

  .card-copy {
    padding: 0.5rem 0.6rem 0.6rem;
  }

  .card-copy h2 {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-copy p {
    margin: 0.2rem 0 0;
    color: var(--text-muted);
    font-size: 0.74rem;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.55rem;
  }

  .card-tags span {
    padding: 0.2rem 0.42rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-dim);
    font-size: 0.72rem;
  }

  .folder-card .card-art {
    background: linear-gradient(135deg, #1a2035, #111);
  }

  .folder-art-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .folder-icon {
    font-size: 2.5rem;
    opacity: 0.6;
  }

  .folder-badge {
    background: rgba(30, 50, 90, 0.85) !important;
    color: #93c5fd !important;
  }

  .empty-library {
    padding: 1.5rem 1.3rem;
  }

  .empty-library h2 {
    margin: 0 0 0.4rem;
  }

  .empty-library p {
    margin: 0;
    color: var(--text-muted);
  }

  /* Load more */
  .load-more-sentinel {
    display: flex;
    justify-content: center;
    padding: 2rem 0;
    min-height: 4rem;
  }

  .load-more-spinner {
    display: inline-block;
    width: 1.4rem;
    height: 1.4rem;
    border: 2px solid rgba(255, 255, 255, 0.08);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  }

  .modal-card {
    width: min(440px, calc(100vw - 2rem));
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .modal-title {
    margin: 0;
    font-size: 1.15rem;
  }

  .modal-label {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .modal-desc {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .modal-actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .auth-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 100px;
    padding: 0.62rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .auth-button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #061322;
    font-weight: 700;
  }

  .auth-button.secondary {
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
  }

  .auth-button.danger {
    background: rgba(224, 82, 82, 0.15);
    border-color: rgba(224, 82, 82, 0.3);
    color: var(--danger);
    font-weight: 700;
  }

  .auth-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .auth-actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.8rem;
    flex-wrap: wrap;
  }

  /* ── Context menu ──────────────────────────────── */
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .ctx-menu {
    position: fixed;
    z-index: 41;
    min-width: 210px;
    max-width: 260px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 0.35rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: rgba(22, 22, 22, 0.97);
    backdrop-filter: blur(16px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .ctx-item {
    display: block;
    width: 100%;
    padding: 0.55rem 0.75rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
    transition: background 120ms ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctx-item:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.07);
  }

  .ctx-item:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .ctx-item.ctx-danger {
    color: var(--danger);
  }

  .ctx-item.ctx-danger:hover:not(:disabled) {
    background: rgba(224, 82, 82, 0.12);
  }

  .ctx-sub-label {
    padding: 0.35rem 0.75rem 0.15rem;
    color: var(--text-dim);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .ctx-sub-item {
    padding-left: 1.1rem;
    color: var(--text-muted);
  }

  .ctx-back {
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .ctx-sep {
    height: 1px;
    margin: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.07);
  }

  /* ── iPad (768–1100px) ─────────────────────────── */
  @media (max-width: 1100px) {
    .library-shell {
      grid-template-columns: 200px minmax(0, 1fr);
    }
  }

  /* ── Mobile (<768px) ────────────────────────────── */
  @media (max-width: 767px) {
    .library-shell {
      grid-template-columns: 1fr;
    }

    .library-sidebar {
      position: fixed;
      top: var(--nav-h, 52px);
      left: 0;
      z-index: 15;
      width: 80vw;
      max-width: 300px;
      height: calc(100svh - var(--nav-h, 52px));
      transform: translateX(-100%);
      transition: transform 240ms ease, box-shadow 240ms ease;
      box-shadow: none;
    }

    .library-sidebar.sidebar-open {
      transform: translateX(0);
      box-shadow: 4px 0 32px rgba(0, 0, 0, 0.5);
    }

    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      top: var(--nav-h, 52px);
      z-index: 14;
      background: rgba(0, 0, 0, 0.5);
    }

    .sidebar-overlay.open {
      display: block;
    }

    .sidebar-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.5rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-muted);
      font-size: 0.86rem;
      cursor: pointer;
      margin-bottom: 0.75rem;
    }

    .library-main {
      padding: 0.6rem 0.6rem 3rem;
    }

    .library-filters {
      gap: 0.35rem;
    }

    .filter-select {
      flex: 1 1 90px;
    }

    .library-grid {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 0.4rem;
    }
  }
</style>
