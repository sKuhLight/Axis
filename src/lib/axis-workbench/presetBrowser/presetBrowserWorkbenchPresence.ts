// Library "views" for the docked preset browser's LIBRARY sidebar (§3 of
// docs/workbench-dc-parity/06-preset-browser.md). This is the pure classification layer: it mirrors
// the monolith's `inView` derivation (src/lib/PresetBrowser.svelte) so the workbench sources column
// shows the same views — All presets / On this device — with live counts, and selecting one filters
// the list exactly like the monolith.
//
// This module only classifies a row against a view, keeping the rules unit-testable without the store.

export type AxisPbPresenceView = 'all' | 'device';

export interface AxisPbPresenceViewDef {
  id: AxisPbPresenceView;
  label: string;
  /** Glyph mirrors the design's colored view glyph (§3, sources list). */
  glyph: string;
  color: string;
}

// From the design's LIBRARY views (§3) — id/label/glyph/color. `device` == "On this device"; the label
// is templated with the detected unit name at render time when available (monolith: "On your FM3").
export const AXIS_PB_PRESENCE_VIEWS: AxisPbPresenceViewDef[] = [
  { id: 'all', label: 'All presets', glyph: '≣', color: 'var(--textdim)' },
  { id: 'device', label: 'On this device', glyph: '▣', color: 'var(--textdim)' }
];

export function isAxisPbPresenceView(value: unknown): value is AxisPbPresenceView {
  return typeof value === 'string' && AXIS_PB_PRESENCE_VIEWS.some((v) => v.id === value);
}

/** The row shape presence classification needs: its source. `source` mirrors LibEntry.source. */
export interface AxisPbPresenceRow {
  source: 'device' | 'file' | 'local' | string;
}

// Predicate mirroring the monolith `inView`.
export function entryInPresenceView(row: AxisPbPresenceRow, view: AxisPbPresenceView): boolean {
  if (view === 'all') return true;
  return view === 'device' ? row.source === 'device' : false;
}

/** Which views to render — kept as a function so the panel has one call site to grow from. */
export function presenceViews(): AxisPbPresenceViewDef[] {
  return AXIS_PB_PRESENCE_VIEWS;
}

// Count rows per view (respects whatever filtering — device filter, deletions — the caller already applied
// to `rows`), matching the monolith `viewCount`.
export function presenceViewCount(rows: AxisPbPresenceRow[], view: AxisPbPresenceView): number {
  let n = 0;
  for (const row of rows) if (entryInPresenceView(row, view)) n++;
  return n;
}
