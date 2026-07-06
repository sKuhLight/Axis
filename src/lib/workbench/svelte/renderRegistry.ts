import type { Component } from 'svelte';
import type { JsonObject, NavigationEntryState, PanelInstance, WidgetInstance, WorkbenchCommand } from '../core';
import type { WorkbenchController } from './controller.svelte';

export type WorkbenchPanelComponent = Component<any>;
export type WorkbenchWidgetComponent = Component<any>;
export type WorkbenchNavigationComponent = Component<any>;
export type WorkbenchActionSource = 'navigation' | 'panel' | 'widget' | 'menu' | 'host';

export interface WorkbenchActionContext {
  controller: WorkbenchController;
  source: WorkbenchActionSource;
  entry?: NavigationEntryState;
  panel?: PanelInstance;
  widget?: WidgetInstance;
  args?: JsonObject;
}

export interface WorkbenchActionHandler {
  id: string;
  run: (context: WorkbenchActionContext) => void | Promise<void>;
}

export interface WorkbenchActionError {
  actionId: string;
  message: string;
  cause?: unknown;
}

export type WorkbenchActionResult =
  | { handled: false; success: false; error?: undefined }
  | { handled: true; success: true; error?: undefined }
  | { handled: true; success: false; error: WorkbenchActionError };

export interface WorkbenchPanelRenderer {
  type: string;
  component: WorkbenchPanelComponent;
}

export interface WorkbenchWidgetRenderer {
  type: string;
  component: WorkbenchWidgetComponent;
}

export interface WorkbenchNavigationRenderer {
  id: string;
  component: WorkbenchNavigationComponent;
}

/**
 * App-provided widget sizing data for the generic auto-fit
 * (`workbench/core/widgetFit.ts`). The generic layer holds no widget-type
 * knowledge — apps register their `estW` table and keep-set here. When absent,
 * WidgetZone falls back to a flat per-widget estimate.
 */
export interface WorkbenchWidgetSizingProvider {
  /** Design `estW` for a widget type (member width; summed for groups). */
  estWidth: (type: string) => number;
  /** Whether a widget type is keep-protected (never sheds into `⋯`). */
  isKeep?: (type: string) => boolean;
}

export class WorkbenchRenderRegistry {
  #panels = new Map<string, WorkbenchPanelComponent>();
  #widgets = new Map<string, WorkbenchWidgetComponent>();
  #navigation = new Map<string, WorkbenchNavigationComponent>();
  #actions = new Map<string, WorkbenchActionHandler['run']>();
  #widgetSizing: WorkbenchWidgetSizingProvider | null = null;
  #lastActionResult: WorkbenchActionResult | null = null;

  constructor(
    private readonly fallbackPanel?: WorkbenchPanelComponent,
    private readonly fallbackWidget?: WorkbenchWidgetComponent,
    private readonly fallbackNavigation?: WorkbenchNavigationComponent
  ) {}

  registerPanel(renderer: WorkbenchPanelRenderer): void {
    this.#panels.set(renderer.type, renderer.component);
  }

  registerWidget(renderer: WorkbenchWidgetRenderer): void {
    this.#widgets.set(renderer.type, renderer.component);
  }

  registerNavigation(renderer: WorkbenchNavigationRenderer): void {
    this.#navigation.set(renderer.id, renderer.component);
  }

  registerAction(handler: WorkbenchActionHandler): void {
    this.#actions.set(handler.id, handler.run);
  }

  registerWidgetSizing(provider: WorkbenchWidgetSizingProvider): void {
    this.#widgetSizing = provider;
  }

  get widgetSizing(): WorkbenchWidgetSizingProvider | null {
    return this.#widgetSizing;
  }

  panel(type: string): WorkbenchPanelComponent | undefined {
    return this.#panels.get(type) ?? this.fallbackPanel;
  }

  widget(type: string): WorkbenchWidgetComponent | undefined {
    return this.#widgets.get(type) ?? this.fallbackWidget;
  }

  navigation(id: string): WorkbenchNavigationComponent | undefined {
    return this.#navigation.get(id) ?? this.fallbackNavigation;
  }

  hasPanel(type: string): boolean {
    return this.#panels.has(type);
  }

  hasWidget(type: string): boolean {
    return this.#widgets.has(type);
  }

  hasNavigation(id: string): boolean {
    return this.#navigation.has(id);
  }

  hasAction(id: string): boolean {
    return this.#actions.has(id);
  }

  get lastActionResult(): WorkbenchActionResult | null {
    return this.#lastActionResult;
  }

  runAction(id: string, context: WorkbenchActionContext): boolean {
    const run = this.#actions.get(id);
    if (!run) return false;
    void this.runActionResult(id, context);
    return true;
  }

  async runActionResult(id: string, context: WorkbenchActionContext): Promise<WorkbenchActionResult> {
    const run = this.#actions.get(id);
    if (!run) {
      this.#lastActionResult = { handled: false, success: false };
      return this.#lastActionResult;
    }
    try {
      await run(context);
      this.#lastActionResult = { handled: true, success: true };
      return this.#lastActionResult;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.#lastActionResult = {
        handled: true,
        success: false,
        error: { actionId: id, message, cause }
      };
      return this.#lastActionResult;
    }
  }
}

export const createWorkbenchRenderRegistry = (
  fallbackPanel?: WorkbenchPanelComponent,
  fallbackWidget?: WorkbenchWidgetComponent,
  fallbackNavigation?: WorkbenchNavigationComponent
): WorkbenchRenderRegistry => new WorkbenchRenderRegistry(fallbackPanel, fallbackWidget, fallbackNavigation);
