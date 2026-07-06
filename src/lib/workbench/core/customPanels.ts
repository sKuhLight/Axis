import { createWorkbenchId } from './ids';
import { selectActiveLayout } from './selectors';
import type {
  BindingRef,
  DockRegionId,
  JsonObject,
  PanelInstance,
  WidgetInstance,
  WidgetSize,
  WidgetZoneId,
  WorkbenchDocument
} from './schema';
import type {
  DockTarget,
  WorkbenchCommand
} from './commands';

export const PANEL_WIDGET_ZONE_PREFIX = 'panel:';
export const DEFAULT_CUSTOM_PANEL_GRID = {
  columns: 4,
  rowHeight: 42,
  gap: 8
} as const;

export interface CustomPanelGridSettings {
  columns: number;
  rowHeight: number;
  gap: number;
}

export interface CreateCustomPanelCommandsOptions {
  id?: string;
  type?: string;
  title?: string;
  region?: DockRegionId;
  target?: DockTarget;
  zoneLabel?: string;
  panelState?: JsonObject;
}

export interface CreateBoundWidgetCommandOptions {
  id?: string;
  type: string;
  binding: BindingRef;
  zone: WidgetZoneId;
  index?: number;
  size?: WidgetSize;
  state?: JsonObject;
}

export interface CreateCustomPanelFromWidgetsCommandsOptions extends CreateCustomPanelCommandsOptions {
  widgetIds: string[];
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!used.has(id)) return id;
  }
}

function readPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function readGridState(state: JsonObject | undefined): JsonObject | undefined {
  const grid = state?.grid;
  return grid && typeof grid === 'object' && !Array.isArray(grid) ? grid as JsonObject : undefined;
}

export function customPanelGridSettings(state: JsonObject | undefined): CustomPanelGridSettings {
  const grid = readGridState(state);
  return {
    columns: readPositiveInt(grid?.columns, DEFAULT_CUSTOM_PANEL_GRID.columns, 1, 24),
    rowHeight: readPositiveInt(grid?.rowHeight, DEFAULT_CUSTOM_PANEL_GRID.rowHeight, 24, 160),
    gap: readPositiveInt(grid?.gap, DEFAULT_CUSTOM_PANEL_GRID.gap, 0, 24)
  };
}

export function customPanelStateWithGrid(state: JsonObject | undefined): JsonObject {
  const settings = customPanelGridSettings(state);
  return {
    ...state,
    grid: {
      ...readGridState(state),
      columns: settings.columns,
      rowHeight: settings.rowHeight,
      gap: settings.gap
    }
  };
}

export function panelWidgetZoneId(panelId: string): WidgetZoneId {
  return `${PANEL_WIDGET_ZONE_PREFIX}${panelId}`;
}

export function panelIdFromWidgetZone(zone: WidgetZoneId): string | null {
  return zone.startsWith(PANEL_WIDGET_ZONE_PREFIX) ? zone.slice(PANEL_WIDGET_ZONE_PREFIX.length) || null : null;
}

export function isPanelWidgetZone(zone: WidgetZoneId): boolean {
  return panelIdFromWidgetZone(zone) != null;
}

export function createCustomPanelCommands(
  doc: WorkbenchDocument,
  options: CreateCustomPanelCommandsOptions = {}
): WorkbenchCommand[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  const panelId = uniqueId(options.id ?? createWorkbenchId('panel'), new Set(Object.keys(layout.panels)));
  const zone = panelWidgetZoneId(panelId);
  const panel: PanelInstance = {
    id: panelId,
    type: options.type ?? 'workbench.customPanel',
    title: options.title ?? 'Custom Panel',
    closable: true,
    collapsible: true,
    state: customPanelStateWithGrid(options.panelState)
  };

  return [
    {
      type: 'zone.ensure',
      zone: {
        id: zone,
        label: options.zoneLabel ?? panel.title,
        orientation: 'free',
        acceptsGroups: true
      }
    },
    {
      type: 'panel.add',
      panel,
      region: options.region ?? 'main',
      target: options.target
    }
  ];
}

export function createBoundWidgetCommand(
  doc: WorkbenchDocument,
  options: CreateBoundWidgetCommandOptions
): WorkbenchCommand | null {
  const layout = selectActiveLayout(doc);
  if (!layout) return null;
  const widgetId = uniqueId(options.id ?? createWorkbenchId('widget'), new Set(Object.keys(layout.widgets)));
  const widget: WidgetInstance = {
    id: widgetId,
    type: options.type,
    zone: options.zone,
    order: options.index ?? 0,
    size: options.size ?? 'default',
    binding: options.binding,
    state: options.state
  };
  return {
    type: 'widget.add',
    widget,
    zone: options.zone,
    index: options.index
  };
}

export function createCustomPanelFromWidgetsCommands(
  doc: WorkbenchDocument,
  options: CreateCustomPanelFromWidgetsCommandsOptions
): WorkbenchCommand[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  const widgetIds = options.widgetIds.filter((widgetId) => !!layout.widgets[widgetId] && !layout.widgets[widgetId].locked);
  if (!widgetIds.length) return [];

  const panelCommands = createCustomPanelCommands(doc, {
    id: options.id,
    type: options.type,
    title: options.title,
    region: options.region,
    target: options.target,
    zoneLabel: options.zoneLabel,
    panelState: {
      acceptsWidgets: true,
      ...options.panelState
    }
  });
  const addPanel = panelCommands.find((command) => command.type === 'panel.add');
  if (!addPanel || addPanel.type !== 'panel.add') return panelCommands;

  return [
    ...panelCommands,
    {
      type: 'widget.move',
      widgetIds,
      zone: panelWidgetZoneId(addPanel.panel.id),
      index: 0
    }
  ];
}
