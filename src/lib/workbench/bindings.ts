import {
  selectActiveLayout,
  type BindingRef,
  type JsonObject,
  type PanelInstance,
  type WidgetInstance,
  type WorkbenchDocument,
  type WorkbenchLayout
} from './core';

export type WorkbenchBindingErrorCode = 'missing-binding' | 'missing-resolver' | 'unsupported-version' | 'resolver-error';

export interface WorkbenchBindingContext {
  document: WorkbenchDocument;
  layout?: WorkbenchLayout;
  widget?: WidgetInstance;
  panel?: PanelInstance;
  source?: string;
  args?: JsonObject;
}

export interface WorkbenchBindingError {
  code: WorkbenchBindingErrorCode;
  kind?: string;
  version?: number;
  message: string;
}

export type WorkbenchBindingResult<T = unknown> =
  | { handled: true; success: true; value: T }
  | { handled: false; success: false; error: WorkbenchBindingError }
  | { handled: true; success: false; error: WorkbenchBindingError };

export type WorkbenchBindingVersionMatcher = number | ((version: number) => boolean);

export interface WorkbenchBindingResolver<T = unknown> {
  kind: string;
  version?: WorkbenchBindingVersionMatcher;
  resolve: (binding: BindingRef, context: WorkbenchBindingContext) => T | Promise<T>;
}

function resolverSupportsVersion(resolver: WorkbenchBindingResolver, version: number): boolean {
  if (resolver.version === undefined) return true;
  if (typeof resolver.version === 'number') return resolver.version === version;
  return resolver.version(version);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WorkbenchBindingRegistry {
  #resolvers = new Map<string, WorkbenchBindingResolver[]>();
  #lastResult: WorkbenchBindingResult | null = null;

  get lastResult(): WorkbenchBindingResult | null {
    return this.#lastResult;
  }

  register<T = unknown>(resolver: WorkbenchBindingResolver<T>): () => void {
    const kind = resolver.kind.trim();
    if (!kind) throw new Error('Workbench binding resolver kind cannot be empty.');
    const normalized: WorkbenchBindingResolver = { ...resolver, kind };
    const resolvers = this.#resolvers.get(kind) ?? [];
    resolvers.push(normalized);
    this.#resolvers.set(kind, resolvers);

    return () => {
      const next = (this.#resolvers.get(kind) ?? []).filter((candidate) => candidate !== normalized);
      if (next.length) this.#resolvers.set(kind, next);
      else this.#resolvers.delete(kind);
    };
  }

  has(kind: string): boolean {
    return this.#resolvers.has(kind);
  }

  resolverFor(binding: BindingRef): WorkbenchBindingResolver | undefined {
    const resolvers = this.#resolvers.get(binding.kind) ?? [];
    const exact = resolvers.find((resolver) => typeof resolver.version === 'number' && resolver.version === binding.version);
    return exact ?? resolvers.find((resolver) => resolverSupportsVersion(resolver, binding.version));
  }

  async resolve<T = unknown>(binding: BindingRef | null | undefined, context: WorkbenchBindingContext): Promise<WorkbenchBindingResult<T>> {
    if (!binding) {
      const result: WorkbenchBindingResult<T> = {
        handled: false,
        success: false,
        error: {
          code: 'missing-binding',
          message: 'No binding reference was provided.'
        }
      };
      this.#lastResult = result;
      return result;
    }

    const resolvers = this.#resolvers.get(binding.kind);
    if (!resolvers?.length) {
      const result: WorkbenchBindingResult<T> = {
        handled: false,
        success: false,
        error: {
          code: 'missing-resolver',
          kind: binding.kind,
          version: binding.version,
          message: `No Workbench binding resolver is registered for ${binding.kind}.`
        }
      };
      this.#lastResult = result;
      return result;
    }

    const resolver = this.resolverFor(binding);
    if (!resolver) {
      const result: WorkbenchBindingResult<T> = {
        handled: true,
        success: false,
        error: {
          code: 'unsupported-version',
          kind: binding.kind,
          version: binding.version,
          message: `No Workbench binding resolver for ${binding.kind} supports version ${binding.version}.`
        }
      };
      this.#lastResult = result;
      return result;
    }

    try {
      const value = (await resolver.resolve(binding, context)) as T;
      const result: WorkbenchBindingResult<T> = { handled: true, success: true, value };
      this.#lastResult = result;
      return result;
    } catch (error) {
      const result: WorkbenchBindingResult<T> = {
        handled: true,
        success: false,
        error: {
          code: 'resolver-error',
          kind: binding.kind,
          version: binding.version,
          message: errorMessage(error)
        }
      };
      this.#lastResult = result;
      return result;
    }
  }

  resolveWidget<T = unknown>(
    document: WorkbenchDocument,
    widgetId: string,
    context: Omit<WorkbenchBindingContext, 'document' | 'layout' | 'widget'> = {}
  ): Promise<WorkbenchBindingResult<T>> {
    const layout = selectActiveLayout(document);
    const widget = layout?.widgets[widgetId];
    return this.resolve<T>(widget?.binding, {
      ...context,
      document,
      layout,
      widget
    });
  }
}

export function createWorkbenchBindingRegistry(): WorkbenchBindingRegistry {
  return new WorkbenchBindingRegistry();
}
