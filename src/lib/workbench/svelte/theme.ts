export interface WorkbenchTheme {
  name: string;
  className?: string;
  vars?: Record<`--${string}`, string>;
  density?: 'comfortable' | 'compact' | 'dense';
  radius?: 'sharp' | 'soft' | 'round';
}

/**
 * Neutral defaults for the generic renderer's `--aw-*` design tokens (T17).
 *
 * The generic components reference plain `var(--aw-*)`; these are the neutral,
 * app-agnostic fallbacks. App themes (e.g. `axisWorkbenchTheme`) override any
 * subset via `WorkbenchTheme.vars`. Keeping the defaults here — rather than
 * inline in a component — is the single source of truth so the renderer stays
 * host-neutral and re-themeable.
 *
 * NOTE: these are currently ALSO declared inline in `WorkbenchHost.svelte`'s
 * `:global(.aw-root)` block (owned by another agent). Once that block is
 * switched to consume `workbenchTokenDefaultsCss()`, this becomes the only
 * definition.
 */
export const WORKBENCH_TOKEN_DEFAULTS: Record<`--aw-${string}`, string> = {
  '--aw-bg': '#0c0c0e',
  '--aw-bg-2': '#0e0e10',
  '--aw-surface': '#141417',
  '--aw-surface-2': '#1c1c21',
  '--aw-border': '#26262c',
  '--aw-border-2': '#2a2a31',
  '--aw-border-3': '#3a3a44',
  '--aw-text': '#e9e9ee',
  '--aw-text-2': '#cfcfd6',
  '--aw-text-muted': '#9a9aa3',
  '--aw-text-faint': '#6e6e78',
  '--aw-accent': '#35c9d6',
  '--aw-accent-ink': '#0a1416',
  '--aw-amber': '#f5a623',
  '--aw-danger': '#d6543f',
  '--aw-font-ui': 'system-ui, sans-serif',
  '--aw-font-mono': 'ui-monospace, monospace'
};

/**
 * The neutral token defaults as a CSS declaration list, for a component's
 * `:global(.aw-root)` block to consume in place of inline hex literals.
 */
export function workbenchTokenDefaultsCss(): string {
  return Object.entries(WORKBENCH_TOKEN_DEFAULTS)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
}

export function workbenchThemeStyle(theme?: WorkbenchTheme): string {
  if (!theme?.vars) return '';
  return Object.entries(theme.vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}
