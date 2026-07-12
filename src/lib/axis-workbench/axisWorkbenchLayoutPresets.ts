import {
  createEmptyDockLayout,
  createEmptyWorkbenchPage,
  createDefaultWidgetZoneLayout,
  createWorkbenchId,
  type DockLayout,
  type DockNode,
  type JsonObject,
  type NavigationEntryState,
  type PanelInstance,
  type WidgetInstance,
  type WidgetSize,
  type WidgetZoneLayout,
  type WorkbenchLayout
} from '../workbench/core';
import { createAxisWorkbenchPanels } from './axisWorkbenchDefaults';

/**
 * Axis layout presets — the production port of the design shell's `preset(kind)`
 * (`docs/workbench-dc-parity/01-shell.md` §3). Six kinds:
 *
 *   - `default` / `stage` / `studio` / `compact` — user-selectable LAYOUT tabs
 *     in the edit ribbon (applied to the *active* profile, preserving `rightW`).
 *   - `tablet` / `mobile` — seed the tablet / mobile profiles' initial layouts.
 *
 * Each preset composes the *existing* Axis panel roster (`createAxisWorkbenchPanels`)
 * and widget/navigation types (see `axisWorkbenchRegistryManifest.ts`) — presets
 * never introduce new panel/widget types, so validation + the render registry
 * cover them automatically. Node ids are minted through `createWorkbenchId` so a
 * preset applied into a live document can never collide with persisted ids.
 *
 * Design → Axis conventions:
 *   - Zones: `tl→top.left`, `tc→top.center`, `tr→top.right`, `rail→rail`,
 *     `bottom→bottom`, `gridbar→gridbar`, `right→right`, `hidden→hidden`.
 *   - Widget kinds → types: preset→axis.preset, scenes→axis.scenes, view→axis.view,
 *     add→axis.addBlock, tuner→axis.tuner, tempo→axis.tempo, cpu→axis.cpu,
 *     save→axis.save, search→axis.search, history→axis.history, map→axis.gridMap,
 *     undo→axis.undoRedo, account→axis.account, gridmode→axis.gridMode,
 *     blocksize→axis.blockSize.
 *   - Density: design `expanded→default`, `compact→compact`, `mini→mini`.
 */

export const AXIS_LAYOUT_PRESET_KINDS = ['default', 'stage', 'studio', 'compact', 'tablet', 'mobile'] as const;
export type AxisLayoutPresetKind = (typeof AXIS_LAYOUT_PRESET_KINDS)[number];

/** LAYOUT-tab presets (applied to the active profile from the edit ribbon). */
export const AXIS_LAYOUT_TAB_KINDS = ['default', 'stage', 'studio', 'compact'] as const;
export type AxisLayoutTabKind = (typeof AXIS_LAYOUT_TAB_KINDS)[number];

/** PROFILE-seed presets (one per non-desktop profile). */
export const AXIS_PROFILE_SEED_KINDS = ['tablet', 'mobile'] as const;

const PRESET_LABELS: Record<AxisLayoutPresetKind, string> = {
  default: 'Default',
  stage: 'Stage',
  studio: 'Studio',
  compact: 'Compact',
  tablet: 'Tablet',
  mobile: 'Mobile'
};

export const axisLayoutPresetLabel = (kind: AxisLayoutPresetKind): string => PRESET_LABELS[kind] ?? PRESET_LABELS.default;

/** Zone-id map: design zone token → Axis widget-zone id. */
const ZONE: Record<string, string> = {
  tl: 'top.left',
  tc: 'top.center',
  tr: 'top.right',
  rail: 'rail',
  bottom: 'bottom',
  gridbar: 'gridbar',
  right: 'right',
  left: 'left',
  float: 'floating',
  hidden: 'hidden'
};

/** Widget-kind map: design widget id → Axis widget type. */
const WIDGET_TYPE: Record<string, string> = {
  preset: 'axis.preset',
  scenes: 'axis.scenes',
  view: 'axis.view',
  add: 'axis.addBlock',
  tuner: 'axis.tuner',
  tempo: 'axis.tempo',
  cpu: 'axis.cpu',
  save: 'axis.save',
  search: 'axis.search',
  history: 'axis.history',
  map: 'axis.gridMap',
  undo: 'axis.undoRedo',
  account: 'axis.account',
  meter: 'axis.meterToggle',
  gridmode: 'axis.gridMode',
  blocksize: 'axis.blockSize',
  hint: 'axis.hint',
  legal: 'axis.legal'
};

type Density = 'expanded' | 'compact' | 'mini';

