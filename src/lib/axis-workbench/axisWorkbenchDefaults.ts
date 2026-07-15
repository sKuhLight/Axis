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
    // Pages (ROUND 15): Setup / Controllers / Scenes / Live each own a seed page,
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
    }
  };

  layout.panels = createAxisWorkbenchPanels();

  // Pages (ROUND 15): every nav point is its own page. The GRID page keeps the
  // minimal first-contact layout (operator decision 2026-07-06): Signal Grid main +
  // Block Editor bottom — the two things a new user needs. Preset Browser, FC,
  // Setup, Controllers, Scenes, and Live each get their own seed page (full-size
  // panel in main); Theme + Axis Cloud stay ACTION nav entries. Pages are identical
  // across profiles (operator: "same seeds").
  const gridDock = createEmptyDockLayout();
  gridDock.root.main = tabs('axis.tabs.grid.main', ['axis.signalGrid']);
  gridDock.root.bottom = tabs('axis.tabs.grid.bottom', ['axis.blockEditor']);
  gridDock.regions.bottom.sizePx = 360;
  const seeded = buildAxisSeedPages(gridDock);
  layout.pages = seeded.pages;
  layout.pageOrder = seeded.pageOrder;
  layout.activePageId = seeded.activePageId;

  layout.widgets = {
    'axis.widget.preset': widget('axis.widget.preset', 'axis.preset', 'top.left', 0, { state: widgetState(95) }),
    'axis.widget.scenes': widget('axis.widget.scenes', 'axis.scenes', 'top.left', 1, { state: widgetState(60) }),
    'axis.widget.view': widget('axis.widget.view', 'axis.view', 'top.right', 0, { state: widgetState(60) }),
    'axis.widget.addBlock': widget('axis.widget.addBlock', 'axis.addBlock', 'top.right', 1, { state: widgetState(70) }),
    'axis.widget.tuner': widget('axis.widget.tuner', 'axis.tuner', 'top.right', 2, { state: widgetState(70) }),
    'axis.widget.tempo': widget('axis.widget.tempo', 'axis.tempo', 'top.right', 3),
    'axis.widget.cpu': widget('axis.widget.cpu', 'axis.cpu', 'top.right', 4),
    'axis.widget.meterToggle': widget('axis.widget.meterToggle', 'axis.meterToggle', 'top.right', 5, { state: widgetState(40) }),
    'axis.widget.save': widget('axis.widget.save', 'axis.save', 'top.right', 6, { state: widgetState(95) }),
    'axis.widget.search': widget('axis.widget.search', 'axis.search', 'hidden', 0),
    // V13c: the rail no longer carries a History widget (History is reachable as a
    // dock panel) nor the "AX" account avatar (the 'account' nav entry / Axis Cloud
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

  // Nav entries bind to the seed pages (grid/library/fc/controllers/scenes/live/
  // setup); Theme + Axis Cloud stay ACTION entries. Triggering a page entry
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
