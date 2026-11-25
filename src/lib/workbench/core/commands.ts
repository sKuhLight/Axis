import type {
  DockAxis,
  DockLayout,
  DockRegionId,
  FloatingRect,
  JsonObject,
  NavigationEntryState,
  PanelInstance,
  PanelTemplate,
  WidgetInstance,
  WidgetSize,
  WidgetZoneState,
  WidgetTemplate,
  WidgetZoneId,
  WorkbenchDocument,
  WorkbenchLayout,
  WorkbenchPage,
  WorkbenchPageLayout,
  WorkbenchProfile
} from './schema';

export type WorkbenchErrorCode =
  | 'active-layout-missing'
  | 'active-profile-missing'
  | 'duplicate-id'
  | 'duplicate-singleton'
  | 'invalid-command'
  | 'invalid-region'
  | 'locked-navigation'
  | 'locked-panel'
  | 'locked-widget'
  | 'locked-widget-group'
  | 'missing-layout'
  | 'missing-navigation'
  | 'missing-page'
  | 'missing-page-layout'
  | 'missing-panel'
  | 'missing-profile'
  | 'missing-split'
  | 'missing-target'
  | 'missing-template'
  | 'missing-widget'
  | 'missing-zone'
  | 'protected-layout'
  | 'protected-page'
  | 'protected-profile'
  | 'protected-zone';

export interface WorkbenchCommandError {
  code: WorkbenchErrorCode;
  message: string;
}

export interface WorkbenchCommandResult {
  success: boolean;
  next: WorkbenchDocument;
  error?: WorkbenchCommandError;
  warnings?: string[];
}

export type DockTarget =
  | { kind: 'region'; region: DockRegionId; index?: number }
  | { kind: 'tab'; targetPanelId?: string; tabStackId?: string; index?: number }
  | {
      kind: 'split';
      region?: DockRegionId;
      targetPanelId?: string;
      axis: DockAxis;
      position?: 'before' | 'after';
    };

