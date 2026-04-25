<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { deleteUser, setUserRole } from '$lib/api';
  import { showErrorToast, showToast } from '$lib/ui/toast';
  import type { UserSummary } from '$lib/api';

  let { data } = $props<{ data: { users: UserSummary[]; session: { user: { id: number } | null } | null } }>();

  let busyIds = $state(new Set<number>());

  async function handleDelete(user: UserSummary): Promise<void> {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    busyIds = new Set([...busyIds, user.id]);
    try {
      await deleteUser(user.id);
      showToast(`Deleted "${user.username}"`);
      await invalidateAll();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      busyIds.delete(user.id);
      busyIds = new Set(busyIds);
    }
  }

  async function handleRoleToggle(user: UserSummary): Promise<void> {
    busyIds = new Set([...busyIds, user.id]);
    try {
      await setUserRole(user.id, !user.isAdmin);
      showToast(`${user.username} is now ${user.isAdmin ? 'a regular user' : 'an admin'}`);
      await invalidateAll();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      busyIds.delete(user.id);
      busyIds = new Set(busyIds);
    }
  }

  const selfId = $derived(data.session?.user?.id ?? null);
</script>

<section class="surface-card users-shell">
  <div class="page-hero">
    <div class="page-eyebrow">Admin</div>
    <h1 class="page-title">User accounts</h1>
    <p class="page-copy">{data.users.length} account{data.users.length === 1 ? '' : 's'} registered.</p>
  </div>

  <div class="users-actions">
    <a class="auth-button primary" href="/users/new">Create account</a>
  </div>

  {#if data.users.length === 0}
    <div class="users-empty">No user accounts found.</div>
  {:else}
    <table class="users-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as user (user.id)}
          <tr class:is-self={user.id === selfId}>
            <td class="username-cell">
              {user.username}
              {#if user.id === selfId}<span class="self-badge">you</span>{/if}
            </td>
            <td>
              <span class={`role-badge ${user.isAdmin ? 'admin' : ''}`}>
                {user.isAdmin ? 'Admin' : 'User'}
              </span>
            </td>
            <td class="date-cell">{new Date(user.createdAt).toLocaleDateString()}</td>
            <td class="actions-cell">
              {#if user.id !== selfId}
                <button
                  class="auth-button secondary small"
                  onclick={() => handleRoleToggle(user)}
                  disabled={busyIds.has(user.id)}
                >
                  {user.isAdmin ? 'Demote' : 'Make admin'}
                </button>
                <button
                  class="auth-button danger small"
                  onclick={() => handleDelete(user)}
                  disabled={busyIds.has(user.id)}
                >
                  Delete
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .users-shell {
    overflow: hidden;
  }

  .users-actions {
    display: flex;
    gap: 0.7rem;
    padding: 0 1.3rem 1.3rem;
  }

  .users-empty {
    padding: 1rem 1.3rem 1.3rem;
    color: var(--text-muted);
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }

  .users-table th,
  .users-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .users-table th {
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .users-table tr.is-self td {
    background: rgba(74, 158, 255, 0.04);
  }

  .username-cell {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .self-badge {
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: rgba(74, 158, 255, 0.15);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .role-badge {
    display: inline-block;
    padding: 0.22rem 0.55rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .role-badge.admin {
    background: rgba(74, 158, 255, 0.12);
    color: #93c5fd;
  }

  .date-cell {
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  .actions-cell {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .auth-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.62rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .auth-button.small {
    padding: 0.38rem 0.7rem;
    font-size: 0.82rem;
    min-width: 0;
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
    background: rgba(224, 82, 82, 0.1);
    border-color: rgba(224, 82, 82, 0.25);
    color: var(--danger);
  }

  .auth-button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  @media (max-width: 640px) {
    .users-table th:nth-child(3),
    .users-table td:nth-child(3) {
      display: none;
    }

    .users-actions {
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }
</style>
