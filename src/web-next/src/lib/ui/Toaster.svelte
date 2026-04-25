<script lang="ts">
  import { toasts } from './toast';
</script>

<div class="toast-host" aria-live="polite" aria-atomic="true">
  {#each $toasts as toast (toast.id)}
    <div class={`toast ${toast.kind}`} role="status">
      {toast.message}
    </div>
  {/each}
</div>
