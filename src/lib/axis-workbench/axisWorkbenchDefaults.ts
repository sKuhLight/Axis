import { createEmptyWorkbenchDocument, createDefaultWidgetZoneLayout } from '../workbench/core/defaults';
import type {
  DockNode,
  NavigationEntryState,
  PanelInstance,
  PanelTemplate,
  JsonObject,
  WidgetTemplate,
  WidgetInstance,
  WorkbenchDocument
} from '../workbench/core/schema';

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
    'axis.customPanel': panel('axis.customPanel', 'axis.customPanel', 'Custom Panel')
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

const nav = (
  id: string,
  label: string,
  command: string,
  extra: Partial<NavigationEntryState> = {}
): NavigationEntryState => ({
  id,
  label,
  hidden: false,
  target: { command },
  ...extra
});

export function createAxisWorkbenchDefaultDocument(): WorkbenchDocument {
  const doc = createEmptyWorkbenchDocument({
    profileId: 'axis.profile.desktop',
    profileLabel: 'Desktop',
    layoutId: 'axis.layout.default',
    layoutLabel: 'Axis Default',
    metadata: { app: 'axis', source: 'axis-workbench-defaults' }
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

  // Minimal first-contact layout (operator decision 2026-07-06): just the grid and
  // the block editor — the two things a new user needs — so the start screen never
  // overwhelms. Everything else (FC, history, preset browser, …) stays registered
  // and reachable via nav / the panel library; richer arrangements are the LAYOUT
  // presets' job.
  layout.dock.root.main = tabs('axis.tabs.main', ['axis.signalGrid']);
  layout.dock.root.bottom = tabs('axis.tabs.bottom', ['axis.blockEditor']);
  layout.dock.regions.bottom.sizePx = 360;

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
    'axis.widget.history': widget('axis.widget.history', 'axis.history', 'rail', 0, { size: 'compact' }),
    'axis.widget.account': widget('axis.widget.account', 'axis.account', 'rail', 1, {
      size: 'compact',
      locked: true,
      state: widgetState(90, { fixedSlot: 'rail.footer' })
    }),
    'axis.widget.connection': widget('axis.widget.connection', 'axis.connection', 'rail', 2, { size: 'compact', state: widgetState(90) }),
    'axis.widget.gridMode': widget('axis.widget.gridMode', 'axis.gridMode', 'gridbar', 0, { state: { mode: 'auto' } }),
    'axis.widget.blockSize': widget('axis.widget.blockSize', 'axis.blockSize', 'gridbar', 1, { state: { size: 'M' } }),
    // Bottom utility bar (StatusBar parity, T10): left = hover-hint ticker, right = Ko-fi / imprint.
    'axis.widget.hint': widget('axis.widget.hint', 'axis.hint', 'bottom', 0, { state: widgetState(20) }),
    'axis.widget.legal': widget('axis.widget.legal', 'axis.legal', 'bottom', 1, { state: widgetState(90) })
  };

  layout.navigation.entries = {
    grid: nav('grid', 'Grid', 'axis.openGrid'),
    library: nav('library', 'Preset Browser', 'axis.openPresetBrowser'),
    fc: nav('fc', 'Footswitches', 'axis.openFc'),
    controllers: nav('controllers', 'Controllers', 'axis.openControllers'),
    scenes: nav('scenes', 'Scenes', 'axis.openScenes'),
    live: nav('live', 'Live', 'axis.openLive'),
    setup: nav('setup', 'Setup', 'axis.openSetup'),
    theme: nav('theme', 'Theme', 'axis.openTheme'),
    account: nav('account', 'Axis Cloud', 'axis.openAccount', {
      locked: true,
      fixedSlot: 'rail.footer',
      hidden: false
    })
  };
  layout.navigation.order = ['grid', 'library', 'fc', 'controllers', 'scenes', 'live', 'setup', 'theme', 'account'];
  layout.navigation.mode = 'side';

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
    'axis.library.widget.history': widgetTemplate('axis.library.widget.history', 'History', [layout.widgets['axis.widget.history']]),
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
