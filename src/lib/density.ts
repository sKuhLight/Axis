// UI density — how tight the app's CHROME is (headers, toolbars, chip rows, footers).
//
// This is a different axis from the theme's `scale` (html { zoom }, theme.svelte.ts). Zoom shrinks
// everything uniformly, chrome and knob dials alike, so it can never trade chrome for content. Density
// shrinks only the chrome, which is the whole point: a docked Block Editor pane was spending ~61% of its
// height on headers and footers, leaving one row of controls. Both axes coexist.
//
// One source of truth. `DensityScale` holds plain numbers so the JS layout math can read them directly
// (ControlSurface's cell cap needs `tileMax` as a number), and `densityTokens()` projects the same numbers
// into the CSS custom properties the stylesheets consume. Never hardcode a chrome height that has a token.

export type Density = 'comfortable' | 'compact' | 'tight';

/** Density levels, loosest first. Order is meaningful: the picker renders it, and the tests assert that
 *  every field shrinks monotonically along it. */
export const DENSITIES: readonly Density[] = [
  'comfortable',
  'compact',
  'tight',
];

export interface DensityScale {
  /** primary buttons — footer actions, the block type button */
  ctlH: number;
  /** secondary chips — channel buttons, layout profile, arrange toggle */
  ctlHSm: number;
  /** inline chips — +Add, the grid toolbar widgets */
  ctlHXs: number;
  /** horizontal padding of a chrome band */
  padX: number;
  /** vertical padding of a chrome band */
  padY: number;
  /** gap between items inside a chrome band */
  gap: number;
  /** chip / button label */
  font: number;
  /** meta + mono labels */
  fontSm: number;
  /** band title */
  fontLg: number;
  /** workbench toolbar widget chip (its own control class — the widget-fit compact/mini ladder is derived
   *  from this, so the two sizing mechanisms stay ordered at every density) */
  widgetH: number;
  /** ControlSurface: largest a board cell may grow to. Without a cap `cell` is just
   *  containerW/cols, which inflated knobs to 171px (a 133px dial) on a wide pane. */
  tileMax: number;
}

export const AXIS_DENSITIES: Record<Density, DensityScale> = {
  comfortable: { ctlH: 44, ctlHSm: 34, ctlHXs: 28, padX: 14, padY: 10, gap: 8, font: 13, fontSm: 11, fontLg: 15, widgetH: 38, tileMax: 132 },
  // Shipped default. tileMax 104 is not arbitrary — it is the same legible-tile unit ControlSurface's
  // `fitCols` already uses to decide how many columns fit.
  compact: { ctlH: 36, ctlHSm: 28, ctlHXs: 24, padX: 10, padY: 6, gap: 6, font: 12, fontSm: 10.5, fontLg: 14, widgetH: 32, tileMax: 104 },
  tight: { ctlH: 30, ctlHSm: 24, ctlHXs: 20, padX: 8, padY: 4, gap: 5, font: 11, fontSm: 10, fontLg: 13, widgetH: 27, tileMax: 88 }
};

export const DEFAULT_DENSITY: Density = 'compact';

export function readDensity(value: unknown): Density {
  return value === 'comfortable' || value === 'tight' ? value : DEFAULT_DENSITY;
}

/** CSS custom-property name per scale field, WITHOUT the leading `--` (theme.svelte.ts#apply adds it,
 *  matching how the palette tokens are written). */
const TOKEN_NAME: Record<keyof DensityScale, string> = {
  ctlH: 'd-ctl-h',
  ctlHSm: 'd-ctl-h-sm',
  ctlHXs: 'd-ctl-h-xs',
  padX: 'd-pad-x',
  padY: 'd-pad-y',
  gap: 'd-gap',
  font: 'd-font',
  fontSm: 'd-font-sm',
  fontLg: 'd-font-lg',
  widgetH: 'd-widget-h',
  tileMax: 'd-tile-max'
};

/** Project a density level into the `token → 'Npx'` map the theme store writes onto <html>. */
export function densityTokens(density: Density): Record<string, string> {
  const scale = AXIS_DENSITIES[readDensity(density)];
  const out: Record<string, string> = {};
  for (const key of Object.keys(TOKEN_NAME) as (keyof DensityScale)[]) out[TOKEN_NAME[key]] = `${scale[key]}px`;
  return out;
}

/** The board cell cap for a density — ControlSurface reads this directly (see surfaceGrid.ts). */
export function densityTileMax(density: Density): number {
  return AXIS_DENSITIES[readDensity(density)].tileMax;
}
