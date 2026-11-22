import {
  createEmptyWorkbenchPage,
  createWorkbenchId,
  liftPanelFromPage,
  panelIdsInPageDock,
  reduceWorkbenchDocument,
  repairWorkbenchDocument,
  resolveProfileForViewport,
  selectActiveLayout,
  selectActivePage,
  selectActiveProfile,
  selectOrderedPages,
  selectPanelLocation,
  selectProfileOverride,
  selectTabStackById,
  type BindingRef,
  type JsonObject,
  type WorkbenchCommand,
  type WorkbenchCommandResult,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchPage,
  type WorkbenchPageLayout,
  type WorkbenchProfile
} from '../core';
import {
  createWorkbenchBindingRegistry,
  type WorkbenchBindingContext,
  type WorkbenchBindingRegistry,
  type WorkbenchBindingResult
} from '../bindings';
import type { WorkbenchAddPaletteRequest } from './addCatalog';
import type { WorkbenchDragState } from './drag';
import type { WorkbenchPlacementState } from './placement';
import { LayoutHistory, type LayoutHistoryOptions } from './layoutHistory';

export interface WorkbenchControllerOptions {
  onChange?: (doc: WorkbenchDocument) => void;
  bindingRegistry?: WorkbenchBindingRegistry;
  /** Tuning for the in-memory layout undo/redo ring (depth / coalesce / clock). */
  layoutHistory?: LayoutHistoryOptions;
}

export interface SetWorkbenchDocumentOptions {
  notify?: boolean;
}

export interface WorkbenchCommandBatchOptions {
  stopOnError?: boolean;
}

export interface WorkbenchCommandBatchResult {
  success: boolean;
  next: WorkbenchDocument;
  results: WorkbenchCommandResult[];
  error?: WorkbenchCommandResult['error'];
}

/**
 * The maximized panel survives a document change only while it is still docked
 * on the (new) active page — a page switch or moving the panel to another page
 * clears it — and is not collapsed (maximize and collapse are exclusive: a
 * collapsed panel cannot be maximized, and collapsing restores). Pure so the
 * rule is unit-tested.
 */
export function reconcileMaximizedPanel(
  panelId: string | null,
  page: WorkbenchPage | undefined,
  panels?: Record<string, { collapsed?: boolean } | undefined>
): string | null {
  if (!panelId || !page) return null;
  if (panels?.[panelId]?.collapsed) return null;
  return panelIdsInPageDock(page).includes(panelId) ? panelId : null;
}

export class WorkbenchController {
  document: WorkbenchDocument;
  editMode = false;
  lastResult: WorkbenchCommandResult | null = null;
  drag: WorkbenchDragState | null = null;
  /**
   * The panel a panel drag has LIFTED out of the rendered dock (its slot
   * collapses, the neighbours fill the space) while the drag is active.
   * Transient view state: never persisted, never in layout history; cleared by
   * `setDrag(null)`, leaving edit mode, and drag cancel.
   */
  liftedPanelId: string | null = null;
  /**
   * The panel whose stack covers the whole workspace (Maximize). Transient view
   * state like `liftedPanelId`: not persisted, not in history; cleared when the
   * panel leaves the active page (page switch / move away).
   */
  maximizedPanelId: string | null = null;
  /**
   * The open Add palette (filter + optional fixed target), or null. Transient
   * view state: never persisted, never in history; cleared on leaving edit mode.
   */
  addPalette: WorkbenchAddPaletteRequest | null = null;
  /**
   * Click-to-place in progress (the highlighted spots, the keyboard spot), or
   * null. Transient like `addPalette`; the session in `placementSession.ts`
   * owns it and clears it when it ends.
   */
  placement: WorkbenchPlacementState | null = null;
  #renderedCache: { page: WorkbenchPage | undefined; lifted: string | null; result: WorkbenchPage | undefined } | null = null;
  #onChange?: (doc: WorkbenchDocument) => void;
  #bindingRegistry: WorkbenchBindingRegistry;
  #subscribers = new Set<(controller: WorkbenchController) => void>();
  /**
   * In-memory layout undo/redo ring. Snapshots the document around dispatches;
   * NEVER persisted (see layoutHistory.ts). Separate from any host-level
   * content/edit history — the two never entangle.
   */
  #layoutHistory: LayoutHistory;
  /** When true, a `setDocument` is a history RESTORE and must not reset the ring. */
  #restoringLayout = false;

  constructor(document: WorkbenchDocument, options: WorkbenchControllerOptions = {}) {
    this.document = repairWorkbenchDocument(document);
    this.#onChange = options.onChange;
    this.#bindingRegistry = options.bindingRegistry ?? createWorkbenchBindingRegistry();
    this.#layoutHistory = new LayoutHistory(options.layoutHistory);
    this.#layoutHistory.seed(this.document);
  }