interface PresetWidget {
  zone: string;
  order: number;
  density: Density;
  group: string | null;
}

interface AxisPresetSpec {
  navMode: 'side' | 'bottom';
  contentMode: 'fixed' | 'pages';
  presetMode: 'flyout' | 'page';
  editorMode: 'drawer' | 'floating' | 'right' | 'left';
  rightW: number;
  widgets: Record<string, PresetWidget>;
}

const W = (zone: string, order: number, density: Density = 'expanded', group: string | null = null): PresetWidget => ({
  zone,
  order,
  density,
  group
});

/**
 * The six preset specs, quoted verbatim (kind → keys) from `01-shell.md` §3.
 * Widget keys are the design ids; zones/densities are translated below.
 */
const PRESET_SPECS: Record<AxisLayoutPresetKind, AxisPresetSpec> = {
  default: {
    navMode: 'side',
    contentMode: 'fixed',
    presetMode: 'flyout',
    editorMode: 'drawer',
    rightW: 340,
    widgets: {
      preset: W('tl', 0),
      scenes: W('tl', 1),
      view: W('tr', 0),
      add: W('tr', 1),
      tuner: W('tr', 2, 'expanded', 'status'),
      tempo: W('tr', 3, 'expanded', 'status'),
      cpu: W('tr', 4, 'expanded', 'status'),
      save: W('tr', 5),
      gridmode: W('gridbar', 0),
      blocksize: W('gridbar', 1),
      history: W('rail', 0, 'compact'),
      account: W('rail', 1, 'compact'),
      search: W('hidden', 0),
      map: W('hidden', 0),
      undo: W('hidden', 0)
    }
  },
  stage: {
    navMode: 'bottom',
    contentMode: 'pages',
    presetMode: 'page',
    editorMode: 'floating',
    rightW: 340,
    widgets: {
      preset: W('tl', 0),
      tuner: W('tl', 1),
      scenes: W('tc', 0),
      tempo: W('tr', 0),
      save: W('tr', 1),
      view: W('hidden', 0),
      add: W('hidden', 0),
      cpu: W('hidden', 0),
      search: W('hidden', 0),
      history: W('hidden', 0),
      map: W('hidden', 0),
      undo: W('hidden', 0),
      account: W('hidden', 0)
    }
  },
  studio: {
    navMode: 'side',
    contentMode: 'fixed',
    presetMode: 'flyout',
    editorMode: 'right',
    rightW: 400,
    widgets: {
      preset: W('tl', 0),
      search: W('tl', 1),
      scenes: W('tl', 2),
      view: W('tr', 0),
      add: W('tr', 1),
      cpu: W('tr', 2),
      save: W('tr', 3),
      gridmode: W('gridbar', 0),
      blocksize: W('gridbar', 1),
      tuner: W('right', 0),
      tempo: W('right', 1),
      map: W('right', 2),
      history: W('rail', 0, 'compact'),
      account: W('rail', 1, 'compact'),
      undo: W('hidden', 0)
    }
  },
  compact: {
    navMode: 'side',
    contentMode: 'fixed',
    presetMode: 'flyout',
    editorMode: 'drawer',
    rightW: 320,
    widgets: {
      preset: W('tl', 0, 'compact'),
      scenes: W('tl', 1, 'compact'),
      add: W('tr', 0, 'compact'),
      save: W('tr', 1, 'compact'),
      view: W('hidden', 0),
      tuner: W('hidden', 0),
      tempo: W('hidden', 0),
      cpu: W('hidden', 0),
      search: W('hidden', 0),
      history: W('hidden', 0),
      map: W('hidden', 0),
      undo: W('hidden', 0),
      account: W('rail', 0, 'compact')
    }
  },
  tablet: {
    navMode: 'bottom',
    contentMode: 'pages',
    presetMode: 'page',
    editorMode: 'drawer',
    rightW: 320,
    widgets: {
      preset: W('tl', 0),
      scenes: W('tc', 0),
      tuner: W('tr', 0),
      save: W('tr', 1),
      add: W('bottom', 0, 'compact'),
      view: W('hidden', 0),
      tempo: W('hidden', 0),
      cpu: W('hidden', 0),
      search: W('hidden', 0),
      history: W('hidden', 0),
      map: W('hidden', 0),
      undo: W('hidden', 0),
      account: W('hidden', 0)
    }
  },
  mobile: {
    // V14d: phones get the persistent bottom nav bar by default — the hamburger
    // + drawer is a side-mode affordance and the wrong default at phone width.
    navMode: 'bottom',
    contentMode: 'pages',
    presetMode: 'page',
    editorMode: 'drawer',
    rightW: 300,
    widgets: {
      preset: W('tl', 0, 'compact'),
      save: W('tr', 0, 'mini'),
      scenes: W('bottom', 0, 'compact'),
      add: W('bottom', 1, 'mini'),
      view: W('hidden', 0),
      tuner: W('hidden', 0),
      tempo: W('hidden', 0),
      cpu: W('hidden', 0),
      search: W('hidden', 0),
      history: W('hidden', 0),
      map: W('hidden', 0),
      undo: W('hidden', 0),
      account: W('hidden', 0),
      gridmode: W('hidden', 0),
      blocksize: W('hidden', 0)
    }
  }
};

