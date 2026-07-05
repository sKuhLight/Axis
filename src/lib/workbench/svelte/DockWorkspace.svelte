<script lang="ts">
  import DockRegion from './DockRegion.svelte';
</script>

<section class="aw-workspace">
  <DockRegion region="top" />
  <div class="aw-workspace-mid">
    <DockRegion region="left" />
    <DockRegion region="main" />
    <DockRegion region="right" />
  </div>
  <DockRegion region="bottom" />
</section>

<style>
  .aw-workspace {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(rgba(255, 255, 255, 0.015), transparent 120px),
      var(--aw-bg);
  }
  .aw-workspace-mid {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
</style>
