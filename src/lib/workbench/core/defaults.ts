import { createIdGenerator, type WorkbenchIdGenerator } from './ids';
import {
  DEFAULT_WIDGET_ZONES,
  DOCK_REGION_IDS,
  WORKBENCH_SCHEMA_VERSION,
  type DockLayout,
  type DockRegionId,
  type JsonObject,
  type NavigationLayout,
  type WidgetZoneLayout,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchPage,
  type WorkbenchProfile
} from './schema';

export interface EmptyWorkbenchDocumentOptions {
  idGenerator?: WorkbenchIdGenerator;
  profileId?: string;
  profileLabel?: string;
  layoutId?: string;
  layoutLabel?: string;
  pageId?: string;
  pageLabel?: string;
  metadata?: JsonObject;
}

/**
 * Default id/label for the page created when a layout has none — also the page
 * a migrated schema-v1 single-dock layout is wrapped into. Deliberately generic
 * (framework-neutral): apps rename/re-bind pages afterwards.
 */
export const DEFAULT_WORKBENCH_PAGE_ID = 'main';
export const DEFAULT_WORKBENCH_PAGE_LABEL = 'Main';

export const createEmptyDockLayout = (): DockLayout => ({
  regions: DOCK_REGION_IDS.reduce(
    (acc, region) => {
      acc[region] = { collapsed: false };
      return acc;
    },
    {} as Record<DockRegionId, { collapsed: boolean }>
  ),
  root: DOCK_REGION_IDS.reduce(
    (acc, region) => {
      acc[region] = null;
      return acc;
    },
    {} as Record<DockRegionId, null>
  )
});

export const createDefaultWidgetZoneLayout = (): WidgetZoneLayout =>
  DEFAULT_WIDGET_ZONES.reduce((acc, id) => {
    acc[id] = {
      id,
      orientation: id === 'rail' ? 'vertical' : id === 'floating' ? 'free' : 'horizontal',
      acceptsGroups: id !== 'hidden'
    };
    return acc;
  }, {} as WidgetZoneLayout);

export const createEmptyNavigationLayout = (): NavigationLayout => ({
  mode: 'side',
  entries: {},
  order: []
});

export interface EmptyWorkbenchPageOptions {
  id?: string;
  label?: string;
  icon?: string;
  dock?: WorkbenchPage['dock'];
}

export const createEmptyWorkbenchPage = (options: EmptyWorkbenchPageOptions = {}): WorkbenchPage => ({
  id: options.id ?? DEFAULT_WORKBENCH_PAGE_ID,
  label: options.label ?? DEFAULT_WORKBENCH_PAGE_LABEL,
  ...(options.icon ? { icon: options.icon } : {}),
  dock: options.dock ?? createEmptyDockLayout()
});

export function createEmptyWorkbenchDocument(options: EmptyWorkbenchDocumentOptions = {}): WorkbenchDocument {
  const ids = options.idGenerator ?? createIdGenerator();
  const layoutId = options.layoutId ?? ids.next('layout');
  const profileId = options.profileId ?? ids.next('profile');

  const page = createEmptyWorkbenchPage({ id: options.pageId, label: options.pageLabel });

  const layout: WorkbenchLayout = {
    id: layoutId,
    label: options.layoutLabel ?? 'Default Layout',
    pages: { [page.id]: page },
    pageOrder: [page.id],
    activePageId: page.id,
    panels: {},
    widgets: {},
    widgetGroups: {},
    navigation: createEmptyNavigationLayout(),
    zones: createDefaultWidgetZoneLayout(),
    settings: {}
  };

  const profile: WorkbenchProfile = {
    id: profileId,
    label: options.profileLabel ?? 'Default',
    layoutId
  };

  return {
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    activeProfileId: profileId,
    profiles: { [profileId]: profile },
    layouts: { [layoutId]: layout },
    panelLibrary: {},
    widgetLibrary: {},
    pageLayouts: {},
    metadata: options.metadata ?? {}
  };
}
