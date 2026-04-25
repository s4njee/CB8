<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { login } from '../../lib/api';
  import { showErrorToast, showToast } from '../../lib/ui/toast';

  let identifier = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function submit(): Promise<void> {
    error = null;
    loading = true;
    try {
      await login(identifier.trim(), password);
      await invalidateAll();
      showToast('Signed in');
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      showErrorToast(error);
    } finally {
      loading = false;
    }
  }
</script>

<section class="surface-card auth-shell">
  <div class="page-hero auth-hero">
    <div class="page-eyebrow">Authentication</div>
    <h1 class="page-title">Sign in to CB8</h1>
    <p class="page-copy">
      The SvelteKit frontend now talks to the live Fastify session endpoints.
      Account creation is administrator-controlled in the current backend.
    </p>
  </div>

  <div class="auth-grid">
    <form class="info-card auth-form" onsubmit={(event) => { event.preventDefault(); return submit(); }}>
      <label class="auth-label" for="identifier">Username</label>
      <input
        id="identifier"
        bind:value={identifier}
        class="auth-input"
        autocomplete="username"
        placeholder="admin"
        required
      />

      <label class="auth-label" for="password">Password</label>
      <input
        id="password"
        bind:value={password}
        class="auth-input"
        type="password"
        autocomplete="current-password"
        required
      />

      {#if error}
        <div class="status-banner auth-error" role="alert">{error}</div>
      {/if}

      <div class="auth-actions">
        <button class="auth-button primary" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <a class="auth-button secondary" href="/forgot-password">Forgot password</a>
      </div>
    </form>

    <article class="info-card">
      <h2>Current backend behavior</h2>
      <ul>
        <li>Sessions are cookie-based and persisted in SQLite.</li>
        <li>Only administrators can create additional accounts.</li>
        <li>Password reset is not implemented by the current Fastify routes.</li>
      </ul>

      <div class="auth-side-actions">
        <a class="auth-button secondary" href="/">Back to app shell</a>
      </div>
    </article>
  </div>
</section>

<style>
  .auth-shell {
    overflow: hidden;
  }

  .auth-hero {
    padding-bottom: 0.6rem;
  }

  .auth-grid {
    display: grid;
    gap: 1rem;
    padding: 0 1.3rem 1.3rem;
    grid-template-columns: minmax(280px, 1.1fr) minmax(260px, 0.9fr);
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .auth-label {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .auth-input {
    width: 100%;
    padding: 0.72rem 0.82rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
  }

  .auth-input:focus {
    border-color: var(--accent);
    outline: none;
  }

  .auth-actions,
  .auth-side-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin-top: 0.4rem;
  }

  .auth-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 140px;
    padding: 0.72rem 0.95rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
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

  .auth-button:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .auth-error {
    margin: 0;
  }

  @media (max-width: 780px) {
    .auth-grid {
      grid-template-columns: 1fr;
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }
</style>
