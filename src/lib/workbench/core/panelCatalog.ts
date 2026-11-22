/**
 * The panel catalog (pure): every panel a user can put on a page, with where it
 * lives now — and the commands that put it on a page.
 *
 * Panels are never lost: "Remove from page" and deleting a page PARK a panel
 * (it stays in `layout.panels`, docked on no page). The catalog lists:
 *
 *   - every existing instance once — docked (on which page) or parked — except
 *     internal types the host hides, and EMPTY parked custom panels (no widgets,
 *     default title and state — nothing to lose; see
 *     {@link selectEmptyParkedCustomPanels}, which the drawer offers to delete
 *     in one go);
 *   - each canonical panel the app always offers (a host-supplied, data-only
 *     list) that has NO instance yet, as `absent` — so even a panel a stored
 *     document lost long ago can be added again;
 *   - a canonical `multiple` spec (e.g. "New custom panel") always;
 *   - the saved panel templates.
 *
 * Adding never creates a second copy of a single-instance panel: a parked or
 * elsewhere-docked instance is MOVED to the target, an absent canonical panel is
 * created fresh, and a template whose singleton already exists moves that
 * instance instead of being refused as `duplicate-singleton`.
 *
 * Locked = cannot LEAVE the layout (no remove, no hard delete) — a locked panel
 * can still move between docks and pages, so the catalog moves it like any other.
 */
import { createWorkbenchId } from './ids';
import { createCustomPanelCommands, customPanelStateWithGrid, panelWidgetZoneId, PANEL_WIDGET_ZONE_PREFIX } from './customPanels';
import { instantiatePanelTemplateCommands } from './panelTemplates';
import { activeWorkbenchPage, orderedWorkbenchPages, panelIdsInPageDock, selectActiveLayout } from './selectors';
import type { DockNode, DockRegionId, PanelInstance, PanelTemplate, WorkbenchDocument, WorkbenchLayout } from './schema';
import type { DockTarget, WorkbenchCommand } from './commands';

/** A panel the host always offers (data only). */
export interface CanonicalPanelSpec {
  /** Stable catalog key, unique among the specs. */
  key: string;
  /**
   * Prototype instance: `id` is the preferred instance id; `type`, `title`,
   * `singletonKey`, `state` and the flags carry over to a created instance.
   */
  panel: PanelInstance;
  /** The catalog row's label when it differs from the panel title (e.g. "New custom panel"). */
  label?: string;
  /** Every add mints a NEW instance (no singleton); the spec is always listed. */
  multiple?: boolean;
  /** The panel hosts its own widget zone (`panel:<id>`), like a custom panel. */
  ownsWidgetZone?: boolean;
}

export type PanelCatalogSource = 'instance' | 'canonical' | 'template';
export type PanelCatalogPlacement = 'docked' | 'parked' | 'absent';

export interface PanelCatalogEntry {
  /** Unique within one catalog: `instance:<id>`, `canonical:<key>`, `template:<id>`. */
  key: string;
  title: string;
  type: string;
  source: PanelCatalogSource;
  /** `instance` entries: the panel id. */
  instanceId?: string;
  /** `template` entries: the template id (doc.panelLibrary). */
  templateId?: string;
  /** `canonical` entries: the spec to create from. */
  spec?: CanonicalPanelSpec;
  /** `docked`: on a page; `parked`: an instance on no page; `absent`: nothing exists yet. */
  placement: PanelCatalogPlacement;
  /** `docked`: the page it is on, and that page's label. */
  pageId?: string;
  pageLabel?: string;
  /** Docked on the layout's ACTIVE page. */
  onActivePage?: boolean;
  singletonKey?: string;
  /** Locked: it cannot leave the layout (no remove / delete), but it moves like any panel. */
  locked?: boolean;
  /** A canonical spec that creates a NEW instance per add. */
  multiple?: boolean;
  /**
   * An instance that may be deleted everywhere (`panel.close`): unlocked custom
   * panels, and keyless COPIES of a single-instance panel (e.g. from a
   * duplicated page) — a locked copy only while its keyed original exists (the
   * reducer's rule). The original — the instance that carries the key, or the
   * canonical id — never is.
   */
  deletable?: boolean;
  /** `template` entries: how many panels the template holds. */
  panelCount?: number;
}

