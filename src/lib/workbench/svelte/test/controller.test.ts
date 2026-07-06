import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  type PanelInstance,
  type WorkbenchDocument,
  type WorkbenchProfile
} from '../../core';
import { createWorkbenchBindingRegistry } from '../../bindings';
import { createWorkbenchController } from '../controller.svelte';

const panel = (id: string): PanelInstance => ({ id, type: 'test.panel', title: id });

/** Base doc with desktop (unset breakpoint) + tablet + phone profiles, each on its own layout. */
function multiProfileDoc(): WorkbenchDocument {
  const doc = createEmptyWorkbenchDocument({ profileId: 'profile.desktop', layoutId: 'layout.desktop' });
  const tabletLayout = JSON.parse(JSON.stringify(doc.layouts['layout.desktop']));
  tabletLayout.id = 'layout.tablet';
  const phoneLayout = JSON.parse(JSON.stringify(doc.layouts['layout.desktop']));
  phoneLayout.id = 'layout.phone';
  doc.layouts['layout.tablet'] = tabletLayout;
  doc.layouts['layout.phone'] = phoneLayout;
  const tablet: WorkbenchProfile = { id: 'profile.tablet', label: 'Tablet', layoutId: 'layout.tablet', breakpoint: 'tablet' };
  const phone: WorkbenchProfile = { id: 'profile.phone', label: 'Phone', layoutId: 'layout.phone', breakpoint: 'phone' };
  doc.profiles[tablet.id] = tablet;
  doc.profiles[phone.id] = phone;
  return doc;
}

describe('WorkbenchController', () => {
  it('dispatches reducer commands and reports document changes', () => {
    const seen: string[] = [];
    const controller = createWorkbenchController(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }),
      { onChange: (doc) => seen.push(doc.activeProfileId) }
    );

    const result = controller.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });

    expect(result.success).toBe(true);
    expect(controller.activeLayout?.panels['panel.a']).toBeDefined();
    expect(controller.lastResult).toBe(result);
    expect(seen).toEqual(['profile.test']);
  });

  it('keeps the current document when a command fails', () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));

    const result = controller.dispatch({ type: 'panel.close', panelId: 'missing' });

    expect(result.success).toBe(false);
    expect(controller.activeLayout?.panels.missing).toBeUndefined();
    expect(controller.lastResult?.error?.code).toBe('missing-panel');
  });

  it('dispatches command batches with one change notification', () => {
    const seen: string[] = [];
    const controller = createWorkbenchController(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }),
      { onChange: (doc) => seen.push(Object.keys(doc.layouts['layout.test'].panels).join(',')) }
    );

    const result = controller.dispatchMany([
      { type: 'panel.add', panel: panel('panel.a'), region: 'main' },
      { type: 'panel.add', panel: panel('panel.b'), region: 'main' }
    ]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(controller.activeLayout?.panels['panel.a']).toBeDefined();
    expect(controller.activeLayout?.panels['panel.b']).toBeDefined();
    expect(seen).toEqual(['panel.a,panel.b']);
  });

  it('stops command batches on failure by default while preserving earlier successes', () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));

    const result = controller.dispatchMany([
      { type: 'panel.add', panel: panel('panel.a'), region: 'main' },
      { type: 'panel.close', panelId: 'missing' },
      { type: 'panel.add', panel: panel('panel.b'), region: 'main' }
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('missing-panel');
    expect(result.results).toHaveLength(2);
    expect(controller.activeLayout?.panels['panel.a']).toBeDefined();
    expect(controller.activeLayout?.panels['panel.b']).toBeUndefined();
  });

  it('exposes a controller binding registry and resolves direct bindings', async () => {
    const registry = createWorkbenchBindingRegistry();
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }), {
      bindingRegistry: registry
    });

    registry.register({
      kind: 'test.param',
      version: 1,
      resolve: (binding, context) => `${context.layout?.id}:${binding.target.id}`
    });

    const result = await controller.resolveBinding<string>({
      kind: 'test.param',
      version: 1,
      target: { id: 'level' }
    });

    expect(controller.bindingRegistry).toBe(registry);
    expect(result).toEqual({ handled: true, success: true, value: 'layout.test:level' });
  });

  it('switches the active profile by viewport width without mutating layouts', () => {
    const controller = createWorkbenchController(multiProfileDoc());
    const layoutsBefore = JSON.stringify(controller.document.layouts);

    expect(controller.document.activeProfileId).toBe('profile.desktop');

    // Narrow to phone width → profile swaps, layouts untouched.
    expect(controller.resolveProfileForWidth(390)).toBe(true);
    expect(controller.document.activeProfileId).toBe('profile.phone');
    expect(JSON.stringify(controller.document.layouts)).toBe(layoutsBefore);

    // Tablet band.
    expect(controller.resolveProfileForWidth(1024)).toBe(true);
    expect(controller.document.activeProfileId).toBe('profile.tablet');

    // Back to desktop.
    expect(controller.resolveProfileForWidth(1920)).toBe(true);
    expect(controller.document.activeProfileId).toBe('profile.desktop');

    // Same class again → no-op (no re-activation).
    expect(controller.resolveProfileForWidth(1500)).toBe(false);
    expect(controller.document.activeProfileId).toBe('profile.desktop');

    expect(JSON.stringify(controller.document.layouts)).toBe(layoutsBefore);
  });

  it('honours a persisted user override over viewport resolution and clears it', () => {
    const controller = createWorkbenchController(multiProfileDoc());

    // Pin phone at a desktop width — override wins and persists on the doc.
    controller.setProfileOverride('profile.phone', 1920);
    expect(controller.document.activeProfileId).toBe('profile.phone');
    expect(controller.document.profileOverrideId).toBe('profile.phone');
    expect(controller.profileOverride).toBe('profile.phone');

    // A resize must not override the explicit user choice.
    expect(controller.resolveProfileForWidth(1920)).toBe(false);
    expect(controller.document.activeProfileId).toBe('profile.phone');

    // Clear the override at a desktop width → re-resolves to desktop.
    controller.setProfileOverride(null, 1920);
    expect(controller.document.profileOverrideId).toBeUndefined();
    expect(controller.document.activeProfileId).toBe('profile.desktop');
  });

  it('ignores an override that names a non-existent profile', () => {
    const controller = createWorkbenchController(multiProfileDoc());
    controller.setProfileOverride('profile.missing', 1920);
    expect(controller.document.profileOverrideId).toBeUndefined();
    expect(controller.document.activeProfileId).toBe('profile.desktop');
  });

  it('resolves widget bindings through the active controller document', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));

    controller.bindingRegistry.register({
      kind: 'test.param',
      resolve: (_binding, context) => context.widget?.id
    });
    controller.dispatch({
      type: 'widget.add',
      zone: 'top.right',
      widget: {
        id: 'widget.bound',
        type: 'test.widget',
        zone: 'top.right',
        order: 0,
        size: 'default',
        binding: {
          kind: 'test.param',
          version: 1,
          target: { id: 'gain' }
        }
      }
    });

    const result = await controller.resolveWidgetBinding<string>('widget.bound');

    expect(result).toEqual({ handled: true, success: true, value: 'widget.bound' });
  });
});