  get activeProfile(): WorkbenchProfile | undefined {
    return selectActiveProfile(this.document);
  }

  get activeLayout(): WorkbenchLayout | undefined {
    return selectActiveLayout(this.document);
  }

  /** The active page of the active layout — the page whose dock is rendered. */
  get activePage(): WorkbenchPage | undefined {
    return selectActivePage(this.document);
  }

  /**
   * The page the dock renders: the active page, minus the lifted panel while a
   * panel drag is active. The lift keeps single-child splits (same geometry as
   * the reducer's removal, but the surviving neighbours keep their node ids, so
   * they are not remounted when the drag starts or is cancelled). Memoized on
   * (active page, lifted id) so every subscriber sees one stable object.
   */
  get renderedPage(): WorkbenchPage | undefined {
    const page = this.activePage;
    const lifted = this.liftedPanelId;
    const cache = this.#renderedCache;
    if (cache && cache.page === page && cache.lifted === lifted) return cache.result;
    const result = page && lifted ? liftPanelFromPage(page, lifted, { preserveSplits: true, holdActive: true }) : page;
    this.#renderedCache = { page, lifted, result };
    return result;
  }

  /** Pages of the active layout in canonical (pageOrder) order. */
  get pages(): WorkbenchPage[] {
    return selectOrderedPages(this.document);
  }

  get bindingRegistry(): WorkbenchBindingRegistry {
    return this.#bindingRegistry;
  }

  setDocument(document: WorkbenchDocument, options: SetWorkbenchDocumentOptions = {}): void {
    this.document = repairWorkbenchDocument(document);
    // An external document swap (adopt cache / remote / import) re-baselines the
    // undo ring so it never restores a stale layout. A history RESTORE (undo/redo)
    // routes through here too but must keep the ring intact — the #restoringLayout
    // guard skips the reset in that case.
    if (!this.#restoringLayout) this.#layoutHistory.reset(this.document);
    if (options.notify !== false) this.#onChange?.(this.document);
    this.#emit();
  }

  setEditMode(editMode: boolean): void {
    this.editMode = editMode;
    if (!editMode) this.#clearEditTransients();
    this.#emit();
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (!this.editMode) this.#clearEditTransients();
    this.#emit();
  }

  /** Leaving edit mode drops every edit-only transient (drag, lift, palette, placement). */
  #clearEditTransients(): void {
    this.drag = null;
    this.liftedPanelId = null;
    this.addPalette = null;
    this.placement = null;
  }

  /** Open the Add palette (edit mode only). */
  openAddPalette(request: WorkbenchAddPaletteRequest): void {
    if (!this.editMode) return;
    this.addPalette = request;
    this.#emit();
  }

  closeAddPalette(): void {
    if (!this.addPalette) return;
    this.addPalette = null;
    this.#emit();
  }

  /** Set (or clear) the click-to-place state (placementSession.ts). */
  setPlacement(placement: WorkbenchPlacementState | null): void {
    this.placement = placement;
    this.#emit();
  }

  /** Set (or clear) the drag state. Clearing it also drops any lifted panel. */
  setDrag(drag: WorkbenchDragState | null): void {
    this.drag = drag;
    if (!drag) this.liftedPanelId = null;
    this.#emit();
  }

  /**
   * Lift a panel out of the rendered dock for the duration of a panel drag
   * (see {@link renderedPage}); `null` puts it back. Nothing is dispatched — a
   * cancelled drag restores the layout simply by clearing the lift. Lifting
   * also restores a maximized panel (the whole dock is the drop surface).
   */
  setLiftedPanel(panelId: string | null): void {
    this.liftedPanelId = panelId;
    if (panelId) this.maximizedPanelId = null;
    this.#emit();
  }

  /** Maximize a panel's stack over the workspace (`null` restores). Activates the panel in its stack. */
  setMaximizedPanel(panelId: string | null): void {
    const next = reconcileMaximizedPanel(panelId, this.activePage, this.activeLayout?.panels);
    if (next) {
      const location = selectPanelLocation(this.document, next);
      const stack = location ? selectTabStackById(this.document, location.tabStackId) : undefined;
      // Activation is view state: panel.activate is excluded from layout history.
      if (stack && stack.activePanelId !== next) this.dispatch({ type: 'panel.activate', panelId: next });
    }
    this.maximizedPanelId = next;
    this.#emit();
  }