export interface BuildPanelCatalogOptions {
  canonical?: readonly CanonicalPanelSpec[];
  templates?: readonly PanelTemplate[] | Readonly<Record<string, PanelTemplate>>;
  /** Internal instance types the catalog never lists (they live on a dedicated, protected page). */
  hiddenTypes?: readonly string[];
}

export interface CatalogAddOptions {
  /**
   * The target is an exact placement the user picked (a drag-out drop): an
   * instance already on the active page MOVES there. Without it (a tap) such an
   * instance is only activated.
   */
  exact?: boolean;
}

const isCustomPanelType = (type: string): boolean => type === 'workbench.customPanel' || type.endsWith('.customPanel');

const titleOf = (panel: PanelInstance): string => panel.title ?? panel.type;

/**
 * The instance a (single-instance) spec already has: the one carrying its
 * singleton key, else the one with its canonical id — old documents (and older
 * host add-or-focus actions) created the canonical id without its key.
 */
export function findCanonicalInstance(layout: WorkbenchLayout, spec: CanonicalPanelSpec): PanelInstance | undefined {
  if (spec.multiple) return undefined;
  const key = spec.panel.singletonKey;
  const byKey = key ? Object.values(layout.panels).find((panel) => panel.singletonKey === key) : undefined;
  return byKey ?? layout.panels[spec.panel.id];
}

/** The title a fresh custom panel of this type gets (the `multiple` spec's, else the framework default). */
function defaultCustomTitle(type: string, canonical: readonly CanonicalPanelSpec[]): string {
  return canonical.find((spec) => spec.multiple && spec.panel.type === type)?.panel.title ?? 'Custom Panel';
}

/** JSON with sorted keys (absent state = `{}`): a deep-equality key for panel state. */
function stateKey(state: unknown): string {
  const walk = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(walk).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${walk(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value ?? null);
  };
  return !state || (typeof state === 'object' && Object.keys(state as object).length === 0) ? 'null' : walk(state);
}

const isCustomType = (type: string, canonical: readonly CanonicalPanelSpec[]): boolean =>
  isCustomPanelType(type) || canonical.some((spec) => spec.multiple && spec.panel.type === type);

/**
 * Parked custom panels that hold nothing: unlocked, no widgets in their zone,
 * the default title and a default state (absent / `{}` / the default grid).
 * They are kept out of the catalog list; the drawer offers "Empty custom
 * panels (n) · Delete all". A parked custom panel with widgets, another title
 * or a changed state is listed normally.
 */
