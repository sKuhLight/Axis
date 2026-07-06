export const WORKBENCH_SCHEMA_VERSION = 1 as const;

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
  dock: DockLayout;
  panels: Record<string, PanelInstance>;
  widgets: Record<string, WidgetInstance>;
  widgetGroups: Record<string, WidgetGroup>;
  navigation: NavigationLayout;
  zones: WidgetZoneLayout;
  settings?: JsonObject;
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
