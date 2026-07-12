export const WORKBENCH_SCHEMA_VERSION = 2 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export const DOCK_REGION_IDS = ['left', 'right', 'top', 'bottom', 'main'] as const;
export type DockRegionId = (typeof DOCK_REGION_IDS)[number];

export type DockAxis = 'horizontal' | 'vertical';
export type WidgetSize = 'default' | 'compact' | 'mini';
export type WidgetZoneId = string;
export type NavigationMode = 'side' | 'bottom';
export type NavigationFixedSlot = 'rail.footer' | 'bottom.trailing' | 'none' | string;

export interface WorkbenchDocument {
  schemaVersion: typeof WORKBENCH_SCHEMA_VERSION;
  activeProfileId: string;
  profiles: Record<string, WorkbenchProfile>;
  layouts: Record<string, WorkbenchLayout>;
  panelLibrary: Record<string, PanelTemplate>;
  widgetLibrary: Record<string, WidgetTemplate>;
  /**
   * Explicit user profile choice that pins the active profile regardless of the
   * viewport class (e.g. a PROFILE switcher). When set to a profile that exists,
   * the profile resolver always returns it; clearing it (undefined) hands control
   * back to viewport-based resolution. Optional + repair-safe: a dangling id is
   * simply ignored by `resolveProfileForViewport`.
   */
  profileOverrideId?: string;
  metadata?: JsonObject;
  /**
   * Monotonic persist revision (≥1 when present). The host bumps it on every
   * persisted change and uses it for stale-write protection: an incoming doc
   * whose `rev` is lower than the one already held must not silently overwrite
   * it. Optional + repair-safe: docs without `rev` count as revision 0 and are
   * never treated as newer. Migration drops non-numeric/non-positive values.
   */
  rev?: number;
  /**
   * ISO-8601 timestamp of the last persisted change (informational — e.g. for
   * labelling backup generations). `rev`, not `updatedAt`, decides staleness.
   * Optional + repair-safe; migration drops non-string values.
   */
  updatedAt?: string;
}

export interface WorkbenchProfile {
  id: string;
  label: string;
  layoutId: string;
  breakpoint?: 'desktop' | 'tablet' | 'phone';
  deviceClass?: string;
  state?: JsonObject;
}

export interface WorkbenchLayout {
  id: string;
  label: string;
  /**
   * The dockable content of a layout is split into PAGES (schema v2): each page
   * owns a full {@link DockLayout} (regions + trees), while everything else on
   * the layout (widgets/zones/navigation/panel instances/libraries) is global.
   * `activePageId` selects the page whose dock is rendered; `pageOrder` is the
   * canonical page sequence. Repair guarantees ≥1 page, a valid `activePageId`,
   * and a deduped, complete `pageOrder`.
   */
  pages: Record<string, WorkbenchPage>;
  pageOrder: string[];
  activePageId: string;
  /**
   * @deprecated Schema v1 single dock. Accepted as MIGRATION INPUT ONLY: repair
   * wraps it into a single page when `pages` is empty and then deletes it.
   * Runtime code must exclusively read page docks (see `activeWorkbenchPage`).
   */
  dock?: DockLayout;
  panels: Record<string, PanelInstance>;
  widgets: Record<string, WidgetInstance>;
  widgetGroups: Record<string, WidgetGroup>;
  navigation: NavigationLayout;
  zones: WidgetZoneLayout;
  settings?: JsonObject;
}

/**
 * One freely configurable dock arrangement inside a layout. Panel instances
 * stay flat on `layout.panels`; a page's dock trees reference them by id, and a
 * panel id may appear in AT MOST one page's dock (repair keeps the first
 * occurrence in page order).
 */
export interface WorkbenchPage {
  id: string;
  label: string;
  icon?: string;
  dock: DockLayout;
  metadata?: JsonObject;
}

export interface DockLayout {
  regions: Record<DockRegionId, DockRegionState>;
  root: Record<DockRegionId, DockNode | null>;
}

export interface DockRegionState {
  sizePx?: number;
  sizeRatio?: number;
  collapsed?: boolean;
}

export type DockNode = SplitDockNode | TabStackDockNode;

export interface SplitDockNode {
  kind: 'split';
  id: string;
  axis: DockAxis;
  ratio: number[];
  children: DockNode[];
}

export interface TabStackDockNode {
  kind: 'tabs';
  id: string;
  activePanelId: string;
  panelIds: string[];
}

export interface PanelInstance {
  id: string;
  type: string;
  title?: string;
  /** Panels sharing a singletonKey are mutually exclusive per layout: `panel.add`/`panel.split` reject duplicates and repair removes them. */
  singletonKey?: string;
  locked?: boolean;
  closable?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  state?: JsonObject;
}

export interface FloatingRect {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface WidgetInstance {
  id: string;
  type: string;
  zone: WidgetZoneId;
  order: number;
  size: WidgetSize;
  groupId?: string | null;
  locked?: boolean;
  binding?: BindingRef;
  state?: JsonObject;
  floatingRect?: FloatingRect;
}

export interface BindingRef {
  kind: string;
  version: number;
  target: JsonObject;
}

export interface WidgetGroup {
  id: string;
  widgetIds: string[];
  locked?: boolean;
  state?: JsonObject;
}

export interface WidgetZoneState {
  id: WidgetZoneId;
  label?: string;
  orientation?: 'horizontal' | 'vertical' | 'free';
  acceptsGroups?: boolean;
  hidden?: boolean;
  state?: JsonObject;
}

export type WidgetZoneLayout = Record<WidgetZoneId, WidgetZoneState>;

export interface NavigationLayout {
  mode: NavigationMode;
  entries: Record<string, NavigationEntryState>;
  order: string[];
}

export interface NavigationCommandTarget {
  command: string;
  args?: JsonObject;
}

export interface NavigationEntryState {
  id: string;
  label?: string;
  hidden?: boolean;
  locked?: boolean;
  fixedSlot?: NavigationFixedSlot;
  target?: NavigationCommandTarget;
  /**
   * Bound page: triggering the entry activates this page (`page.activate`) and
   * the entry tints active while it is the layout's `activePageId`. Entries
   * without a `pageId` keep their app-provided `target` action behavior.
   * Repair drops a dangling binding (and removes the entry entirely when it
   * has no `target` to fall back to).
   */
  pageId?: string;
  state?: JsonObject;
}

export interface PanelTemplate {
  id: string;
  title: string;
  panels: Record<string, PanelInstance>;
  dock?: DockNode | null;
  widgets?: Record<string, WidgetInstance>;
  widgetGroups?: Record<string, WidgetGroup>;
  state?: JsonObject;
}

export interface WidgetTemplate {
  id: string;
  title: string;
  widgets: Record<string, WidgetInstance>;
  widgetGroups?: Record<string, WidgetGroup>;
  state?: JsonObject;
}

export const DEFAULT_WIDGET_ZONES = [
  'top.left',
  'top.center',
  'top.right',
  'rail',
  'bottom',
  'gridbar',
  'floating',
  'hidden'
] as const;

export const isDockRegionId = (value: string): value is DockRegionId =>
  (DOCK_REGION_IDS as readonly string[]).includes(value);
