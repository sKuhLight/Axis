import { createEmptyWorkbenchDocument, createDefaultWidgetZoneLayout, createEmptyDockLayout } from '../workbench/core/defaults';
import type {
  DockNode,
  PanelInstance,
  PanelTemplate,
  JsonObject,
  WidgetTemplate,
  WidgetInstance,
  WorkbenchDocument
} from '../workbench/core/schema';
import { axisMyControlsPanel, axisMyControlsZone, AXIS_MY_CONTROLS_PANEL_ID } from './myControlsPanel';
import {
  AXIS_SEED_PAGES_MARKER,
  buildAxisSeedPages,
  createAxisConvertPanels,
  createAxisPagePanels,
  createAxisSeedNavigation
} from './axisWorkbenchPages';

export const axisPanel = (
  id: string,
  type: string,
  title: string,
  extra: Partial<PanelInstance> = {}
): PanelInstance => ({
  id,
  type,
  title,
  closable: true,
  collapsible: true,
  ...extra
});

const panel = axisPanel;

/**
 * The canonical Axis panel roster (singleton keys + locked flags). Shared by the
 * default document and every layout preset so a preset never re-mints a panel id
 * that could collide with an existing one and every panel keeps its singleton
 * key. Returns a fresh object each call (safe to mutate per layout).
 */
export function createAxisWorkbenchPanels(): Record<string, PanelInstance> {
  return {
    'axis.signalGrid': panel('axis.signalGrid', 'axis.signalGrid', 'Signal Grid', {
      locked: true,
      closable: false,
      singletonKey: 'axis.signalGrid'
    }),
    'axis.blockEditor': panel('axis.blockEditor', 'axis.blockEditor', 'Block Editor', {
      singletonKey: 'axis.blockEditor'
    }),
    'axis.history': panel('axis.history', 'axis.history', 'History', { singletonKey: 'axis.history' }),
    'axis.presetBrowser': panel('axis.presetBrowser', 'axis.presetBrowser', 'Preset Browser', {
      singletonKey: 'axis.presetBrowser'
    }),
    'axis.fc': panel('axis.fc', 'axis.fc', 'Footswitches', { singletonKey: 'axis.fc' }),
    'axis.account': panel('axis.account', 'axis.account', 'Axis Account', {
      locked: true,
      closable: false,
      singletonKey: 'axis.account'
    }),
    'axis.deviceTools': panel('axis.deviceTools', 'axis.deviceTools', 'Device Tools', {
      singletonKey: 'axis.deviceTools'
    }),
    'axis.customPanel': panel('axis.customPanel', 'axis.customPanel', 'Custom Panel'),
    // The single pin destination. No panelLibrary template: it must not be
    // instantiable a second time.
    [AXIS_MY_CONTROLS_PANEL_ID]: axisMyControlsPanel(),
    // Pages (ROUND 15): Setup / Controllers / Live each own a seed page,
    // so their panel instances live in the roster (they used to be minted on demand
    // by the add-or-focus nav actions). Preset Browser / FC panels already exist above.
    ...createAxisPagePanels(),
    // Cross-device converter page (M4) — four offline review/edit panels.
    ...createAxisConvertPanels()
  };
}

const widget = (
  id: string,
  type: string,
  zone: string,
  order: number,
  extra: Partial<WidgetInstance> = {}
): WidgetInstance => ({
  id,
  type,
  zone,
  order,
  size: 'default',
  ...extra
});

const widgetState = (overflowPriority: number, extra: JsonObject = {}): JsonObject => ({
  overflowPriority,
  ...extra
});

/** Zone-id prefix that marks a widget as top-bar chrome. */
const AXIS_TOP_BAR_ZONE_PREFIX = 'top.';

const isAxisTopBarZone = (zone: unknown): zone is string =>
  typeof zone === 'string' && zone.startsWith(AXIS_TOP_BAR_ZONE_PREFIX);

/**
 * The canonical TOP BAR — the single source of truth for the widgets that sit in
 * `top.left` / `top.center` / `top.right`, with their zones, orders, densities and
 * overflow priorities. The default document AND every profile seed (see
 * `axisWorkbenchLayoutPresets.ts`) build the top bar from here, so the bar is
 * identical on every screen size. A drifted copy of this list is what once made
 * tablet/phone render a different bar than desktop; keep both call sites on this
 * factory (pinned by `test/axisWorkbenchLayoutPresets.test.ts`).
 */
