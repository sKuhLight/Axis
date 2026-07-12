import { describe, expect, it } from 'vitest';
import { createWorkbenchBindingRegistry, type WorkbenchBindingError, type WorkbenchBindingResult } from '../bindings';
import { createEmptyWorkbenchDocument, selectActiveLayout, type BindingRef } from '../core';

const binding = (kind = 'test.param', version = 1): BindingRef => ({
  kind,
  version,
  target: { id: 'gain' }
});

function resultError(result: WorkbenchBindingResult): WorkbenchBindingError {
  if (result.success) throw new Error('Expected binding resolution to fail.');
  return result.error;
}

describe('WorkbenchBindingRegistry', () => {
  it('resolves bindings with exact-version precedence', async () => {
    const registry = createWorkbenchBindingRegistry();
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });

    registry.register({
      kind: 'test.param',
      resolve: () => 'fallback'
    });
    registry.register({
      kind: 'test.param',
      version: 1,
      resolve: ({ target }) => `exact:${target.id}`
    });

    const result = await registry.resolve<string>(binding(), { document: doc });

    expect(result).toEqual({ handled: true, success: true, value: 'exact:gain' });
    expect(registry.lastResult).toBe(result);
  });

  it('reports missing bindings, missing resolvers, unsupported versions, and resolver failures', async () => {
    const registry = createWorkbenchBindingRegistry();
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });

    registry.register({
      kind: 'test.versioned',
      version: 2,
      resolve: () => 'ok'
    });
    registry.register({
      kind: 'test.fail',
      resolve: () => {
        throw new Error('Binding failed');
      }
    });

    const missingBinding = await registry.resolve(undefined, { document: doc });
    const missingResolver = await registry.resolve(binding('test.missing'), { document: doc });
    const unsupportedVersion = await registry.resolve(binding('test.versioned', 1), { document: doc });
    const failed = await registry.resolve(binding('test.fail'), { document: doc });

    expect(resultError(missingBinding).code).toBe('missing-binding');
    expect(resultError(missingResolver).code).toBe('missing-resolver');
    expect(resultError(unsupportedVersion).code).toBe('unsupported-version');
    expect(resultError(failed).code).toBe('resolver-error');
    expect(resultError(failed).message).toBe('Binding failed');
  });

  it('can unregister resolvers', async () => {
    const registry = createWorkbenchBindingRegistry();
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const unregister = registry.register({
      kind: 'test.param',
      resolve: () => 'ok'
    });

    expect(registry.has('test.param')).toBe(true);
    unregister();

    const result = await registry.resolve(binding(), { document: doc });
    expect(registry.has('test.param')).toBe(false);
    expect(resultError(result).code).toBe('missing-resolver');
  });

  it('resolves widget bindings with active layout context', async () => {
    const registry = createWorkbenchBindingRegistry();
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const layout = selectActiveLayout(doc)!;
    layout.widgets['widget.bound'] = {
      id: 'widget.bound',
      type: 'test.widget',
      zone: 'top.right',
      order: 0,
      size: 'default',
      binding: binding()
    };

    registry.register({
      kind: 'test.param',
      resolve: (_binding, context) => `${context.layout?.id}:${context.widget?.id}`
    });

    const result = await registry.resolveWidget<string>(doc, 'widget.bound');

    expect(result).toEqual({ handled: true, success: true, value: 'layout.test:widget.bound' });
  });
});
