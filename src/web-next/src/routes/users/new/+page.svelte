<script lang="ts">
  import { goto } from '$app/navigation';
  import { createUser } from '../../../lib/api';
  import { showErrorToast, showToast } from '../../../lib/ui/toast';

  let username = $state('');
  let password = $state('');
  let isAdmin = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function submit(): Promise<void> {
    error = null;
    loading = true;
    try {
      await createUser(username.trim(), password, isAdmin);
      showToast(`Created ${isAdmin ? 'admin' : 'user'} account "${username.trim()}"`);
      username = '';
      password = '';
      isAdmin = false;
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
    <div class="page-eyebrow">Admin</div>
    <h1 class="page-title">Create account</h1>
    <p class="page-copy">
      The current backend only supports administrator-managed account creation.
      This screen maps directly to <code>POST /api/users</code>.
    </p>
  </div>

  <div class="auth-grid single">
    <form class="info-card auth-form" onsubmit={(event) => { event.preventDefault(); return submit(); }}>
      <label class="auth-label" for="username">Username</label>
      <input
        id="username"
        bind:value={username}
        class="auth-input"
        autocomplete="username"
        minlength="1"
        required
      />

      <label class="auth-label" for="password">Password</label>
      <input
        id="password"
        bind:value={password}
        class="auth-input"
        type="password"
        autocomplete="new-password"
        minlength="1"
        required
      />

      <label class="auth-checkbox">
        <input bind:checked={isAdmin} type="checkbox" />
        <span>Grant administrator access</span>
      </label>

      {#if error}
        <div class="status-banner auth-error" role="alert">{error}</div>
      {/if}

      <div class="auth-actions">
        <button class="auth-button primary" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
        <button class="auth-button secondary" type="button" onclick={() => goto('/')}>
          Back to shell
        </button>
      </div>
    </form>
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
  }

  .single {
    grid-template-columns: minmax(320px, 560px);
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

  .auth-checkbox {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-top: 0.35rem;
    color: var(--text-muted);
  }

  .auth-actions {
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
</style>
