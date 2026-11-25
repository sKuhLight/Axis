/**
 * Fraction of the workbench height the phone-profile block editor takes when a block
 * is active (operator T31: "controls always sit at the bottom taking ~70–80% of the
 * height"). 0.75 sits in the middle of that band.
 */
export const AXIS_MOBILE_BLOCK_EXPAND_RATIO = 0.75;

/**
 * Height the main region (the grid map) keeps above the expanded editor: its minimum on
 * a phone (`DockRegion.svelte`, `.aw-region-main { min-height }` under 760 px).
 */
export const AXIS_MOBILE_MAIN_MIN_PX = 90;
