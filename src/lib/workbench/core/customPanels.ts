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

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!used.has(id)) return id;
  }
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
    state: options.panelState
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
