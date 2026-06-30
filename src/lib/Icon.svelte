<script lang="ts" module>
  // Inline SVG icon set for the cloud / browser UI. Stroke icons inherit `currentColor`; size in px.
  // Keep paths terse — these render at 9–22px, so favour simple geometry that stays legible small.
  export type IconName =
    | 'cloud' | 'cloudUp' | 'cloudDown' | 'cloudCheck' | 'device' | 'refresh' | 'check'
    | 'rename' | 'duplicate' | 'convert' | 'export' | 'trash' | 'load' | 'star' | 'mail'
    | 'user' | 'folder' | 'plus' | 'close' | 'list' | 'cloudOff';
</script>

<script lang="ts">
  let { name, size = 16, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'cloud'}
    <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 9.2 3.5 3.5 0 0 1 17 18H7Z" />
  {:else if name === 'cloudUp'}
    <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 9.2 3.5 3.5 0 0 1 17 18" />
    <path d="M12 21v-7m0 0-2.3 2.3M12 14l2.3 2.3" />
  {:else if name === 'cloudDown'}
    <path d="M7 16a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 7.2 3.5 3.5 0 0 1 17 16" />
    <path d="M12 11v8m0 0 2.3-2.3M12 19l-2.3-2.3" />
  {:else if name === 'cloudCheck'}
    <path d="M7 17a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.2 3.5 3.5 0 0 1 17 17" />
    <path d="m9.3 14.6 1.8 1.8 3.6-3.8" />
  {:else if name === 'device'}
    <rect x="6" y="3.5" width="12" height="17" rx="2" />
    <path d="M10 17h4" />
  {:else if name === 'refresh'}
    <path d="M20 11a8 8 0 0 0-14.3-4.3M4 5v3.5h3.5" />
    <path d="M4 13a8 8 0 0 0 14.3 4.3M20 19v-3.5h-3.5" />
  {:else if name === 'check'}
    <path d="m5 12.5 4.5 4.5L19 7" />
  {:else if name === 'rename'}
    <path d="M4 20h16" />
    <path d="M14.5 5.5 18 9 8 19l-4 1 1-4 9.5-10.5Z" />
  {:else if name === 'duplicate'}
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M5.5 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5" />
  {:else if name === 'convert'}
    <path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5" />
    <path d="M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" />
  {:else if name === 'export'}
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  {:else if name === 'trash'}
    <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2m2 0v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7" />
  {:else if name === 'load'}
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M5 21h14" />
  {:else if name === 'star'}
    <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" fill="currentColor" stroke="none" />
  {:else if name === 'mail'}
    <rect x="3" y="5.5" width="18" height="13" rx="2.4" />
    <path d="m4 7 8 6 8-6" />
  {:else if name === 'user'}
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 19.2a6.6 5.6 0 0 1 13 0" />
  {:else if name === 'folder'}
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v8.3A1.5 1.5 0 0 1 19 19.5H5a1.5 1.5 0 0 1-1.5-1.5V7.5Z" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'list'}
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
  {:else if name === 'cloudOff'}
    <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 9.2 3.5 3.5 0 0 1 17 18H7Z" />
    <path d="M3.5 3.5 20.5 20.5" />
  {/if}
</svg>
