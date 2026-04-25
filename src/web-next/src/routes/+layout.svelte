<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import '../app.css';
  import { logout } from '../lib/api';
  import Toaster from '$lib/ui/Toaster.svelte';
  import { showErrorToast, showToast } from '$lib/ui/toast';

  let { data, children } = $props();

  const authenticated = $derived(Boolean(data.session?.authenticated && data.session?.user));
  const username = $derived(data.session?.user?.username ?? 'Guest');
  const isAdmin = $derived(Boolean(data.session?.user?.isAdmin));
  const guestEnabled = $derived(Boolean(data.session?.guestAccess));
  const pathname = $derived(page.url.pathname);
  const isReaderRoute = $derived(pathname.startsWith('/read/'));
  const isLibraryRoute = $derived(pathname === '/');
  const isFullWidth = $derived(isReaderRoute || isLibraryRoute);

  async function handleLogout(): Promise<void> {
    try {
      await logout();
      await invalidateAll();
      showToast('Signed out');
      await goto('/login');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    }
  }
</script>

<div class="app-shell">
  <header class="app-topbar">
    <div class="app-topbar-left">
      <a href="/" class="app-brand">CB8</a>
      <nav class="app-nav" aria-label="Primary">
        <a href="/" class="app-nav-link" aria-current={pathname === '/' ? 'page' : undefined}>Library</a>
        {#if isAdmin}
          <a href="/add-comics" class="app-nav-link" aria-current={pathname === '/add-comics' ? 'page' : undefined}>
            Add Comics
          </a>
          <a href="/users" class="app-nav-link" aria-current={pathname.startsWith('/users') ? 'page' : undefined}>
            Users
          </a>
        {/if}
        {#if !authenticated}
          <a href="/login" class="app-nav-link" aria-current={pathname === '/login' ? 'page' : undefined}>Sign in</a>
        {/if}
      </nav>
    </div>

    <div class="app-topbar-right">
      <span class="session-pill">
        <span class={`session-dot ${authenticated ? 'authenticated' : guestEnabled ? 'guest' : ''}`}></span>
        <strong>{username}</strong>
      </span>

      {#if authenticated}
        <button class="topbar-button" type="button" onclick={handleLogout}>Sign out</button>
      {/if}
    </div>
  </header>

  <main class={`app-main ${isReaderRoute ? 'reader-main' : ''}`}>
    {#if data.sessionError}
      <div class={isFullWidth ? 'status-banner-inline' : 'status-banner'} role="alert">
        Session probe failed: {data.sessionError}
      </div>
    {/if}

    {#if isFullWidth}
      {@render children()}
    {:else}
      <div class="page-container">
        {@render children()}
      </div>
    {/if}
  </main>

  <Toaster />
</div>
