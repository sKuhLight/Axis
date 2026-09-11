<script lang="ts">
  /**
   * The ☆/★ favorite-toggle button beside a list row — identical in CabPicker and PresetPicker
   * down to every value except glyph size, which stayed a prop rather than being forced to match.
   */
  let {
    on,
    onclick,
    size = 17
  }: {
    on: boolean;
    onclick: () => void;
    size?: number;
  } = $props();
</script>

<button
  class="fav-star"
  class:on
  aria-label="Favorite"
  title={on ? 'Unfavorite' : 'Favorite'}
  style:font-size="{size}px"
  {onclick}
>
  {on ? '★' : '☆'}
</button>

<style>
  .fav-star {
    flex: none;
    width: 38px;
    height: 38px;
    margin-right: 6px;
    border: 0;
    background: transparent;
    color: var(--border3);
    cursor: pointer;
    border-radius: 9px;
  }
  .fav-star:hover,
  .fav-star.on {
    color: var(--amber);
  }
</style>
