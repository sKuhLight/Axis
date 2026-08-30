<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { appSettings } from '$lib/appSettings.svelte';
  import { theme } from '$lib/theme.svelte';
  // Apply saved global settings ASAP on the client (SSR is off).
  if (typeof document !== 'undefined') {
    theme.init();
    appSettings.init();
  }
  let { children } = $props();

  // PWA: register the service worker ONLY in the remote web build (axisapp.live). The desktop app is
  // served same-origin over http://localhost, where an SW would intercept the ForgeFX API/SSE — so it
  // must stay off there. VITE_AXIS_REMOTE is a build-time constant, so this branch is tree-shaken out
  // of the desktop bundle entirely.
  onMount(() => {
    if (import.meta.env.VITE_AXIS_REMOTE === '1' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch(() => {});
    }
  });
</script>

{@render children()}