export function selectEmptyParkedCustomPanels(
  layout: WorkbenchLayout | undefined,
  canonical: readonly CanonicalPanelSpec[] = []
): PanelInstance[] {
  if (!layout) return [];
  const docked = dockedPageIndex(layout);
  const zonesWithWidgets = new Set(Object.values(layout.widgets ?? {}).map((widget) => widget.zone));
  return Object.values(layout.panels)
    .filter((panel) => {
      if (!isCustomType(panel.type, canonical) || panel.locked || docked.has(panel.id)) return false;
      if (zonesWithWidgets.has(panelWidgetZoneId(panel.id))) return false;
      if ((panel.title ?? '') !== defaultCustomTitle(panel.type, canonical)) return false;
      const specState = canonical.find((spec) => spec.multiple && spec.panel.type === panel.type)?.panel.state;
      const key = stateKey(panel.state);
      return key === 'null' || key === stateKey(customPanelStateWithGrid(specState)) || key === stateKey(customPanelStateWithGrid(undefined));
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** panel id → id of the page it is docked on (first occurrence in page order). */
function dockedPageIndex(layout: WorkbenchLayout): Map<string, string> {
  const index = new Map<string, string>();
  for (const page of orderedWorkbenchPages(layout)) {
    for (const panelId of panelIdsInPageDock(page)) if (!index.has(panelId)) index.set(panelId, page.id);
  }
  return index;
}

export function buildPanelCatalog(layout: WorkbenchLayout | undefined, options: BuildPanelCatalogOptions = {}): PanelCatalogEntry[] {
  if (!layout) return [];
  const canonical = options.canonical ?? [];
  const hidden = new Set(options.hiddenTypes ?? []);
  const multipleTypes = new Set(canonical.filter((spec) => spec.multiple).map((spec) => spec.panel.type));
  // Single-instance types: a keyed canonical spec, or an instance carrying a key
  // (the original) — a KEYLESS instance of such a type is a copy.
  const liveKeyedTypes = new Set(Object.values(layout.panels).filter((panel) => panel.singletonKey).map((panel) => panel.type));
  const keyedTypes = new Set([
    ...canonical.filter((spec) => !spec.multiple && spec.panel.singletonKey).map((spec) => spec.panel.type),
    ...liveKeyedTypes
  ]);
  const activePageId = activeWorkbenchPage(layout)?.id;
  const docked = dockedPageIndex(layout);
  const empties = new Set(selectEmptyParkedCustomPanels(layout, canonical).map((panel) => panel.id));
  const isCustom = (panel: PanelInstance): boolean => multipleTypes.has(panel.type) || isCustomPanelType(panel.type);
  const listed = (panel: PanelInstance): boolean => !hidden.has(panel.type) && !empties.has(panel.id);
  // Instances matched to a canonical spec (the originals): never hard-deletable copies.
  const originals = new Set<string>();

  const instanceEntry = (panel: PanelInstance): PanelCatalogEntry => {
    const pageId = docked.get(panel.id);
    // A keyless copy of a single-instance type; a LOCKED copy only while its keyed
    // original exists (`panel.close` accepts exactly that).
    const copy =
      !panel.singletonKey && keyedTypes.has(panel.type) && !originals.has(panel.id) && (!panel.locked || liveKeyedTypes.has(panel.type));
    const deletable = (isCustom(panel) && !panel.locked && panel.closable !== false) || copy;
    return {
      key: `instance:${panel.id}`,
      title: titleOf(panel),
      type: panel.type,
      source: 'instance',
      instanceId: panel.id,
      placement: pageId ? 'docked' : 'parked',
      ...(pageId ? { pageId, pageLabel: layout.pages[pageId]?.label ?? pageId, onActivePage: pageId === activePageId } : {}),
      ...(panel.singletonKey ? { singletonKey: panel.singletonKey } : {}),
      ...(panel.locked ? { locked: true } : {}),
      ...(deletable ? { deletable: true } : {})
    };
  };

  const entries: PanelCatalogEntry[] = [];
  const emitted = new Set<string>();
  for (const spec of canonical) {
    if (spec.multiple) {
      entries.push({
        key: `canonical:${spec.key}`,
        title: spec.label ?? titleOf(spec.panel),
        type: spec.panel.type,
        source: 'canonical',
        spec,
        placement: 'absent',
        multiple: true
      });
      continue;
    }
    const instance = findCanonicalInstance(layout, spec);
    if (instance) {
      originals.add(instance.id);
      if (!emitted.has(instance.id) && listed(instance)) {
        emitted.add(instance.id);
        entries.push(instanceEntry(instance));
      }
      continue;
    }
    entries.push({
      key: `canonical:${spec.key}`,
      title: spec.label ?? titleOf(spec.panel),
      type: spec.panel.type,
      source: 'canonical',
      spec,
      placement: 'absent',
      ...(spec.panel.singletonKey ? { singletonKey: spec.panel.singletonKey } : {})
    });
  }

  const rest = Object.values(layout.panels)
    .filter((panel) => !emitted.has(panel.id) && listed(panel))
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b)) || a.id.localeCompare(b.id));
  for (const panel of rest) entries.push(instanceEntry(panel));

  const templates = Array.isArray(options.templates)
    ? (options.templates as readonly PanelTemplate[])
    : Object.values((options.templates ?? {}) as Record<string, PanelTemplate>);
  for (const template of [...templates].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))) {
    const panels = Object.values(template.panels ?? {});
    entries.push({
      key: `template:${template.id}`,
      title: template.title,
      type: panels[0]?.type ?? 'template',
      source: 'template',
      templateId: template.id,
      placement: 'absent',
      panelCount: panels.length
    });
  }
  return entries;
}

// ── Adding ───────────────────────────────────────────────────────────────────

interface AddTarget {
  pageId: string;
  to: DockTarget;
  region: DockRegionId;
  /** The target is the user's exact choice (a drop): an instance already on the page moves there. */
  exact: boolean;
}

