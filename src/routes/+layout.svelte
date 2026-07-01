<script lang="ts">
  import '../app.css';
  import { theme } from '$lib/theme.svelte';
  // Apply the saved theme ASAP on the client (SSR is off) so the whole app renders in it.
  if (typeof document !== 'undefined') theme.init();
  let { children } = $props();
</script>

{@render children()}
