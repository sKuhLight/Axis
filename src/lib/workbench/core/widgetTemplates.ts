/**
 * Widget-template instantiation (pure). A saved widget template is re-minted
 * into the active layout as `widget.add` (+ `widget.group`) commands with
 * collision-free ids. Lives in core so the widget catalog (`widgetCatalog.ts`)
 * can build template commands; `svelte/library.ts` re-exports it.
 */
import { selectActiveLayout } from './selectors';
import type { WidgetGroup, WidgetInstance, WidgetTemplate, WidgetZoneId, WorkbenchDocument } from './schema';
import type { WorkbenchCommand } from './commands';

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
    // With an explicit index the group stays where its members were added: past
    // the template's widgets that come before its first member (the reducer
    // splices the group among the zone WITHOUT its members).
    const members = new Set(group.widgetIds);
    const first = widgets.findIndex((widget) => members.has(widget.id));
    const before = widgets.slice(0, Math.max(0, first)).filter((widget) => !members.has(widget.id)).length;
    commands.push({
      type: 'widget.group',
      groupId: groupIdMap.get(group.id) ?? uniqueId(group.id, usedGroupIds),
      widgetIds,
      zone: targetZone,
      index: options.index == null ? undefined : options.index + before
    });
  }

  return commands;
}