function regionOfTarget(to: DockTarget): DockRegionId {
  if (to.kind === 'region') return to.region;
  if (to.kind === 'split' && to.region) return to.region;
  return 'main';
}

function findStack(node: DockNode | null, stackId: string): Extract<DockNode, { kind: 'tabs' }> | undefined {
  if (!node) return undefined;
  if (node.kind === 'tabs') return node.id === stackId ? node : undefined;
  for (const child of node.children) {
    const found = findStack(child, stackId);
    if (found) return found;
  }
  return undefined;
}

/**
 * A drop onto the panel itself — its own tab/split target, or its own
 * single-panel stack (by id): moving would first remove that very stack and
 * the move would be refused. Nothing to do.
 */
function dropsOntoItself(layout: WorkbenchLayout, panelId: string, target: AddTarget): boolean {
  const to = target.to;
  if (to.kind === 'region') return false;
  if (to.targetPanelId === panelId) return true;
  if (to.kind === 'tab' && to.tabStackId) {
    for (const node of Object.values(layout.pages[target.pageId]?.dock.root ?? {})) {
      const stack = findStack(node, to.tabStackId);
      if (stack) return stack.panelIds.length === 1 && stack.panelIds[0] === panelId;
    }
  }
  return false;
}

/**
 * Put an EXISTING instance on the target: parked or docked elsewhere → move it
 * there (locked ones too — locked only means it cannot leave the layout);
 * already on the target page → activate it, unless the target is an exact drop
 * (then it moves within the page; a drop onto itself is a no-op).
 */
function placeExisting(layout: WorkbenchLayout, panel: PanelInstance, target: AddTarget): WorkbenchCommand[] {
  const pageId = dockedPageIndex(layout).get(panel.id);
  if (pageId === target.pageId && (!target.exact || dropsOntoItself(layout, panel.id, target))) {
    return [{ type: 'panel.activate', panelId: panel.id }];
  }
  return [{ type: 'panel.move', panelId: panel.id, to: target.to, pageId: target.pageId }];
}

function uniquePanelId(base: string, layout: WorkbenchLayout): string {
  if (!layout.panels[base]) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!layout.panels[id]) return id;
  }
}

function canonicalAddCommands(doc: WorkbenchDocument, layout: WorkbenchLayout, spec: CanonicalPanelSpec, target: AddTarget): WorkbenchCommand[] {
  const id = spec.multiple ? uniquePanelId(createWorkbenchId('panel'), layout) : uniquePanelId(spec.panel.id, layout);
  if (spec.ownsWidgetZone) {
    const commands = createCustomPanelCommands(doc, {
      id,
      type: spec.panel.type,
      title: spec.panel.title,
      region: target.region,
      target: target.to,
      panelState: spec.panel.state
    });
    const singletonKey = spec.multiple ? undefined : spec.panel.singletonKey;
    return singletonKey
      ? commands.map((command) => (command.type === 'panel.add' ? { ...command, panel: { ...command.panel, singletonKey } } : command))
      : commands;
  }
  const panel: PanelInstance = { ...(JSON.parse(JSON.stringify(spec.panel)) as PanelInstance), id };
  if (spec.multiple) delete panel.singletonKey;
  delete panel.collapsed;
  return [{ type: 'panel.add', panel, region: target.region, target: target.to }];
}

const panelOfZone = (zone: string): string | null => (zone.startsWith(PANEL_WIDGET_ZONE_PREFIX) ? zone.slice(PANEL_WIDGET_ZONE_PREFIX.length) : null);

/**
 * Template instantiation never duplicates a singleton: a `panel.add` whose
 * singleton key already exists becomes "put the existing instance on the
 * target" and later tab targets that pointed at the would-be copy follow the
 * existing instance. The template's widgets for such a panel are DROPPED —
 * the existing instance keeps its own (re-adding them on every tap would pile
 * up copies).
 */
