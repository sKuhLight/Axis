<script lang="ts">
  // Theme & appearance picker modal (monolith shell). The controls live in AppearanceSettings; this
  // wrapper owns the Dialog shell + header. The Axis hub's Theme tab renders the same controls inline.
  import { editorOverlays, editorViewport } from '$lib/editor/editorClients.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';

  const onclose = () => (editorOverlays.themeOpen = false);
  const mob = $derived(editorViewport.isMobile);
</script>

<Dialog overlay="theme" open={editorOverlays.themeOpen} onClose={onclose} size="sm" maxHeight="88vh" sheet={mob} labelledBy="theme-dlg-title" class="theme-dlg">
  <div class="card scroll" class:mob>
    <div class="head" id="theme-dlg-title">
      <div><div class="h1">Appearance</div><div class="sub">Theme, accent, scale &amp; density — saved on this device</div></div>
      <button class="x" aria-label="Close" onclick={onclose}>✕</button>
    </div>

    <AppearanceSettings />
  </div>
</Dialog>

<style>
  /* card frame comes from Dialog; `.card` here is now the scrollable padded body. */
  .card { width: 100%; overflow-y: auto; color: var(--text); padding: 22px 22px 24px; }
  .card.mob { padding-bottom: calc(24px + var(--axis-safe-bottom)); }
  .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
  .h1 { font-size: 19px; font-weight: 800; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--textdim); margin-top: 2px; }
  .x { width: 30px; height: 30px; flex: none; border: 0; border-radius: 8px; background: var(--bg2); color: var(--textdim); font-size: 14px; cursor: pointer; }
  .x:hover { color: var(--text); background: var(--surface2); }
</style>
