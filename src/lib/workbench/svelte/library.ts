import {
  selectActiveLayout,
  type WidgetGroup,
  type WidgetInstance,
  type WidgetTemplate,
  type WidgetZoneId,
  type WorkbenchCommand,
  type WorkbenchDocument,
  type PanelTemplate
} from '../core';

// Panel-template instantiation moved to core (the panel catalog builds template
// commands there); re-exported here for the existing callers.
export {
  instantiatePanelTemplateCommands,
  labelFromWorkbenchType,
  type InstantiatePanelTemplateOptions
} from '../core/panelTemplates';
import { labelFromWorkbenchType } from '../core/panelTemplates';

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