function resolveTemplateSingletons(layout: WorkbenchLayout, commands: WorkbenchCommand[], target: AddTarget): WorkbenchCommand[] {
  const remap = new Map<string, string>();
  /** Would-be copies that were not added (their template widgets are dropped). */
  const skipped = new Set<string>();
  const addedKeys = new Map<string, string>();
  const out: WorkbenchCommand[] = [];
  const retarget = (to: DockTarget | undefined): DockTarget | undefined => {
    if (!to || to.kind === 'region' || !to.targetPanelId || !remap.has(to.targetPanelId)) return to;
    return { ...to, targetPanelId: remap.get(to.targetPanelId) };
  };
  for (const command of commands) {
    if (command.type === 'panel.add') {
      const key = command.panel.singletonKey;
      const to = retarget(command.target);
      const sameBatch = key ? addedKeys.get(key) : undefined;
      if (sameBatch) {
        remap.set(command.panel.id, sameBatch);
        skipped.add(command.panel.id);
        continue;
      }
      const existing = key ? Object.values(layout.panels).find((panel) => panel.singletonKey === key) : undefined;
      if (existing) {
        skipped.add(command.panel.id);
        remap.set(command.panel.id, existing.id);
        out.push(...placeExisting(layout, existing, { ...target, to: to ?? { kind: 'region', region: command.region } }));
        continue;
      }
      if (key) addedKeys.set(key, command.panel.id);
      out.push(to === command.target ? command : { ...command, target: to });
      continue;
    }
    out.push(command);
  }
  // Second pass (a panel's zone.ensure comes BEFORE its panel.add): drop the
  // owned zone + widgets + groups of every copy that was not added.
  const ownerSkipped = (zone: string | undefined): boolean => {
    const owner = zone ? panelOfZone(zone) : null;
    return !!owner && skipped.has(owner);
  };
  const kept = out.filter((command) => {
    if (command.type === 'zone.ensure') return !ownerSkipped(command.zone.id);
    if (command.type === 'widget.add') return !ownerSkipped(command.zone);
    if (command.type === 'widget.group') return !ownerSkipped(command.zone);
    return true;
  });
  // A group whose members were dropped would be refused: keep only groups whose widgets exist.
  const addedWidgets = new Set(kept.flatMap((command) => (command.type === 'widget.add' ? [command.widget.id] : [])));
  return kept.filter(
    (command) => command.type !== 'widget.group' || command.widgetIds.every((id) => addedWidgets.has(id) || !!layout.widgets[id])
  );
}

/**
 * The commands that put a catalog entry on the ACTIVE page (dispatch them as
 * ONE batch):
 *
 *   - parked instance                → `panel.move` to the target;
 *   - instance docked on another page → `panel.move` (it stays one instance; locked ones move too);
 *   - instance already on this page   → `panel.activate`, or with `exact` (a
 *     drop) a move to that exact spot (a drop onto itself only activates);
 *   - absent canonical panel          → a fresh instance from the spec (with its singleton key);
 *   - canonical `multiple` spec       → a NEW instance every time;
 *   - template                        → its instantiation, with existing singletons moved instead of copied.
 *
 * None of these can be refused as `duplicate-singleton`. Returns [] when the
 * entry is stale (its instance / template is gone) or there is nothing to do.
 */
export function catalogAddCommands(
  doc: WorkbenchDocument,
  entry: PanelCatalogEntry,
  to: DockTarget,
  options: CatalogAddOptions = {}
): WorkbenchCommand[] {
  const layout = selectActiveLayout(doc);
  const activePageId = activeWorkbenchPage(layout)?.id;
  if (!layout || !activePageId) return [];
  const target: AddTarget = { pageId: activePageId, to, region: regionOfTarget(to), exact: options.exact === true };

  if (entry.source === 'instance') {
    const panel = entry.instanceId ? layout.panels[entry.instanceId] : undefined;
    return panel ? placeExisting(layout, panel, target) : [];
  }

  if (entry.source === 'canonical') {
    const spec = entry.spec;
    if (!spec) return [];
    // A stale "absent" entry whose instance appeared meanwhile: use that one.
    const existing = findCanonicalInstance(layout, spec);
    if (existing) return placeExisting(layout, existing, target);
    return canonicalAddCommands(doc, layout, spec, target);
  }

  const template = entry.templateId ? doc.panelLibrary[entry.templateId] : undefined;
  if (!template) return [];
  const commands = instantiatePanelTemplateCommands(doc, template, { region: target.region, target: target.to });
  return resolveTemplateSingletons(layout, commands, target);
}
