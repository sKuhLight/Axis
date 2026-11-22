/**
 * The widget catalog (pure): every widget a user can put into a zone, with
 * where it lives now — and the commands that put it there. The widget twin of
 * `panelCatalog.ts`, built for the Add palette.
 *
 *   - each BUILT-IN widget type the host offers (a data-only list), once: an
 *     instance that is placed (in a zone) or hidden is MOVED by an add — a
 *     built-in type is never duplicated — and a type with no instance is created
 *     fresh from its spec;
 *   - every other HIDDEN widget (e.g. a pinned parameter control the user hid);
 *   - the saved widget templates: an add always creates a COPY.
 *
 * A type the host reports unavailable (e.g. the connected device lacks it) is
 * kept, with its reason, and listed after everything else.
 */
import { createWorkbenchId } from './ids';
import { labelFromWorkbenchType } from './panelTemplates';
import { instantiateWidgetTemplateCommands } from './widgetTemplates';
import { selectActiveLayout } from './selectors';
import { PANEL_WIDGET_ZONE_PREFIX } from './customPanels';
import type { JsonObject, WidgetInstance, WidgetSize, WidgetTemplate, WidgetZoneId, WorkbenchDocument, WorkbenchLayout } from './schema';
import type { WorkbenchCommand } from './commands';

/** A built-in widget the host always offers (data only). */
export interface CanonicalWidgetSpec {
  type: string;
  /** Card title. */
  label: string;
  /** Preferred id of a fresh instance (a `.copyN` suffix is added when taken). */
  id?: string;
  size?: WidgetSize;
  state?: JsonObject;
  /** Extra search terms. */
  keywords?: string[];
}

export type WidgetCatalogSource = 'builtin' | 'instance' | 'template';
/** `placed`: in a visible zone · `hidden`: on the hidden shelf · `absent`: no instance yet. */
export type WidgetCatalogPlacement = 'placed' | 'hidden' | 'absent';

export interface WidgetCatalogEntry {
  /** Unique within one catalog: `builtin:<type>`, `instance:<id>`, `template:<id>`. */
  key: string;
  title: string;
  /** Widget type (templates: their first widget's type). */
  type: string;
  source: WidgetCatalogSource;
  placement: WidgetCatalogPlacement;
  /** The existing instance an add moves (built-ins with an instance, `instance` entries). */
  instanceId?: string;
  /** `placed`: the zone it is in. */
  zone?: WidgetZoneId;
  /** `builtin`: the spec a fresh instance is made from. */
  spec?: CanonicalWidgetSpec;
  /** `template`: the template id (doc.widgetLibrary) and its widget count. */
  templateId?: string;
  widgetCount?: number;
  /** Every widget type of a template, in order. */
  types?: string[];
  /** Why it cannot be used right now (the card is greyed and listed last). */
  unavailable?: string;
  keywords?: string[];
}

export interface BuildWidgetCatalogOptions {
  canonical?: readonly CanonicalWidgetSpec[];
  templates?: readonly WidgetTemplate[] | Readonly<Record<string, WidgetTemplate>>;
  /** Why a type is unavailable right now, or null/undefined when it is usable. */
  unavailableReason?: (type: string) => string | null | undefined;
}

/** A widget's display title: its `state.label` when set, else a label from its type. */
export function widgetTitle(widget: Pick<WidgetInstance, 'type' | 'state'>): string {
  const label = widget.state?.label;
  return typeof label === 'string' && label.trim() ? label : labelFromWorkbenchType(widget.type);
}

/** Visible instances first (by zone, then order), then hidden ones. */
function rankInstances(widgets: WidgetInstance[]): WidgetInstance[] {
  return [...widgets].sort((a, b) => {
    const ah = a.zone === 'hidden' ? 1 : 0;
    const bh = b.zone === 'hidden' ? 1 : 0;
    return ah - bh || a.zone.localeCompare(b.zone) || a.order - b.order || a.id.localeCompare(b.id);
  });
}

export function buildWidgetCatalog(layout: WorkbenchLayout | undefined, options: BuildWidgetCatalogOptions = {}): WidgetCatalogEntry[] {
  if (!layout) return [];
  const reason = (type: string): string | undefined => options.unavailableReason?.(type) || undefined;
  const widgets = Object.values(layout.widgets ?? {});
  const covered = new Set<string>();
  const entries: WidgetCatalogEntry[] = [];
  const seenTypes = new Set<string>();

  for (const spec of options.canonical ?? []) {
    if (seenTypes.has(spec.type)) continue;
    seenTypes.add(spec.type);
    const instance = rankInstances(widgets.filter((widget) => widget.type === spec.type))[0];
    if (instance) covered.add(instance.id);
    const unavailable = reason(spec.type);
    entries.push({
      key: `builtin:${spec.type}`,
      title: spec.label,
      type: spec.type,
      source: 'builtin',
      placement: instance ? (instance.zone === 'hidden' ? 'hidden' : 'placed') : 'absent',
      spec,
      ...(instance ? { instanceId: instance.id } : {}),
      ...(instance && instance.zone !== 'hidden' ? { zone: instance.zone } : {}),
      ...(unavailable ? { unavailable } : {}),
      ...(spec.keywords?.length ? { keywords: [...spec.keywords] } : {})
    });
  }

  const hidden = widgets
    .filter((widget) => widget.zone === 'hidden' && !covered.has(widget.id))
    .sort((a, b) => widgetTitle(a).localeCompare(widgetTitle(b)) || a.id.localeCompare(b.id));
  for (const widget of hidden) {
    const unavailable = reason(widget.type);
    entries.push({
      key: `instance:${widget.id}`,
      title: widgetTitle(widget),
      type: widget.type,
      source: 'instance',
      placement: 'hidden',
      instanceId: widget.id,
      ...(unavailable ? { unavailable } : {})
    });
  }

  const templates = Array.isArray(options.templates)
    ? (options.templates as readonly WidgetTemplate[])
    : Object.values((options.templates ?? {}) as Record<string, WidgetTemplate>);
  for (const template of [...templates].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))) {
    const members = Object.values(template.widgets ?? {}).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const types = members.map((widget) => widget.type);
    const reasons = types.map(reason);
    // A template is unavailable only when none of its widgets can render.
    const unavailable = types.length && reasons.every(Boolean) ? reasons[0] : undefined;
    entries.push({
      key: `template:${template.id}`,
      title: template.title,
      type: types[0] ?? 'template',
      source: 'template',
      placement: 'absent',
      templateId: template.id,
      widgetCount: members.length,
      types,
      ...(unavailable ? { unavailable } : {})
    });
  }

  // Unavailable entries go last, keeping the relative order on both sides.
  return [...entries.filter((entry) => !entry.unavailable), ...entries.filter((entry) => !!entry.unavailable)];
}

