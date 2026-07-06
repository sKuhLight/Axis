import type {
  DockAxis,
  DockRegionId,
  FloatingRect,
  JsonObject,
  PanelInstance,
  PanelTemplate,
  WidgetInstance,
  WidgetSize,
  WidgetZoneState,
  WidgetTemplate,
  WidgetZoneId,
  WorkbenchDocument,
  WorkbenchLayout,
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
  | 'missing-panel'
  | 'missing-profile'
  | 'missing-split'
  | 'missing-target'
  | 'missing-template'
  | 'missing-widget'
  | 'missing-zone'
  | 'protected-layout'
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
  | { type: 'panel.close'; panelId: string }
  | { type: 'panel.move'; panelId: string; to: DockTarget }
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
