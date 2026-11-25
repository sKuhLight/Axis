import type { Component } from 'svelte';
import type {
  CanonicalPanelSpec,
  CanonicalWidgetSpec,
  JsonObject,
  NavigationEntryState,
  PanelInstance,
  WidgetInstance,
  WorkbenchCommand,
  WorkbenchLayout,
  WorkbenchPage
} from '../core';
import type { WorkbenchController } from './controller.svelte';
import type { WorkbenchAddPaletteApi } from './addPalette';

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
  /**
   * Whether a widget type can render right now (e.g. the connected device has
   * the capability it needs). Unavailable widgets are skipped by WidgetZone —
   * not mounted and not counted by auto-fit — so they leave neither an empty
   * shell nor phantom width. Read inside reactive scope; absent = always
   * available.
   */
  isAvailable?: (type: string) => boolean;
}

/**
 * App-provided resolution of which navigation entry is currently "active" — the
 * one whose content section is in front (01-shell.md §9: active = current content
 * section). The generic layer holds no notion of app sections, so the app
 * registers this seam (mirrors `registerWidgetSizing`). NavigationHost tints the
 * entry `isActive` returns true for. This is transient UI state, so it lives here
 * (a render-time provider) and never mutates the document/schema.
 */
export interface WorkbenchNavigationStateProvider {
  /** Whether the given navigation entry id is the active section right now. */
  isActive: (entryId: string) => boolean;
}

/**
 * App-provided panel catalog data (data only): the canonical panels the app
 * always offers — so every panel can be added again, even one a stored document
 * lost — and the internal instance types kept out of the list while docked.
 * The generic Library drawer builds its catalog from this (core
 * `buildPanelCatalog`); without a provider it lists instances and templates.
 */
export interface WorkbenchPanelCatalogProvider {
  canonical: () => CanonicalPanelSpec[];
  hiddenTypes?: readonly string[];
}

/**
 * App-provided widget catalog data (data only): the built-in widget types the
 * Add palette always offers (core `buildWidgetCatalog`), and why a type cannot
 * be used right now (greyed, listed last). Without a provider the palette lists
 * hidden widgets and saved widget templates only.
 */
export interface WorkbenchWidgetCatalogProvider {
  canonical: () => CanonicalWidgetSpec[];
  /** Why a type is unavailable (e.g. the connected device lacks it), or null. Read inside reactive scope. */
  unavailableReason?: (type: string) => string | null;
}

/** Props of the host's Add palette component (see {@link WorkbenchRenderRegistry.registerAddPalette}). */
export interface WorkbenchAddPaletteProps {
  api: WorkbenchAddPaletteApi;
}

/**
 * A hint about the active page, shown in a slim bar above the dock workspace
 * (edit and view mode) — e.g. "Preset Browser is on page Grid · Bring it here".
 * The optional action dispatches `commands()` as ONE batch; a hint without an
 * action is text only.
 */
export interface WorkbenchPageHint {
  id: string;
  text: string;
  actionLabel?: string;
  commands?: () => WorkbenchCommand[];
}

export type WorkbenchPageHintProvider = (layout: WorkbenchLayout, page: WorkbenchPage) => WorkbenchPageHint[];

/**
 * When the hint bar shows: always while editing (the page is being arranged);
 * in view mode only when the page's main region is empty — a page that shows
 * content does not keep a bar the user cannot dismiss.
 */
export function shouldShowPageHints(input: { count: number; editMode: boolean; mainEmpty: boolean }): boolean {
  return input.count > 0 && (input.editMode || input.mainEmpty);
}

/**
 * Why a page cannot be deleted (e.g. "Used by the preset converter"), or null
 * when it can. The generic UI disables every Delete of that page with the reason.
 */
export type WorkbenchPageProtection = (page: WorkbenchPage) => string | null;

export class WorkbenchRenderRegistry {
  #panels = new Map<string, WorkbenchPanelComponent>();
  #widgets = new Map<string, WorkbenchWidgetComponent>();
  #navigation = new Map<string, WorkbenchNavigationComponent>();
  #actions = new Map<string, WorkbenchActionHandler['run']>();
  #widgetSizing: WorkbenchWidgetSizingProvider | null = null;
  #navigationState: WorkbenchNavigationStateProvider | null = null;
  #panelCatalog: WorkbenchPanelCatalogProvider | null = null;
  #pageHints: WorkbenchPageHintProvider | null = null;
  #pageProtection: WorkbenchPageProtection | null = null;
  #widgetCatalog: WorkbenchWidgetCatalogProvider | null = null;
  #addPalette: Component<WorkbenchAddPaletteProps> | null = null;
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

  registerNavigationState(provider: WorkbenchNavigationStateProvider): void {
    this.#navigationState = provider;
  }

  get navigationState(): WorkbenchNavigationStateProvider | null {
    return this.#navigationState;
  }

  registerPanelCatalogProvider(provider: WorkbenchPanelCatalogProvider): void {
    this.#panelCatalog = provider;
  }

  /** The app's canonical panels ([] without a provider). Read inside reactive scope. */
  canonicalPanels(): CanonicalPanelSpec[] {
    return this.#panelCatalog?.canonical() ?? [];
  }

  /** Instance types the catalog keeps out while docked. */
  get panelCatalogHiddenTypes(): readonly string[] {
    return this.#panelCatalog?.hiddenTypes ?? [];
  }

  registerWidgetCatalogProvider(provider: WorkbenchWidgetCatalogProvider): void {
    this.#widgetCatalog = provider;
  }

  /** The app's built-in widget types ([] without a provider). Read inside reactive scope. */
  canonicalWidgets(): CanonicalWidgetSpec[] {
    return this.#widgetCatalog?.canonical() ?? [];
  }

  /** Why a widget type is unavailable right now (null without a provider). */
  widgetUnavailableReason(type: string): string | null {
    return this.#widgetCatalog?.unavailableReason?.(type) ?? null;
  }

  /**
   * The Add palette slot: the host renders the palette (cards, previews) on
   * top of the generic catalog, placement and highlights (`addPalette.ts`).
   * Without one the edit bar keeps its Add menu.
   */
  registerAddPalette(component: Component<WorkbenchAddPaletteProps>): void {
    this.#addPalette = component;
  }

  get addPalette(): Component<WorkbenchAddPaletteProps> | null {
    return this.#addPalette;
  }

  registerPageHints(provider: WorkbenchPageHintProvider): void {
    this.#pageHints = provider;
  }

  /** Hints for a page ([] without a provider). */
  pageHints(layout: WorkbenchLayout | undefined, page: WorkbenchPage | undefined): WorkbenchPageHint[] {
    if (!layout || !page || !this.#pageHints) return [];
    return this.#pageHints(layout, page);
  }

  registerPageProtection(protection: WorkbenchPageProtection): void {
    this.#pageProtection = protection;
  }

  /** The reason a page cannot be deleted, or null (no provider = every page deletable). */
  pageProtection(page: WorkbenchPage | undefined): string | null {
    if (!page || !this.#pageProtection) return null;
    return this.#pageProtection(page);
  }

  /** Whether a nav entry is the active section. False when no provider is registered. */
  isNavigationEntryActive(entryId: string): boolean {
    return this.#navigationState?.isActive(entryId) ?? false;
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