  /** Maximize `panelId`, or restore when it is the maximized one. */
  toggleMaximizedPanel(panelId: string): void {
    this.setMaximizedPanel(this.maximizedPanelId === panelId ? null : panelId);
  }

  updateDrag(patch: Partial<WorkbenchDragState>): void {
    if (!this.drag) return;
    this.drag = { ...this.drag, ...patch } as WorkbenchDragState;
    this.#emit();
  }

  dispatch(command: WorkbenchCommand): WorkbenchCommandResult {
    const result = reduceWorkbenchDocument(this.document, command);
    this.lastResult = result;
    if (result.success) {
      this.document = result.next;
      this.#layoutHistory.record(command, this.document);
      this.#onChange?.(this.document);
    }
    this.#emit();
    return result;
  }

  dispatchMany(commands: WorkbenchCommand[], options: WorkbenchCommandBatchOptions = {}): WorkbenchCommandBatchResult {
    const stopOnError = options.stopOnError ?? true;
    const results: WorkbenchCommandResult[] = [];
    let next = this.document;
    let changed = false;

    for (const command of commands) {
      const result = reduceWorkbenchDocument(next, command);
      results.push(result);
      this.lastResult = result;
      if (result.success) {
        next = result.next;
        changed = true;
      } else if (stopOnError) {
        break;
      }
    }

    if (changed) {
      this.document = next;
      // A batch is one user action → one undo step (never coalesces).
      this.#layoutHistory.recordBatch(commands, this.document);
      this.#onChange?.(this.document);
    }
    this.#emit();

    const error = results.find((result) => !result.success)?.error;
    return {
      success: !error,
      next: this.document,
      results,
      error
    };
  }

  // ── Pages (thin command wrappers; reactive via #emit like dispatch) ──────

  /** Activate a page (switch the rendered dock). Not captured by layout history. */
  activatePage(pageId: string): WorkbenchCommandResult {
    return this.dispatch({ type: 'page.activate', pageId });
  }

  /**
   * Add a new page (empty dock unless a page is supplied) and activate it.
   * Returns the new page id, or `null` when the add was rejected.
   */
  addPage(options: { id?: string; label?: string; icon?: string; page?: WorkbenchPage; index?: number } = {}): string | null {
    const page: WorkbenchPage =
      options.page ??
      createEmptyWorkbenchPage({
        id: options.id ?? createWorkbenchId('page'),
        label: options.label ?? 'New Page',
        icon: options.icon
      });
    const batch = this.dispatchMany([
      { type: 'page.add', page, index: options.index },
      { type: 'page.activate', pageId: page.id }
    ]);
    return batch.success ? page.id : null;
  }

  removePage(pageId: string): WorkbenchCommandResult {
    return this.dispatch({ type: 'page.remove', pageId });
  }

  renamePage(pageId: string, label: string): WorkbenchCommandResult {
    return this.dispatch({ type: 'page.rename', pageId, label });
  }

  duplicatePage(pageId: string, options: { newPageId?: string; label?: string } = {}): WorkbenchCommandResult {
    return this.dispatch({ type: 'page.duplicate', pageId, newPageId: options.newPageId, label: options.label });
  }

  /** Reorder a page within the layout's `pageOrder` (and its bound nav entry). */
  movePage(pageId: string, index: number): WorkbenchCommandResult {
    return this.dispatch({ type: 'page.move', pageId, index });
  }

  // ── Page layouts (shared document store; thin command wrappers) ──────────

  /** The shared, document-level saved page layouts. */
  get pageLayouts(): WorkbenchPageLayout[] {
    return Object.values(this.document.pageLayouts ?? {});
  }

  savePageLayout(pageLayout: WorkbenchPageLayout): WorkbenchCommandResult {
    return this.dispatch({ type: 'pageLayout.save', pageLayout });
  }

  applyPageLayout(pageLayoutId: string, pageId?: string): WorkbenchCommandResult {
    return this.dispatch({ type: 'pageLayout.apply', pageLayoutId, pageId });
  }

  renamePageLayout(pageLayoutId: string, label: string): WorkbenchCommandResult {
    return this.dispatch({ type: 'pageLayout.rename', pageLayoutId, label });
  }

  deletePageLayout(pageLayoutId: string): WorkbenchCommandResult {
    return this.dispatch({ type: 'pageLayout.delete', pageLayoutId });
  }

  // ── Layout undo/redo (in-memory only; see layoutHistory.ts) ──────────────

  /** True when there is a prior layout snapshot to restore. Reactive via #emit. */
  get canUndoLayout(): boolean {
    return this.#layoutHistory.canUndo;
  }