export function createAxisTopBarWidgets(): Record<string, WidgetInstance> {
  return {
    'axis.widget.preset': widget('axis.widget.preset', 'axis.preset', 'top.left', 0, { state: widgetState(95) }),
    'axis.widget.scenes': widget('axis.widget.scenes', 'axis.scenes', 'top.left', 1, { state: widgetState(60) }),
    // Save sits directly after the Scenes widget rather than in the far-right
    // status cluster, so the amber "edited" pill and the action it offers are
    // next to the scene name.
    'axis.widget.save': widget('axis.widget.save', 'axis.save', 'top.left', 2, { state: widgetState(95) }),
    'axis.widget.tuner': widget('axis.widget.tuner', 'axis.tuner', 'top.right', 2, { state: widgetState(70) }),
    'axis.widget.tempo': widget('axis.widget.tempo', 'axis.tempo', 'top.right', 3),
    'axis.widget.cpu': widget('axis.widget.cpu', 'axis.cpu', 'top.right', 4),
    'axis.widget.meterToggle': widget('axis.widget.meterToggle', 'axis.meterToggle', 'top.right', 5, { state: widgetState(40) })
  };
}

const tabs = (id: string, panelIds: string[], activePanelId = panelIds[0]): DockNode => ({
  kind: 'tabs',
  id,
  panelIds,
  activePanelId
});

