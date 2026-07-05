import {
  selectActiveLayout,
  panelWidgetZoneId,
  type DockRegionId,
  type PanelInstance,
  type PanelTemplate,
  type WidgetGroup,
  type WidgetInstance,
  type WidgetTemplate,
  type WidgetZoneId,
  type WorkbenchCommand,
  type WorkbenchDocument
} from '../core';

export interface InstantiatePanelTemplateOptions {
  region?: DockRegionId;
  index?: number;
}

export interface InstantiateWidgetTemplateOptions {
  zone?: WidgetZoneId;
  index?: number;
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

  const clonedPanels = panels.map((panel): PanelInstance => ({
    ...clone(panel),
    id: idMap.get(panel.id) ?? panel.id,
    locked: false,
    closable: panel.closable ?? true
  }));
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
          ? { kind: 'region', region, index: options.index }
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

export function createPanelTemplateFromPanel(
  doc: WorkbenchDocument,
  panelId: string,
  title?: string
): PanelTemplate | null {
  const layout = selectActiveLayout(doc);
  const panel = layout?.panels[panelId];
  if (!layout || !panel) return null;

  const panelZone = `panel:${panelId}`;
  const widgets = Object.values(layout.widgets)
    .filter((widget) => widget.zone === panelZone)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const widgetIds = new Set(widgets.map((widget) => widget.id));
  const widgetGroups = Object.fromEntries(
    Object.values(layout.widgetGroups)
      .map((group): WidgetGroup => ({
        ...clone(group),
        locked: false,
        widgetIds: group.widgetIds.filter((widgetId) => widgetIds.has(widgetId))
      }))
      .filter((group) => group.widgetIds.length > 1)
      .map((group) => [group.id, group])
  );

  return {
    id: `template.${panel.id}`,
    title: title ?? panel.title ?? labelFromWorkbenchType(panel.type),
    panels: {
      [panel.id]: {
        ...clone(panel),
        locked: false,
        closable: panel.closable ?? true
      }
    },
    widgets: Object.fromEntries(
      widgets.map((widget) => [
        widget.id,
        {
          ...clone(widget),
          locked: false
        }
      ])
    ),
    widgetGroups
  };
}

export function createWidgetTemplateFromWidgets(
  doc: WorkbenchDocument,
  widgetIds: string[],
  title?: string
): WidgetTemplate | null {
  const layout = selectActiveLayout(doc);
  if (!layout) return null;
  const selected = widgetIds
    .map((id) => layout.widgets[id])
    .filter((widget): widget is WidgetInstance => !!widget)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (!selected.length) return null;

  const selectedIds = new Set(selected.map((widget) => widget.id));
  const includedGroups = Object.values(layout.widgetGroups)
    .map((group): WidgetGroup => ({
      ...clone(group),
      locked: false,
      widgetIds: group.widgetIds.filter((widgetId) => selectedIds.has(widgetId))
    }))
    .filter((group) => group.widgetIds.length > 1);
  const groupIds = new Set(includedGroups.map((group) => group.id));
  const sourceTitle =
    title ??
    (selected.length === 1
      ? selected[0].state?.label && typeof selected[0].state.label === 'string'
        ? selected[0].state.label
        : labelFromWorkbenchType(selected[0].type)
      : selected.map((widget) => labelFromWorkbenchType(widget.type)).join(' + '));
  const templateIdBase = `template.${selected.map((widget) => widget.id).join('.')}`;
  const templateId = uniqueId(templateIdBase, new Set(Object.keys(doc.widgetLibrary)));

  return {
    id: templateId,
    title: sourceTitle,
    widgets: Object.fromEntries(
      selected.map((widget, index) => [
        widget.id,
        {
          ...clone(widget),
          order: index,
          locked: false,
          groupId: widget.groupId && groupIds.has(widget.groupId) ? widget.groupId : null
        }
      ])
    ),
    widgetGroups: Object.fromEntries(includedGroups.map((group) => [group.id, group]))
  };
}

export function createWidgetTemplateFromWidget(
  doc: WorkbenchDocument,
  widgetId: string,
  title?: string
): WidgetTemplate | null {
  return createWidgetTemplateFromWidgets(doc, [widgetId], title);
}

export function createWidgetTemplateFromGroup(
  doc: WorkbenchDocument,
  groupId: string,
  title?: string
): WidgetTemplate | null {
  const layout = selectActiveLayout(doc);
  const group = layout?.widgetGroups[groupId];
  return group ? createWidgetTemplateFromWidgets(doc, group.widgetIds, title) : null;
}

export function instantiateWidgetTemplateCommands(
  doc: WorkbenchDocument,
  template: WidgetTemplate,
  options: InstantiateWidgetTemplateOptions = {}
): WorkbenchCommand[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  const usedWidgetIds = new Set(Object.keys(layout.widgets));
  const usedGroupIds = new Set(Object.keys(layout.widgetGroups));
  const widgets = Object.values(template.widgets).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const widgetIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  const targetZone = options.zone ?? widgets[0]?.zone ?? 'top.right';
  const commands: WorkbenchCommand[] = [];

  for (const widget of widgets) {
    widgetIdMap.set(widget.id, uniqueId(widget.id, usedWidgetIds));
    if (widget.groupId && !groupIdMap.has(widget.groupId)) {
      groupIdMap.set(widget.groupId, uniqueId(widget.groupId, usedGroupIds));
    }
  }

  for (const group of Object.values(template.widgetGroups ?? {})) {
    if (!groupIdMap.has(group.id)) groupIdMap.set(group.id, uniqueId(group.id, usedGroupIds));
  }

  widgets.forEach((widget, index) => {
    const clonedWidget: WidgetInstance = {
      ...clone(widget),
      id: widgetIdMap.get(widget.id) ?? widget.id,
      zone: targetZone,
      order: (options.index ?? 0) + index,
      groupId: null,
      locked: false
    };
    commands.push({
      type: 'widget.add',
      widget: clonedWidget,
      zone: targetZone,
      index: (options.index ?? 0) + index
    });
  });

  const groups = Object.values(template.widgetGroups ?? {});
  const groupsByWidgetRefs = groups.length
    ? groups
    : Object.values(
        widgets.reduce<Record<string, WidgetGroup>>((acc, widget) => {
          if (!widget.groupId) return acc;
          acc[widget.groupId] ??= { id: widget.groupId, widgetIds: [] };
          acc[widget.groupId].widgetIds.push(widget.id);
          return acc;
        }, {})
      );

  for (const group of groupsByWidgetRefs) {
    const widgetIds = group.widgetIds.map((id) => widgetIdMap.get(id)).filter((id): id is string => !!id);
    if (widgetIds.length < 2) continue;
    commands.push({
      type: 'widget.group',
      groupId: groupIdMap.get(group.id) ?? uniqueId(group.id, usedGroupIds),
      widgetIds,
      zone: targetZone,
      index: options.index
    });
  }

  return commands;
}