export type WorkbenchCommand =
  | { type: 'panel.add'; panel: PanelInstance; region: DockRegionId; target?: DockTarget }
  // panel.create adds a PARKED instance: it lives in `layout.panels` without
  // being docked on any page (a later panel.move / page.add / page.setDock
  // docks it). Rejects an existing id and a duplicate singleton like panel.add.
  | { type: 'panel.create'; panel: PanelInstance }
  // panel.close is the HARD delete: the instance leaves every page, its owned
  // widgets move to `hidden`, and the instance is deleted. Locked panels are
  // rejected — except a keyless copy of a single-instance panel (another panel
  // of the same type carries the singleton key).
  | { type: 'panel.close'; panelId: string }
  // panel.remove PARKS the panel: it leaves every page dock but the instance
  // (state, title, owned widget zone + widgets) stays in `layout.panels`, so it
  // can be docked again. Locked panels are rejected, like panel.close.
  | { type: 'panel.remove'; panelId: string }
  // panel.move: `pageId` (optional) applies `to` to THAT page's dock instead of
  // the active page's; the active page stays as it is.
  | { type: 'panel.move'; panelId: string; to: DockTarget; pageId?: string }
  | { type: 'panel.tab'; panelId: string; targetPanelId: string; index?: number }
  | { type: 'panel.activate'; panelId: string }
  | {
      type: 'panel.split';
      panel?: PanelInstance;
      panelId?: string;
      region?: DockRegionId;
      targetPanelId?: string;
      axis: DockAxis;
      position?: 'before' | 'after';
    }
  | { type: 'panel.rename'; panelId: string; title: string }
  // panel.state merges functional panel state (a panel's own options — the grouping toggle of a custom
  // panel, a view choice): like widget.state it is not layout, so a locked panel may still change it.
  | { type: 'panel.state'; panelId: string; state: JsonObject }
  | { type: 'panel.collapse'; panelId: string; collapsed: boolean }
  | { type: 'region.resize'; region: DockRegionId; sizePx: number }
  | { type: 'region.collapse'; region: DockRegionId; collapsed: boolean }
  | { type: 'split.resize'; splitId: string; ratio: number[] }
  | { type: 'widget.add'; widget: WidgetInstance; zone: WidgetZoneId; index?: number }
  | { type: 'widget.move'; widgetIds: string[]; zone: WidgetZoneId; index?: number; floatingRect?: FloatingRect }
  | { type: 'widget.hide'; widgetIds: string[] }
  | { type: 'widget.resize'; widgetId: string; size: WidgetSize }
  | { type: 'widget.state'; widgetId: string; state: JsonObject }
  | {
      type: 'widget.group';
      widgetIds: string[];
      groupId?: string;
      zone?: WidgetZoneId;
      index?: number;
      // Explicit member sequence for the resulting group. When omitted the
      // reducer orders members by their current zone `order` (the create/append
      // default). When supplied it is used verbatim — this expresses a positional
      // in-group insert or an in-group reorder (V14b): the caller has already
      // computed where the moved member lands between its siblings.
      memberOrder?: string[];
    }
  | { type: 'widget.ungroup'; groupId: string }
  | { type: 'zone.ensure'; zone: WidgetZoneState }
  | { type: 'zone.rename'; zoneId: WidgetZoneId; label: string }
  | { type: 'zone.hide'; zoneId: WidgetZoneId; hidden: boolean }
  | { type: 'zone.delete'; zoneId: WidgetZoneId; moveWidgetsTo?: WidgetZoneId }
  // ── Pages ──────────────────────────────────────────────────────────────
  // Every dock-scoped command above (panel.*, region.*, split.resize)
  // implicitly targets the ACTIVE page's dock.
  //
  // page.add inserts the page (+ a navigation entry bound to it — either the
  // provided one or a default derived from the page id/label/icon) at `index`
  // in pageOrder and at `navIndex` (default: `index`) in navigation order. It
  // does NOT activate the page. The page's dock may reference existing panels:
  // parked ones get docked; a panel already docked on ANOTHER page stays there
  // (the reference is dropped — a new page never takes a panel away).
  // `navEntry: null` adds the page WITHOUT a navigation entry.
  | { type: 'page.add'; page: WorkbenchPage; index?: number; navIndex?: number; navEntry?: NavigationEntryState | null }
  // page.remove drops the page and its bound nav entries. Its panels are
  // PARKED, never deleted (instances, state and owned widgets stay). Removing
  // the last page is rejected; removing the active page activates the nearest
  // remaining page by order.
  | { type: 'page.remove'; pageId: string }
  // page.setDock replaces a page's dock (omitted = clear the page: the region
  // sizes stay, every root empties).
  // Panels on the page that the new dock does not reference are PARKED. The
  // new dock may reference parked panels; references to missing panels and to
  // panels docked on ANOTHER page are dropped (those stay where they are).
  | { type: 'page.setDock'; pageId: string; dock?: DockLayout }
  // page.rename renames the page AND its bound navigation entries.
  | { type: 'page.rename'; pageId: string; label: string }
  // page.activate switches the rendered page. Excluded from layout history
  // (transient view state, like panel.activate / profile.activate).
  | { type: 'page.activate'; pageId: string }
  // page.duplicate deep-copies the page with freshly minted dock-node ids and
  // panel-instance ids, inserts it after the source, and binds a new nav entry.
  | { type: 'page.duplicate'; pageId: string; newPageId?: string; label?: string }
  // page.move reorders a page within pageOrder and keeps the page-bound
  // navigation entries in the same sequence (non-page nav entries stay anchored).
  | { type: 'page.move'; pageId: string; index: number }
  // ── Page layouts (shared document-level store) ───────────────────────────
  // pageLayout.save stores a self-contained page snapshot; .apply re-mints it
  // onto the target page (default: active page), replacing that page's dock and
  // panels; .rename/.delete manage the store.
  | { type: 'pageLayout.save'; pageLayout: WorkbenchPageLayout }
  | { type: 'pageLayout.rename'; pageLayoutId: string; label: string }
  | { type: 'pageLayout.delete'; pageLayoutId: string }
  | { type: 'pageLayout.apply'; pageLayoutId: string; pageId?: string }
  | { type: 'navigation.move'; entryId: string; index: number }
  | { type: 'navigation.hide'; entryId: string }
  | { type: 'navigation.show'; entryId: string; index?: number }
  | { type: 'navigation.mode'; mode: 'side' | 'bottom' }
  | { type: 'profile.add'; profile: WorkbenchProfile }
  | { type: 'profile.activate'; profileId: string }
  | { type: 'profile.rename'; profileId: string; label: string }
  | { type: 'profile.setLayout'; profileId: string; layoutId: string }
  | { type: 'profile.delete'; profileId: string; fallbackProfileId?: string }
  | { type: 'layout.apply'; layoutId: string }
  | { type: 'layout.save'; layout: WorkbenchLayout }
  | { type: 'layout.rename'; layoutId: string; label: string }
  | { type: 'layout.delete'; layoutId: string }
  | { type: 'library.panel.save'; template: PanelTemplate }
  | { type: 'library.panel.rename'; templateId: string; title: string }
  | { type: 'library.panel.delete'; templateId: string }
  | { type: 'library.widget.save'; template: WidgetTemplate }
  | { type: 'library.widget.rename'; templateId: string; title: string }
  | { type: 'library.widget.delete'; templateId: string };
