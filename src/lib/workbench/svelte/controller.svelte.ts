import {
  createEmptyWorkbenchPage,
  createWorkbenchId,
  reduceWorkbenchDocument,
  repairWorkbenchDocument,
  resolveProfileForViewport,
  selectActiveLayout,
  selectActivePage,
  selectActiveProfile,
  selectOrderedPages,
  selectProfileOverride,
  type BindingRef,
  type JsonObject,
  type WorkbenchCommand,
  type WorkbenchCommandResult,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchPage,
  type WorkbenchProfile
} from '../core';
import {
  createWorkbenchBindingRegistry,
  type WorkbenchBindingContext,
  type WorkbenchBindingRegistry,
  type WorkbenchBindingResult
} from '../bindings';
import type { WorkbenchDragState } from './drag';
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

export class WorkbenchController {
  document: WorkbenchDocument;
  editMode = false;
  lastResult: WorkbenchCommandResult | null = null;
  drag: WorkbenchDragState | null = null;
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
    this.#emit();
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (!this.editMode) this.drag = null;
    this.#emit();
  }

  setDrag(drag: WorkbenchDragState | null): void {
    this.drag = drag;
    this.#emit();
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
   * `profile.activate`. Never writes layout contents — a resize swaps the active
   * profile id, it does not mutate the layout the user is on.
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
    this.#subscribers.forEach((run) => run(this));
  }
}

export function createWorkbenchController(
  document: WorkbenchDocument,
  options: WorkbenchControllerOptions = {}
): WorkbenchController {
  return new WorkbenchController(document, options);
}