/** Where a widget add lands: the zone and the WIDGET-order index in it (all of its current widgets counted). */
export interface WidgetCatalogDrop {
  zone: WidgetZoneId;
  index?: number;
}

function uniqueWidgetId(base: string, layout: WorkbenchLayout): string {
  if (!layout.widgets[base]) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!layout.widgets[id]) return id;
  }
}

/**
 * The index a MOVE of `widgetId` takes when the drop index counts every widget
 * in the zone (the widget itself included, as rendered). The reducer splices
 * into the zone WITHOUT the moved widget, so an index past its own position
 * shifts down by one.
 */
export function moveIndexExcludingSelf(layout: WorkbenchLayout, widgetId: string, drop: WidgetCatalogDrop): number | undefined {
  if (drop.index == null) return undefined;
  const widget = layout.widgets[widgetId];
  if (!widget || widget.zone !== drop.zone) return drop.index;
  const zoneWidgets = Object.values(layout.widgets)
    .filter((candidate) => candidate.zone === drop.zone)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const own = zoneWidgets.findIndex((candidate) => candidate.id === widgetId);
  return own >= 0 && own < drop.index ? drop.index - 1 : drop.index;
}

/**
 * The commands that put a widget catalog entry into a zone (dispatch them as
 * ONE batch):
 *
 *   - a built-in type with an instance (placed or hidden) → `widget.move` of that instance;
 *   - a hidden `instance` entry                         → `widget.move` back into the zone;
 *   - a built-in type with no instance                  → `widget.add` of a fresh instance;
 *   - a template                                        → a copy of its widgets (and groups).
 *
 * Returns [] for an unavailable or stale entry (its instance / template is gone).
 */
export function widgetCatalogAddCommands(doc: WorkbenchDocument, entry: WidgetCatalogEntry, drop: WidgetCatalogDrop): WorkbenchCommand[] {
  const layout = selectActiveLayout(doc);
  if (!layout || entry.unavailable || !drop.zone || drop.zone === 'hidden') return [];

  if (entry.source === 'template') {
    const template = entry.templateId ? doc.widgetLibrary[entry.templateId] : undefined;
    // No index (a zone's "+": "End of <zone>") = after every widget the zone
    // holds, as the reducer orders them — the copies land together at the end.
    const index = drop.index ?? Object.values(layout.widgets).filter((widget) => widget.zone === drop.zone).length;
    return template ? instantiateWidgetTemplateCommands(doc, template, { zone: drop.zone, index }) : [];
  }

  // A built-in entry whose instance appeared (or vanished) meanwhile follows the live layout.
  const instanceId =
    entry.source === 'builtin'
      ? rankInstances(Object.values(layout.widgets).filter((widget) => widget.type === entry.type))[0]?.id
      : entry.instanceId;
  if (instanceId && layout.widgets[instanceId]) {
    const index = moveIndexExcludingSelf(layout, instanceId, drop);
    return [{ type: 'widget.move', widgetIds: [instanceId], zone: drop.zone, ...(index != null ? { index } : {}) }];
  }
  if (entry.source !== 'builtin' || !entry.spec) return [];

  const spec = entry.spec;
  const widget: WidgetInstance = {
    id: uniqueWidgetId(spec.id ?? createWorkbenchId('widget'), layout),
    type: spec.type,
    zone: drop.zone,
    order: drop.index ?? 0,
    size: spec.size ?? 'default',
    ...(spec.state ? { state: JSON.parse(JSON.stringify(spec.state)) as JsonObject } : {})
  };
  return [{ type: 'widget.add', widget, zone: drop.zone, ...(drop.index != null ? { index: drop.index } : {}) }];
}

/** "top.right" → "Top right", "gridbar" → "Gridbar". */
function humanizeZone(zone: string): string {
  const words = zone.split(/[.:_-]/).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A zone's display name: a custom panel's own zone is named after its panel,
 * a zone with a stored label uses it, anything else is humanized from its id.
 */
export function widgetZoneLabel(layout: WorkbenchLayout | undefined, zone: WidgetZoneId): string {
  if (zone.startsWith(PANEL_WIDGET_ZONE_PREFIX)) {
    const panel = layout?.panels[zone.slice(PANEL_WIDGET_ZONE_PREFIX.length)];
    if (panel) return panel.title ?? labelFromWorkbenchType(panel.type);
  }
  const label = layout?.zones?.[zone]?.label;
  return label && label.trim() ? label : humanizeZone(zone);
}