export function createAxisWorkbenchDefaultDocument(): WorkbenchDocument {
  const doc = createEmptyWorkbenchDocument({
    profileId: 'axis.profile.desktop',
    profileLabel: 'Desktop',
    layoutId: 'axis.layout.default',
    layoutLabel: 'Axis Default',
    metadata: { app: 'axis', source: 'axis-workbench-defaults', [AXIS_SEED_PAGES_MARKER]: 'v1' }
  });

  const layout = doc.layouts['axis.layout.default'];
  layout.zones = {
    ...createDefaultWidgetZoneLayout(),
    'panel:axis.customPanel': {
      id: 'panel:axis.customPanel',
      label: 'Custom Panel',
      orientation: 'horizontal',
      acceptsGroups: true
    },
    [axisMyControlsZone().id]: axisMyControlsZone()
  };

  layout.panels = createAxisWorkbenchPanels();

  // Pages (ROUND 15): every nav point is its own page. The GRID page opens on the
  // Block Editor (operator decision 2026-09-02): Block Editor main + History and
  // My Controls tabbed into the right dock, with the Signal Grid panel UNDOCKED (still in the roster, so it can be
  // re-added from the panel picker) — the editor already carries the GRID MAP
  // navigator, so the full signal grid is not needed for first contact. Preset
  // Browser, FC, Setup, Controllers, and Live each get their own seed page
  // (full-size panel in main); Theme + Axis stay ACTION nav entries. Pages are
  // identical across profiles (operator: "same seeds").
  const gridDock = createEmptyDockLayout();
  gridDock.root.main = tabs('axis.tabs.grid.main', ['axis.blockEditor']);
  gridDock.root.right = tabs('axis.tabs.grid.right', [AXIS_MY_CONTROLS_PANEL_ID, 'axis.history']);
  gridDock.regions.right.sizePx = 560;
  const seeded = buildAxisSeedPages(gridDock);
  layout.pages = seeded.pages;
  layout.pageOrder = seeded.pageOrder;
  layout.activePageId = seeded.activePageId;

  layout.widgets = {
    // The top bar comes from the shared factory so it can never drift from the
    // tablet/phone seeds or from `ensureAxisTopBarParity`'s reference.
    ...createAxisTopBarWidgets(),
    'axis.widget.search': widget('axis.widget.search', 'axis.search', 'hidden', 0),
    // V13c: the rail no longer carries a History widget (History is reachable as a
    // dock panel) nor the "AX" account avatar (the 'account' nav entry / Axis hub
    // is the single account entry). Only the connection status remains on the rail.
    'axis.widget.connection': widget('axis.widget.connection', 'axis.connection', 'rail', 0, { size: 'compact', state: widgetState(90) }),
    'axis.widget.gridMode': widget('axis.widget.gridMode', 'axis.gridMode', 'gridbar', 0, { state: { mode: 'auto' } }),
    'axis.widget.blockSize': widget('axis.widget.blockSize', 'axis.blockSize', 'gridbar', 1, { state: { size: 'M' } }),
    // Telemetry monitor (META-17): device polling-mode quick-switch + live traffic. Capability-gated in
    // the widget (renders nothing when the server has no telemetry control), so it degrades to an empty
    // slot on older servers.
    'axis.widget.telemetry': widget('axis.widget.telemetry', 'axis.telemetry', 'gridbar', 2, { state: widgetState(30) }),
    // Bottom utility bar (StatusBar parity, T10): left = hover-hint ticker, right = Ko-fi / imprint.
    'axis.widget.hint': widget('axis.widget.hint', 'axis.hint', 'bottom', 0, { state: widgetState(20) }),
    'axis.widget.legal': widget('axis.widget.legal', 'axis.legal', 'bottom', 1, { state: widgetState(90) })
  };

  // Nav entries bind to the seed pages (grid/library/fc/controllers/live/setup);
  // Theme + Axis stay ACTION entries. Triggering a page entry
  // activates its page via the generic NavigationHost (`page.activate`).
  layout.navigation = createAxisSeedNavigation('side');

  doc.panelLibrary = {
    'axis.library.panel.blockEditor': panelTemplate('axis.library.panel.blockEditor', 'Block Editor', layout.panels['axis.blockEditor']),
    'axis.library.panel.customPanel': panelTemplate('axis.library.panel.customPanel', 'Custom Panel', layout.panels['axis.customPanel']),
    'axis.library.panel.deviceTools': panelTemplate('axis.library.panel.deviceTools', 'Device Tools', layout.panels['axis.deviceTools']),
    'axis.library.panel.fc': panelTemplate('axis.library.panel.fc', 'Footswitches', layout.panels['axis.fc']),
    'axis.library.panel.history': panelTemplate('axis.library.panel.history', 'History', layout.panels['axis.history']),
    'axis.library.panel.presetBrowser': panelTemplate('axis.library.panel.presetBrowser', 'Preset Browser', layout.panels['axis.presetBrowser'])
  };

  doc.widgetLibrary = {
    'axis.library.widget.gridControls': widgetTemplate('axis.library.widget.gridControls', 'Grid Controls', [
      layout.widgets['axis.widget.gridMode'],
      layout.widgets['axis.widget.blockSize']
    ]),
    // The History widget is no longer seeded onto the rail (V13c), but it stays
    // available from the widget library so a user can re-add it anywhere. Define
    // it inline since it no longer has a default rail instance to source from.
    'axis.library.widget.history': widgetTemplate('axis.library.widget.history', 'History', [
      widget('axis.widget.history', 'axis.history', 'rail', 0, { size: 'compact' })
    ]),
    'axis.library.widget.preset': widgetTemplate('axis.library.widget.preset', 'Preset', [
      layout.widgets['axis.widget.preset'],
      layout.widgets['axis.widget.scenes']
    ]),
    'axis.library.widget.status': widgetTemplate('axis.library.widget.status', 'Status', [
      layout.widgets['axis.widget.connection'],
      layout.widgets['axis.widget.cpu']
    ]),
    'axis.library.widget.tools': widgetTemplate('axis.library.widget.tools', 'Tuner + Tempo', [
      layout.widgets['axis.widget.tuner'],
      layout.widgets['axis.widget.tempo']
    ]),
    'axis.library.widget.meter': widgetTemplate('axis.library.widget.meter', 'Meter', [
      layout.widgets['axis.widget.meterToggle']
    ])
  };

  return doc;
}

function panelTemplate(id: string, title: string, source: PanelInstance): PanelTemplate {
  return {
    id,
    title,
    panels: {
      [source.id]: { ...source, locked: false, closable: true }
    }
  };
}

function widgetTemplate(id: string, title: string, sources: WidgetInstance[]): WidgetTemplate {
  return {
    id,
    title,
    widgets: Object.fromEntries(sources.map((source, index) => [source.id, { ...source, order: index, locked: false, groupId: null }]))
  };
}

