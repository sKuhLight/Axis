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
 * These are the SINGLE SOURCE OF TRUTH for the `--aw-*` defaults:
 * `WorkbenchHost.svelte`'s `:global(.aw-root)` block consumes this via
 * `workbenchTokenDefaultsCss()` (injected as an inline style attribute on the
 * root), so no hex literal is duplicated in the component. The noHexColors guard
 * therefore enforces the renderer with no per-file tolerance.
 *
 * Each entry keeps the `var(--host-token, <hex fallback>)` shape so a host that
 * sets the short-named vars (`--bg`, `--accent`, …) still wins, while a bare
 * generic shell falls back to the hex.
 */
export const WORKBENCH_TOKEN_DEFAULTS: Record<`--aw-${string}`, string> = {
  '--aw-bg': 'var(--bg, #0c0c0e)',
  '--aw-bg-2': 'var(--bg2, #0e0e10)',
  '--aw-surface': 'var(--surface, #141417)',
  '--aw-surface-2': 'var(--surface2, #1c1c21)',
  '--aw-border': 'var(--border, #26262c)',
  '--aw-border-2': 'var(--border2, #2a2a31)',
  '--aw-border-3': 'var(--border3, #3a3a44)',
  '--aw-text': 'var(--text, #e9e9ee)',
  '--aw-text-2': 'var(--text2, #cfcfd6)',
  '--aw-text-muted': 'var(--textdim, #9a9aa3)',
  '--aw-text-faint': 'var(--textfaint, #6e6e78)',
  '--aw-accent': 'var(--accent, #35c9d6)',
  '--aw-accent-ink': 'var(--accentink, #0a1416)',
  // --aw-accent-indigo: secondary logo/mark accent (R6 T22 added it inline; now
  // sourced here so the mark's third dot + bottom-nav accents are tokenized).
  '--aw-accent-indigo': 'var(--accent-indigo, #4f6bed)',
  '--aw-amber': 'var(--amber, #f5a623)',
  '--aw-danger': 'var(--danger, #d6543f)',
  '--aw-font-ui': 'var(--font-ui, system-ui, sans-serif)',
  '--aw-font-mono': 'var(--font-mono, ui-monospace, monospace)',
  // T21: safe-area insets (notch / home-indicator). Neutral 0px in the generic
  // layer; a host theme (e.g. axisWorkbenchTheme) maps these onto the platform's
  // real `env(safe-area-inset-*)` values so the shell respects device chrome.
  '--aw-safe-top': '0px',
  '--aw-safe-right': '0px',
  '--aw-safe-bottom': '0px',
  '--aw-safe-left': '0px',
  // Shared metrics. Widget bar height + the desktop rail's resting (icon-only)
  // width. The rail expands to `--aw-rail-w-expanded` on hover/focus as an
  // absolutely-positioned overlay (no dock reflow — geometry guard safe).
  '--aw-widget-h': '38px',
  '--aw-rail-w': '58px',
  '--aw-rail-w-expanded': '200px',
  // V14c: when the rail exists only for rail-zone widgets (bottom-nav mode, no
  // nav), it stays a slim non-expanding strip (design §9: "64px when the rail
  // exists only for rail widgets").
  '--aw-rail-w-widgets': '64px'
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
