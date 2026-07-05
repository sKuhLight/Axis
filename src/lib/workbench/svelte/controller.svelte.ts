import {
  reduceWorkbenchDocument,
  repairWorkbenchDocument,
  selectActiveLayout,
  selectActiveProfile,
  type BindingRef,
  type JsonObject,
  type WorkbenchCommand,
  type WorkbenchCommandResult,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchProfile
} from '../core';
import {
  createWorkbenchBindingRegistry,
  type WorkbenchBindingContext,
  type WorkbenchBindingRegistry,
  type WorkbenchBindingResult
} from '../bindings';
import type { WorkbenchDragState } from './drag';

export interface WorkbenchControllerOptions {
  onChange?: (doc: WorkbenchDocument) => void;
  bindingRegistry?: WorkbenchBindingRegistry;
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

  constructor(document: WorkbenchDocument, options: WorkbenchControllerOptions = {}) {
    this.document = repairWorkbenchDocument(document);
    this.#onChange = options.onChange;
    this.#bindingRegistry = options.bindingRegistry ?? createWorkbenchBindingRegistry();
  }

  get activeProfile(): WorkbenchProfile | undefined {
    return selectActiveProfile(this.document);
  }

  get activeLayout(): WorkbenchLayout | undefined {
    return selectActiveLayout(this.document);
  }

  get bindingRegistry(): WorkbenchBindingRegistry {
    return this.#bindingRegistry;
  }

  setDocument(document: WorkbenchDocument, options: SetWorkbenchDocumentOptions = {}): void {
    this.document = repairWorkbenchDocument(document);
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