const densityToSize = (density: Density): WidgetSize =>
  density === 'mini' ? 'mini' : density === 'compact' ? 'compact' : 'default';

/** Stable widget instance id per design widget kind (matches the default doc). */
const WIDGET_INSTANCE_ID: Record<string, string> = {
  preset: 'axis.widget.preset',
  scenes: 'axis.widget.scenes',
  view: 'axis.widget.view',
  add: 'axis.widget.addBlock',
  tuner: 'axis.widget.tuner',
  tempo: 'axis.widget.tempo',
  cpu: 'axis.widget.cpu',
  save: 'axis.widget.save',
  search: 'axis.widget.search',
  history: 'axis.widget.history',
  map: 'axis.widget.gridMap',
  undo: 'axis.widget.undoRedo',
  account: 'axis.widget.account',
  meter: 'axis.widget.meterToggle',
  gridmode: 'axis.widget.gridMode',
  blocksize: 'axis.widget.blockSize',
  hint: 'axis.widget.hint',
  legal: 'axis.widget.legal'
};

/** Widgets that carry a fixed rail-footer slot / lock in every preset. */
const RAIL_FOOTER_KINDS = new Set(['account']);

/**
 * Persistent zones on top of the default set: the legacy `right`/`left` dock
 * zones (studio places tuner/tempo/map into `right`) and the custom-panel zone.
 */
function createAxisPresetZones(): WidgetZoneLayout {
  const zones = createDefaultWidgetZoneLayout();
  zones.left = { id: 'left', orientation: 'vertical', acceptsGroups: true };
  zones.right = { id: 'right', orientation: 'vertical', acceptsGroups: true };
  zones['panel:axis.customPanel'] = {
    id: 'panel:axis.customPanel',
    label: 'Custom Panel',
    orientation: 'horizontal',
    acceptsGroups: true
  };
  return zones;
}

function buildWidgets(spec: AxisPresetSpec): {
  widgets: Record<string, WidgetInstance>;
  groups: WorkbenchLayout['widgetGroups'];
} {
  const widgets: Record<string, WidgetInstance> = {};
  const groupMembers: Record<string, string[]> = {};

  for (const [kind, w] of Object.entries(spec.widgets)) {
    const type = WIDGET_TYPE[kind];
    const id = WIDGET_INSTANCE_ID[kind];
    if (!type || !id) continue;
    const zone = ZONE[w.zone] ?? w.zone;
    const state: JsonObject = {};
    if (RAIL_FOOTER_KINDS.has(kind)) state.fixedSlot = 'rail.footer';
    if (kind === 'gridmode') state.mode = 'auto';
    if (kind === 'blocksize') state.size = 'M';

    const instance: WidgetInstance = {
      id,
      type,
      zone,
      order: w.order,
      size: densityToSize(w.density)
    };
    if (w.group) {
      const groupId = `axis.group.${w.group}`;
      instance.groupId = groupId;
      (groupMembers[groupId] ??= []).push(id);
    }
    if (RAIL_FOOTER_KINDS.has(kind)) instance.locked = true;
    if (Object.keys(state).length) instance.state = state;
    widgets[id] = instance;
  }

  const groups: WorkbenchLayout['widgetGroups'] = {};
  for (const [groupId, widgetIds] of Object.entries(groupMembers)) {
    // A widget group needs at least two members to be meaningful; a lone member
    // is repaired away, so drop the group ref instead of leaving a dangling one.
    if (widgetIds.length < 2) {
      for (const wid of widgetIds) widgets[wid].groupId = null;
      continue;
    }
    groups[groupId] = { id: groupId, widgetIds };
  }
  return { widgets, groups };
}

/**
 * Build the dock tree for a preset. Panel visibility mirrors the design default
 * (`place:{grid:"main", editor:"bottom", fc:"bottom", history:"right", presets:"left"}`,
 * only the grid visible initially) while `presetMode:"page"` presets (stage /
 * tablet / mobile) drop the docked preset browser — the browser is a full page
 * in those modes, not a left dock. Editor placement follows `editorMode`.
 */