/**
 * Self-heal grid controls: any layout that docks a Signal Grid panel gets the
 * gridMode/blockSize widgets seeded into its gridbar when the layout carries
 * neither (hand-built layouts, sparse presets). The design treats them as
 * widgets so users CAN move/hide them — but a layout that never had them
 * shouldn't silently lose the grid's mode/size controls. Runs during document
 * normalization (see axisWorkbenchStore), so it must be idempotent and never
 * touch a layout that has either widget anywhere (including 'hidden' — that is
 * an explicit user choice).
 */
/**
 * Rail widget ids retired by V13c (History widget + the "AX" account avatar).
 * They are stripped from *every* layout on load/adopt/restore so a persisted
 * document minted before V13c doesn't keep painting the removed rail entries.
 * Removing the instance is enough — the reducer/repair already prunes any
 * dangling group/order references, and the widget types stay registered so the
 * History widget can still be re-added from the widget library.
 */
const AXIS_RETIRED_RAIL_WIDGET_IDS = ['axis.widget.history', 'axis.widget.account'] as const;

/** Drop retired rail widget instances (V13c) from a (possibly persisted) document. Idempotent. */
export function pruneAxisRetiredRailWidgets(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object' || !layout.widgets) continue;
    for (const id of AXIS_RETIRED_RAIL_WIDGET_IDS) {
      const instance = layout.widgets[id];
      // Only strip the retired *rail* seeds — never touch a same-id widget a user
      // deliberately placed elsewhere (e.g. History docked into another zone).
      if (instance && instance.zone === 'rail') delete layout.widgets[id];
    }
  }
  return doc;
}

/**
 * Remove the preset search widget from persisted top bars. It remains available
 * outside the top bar for custom layouts that still use it there. Idempotent.
 */
export function pruneAxisTopBarSearchWidgets(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object' || !layout.widgets) continue;
    for (const [id, instance] of Object.entries(layout.widgets)) {
      if (instance?.type === 'axis.search' && instance.zone.startsWith('top.')) delete layout.widgets[id];
    }
  }
  return doc;
}

/**
 * Drop every instance of a retired widget TYPE from a (possibly persisted) document.
 * These widgets were removed from the shell but persisted docs minted earlier still
 * carry their instances in a top/bottom zone, where the retired-rail prune (above)
 * can't reach them. Unlike the rail prune this is unconditional on zone — the type is
 * no longer registered, so any instance is dead: it renders nothing, yet would still
 * be listed as an addable entry in the Customize → Widgets library drawer.
 * Idempotent.
 *
 *   - `axis.addBlock` — the Add Block widget (T-series).
 *   - `axis.view` — the Basic/Advanced VIEW chip; blocks now always open on Ideal.
 */
const AXIS_RETIRED_WIDGET_TYPES = ['axis.addBlock', 'axis.view'] as const;

export function pruneAxisRetiredWidgetTypes(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object' || !layout.widgets) continue;
    for (const [id, instance] of Object.entries(layout.widgets)) {
      if (instance && AXIS_RETIRED_WIDGET_TYPES.includes(instance.type as (typeof AXIS_RETIRED_WIDGET_TYPES)[number])) {
        delete layout.widgets[id];
      }
    }
  }
  return doc;
}

/**
 * Navigation entries retired from the Axis shell. The Theme entry was folded into the
 * Axis hub's Theme tab, so the standalone rail entry and its `axis.openTheme` action are
 * gone. A persisted document minted earlier still carries the entry, which would render
 * through the navigation fallback and dispatch an unregistered command — strip it (and
 * its `order` slot) on load. Idempotent.
 */
const AXIS_RETIRED_NAVIGATION_ENTRY_IDS = ['theme'] as const;

export function pruneAxisRetiredNavigationEntries(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object' || !layout.navigation) continue;
    for (const id of AXIS_RETIRED_NAVIGATION_ENTRY_IDS) {
      if (layout.navigation.entries?.[id]) delete layout.navigation.entries[id];
      layout.navigation.order = (layout.navigation.order ?? []).filter((entryId) => entryId !== id);
    }
  }
  return doc;
}

