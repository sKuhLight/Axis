<script lang="ts">
  import SignalGrid from '../../SignalGrid.svelte';
</script>

<div class="axis-pane-fill">
  <SignalGrid />
</div>

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
