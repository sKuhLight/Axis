import {
  WORKBENCH_SCHEMA_VERSION,
  cloneWorkbenchDocument,
  isJsonSerializable,
  selectActiveLayout,
  type PanelTemplate,
  type WidgetTemplate,
  type WorkbenchCommand,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchProfile
} from './core';

export const WORKBENCH_PACKAGE_VERSION = 1 as const;
export const WORKBENCH_PACKAGE_FORMAT = 'workbench.package' as const;

export type WorkbenchPackageKind = 'layout' | 'profile' | 'panelTemplate' | 'widgetTemplate';

export type WorkbenchPackagePayload = WorkbenchLayout | WorkbenchProfile | PanelTemplate | WidgetTemplate;

export interface WorkbenchPackage<T extends WorkbenchPackagePayload = WorkbenchPackagePayload> {
  format: typeof WORKBENCH_PACKAGE_FORMAT;
  packageVersion: typeof WORKBENCH_PACKAGE_VERSION;
  schemaVersion: typeof WORKBENCH_SCHEMA_VERSION;
  kind: WorkbenchPackageKind;
  payload: T;
  metadata?: {
    title?: string;
    sourceId?: string;
  };
}

export type WorkbenchPackageResult<T extends WorkbenchPackagePayload = WorkbenchPackagePayload> =
  | { success: true; package: WorkbenchPackage<T> }
  | { success: false; error: string };

const clone = <T>(value: T): T => cloneWorkbenchDocument(value as never) as T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!used.has(id)) return id;
  }
}

export function createWorkbenchPackage<T extends WorkbenchPackagePayload>(
  kind: WorkbenchPackageKind,
  payload: T,
  metadata: WorkbenchPackage['metadata'] = {}
): WorkbenchPackage<T> {
  return {
    format: WORKBENCH_PACKAGE_FORMAT,
    packageVersion: WORKBENCH_PACKAGE_VERSION,
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    kind,
    payload: clone(payload),
    metadata: clone(metadata)
  };
}

export function parseWorkbenchPackage(input: unknown): WorkbenchPackageResult {
  if (!isRecord(input)) return { success: false, error: 'Workbench package must be an object.' };
  if (input.format !== WORKBENCH_PACKAGE_FORMAT) return { success: false, error: 'Unsupported Workbench package format.' };
  if (input.packageVersion !== WORKBENCH_PACKAGE_VERSION) return { success: false, error: 'Unsupported Workbench package version.' };
  if (input.schemaVersion !== WORKBENCH_SCHEMA_VERSION) return { success: false, error: 'Unsupported Workbench schema version.' };
  if (!['layout', 'profile', 'panelTemplate', 'widgetTemplate'].includes(String(input.kind))) {
    return { success: false, error: 'Unsupported Workbench package kind.' };
  }
  if (!isJsonSerializable(input.payload)) return { success: false, error: 'Workbench package payload must be JSON serializable.' };

  return {
    success: true,
    package: input as unknown as WorkbenchPackage
  };
}

export function packageActiveLayout(doc: WorkbenchDocument): WorkbenchPackage<WorkbenchLayout> | null {
  const layout = selectActiveLayout(doc);
  return layout ? createWorkbenchPackage('layout', layout, { title: layout.label, sourceId: layout.id }) : null;
}

export function packageLayout(doc: WorkbenchDocument, layoutId: string): WorkbenchPackage<WorkbenchLayout> | null {
  const layout = doc.layouts[layoutId];
  return layout ? createWorkbenchPackage('layout', layout, { title: layout.label, sourceId: layout.id }) : null;
}

export function packageProfile(doc: WorkbenchDocument, profileId: string): WorkbenchPackage<WorkbenchProfile> | null {
  const profile = doc.profiles[profileId];
  return profile ? createWorkbenchPackage('profile', profile, { title: profile.label, sourceId: profile.id }) : null;
}

export function packagePanelTemplate(doc: WorkbenchDocument, templateId: string): WorkbenchPackage<PanelTemplate> | null {
  const template = doc.panelLibrary[templateId];
  return template ? createWorkbenchPackage('panelTemplate', template, { title: template.title, sourceId: template.id }) : null;
}

export function packageWidgetTemplate(doc: WorkbenchDocument, templateId: string): WorkbenchPackage<WidgetTemplate> | null {
  const template = doc.widgetLibrary[templateId];
  return template ? createWorkbenchPackage('widgetTemplate', template, { title: template.title, sourceId: template.id }) : null;
}

export interface ImportWorkbenchPackageOptions {
  id?: string;
  overwrite?: boolean;
}

export function importWorkbenchPackageCommands(
  doc: WorkbenchDocument,
  workbenchPackage: WorkbenchPackage,
  options: ImportWorkbenchPackageOptions = {}
): WorkbenchCommand[] {
  const payload = clone(workbenchPackage.payload);
  switch (workbenchPackage.kind) {
    case 'layout': {
      const layout = payload as WorkbenchLayout;
      layout.id = options.id ?? (options.overwrite ? layout.id : uniqueId(layout.id, new Set(Object.keys(doc.layouts))));
      return [{ type: 'layout.save', layout }];
    }
    case 'profile': {
      const profile = payload as WorkbenchProfile;
      profile.id = options.id ?? (options.overwrite ? profile.id : uniqueId(profile.id, new Set(Object.keys(doc.profiles))));
      return [{ type: 'profile.add', profile }];
    }
    case 'panelTemplate': {
      const template = payload as PanelTemplate;
      template.id = options.id ?? (options.overwrite ? template.id : uniqueId(template.id, new Set(Object.keys(doc.panelLibrary))));
      return [{ type: 'library.panel.save', template }];
    }
    case 'widgetTemplate': {
      const template = payload as WidgetTemplate;
      template.id = options.id ?? (options.overwrite ? template.id : uniqueId(template.id, new Set(Object.keys(doc.widgetLibrary))));
      return [{ type: 'library.widget.save', template }];
    }
  }
}
