<section class="surface-card auth-shell">
  <div class="page-hero auth-hero">
    <div class="page-eyebrow">Authentication</div>
    <h1 class="page-title">Password reset is unavailable</h1>
    <p class="page-copy">
      The current Fastify backend does not expose password reset or email-based
      recovery routes. This placeholder exists so the new frontend reflects the
      real API instead of linking to dead flows.
    </p>
  </div>

  <div class="card-grid">
    <article class="info-card">
      <h2>What to do instead</h2>
      <ul>
        <li>Ask an administrator to create a replacement account.</li>
        <li>Use the bootstrap admin password from <code>CB8_INITIAL_ADMIN_PASSWORD</code> if you are the operator.</li>
        <li>Return to the sign-in screen and try the correct credentials.</li>
      </ul>
      <div class="auth-actions">
        <a class="auth-button secondary" href="/login">Back to sign in</a>
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

  .auth-actions {
    display: flex;
    gap: 0.7rem;
    margin-top: 1rem;
  }

  .auth-button.secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 140px;
    padding: 0.72rem 0.95rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
  }
</style>