export function ensureAxisGridControlWidgets(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object') continue;
    const panels = Object.values(layout.panels ?? {});
    if (!panels.some((instance) => instance?.type === 'axis.signalGrid')) continue;
    const widgets = (layout.widgets = layout.widgets ?? {});
    const types = new Set(Object.values(widgets).map((instance) => instance?.type));
    if (types.has('axis.gridMode') || types.has('axis.blockSize')) continue;
    // Canonical ids only — if either key is somehow taken by a foreign widget, leave the
    // layout alone (seeding must stay strictly idempotent; the panel's auto+M fallback
    // keeps the grid behaving either way).
    if (widgets['axis.widget.gridMode'] || widgets['axis.widget.blockSize']) continue;
    const gridbarCount = Object.values(widgets).filter((instance) => instance?.zone === 'gridbar').length;
    widgets['axis.widget.gridMode'] = widget('axis.widget.gridMode', 'axis.gridMode', 'gridbar', gridbarCount, { state: { mode: 'auto' } });
    widgets['axis.widget.blockSize'] = widget('axis.widget.blockSize', 'axis.blockSize', 'gridbar', gridbarCount + 1, { state: { size: 'M' } });
  }
  return doc;
}

/**
 * Ensure the Meter toggle is offered in the widget library (Customize → Widgets → "Saved Widgets").
 * Marker-free and idempotent, like `ensureAxisConvertPage`: a document that already carries the
 * `axis.library.widget.meter` template is left untouched, so a persisted doc minted before the
 * library entry shipped self-heals on the next load. The widget instance is constructed fresh here
 * (not sourced from `layout.widgets['axis.widget.meterToggle']`) because a preset-applied or
 * hand-built layout may not carry that instance.
 */
export function ensureAxisMeterWidgetLibrary(doc: WorkbenchDocument): WorkbenchDocument {
  doc.widgetLibrary = doc.widgetLibrary ?? {};
  if (!doc.widgetLibrary['axis.library.widget.meter']) {
    doc.widgetLibrary['axis.library.widget.meter'] = widgetTemplate('axis.library.widget.meter', 'Meter', [
      widget('axis.widget.meterToggle', 'axis.meterToggle', 'top.right', 0, { state: widgetState(40) })
    ]);
  }
  return doc;
}

/**
 * Relocate the canonical Save widget to sit immediately after the Scenes widget,
 * so the amber "edited" pill — and the action it offers — land next to the scene
 * name they belong to. Scenes does not always live in `top.left` (a tablet layout
 * can park it in `top.center`), so the target zone is wherever Scenes is inside
 * the top bar, and Save is slotted directly after it. When a layout carries no
 * top-bar Scenes widget, Save falls back to the end of `top.left` (beside the
 * preset name).
 *
 * Deliberately narrow: only the canonical `axis.widget.save` instance is moved,
 * and only while it already sits in a top-bar zone — a Save parked in a custom
 * panel, the floating layer, `hidden`, or the bottom bar is left untouched.
 * Idempotent — once positioned it is a no-op, so the normalization chain can run
 * on every load.
 */
export function ensureAxisSaveWidgetPlacement(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object' || !layout.widgets) continue;
    const save = layout.widgets['axis.widget.save'];
    if (!save || save.type !== 'axis.save') continue;
    // Respect an explicit placement outside the top bar (hidden/custom/floating).
    if (!isAxisTopBarZone(save.zone)) continue;

    // Preferred: immediately after Scenes, in whatever top-bar zone Scenes uses.
    const scenes = Object.values(layout.widgets).find((instance) => instance?.type === 'axis.scenes' && isAxisTopBarZone(instance.zone));
    if (scenes) {
      if (save.zone === scenes.zone && save.order === scenes.order + 1) continue;
      // Open a slot directly after Scenes without displacing Scenes itself.
      for (const instance of Object.values(layout.widgets)) {
        if (instance && instance !== save && instance.zone === scenes.zone && instance.order >= scenes.order + 1) {
          instance.order += 1;
        }
      }
      save.zone = scenes.zone;
      save.order = scenes.order + 1;
      continue;
    }

    // No top-bar Scenes widget: fall back to the end of top.left.
    if (save.zone === 'top.left') continue;
    const topLeftMax = Object.values(layout.widgets)
      .filter((instance) => instance?.zone === 'top.left')
      .reduce((max, instance) => Math.max(max, instance.order ?? 0), -1);
    save.zone = 'top.left';
    save.order = topLeftMax + 1;
  }
  return doc;
}