  /** True when a redo target exists ahead of the cursor. Reactive via #emit. */
  get canRedoLayout(): boolean {
    return this.#layoutHistory.canRedo;
  }

  /**
   * Restore the previous layout snapshot. Goes through the normal `setDocument`
   * path (so the document is repaired and persisted) but WITHOUT re-capturing —
   * the ring cursor moves, the redo future is preserved. No-op when nothing to
   * undo. Returns `true` if a snapshot was restored.
   */
  undoLayout(): boolean {
    const snapshot = this.#layoutHistory.undo();
    if (!snapshot) return false;
    this.#restoreLayoutSnapshot(snapshot);
    return true;
  }

  /** Restore the next (redo) layout snapshot. Mirror of {@link undoLayout}. */
  redoLayout(): boolean {
    const snapshot = this.#layoutHistory.redo();
    if (!snapshot) return false;
    this.#restoreLayoutSnapshot(snapshot);
    return true;
  }

  #restoreLayoutSnapshot(snapshot: WorkbenchDocument): void {
    this.#restoringLayout = true;
    try {
      this.setDocument(snapshot);
    } finally {
      this.#restoringLayout = false;
    }
  }

  /** The currently-persisted, still-valid user profile override id (or undefined). */
  get profileOverride(): string | undefined {
    return selectProfileOverride(this.document);
  }

  /**
   * Resolve the profile that matches the given viewport width (honouring any user
   * override) and, **only when it differs from the active profile**, dispatch
   * `profile.activate`. A resize swaps the active profile id and carries the active
   * PAGE onto the incoming profile's layout (reducer, `profile.activate`) so the user
   * stays on the view they were looking at; it does not otherwise mutate layout
   * contents — panels, widgets and docks are untouched.
   *
   * Returns `true` when the active profile changed.
   */
  resolveProfileForWidth(width: number): boolean {
    const targetId = resolveProfileForViewport(this.document, {
      width,
      userOverride: this.profileOverride
    });
    if (targetId === this.document.activeProfileId) return false;
    if (!this.document.profiles[targetId]) return false;
    return this.dispatch({ type: 'profile.activate', profileId: targetId }).success;
  }

  /**
   * Set (or clear, with `null`) the explicit user profile override and immediately
   * activate the resolved profile. Persists `profileOverrideId` on the document so
   * the choice survives reloads. When an override names a real profile it wins over
   * viewport resolution until cleared. Pass the current viewport `width` so the
   * cleared case re-resolves against the viewport instead of holding a stale id.
   */
  setProfileOverride(profileId: string | null, width?: number): void {
    const next = repairWorkbenchDocument(this.document);
    if (profileId && next.profiles[profileId]) {
      next.profileOverrideId = profileId;
    } else {
      delete next.profileOverrideId;
    }
    this.document = next;
    this.#onChange?.(this.document);

    const resolved = resolveProfileForViewport(this.document, {
      width: width ?? Number.POSITIVE_INFINITY,
      userOverride: this.document.profileOverrideId ?? null
    });
    if (resolved !== this.document.activeProfileId && this.document.profiles[resolved]) {
      this.dispatch({ type: 'profile.activate', profileId: resolved });
      return;
    }
    this.#emit();
  }

  resolveBinding<T = unknown>(
    binding: BindingRef | null | undefined,
    context: Omit<WorkbenchBindingContext, 'document' | 'layout'> = {}
  ): Promise<WorkbenchBindingResult<T>> {
    return this.#bindingRegistry.resolve<T>(binding, {
      ...context,
      document: this.document,
      layout: this.activeLayout
    });
  }

  resolveWidgetBinding<T = unknown>(
    widgetId: string,
    context: Omit<WorkbenchBindingContext, 'document' | 'layout' | 'widget'> & { args?: JsonObject } = {}
  ): Promise<WorkbenchBindingResult<T>> {
    return this.#bindingRegistry.resolveWidget<T>(this.document, widgetId, context);
  }

  subscribe(run: (controller: WorkbenchController) => void): () => void {
    run(this);
    this.#subscribers.add(run);
    return () => this.#subscribers.delete(run);
  }

  #emit(): void {
    // Transient view state follows the document: a maximized panel that is no
    // longer on the active page (page switch, moved away, closed, undone) is
    // restored before anyone renders.
    if (this.maximizedPanelId) this.maximizedPanelId = reconcileMaximizedPanel(this.maximizedPanelId, this.activePage, this.activeLayout?.panels);
    this.#subscribers.forEach((run) => run(this));
  }
}

export function createWorkbenchController(
  document: WorkbenchDocument,
  options: WorkbenchControllerOptions = {}
): WorkbenchController {
  return new WorkbenchController(document, options);
}
