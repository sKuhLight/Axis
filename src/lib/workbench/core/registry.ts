import type {
  DockRegionId,
  JsonObject,
  PanelInstance,
  WidgetInstance,
  WidgetSize,
  WidgetZoneId
} from './schema';

export interface PanelDefinition {
  type: string;
  title: string;
  version: number;
  singleton?: boolean;
  allowedRegions?: DockRegionId[];
  defaultState?: () => JsonObject;
  locked?: boolean;
  closable?: boolean;
  collapsible?: boolean;
}

export interface WidgetDefinition {
  type: string;
  title: string;
  version: number;
  allowedZones?: WidgetZoneId[];
  sizeVariants?: WidgetSize[];
  defaultSize?: WidgetSize;
  defaultState?: () => JsonObject;
  locked?: boolean;
  hideable?: boolean;
}

export interface RegistryResult {
  success: boolean;
  error?: string;
}

export class WorkbenchRegistry {
  #panels = new Map<string, PanelDefinition>();
  #widgets = new Map<string, WidgetDefinition>();

  registerPanel(definition: PanelDefinition): RegistryResult {
    if (this.#panels.has(definition.type)) {
      return { success: false, error: `Panel type already registered: ${definition.type}` };
    }
    this.#panels.set(definition.type, { ...definition });
    return { success: true };
  }

  registerWidget(definition: WidgetDefinition): RegistryResult {
    if (this.#widgets.has(definition.type)) {
      return { success: false, error: `Widget type already registered: ${definition.type}` };
    }
    this.#widgets.set(definition.type, { ...definition });
    return { success: true };
  }

  getPanel(type: string): PanelDefinition | undefined {
    const definition = this.#panels.get(type);
    return definition ? { ...definition } : undefined;
  }

  getWidget(type: string): WidgetDefinition | undefined {
    const definition = this.#widgets.get(type);
    return definition ? { ...definition } : undefined;
  }

  hasPanel(type: string): boolean {
    return this.#panels.has(type);
  }

  hasWidget(type: string): boolean {
    return this.#widgets.has(type);
  }
}

export const createWorkbenchRegistry = (): WorkbenchRegistry => new WorkbenchRegistry();

export const isKnownPanelInstance = (registry: WorkbenchRegistry, panel: PanelInstance): boolean =>
  registry.hasPanel(panel.type);

export const isKnownWidgetInstance = (registry: WorkbenchRegistry, widget: WidgetInstance): boolean =>
  registry.hasWidget(widget.type);
