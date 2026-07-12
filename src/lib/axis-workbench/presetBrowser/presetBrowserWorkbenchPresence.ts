// Cloud-presence "views" for the docked preset browser's LIBRARY sidebar (§3 of
// docs/workbench-dc-parity/06-preset-browser.md). This is the pure classification layer: it mirrors
// the monolith's `inView`/`syncStateOf` derivation (src/lib/PresetBrowser.svelte lines 295-342) so the
// workbench sources column shows the same design views — All presets / On this device / In cloud /
// Cloud only / Not backed up / Needs upload / Needs update — with live counts, and selecting one filters
// the list exactly like the monolith.
//
// The heavy lifting (reading the reactive `cloud` store + `editor.cloud` auth) stays in the Svelte host,
// which resolves each entry's SyncState once and hands it to `createAxisPresetBrowserDataView`. This module
// only classifies a resolved SyncState against a view, keeping the rules unit-testable without the store.
import type { SyncState } from '../../types';

export type AxisPbPresenceView =
  | 'all'
  | 'device'
  | 'cloud'
  | 'cloudOnly'
  | 'notBackedUp'
  | 'needsUpload'
  | 'needsUpdate';

export interface AxisPbPresenceViewDef {
  id: AxisPbPresenceView;
  label: string;
  /** Glyph mirrors the design's colored view glyph (§3, sources list). */
  glyph: string;
  color: string;
  /** True for views that only make sense signed-in (cloud presence views). */
  cloud: boolean;
}

// Verbatim from the design's LIBRARY views (§3) — id/label/glyph/color. `device` == "On this device"; the
// label is templated with the detected unit name at render time when available (monolith: "On your FM3").
export const AXIS_PB_PRESENCE_VIEWS: AxisPbPresenceViewDef[] = [
  { id: 'all', label: 'All presets', glyph: '≣', color: 'var(--textdim)', cloud: false },
  { id: 'device', label: 'On this device', glyph: '▣', color: 'var(--textdim)', cloud: false },
  { id: 'cloud', label: 'In cloud', glyph: '☁', color: 'var(--accent)', cloud: true },
  { id: 'cloudOnly', label: 'Cloud only', glyph: '☁', color: '#9b8cf0', cloud: true },
  { id: 'notBackedUp', label: 'Not backed up', glyph: '▪', color: '#6e6e78', cloud: true },
  { id: 'needsUpload', label: 'Needs upload', glyph: '↑', color: '#f5a623', cloud: true },
  { id: 'needsUpdate', label: 'Needs update', glyph: '↓', color: '#4a82e0', cloud: true }
];

export function isAxisPbPresenceView(value: unknown): value is AxisPbPresenceView {
  return typeof value === 'string' && AXIS_PB_PRESENCE_VIEWS.some((v) => v.id === value);
}

// The row shape presence classification needs: its source + resolved cloud sync state. `source` mirrors
// LibEntry.source; `syncState` is what `cloud.stateOf(...)` returned (or 'none' when signed out).
export interface AxisPbPresenceRow {
  source: 'device' | 'file' | 'local' | string;
  /** A synthesized cloud-only row (monolith `cloud:` id) — never counts as a real device slot. */
  cloudOnly: boolean;
  syncState: SyncState;
}

// Predicate mirroring the monolith `inView` (PresetBrowser.svelte lines 327-340). `device` matches real
// device slots only (cloud-only synthesized rows carry source 'device' but are excluded); the cloud views
// key off the resolved SyncState.
export function entryInPresenceView(row: AxisPbPresenceRow, view: AxisPbPresenceView): boolean {
  if (view === 'all') return true;
  const s = row.syncState;
  switch (view) {
    case 'device':
      return row.source === 'device' && !row.cloudOnly;
    case 'cloud':
      return row.cloudOnly || s === 'synced' || s === 'modified' || s === 'outdated' || s === 'unknown';
    case 'cloudOnly':
      return s === 'cloudOnly';
    case 'notBackedUp':
      return s === 'deviceOnly';
    case 'needsUpload':
      return s === 'modified';
    case 'needsUpdate':
      return s === 'outdated';
    default:
      return false;
  }
}

// Which views to render given auth state (§3): device/local views always show; cloud presence views only
// appear signed-in, matching the monolith's `SYNC_VIEWS` gating so signed-out UX is honest (no dead cloud
// rows). Callers still render a "Sign in for cloud sync" affordance for the omitted cloud views.
export function presenceViewsForAuth(cloudOn: boolean): AxisPbPresenceViewDef[] {
  return AXIS_PB_PRESENCE_VIEWS.filter((v) => cloudOn || !v.cloud);
}

// Count rows per view (respects whatever filtering — device filter, deletions — the caller already applied
// to `rows`), matching the monolith `viewCount`.
export function presenceViewCount(rows: AxisPbPresenceRow[], view: AxisPbPresenceView): number {
  let n = 0;
  for (const row of rows) if (entryInPresenceView(row, view)) n++;
  return n;
}