/**
 * doc.metadata marker: the non-desktop profile top bars have been reconciled with
 * the desktop layout (see {@link ensureAxisTopBarParity}). One-shot, so a doc the
 * user deliberately customised per profile afterwards is never re-clobbered.
 */
export const AXIS_TOP_BAR_PARITY_MARKER = 'axisTopBarParity';

/** Deep copy a widget instance (binding/state are plain JSON). */
const cloneWidgetInstance = (instance: WidgetInstance): WidgetInstance =>
  JSON.parse(JSON.stringify(instance)) as WidgetInstance;

/**
 * Make the TOP BAR identical on every profile.
 *
 * Before profiles were unified, tablet and phone were seeded from their own layout
 * specs (Scenes parked in `top.center`, a tuner/tempo/cpu `status` group, no meter),
 * so resizing the window silently swapped the bar's widgets and arrangement. Those
 * specs are gone, but a persisted document still carries the old per-profile layouts
 * (`seedAxisProfiles` leaves existing profiles untouched). This reconciles them: every
 * non-desktop profile's top-bar widgets are replaced with verbatim copies of the
 * desktop profile's — "same bar on every screen size".
 *
 * Only the `top.*` zones are touched: each profile keeps its own dock (the phone
 * profile's bottom-docked Block Editor powering the mobile block flow). Docks, pages,
 * panels and navigation are left alone. A group the replacement emptied (the legacy
 * `status` group) is pruned, since repair would otherwise re-attach it to the copied
 * members. Marker-gated, so it runs once per document; the normalizer's default doc
 * plus the shared top-bar factory keep fresh docs at parity without it.
 */
export function ensureAxisTopBarParity(doc: WorkbenchDocument): WorkbenchDocument {
  if (doc.metadata?.[AXIS_TOP_BAR_PARITY_MARKER]) return doc;

  const profiles = Object.values(doc.profiles ?? {});
  // The desktop profile's layout is the reference — it is what the user sees at
  // full width, and the bar they expect everywhere. `breakpoint` unset means desktop.
  const reference = profiles.find((profile) => !profile.breakpoint || profile.breakpoint === 'desktop');
  const referenceLayout = reference ? doc.layouts[reference.layoutId] : undefined;
  if (!reference || !referenceLayout?.widgets) return doc;

  const referenceTopWidgets = Object.values(referenceLayout.widgets).filter(
    (instance) => instance && isAxisTopBarZone(instance.zone)
  );
  if (!referenceTopWidgets.length) return doc;

  for (const profile of profiles) {
    if (profile.id === reference.id) continue;
    const layout = doc.layouts[profile.layoutId];
    if (!layout || !layout.widgets) continue;

    // Drop this profile's own top-bar widgets...
    for (const [id, instance] of Object.entries(layout.widgets)) {
      if (instance && isAxisTopBarZone(instance.zone)) delete layout.widgets[id];
    }
    // ...and plant the desktop bar verbatim. Assigning by canonical id also moves a
    // widget the profile had parked in another zone (e.g. a docked tuner) back up.
    for (const instance of referenceTopWidgets) {
      layout.widgets[instance.id] = cloneWidgetInstance(instance);
    }

    // Prune groups the replacement emptied (the legacy `status` group's members no
    // longer carry `groupId`, but its stale `widgetIds` would keep it alive through
    // repair). Groups still claimed by two or more widgets are kept.
    if (layout.widgetGroups) {
      for (const [groupId, group] of Object.entries(layout.widgetGroups)) {
        const members = (group.widgetIds ?? []).filter(
          (widgetId) => layout.widgets![widgetId]?.groupId === groupId
        );
        if (members.length < 2) {
          for (const widgetId of members) {
            const widget = layout.widgets![widgetId];
            if (widget) widget.groupId = null;
          }
          delete layout.widgetGroups[groupId];
        } else if (members.length !== group.widgetIds?.length) {
          layout.widgetGroups[groupId] = { ...group, id: groupId, widgetIds: members };
        }
      }
    }
  }

  doc.metadata = { ...(doc.metadata ?? {}), [AXIS_TOP_BAR_PARITY_MARKER]: 'v1' };
  return doc;
}
