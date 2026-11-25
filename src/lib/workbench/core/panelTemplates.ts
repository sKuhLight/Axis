/**
 * Panel-template instantiation (pure). A saved panel template is re-minted into
 * the active layout as `panel.add` (+ owned widget zone / widgets / groups)
 * commands with collision-free ids. Lives in core so the panel catalog
 * (`panelCatalog.ts`) can build template commands; `svelte/library.ts`
 * re-exports it for its existing callers.
 */
import { panelWidgetZoneId } from './customPanels';
import { selectActiveLayout } from './selectors';
import type { DockRegionId, PanelInstance, PanelTemplate, WidgetGroup, WidgetInstance, WorkbenchDocument } from './schema';
import type { DockTarget, WorkbenchCommand } from './commands';

export interface InstantiatePanelTemplateOptions {
  region?: DockRegionId;
  index?: number;
  /**
   * Exact dock placement for the template's FIRST panel (a drag-out drop: zone
   * split, tab at index, edge split). Further template panels tab onto the
   * first. Without it the first panel appends to `region`.
   */
  target?: DockTarget;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

export function labelFromWorkbenchType(type: string): string {
  return type
    .split(/[.:/-]/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function instantiatePanelTemplateCommands(
  doc: WorkbenchDocument,
  template: PanelTemplate,
  options: InstantiatePanelTemplateOptions = {}
): WorkbenchCommand[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  const region = options.region ?? 'main';
  const usedPanelIds = new Set(Object.keys(layout.panels));
  const usedWidgetIds = new Set(Object.keys(layout.widgets));
  const usedGroupIds = new Set(Object.keys(layout.widgetGroups));
  const panels = Object.values(template.panels);
  const idMap = new Map<string, string>();
  const widgetIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  for (const panel of panels) {
    idMap.set(panel.id, uniqueId(panel.id, usedPanelIds));
  }
  for (const widget of Object.values(template.widgets ?? {})) {
    widgetIdMap.set(widget.id, uniqueId(widget.id, usedWidgetIds));
    if (widget.groupId && !groupIdMap.has(widget.groupId)) {
      groupIdMap.set(widget.groupId, uniqueId(widget.groupId, usedGroupIds));
    }
  }
  for (const group of Object.values(template.widgetGroups ?? {})) {
    if (!groupIdMap.has(group.id)) groupIdMap.set(group.id, uniqueId(group.id, usedGroupIds));
  }

  const clonedPanels = panels.map((panel): PanelInstance => {
    const cloned: PanelInstance = {
      ...clone(panel),
      id: idMap.get(panel.id) ?? panel.id,
      locked: false,
      closable: panel.closable ?? true
    };
    // An instantiated panel always arrives expanded (a template saved from a
    // collapsed strip must not land as a strip where the drop showed a panel).
    delete cloned.collapsed;
    return cloned;
  });
  const firstPanelId = clonedPanels[0]?.id;

  const templateUsesPanelZone = (sourcePanelId: string): boolean =>
    Object.values(template.widgets ?? {}).some((widget) => widget.zone === panelWidgetZoneId(sourcePanelId));
  const panelAcceptsWidgets = (panel: PanelInstance): boolean =>
    panel.state?.acceptsWidgets === true || panel.type === 'workbench.customPanel' || panel.type.endsWith('.customPanel');

  const commands: WorkbenchCommand[] = [];
  clonedPanels.forEach((panel, index) => {
    const sourcePanel = panels[index];
    if (sourcePanel && (templateUsesPanelZone(sourcePanel.id) || panelAcceptsWidgets(sourcePanel))) {
      commands.push({
        type: 'zone.ensure',
        zone: {
          id: panelWidgetZoneId(panel.id),
          label: panel.title ?? labelFromWorkbenchType(panel.type),
          orientation: 'free',
          acceptsGroups: true
        }
      });
    }
    commands.push({
      type: 'panel.add',
      panel,
      region,
      target:
        index === 0
          ? options.target ?? { kind: 'region', region, index: options.index }
          : { kind: 'tab', targetPanelId: firstPanelId }
    });
  });

  const zoneForClonedPanel = (zone: string): string => {
    if (!zone.startsWith('panel:')) return zone;
    const sourcePanelId = zone.slice('panel:'.length);
    return `panel:${idMap.get(sourcePanelId) ?? sourcePanelId}`;
  };
  const templateWidgets = Object.values(template.widgets ?? {}).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  for (const widget of templateWidgets) {
    const clonedWidget: WidgetInstance = {
      ...clone(widget),
      id: widgetIdMap.get(widget.id) ?? widget.id,
      zone: zoneForClonedPanel(widget.zone),
      groupId: null,
      locked: false
    };
    commands.push({
      type: 'widget.add',
      widget: clonedWidget,
      zone: clonedWidget.zone,
      index: clonedWidget.order
    });
  }

  const groups = Object.values(template.widgetGroups ?? {});
  const groupsByWidgetRefs = groups.length
    ? groups
    : Object.values(
        templateWidgets.reduce<Record<string, WidgetGroup>>((acc, widget) => {
          if (!widget.groupId) return acc;
          acc[widget.groupId] ??= { id: widget.groupId, widgetIds: [] };
          acc[widget.groupId].widgetIds.push(widget.id);
          return acc;
        }, {})
      );

  for (const group of groupsByWidgetRefs) {
    const widgetIds = group.widgetIds.map((id) => widgetIdMap.get(id)).filter((id): id is string => !!id);
    if (widgetIds.length < 2) continue;
    const firstWidget = template.widgets?.[group.widgetIds[0]];
    commands.push({
      type: 'widget.group',
      groupId: groupIdMap.get(group.id) ?? uniqueId(group.id, usedGroupIds),
      widgetIds,
      zone: firstWidget ? zoneForClonedPanel(firstWidget.zone) : 'top.right',
      index: firstWidget?.order
    });
  }

  return commands;
}
