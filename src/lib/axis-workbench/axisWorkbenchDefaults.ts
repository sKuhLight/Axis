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

const panel = (id: string, type: string, title: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({
  id,
  type,
  title,
  closable: true,
  collapsible: true,
  ...extra
});

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

  layout.panels = {
    'axis.signalGrid': panel('axis.signalGrid', 'axis.signalGrid', 'Signal Grid', { locked: true, closable: false }),
    'axis.blockEditor': panel('axis.blockEditor', 'axis.blockEditor', 'Block Editor'),
    'axis.history': panel('axis.history', 'axis.history', 'History'),
    'axis.presetBrowser': panel('axis.presetBrowser', 'axis.presetBrowser', 'Preset Browser'),
    'axis.fc': panel('axis.fc', 'axis.fc', 'Footswitches'),
    'axis.account': panel('axis.account', 'axis.account', 'Axis Account', { locked: true, closable: false }),
    'axis.deviceTools': panel('axis.deviceTools', 'axis.deviceTools', 'Device Tools'),
    'axis.customPanel': panel('axis.customPanel', 'axis.customPanel', 'Custom Panel')
  };

  layout.dock.root.main = tabs('axis.tabs.main', ['axis.signalGrid']);
  layout.dock.root.bottom = tabs('axis.tabs.bottom', ['axis.blockEditor', 'axis.fc'], 'axis.blockEditor');
  layout.dock.root.right = tabs('axis.tabs.right', ['axis.history']);
  layout.dock.root.left = tabs('axis.tabs.left', ['axis.presetBrowser']);
  layout.dock.regions.left.sizePx = 320;
  layout.dock.regions.right.sizePx = 340;
  layout.dock.regions.bottom.sizePx = 360;

  layout.widgets = {
    'axis.widget.preset': widget('axis.widget.preset', 'axis.preset', 'top.left', 0, { state: widgetState(95) }),
    'axis.widget.scenes': widget('axis.widget.scenes', 'axis.scenes', 'top.left', 1, { state: widgetState(60) }),
    'axis.widget.view': widget('axis.widget.view', 'axis.view', 'top.right', 0, { state: widgetState(60) }),
    'axis.widget.addBlock': widget('axis.widget.addBlock', 'axis.addBlock', 'top.right', 1, { state: widgetState(70) }),
    'axis.widget.tuner': widget('axis.widget.tuner', 'axis.tuner', 'top.right', 2, { state: widgetState(70) }),
    'axis.widget.tempo': widget('axis.widget.tempo', 'axis.tempo', 'top.right', 3),
    'axis.widget.cpu': widget('axis.widget.cpu', 'axis.cpu', 'top.right', 4),
    'axis.widget.save': widget('axis.widget.save', 'axis.save', 'top.right', 5, { state: widgetState(95) }),
    'axis.widget.search': widget('axis.widget.search', 'axis.search', 'hidden', 0),
    'axis.widget.history': widget('axis.widget.history', 'axis.history', 'rail', 0, { size: 'compact' }),
    'axis.widget.account': widget('axis.widget.account', 'axis.account', 'rail', 1, {
      size: 'compact',
      locked: true,
      state: widgetState(90, { fixedSlot: 'rail.footer' })
    }),
    'axis.widget.connection': widget('axis.widget.connection', 'axis.connection', 'rail', 2, { size: 'compact', state: widgetState(90) }),
    'axis.widget.gridMode': widget('axis.widget.gridMode', 'axis.gridMode', 'gridbar', 0, { state: { mode: 'auto' } }),
    'axis.widget.blockSize': widget('axis.widget.blockSize', 'axis.blockSize', 'gridbar', 1, { state: { size: 'M' } })
  };

  layout.navigation.entries = {
    grid: nav('grid', 'Grid', 'axis.openGrid'),
    library: nav('library', 'Preset Browser', 'axis.openPresetBrowser'),
    fc: nav('fc', 'Footswitches', 'axis.openFc'),
    scenes: nav('scenes', 'Scenes', 'axis.openScenes'),
    live: nav('live', 'Live', 'axis.openLive'),
    setup: nav('setup', 'Setup', 'axis.openSetup'),
    account: nav('account', 'Axis Cloud', 'axis.openAccount', {
      locked: true,
      fixedSlot: 'rail.footer',
      hidden: false
    })
  };
  layout.navigation.order = ['grid', 'library', 'fc', 'scenes', 'live', 'setup', 'account'];
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