function buildDock(kind: AxisLayoutPresetKind, spec: AxisPresetSpec): DockLayout {
  const dock = createEmptyDockLayout();
  const tabs = (panelIds: string[], active = panelIds[0]): DockNode => ({
    kind: 'tabs',
    id: createWorkbenchId('tabs'),
    panelIds,
    activePanelId: active
  });

  dock.root.main = tabs(['axis.signalGrid']);

  // Editor + FC share the bottom drawer unless the editor docks to a side.
  const editorRegion =
    spec.editorMode === 'right' ? 'right' : spec.editorMode === 'left' ? 'left' : 'bottom';
  if (editorRegion === 'bottom') {
    dock.root.bottom = tabs(['axis.blockEditor', 'axis.fc'], 'axis.blockEditor');
  } else {
    dock.root[editorRegion] = tabs(['axis.blockEditor']);
    dock.root.bottom = tabs(['axis.fc']);
  }

  // History docks right (unless the editor already claimed right — then tab in).
  if (editorRegion === 'right') {
    const right = dock.root.right as Extract<DockNode, { kind: 'tabs' }>;
    right.panelIds.push('axis.history');
  } else {
    dock.root.right = tabs(['axis.history']);
  }

  // Preset browser: docked left only in flyout mode; page mode keeps it undocked.
  if (spec.presetMode === 'flyout') {
    if (dock.root.left && dock.root.left.kind === 'tabs') {
      dock.root.left.panelIds.push('axis.presetBrowser');
    } else {
      dock.root.left = tabs(['axis.presetBrowser']);
    }
  }

  dock.regions.left.sizePx = 320;
  dock.regions.right.sizePx = spec.rightW;
  dock.regions.bottom.sizePx = 360;
  return dock;
}

function buildNavigation(spec: AxisPresetSpec): WorkbenchLayout['navigation'] {
  const nav = (
    id: string,
    label: string,
    command: string,
    extra: Partial<NavigationEntryState> = {}
  ): NavigationEntryState => ({ id, label, hidden: false, target: { command }, ...extra });

  return {
    mode: spec.navMode,
    entries: {
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
    },
    order: ['grid', 'library', 'fc', 'controllers', 'scenes', 'live', 'setup', 'theme', 'account']
  };
}

export interface CreateAxisLayoutPresetOptions {
  /** Layout id to use. Defaults to a freshly minted `layout-*` id. */
  layoutId?: string;
  /** Layout label. Defaults to `Axis <Kind>`. */
  label?: string;
  /** Override `rightW` (e.g. preserve the current profile's width on re-apply). */
  rightW?: number;
}

/**
 * Build a complete `WorkbenchLayout` for one preset kind. The layout composes
 * the shared panel roster + preset widget/dock/nav layout. Design flags
 * (`navMode`/`contentMode`/`presetMode`/`editorMode`/`rightW`/`activePreset`)
 * are stored in `layout.settings`.
 */
export function createAxisLayoutPreset(
  kind: AxisLayoutPresetKind,
  options: CreateAxisLayoutPresetOptions = {}
): WorkbenchLayout {
  const spec = PRESET_SPECS[kind] ?? PRESET_SPECS.default;
  const rightW = options.rightW ?? spec.rightW;
  const { widgets, groups } = buildWidgets(spec);
  // Pages (schema v2): every preset ships a single default page carrying the
  // whole preset dock — page bindings/splits are a user-level operation later.
  const page = createEmptyWorkbenchPage({ dock: buildDock(kind, { ...spec, rightW }) });
  const layout: WorkbenchLayout = {
    id: options.layoutId ?? createWorkbenchId('layout'),
    label: options.label ?? `Axis ${axisLayoutPresetLabel(kind)}`,
    pages: { [page.id]: page },
    pageOrder: [page.id],
    activePageId: page.id,
    panels: createAxisWorkbenchPanels(),
    widgets,
    widgetGroups: groups,
    navigation: buildNavigation(spec),
    zones: createAxisPresetZones(),
    settings: {
      presetKind: kind,
      activePreset: AXIS_LAYOUT_TAB_KINDS.includes(kind as AxisLayoutTabKind) ? kind : 'default',
      navMode: spec.navMode,
      contentMode: spec.contentMode,
      presetMode: spec.presetMode,
      editorMode: spec.editorMode,
      rightW
    }
  };
  return layout;
}
