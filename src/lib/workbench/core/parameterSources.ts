import { createBoundWidgetCommand, createCustomPanelCommands, panelWidgetZoneId } from './customPanels';
import type {
  BindingRef,
  DockRegionId,
  JsonObject,
  WidgetSize,
  WidgetZoneId,
  WorkbenchDocument
} from './schema';
import type { DockTarget, WorkbenchCommand } from './commands';

export interface WorkbenchParameterSource {
  id: string;
  label: string;
  binding: BindingRef;
  preferredWidgetType?: string;
  defaultSize?: WidgetSize;
  state?: JsonObject;
}

export interface AddParameterWidgetOptions {
  zone: WidgetZoneId;
  index?: number;
  widgetType?: string;
  widgetId?: string;
}

export interface CreateParameterCustomPanelOptions {
  panelId?: string;
  panelType?: string;
  title?: string;
  region?: DockRegionId;
  target?: DockTarget;
  widgetType?: string;
  startIndex?: number;
}

function sourceWidgetType(source: WorkbenchParameterSource, fallback?: string): string {
  return fallback ?? source.preferredWidgetType ?? 'workbench.parameter';
}

function sourceWidgetState(source: WorkbenchParameterSource, extra: JsonObject = {}): JsonObject {
  return {
    label: source.label,
    sourceId: source.id,
    ...source.state,
    ...extra
  };
}

export function createParameterWidgetCommand(
  doc: WorkbenchDocument,
  source: WorkbenchParameterSource,
  options: AddParameterWidgetOptions
): WorkbenchCommand | null {
  return createBoundWidgetCommand(doc, {
    id: options.widgetId,
    type: sourceWidgetType(source, options.widgetType),
    zone: options.zone,
    index: options.index,
    size: source.defaultSize ?? 'default',
    binding: source.binding,
    state: sourceWidgetState(source)
  });
}

export function createParameterWidgetsForZoneCommands(
  doc: WorkbenchDocument,
  sources: WorkbenchParameterSource[],
  options: AddParameterWidgetOptions
): WorkbenchCommand[] {
  return sources
    .map((source, offset) =>
      createParameterWidgetCommand(doc, source, {
        ...options,
        index: (options.index ?? 0) + offset
      })
    )
    .filter((command): command is WorkbenchCommand => !!command);
}

export function createCustomPanelFromParameterSourcesCommands(
  doc: WorkbenchDocument,
  sources: WorkbenchParameterSource[],
  options: CreateParameterCustomPanelOptions = {}
): WorkbenchCommand[] {
  if (!sources.length) return [];
  const panelCommands = createCustomPanelCommands(doc, {
    id: options.panelId,
    type: options.panelType,
    title: options.title ?? (sources.length === 1 ? sources[0].label : 'Pinned Parameters'),
    region: options.region,
    target: options.target,
    panelState: {
      acceptsParameters: true
    }
  });
  const addPanel = panelCommands.find((command) => command.type === 'panel.add');
  if (!addPanel || addPanel.type !== 'panel.add') return panelCommands;

  const zone = panelWidgetZoneId(addPanel.panel.id);
  const widgetCommands = sources
    .map((source, offset) =>
      createParameterWidgetCommand(doc, source, {
        zone,
        index: (options.startIndex ?? 0) + offset,
        widgetType: options.widgetType
      })
    )
    .filter((command): command is WorkbenchCommand => !!command);

  return [...panelCommands, ...widgetCommands];
}
