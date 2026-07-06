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

  it('undoes and redoes layout dispatches through setDocument, in memory only', () => {
    let clock = 1000;
    const persisted: string[] = [];
    const controller = createWorkbenchController(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }),
      {
        onChange: (doc) => persisted.push(Object.keys(doc.layouts['layout.test'].panels).join(',') || '-'),
        layoutHistory: { env: { now: () => clock } }
      }
    );

    expect(controller.canUndoLayout).toBe(false);
    expect(controller.canRedoLayout).toBe(false);

    clock = 2000;
    controller.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });
    clock = 3000;
    controller.dispatch({ type: 'panel.add', panel: panel('panel.b'), region: 'main' });

    expect(controller.canUndoLayout).toBe(true);
    expect(Object.keys(controller.activeLayout!.panels).sort()).toEqual(['panel.a', 'panel.b']);

    // Undo removes panel.b, restoring through setDocument (which repairs + persists).
    expect(controller.undoLayout()).toBe(true);
    expect(Object.keys(controller.activeLayout!.panels)).toEqual(['panel.a']);
    expect(controller.canRedoLayout).toBe(true);

    // Undo again → empty.
    expect(controller.undoLayout()).toBe(true);
    expect(Object.keys(controller.activeLayout!.panels)).toEqual([]);
    expect(controller.canUndoLayout).toBe(false);
    expect(controller.undoLayout()).toBe(false);

    // Redo re-adds them.
    expect(controller.redoLayout()).toBe(true);
    expect(Object.keys(controller.activeLayout!.panels)).toEqual(['panel.a']);
    expect(controller.redoLayout()).toBe(true);
    expect(Object.keys(controller.activeLayout!.panels).sort()).toEqual(['panel.a', 'panel.b']);
    expect(controller.canRedoLayout).toBe(false);

    // The restore path notifies onChange (persist) each time, so the layout is
    // saved — but the document itself never gained a history field.
    expect('layoutHistory' in controller.document).toBe(false);
    expect(persisted.length).toBeGreaterThan(0);
  });

  it('coalesces a rapid same-type stream into one undo step', () => {
    let clock = 1000;
    const controller = createWorkbenchController(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }),
      { layoutHistory: { env: { now: () => clock }, coalesceWindowMs: 400 } }
    );
    controller.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });

    // A continuous grid-mode / block-size hold stream on one widget.
    controller.dispatch({
      type: 'widget.add',
      zone: 'top.right',
      widget: { id: 'w1', type: 't', zone: 'top.right', order: 0, size: 'default' }
    });
    clock = 2000;
    controller.dispatch({ type: 'widget.state', widgetId: 'w1', state: { v: 1 } });
    clock = 2050;
    controller.dispatch({ type: 'widget.state', widgetId: 'w1', state: { v: 2 } });
    clock = 2100;
    controller.dispatch({ type: 'widget.state', widgetId: 'w1', state: { v: 3 } });

    // The three widget.state writes collapse into ONE undo step.
    expect(controller.undoLayout()).toBe(true);
    const w = controller.activeLayout!.widgets['w1'];
    expect(w.state).toBeUndefined(); // back to before the stream
  });

  it('a fresh dispatch after undo truncates the redo future', () => {
    const controller = createWorkbenchController(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }),
      { layoutHistory: { env: { now: () => 0 }, coalesceWindowMs: 0 } }
    );
    controller.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });
    controller.dispatch({ type: 'panel.add', panel: panel('panel.b'), region: 'main' });
    controller.undoLayout();
    expect(controller.canRedoLayout).toBe(true);
    controller.dispatch({ type: 'panel.add', panel: panel('panel.c'), region: 'main' });
    expect(controller.canRedoLayout).toBe(false);
  });

  it('re-baselines the ring on an external setDocument (no stale undo)', () => {
    const controller = createWorkbenchController(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' })
    );
    controller.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });
    expect(controller.canUndoLayout).toBe(true);

    controller.setDocument(createEmptyWorkbenchDocument({ profileId: 'profile.fresh', layoutId: 'layout.fresh' }));
    expect(controller.canUndoLayout).toBe(false);
    expect(controller.canRedoLayout).toBe(false);
  });

  it('having a layout history does not change what the document persists', () => {
    const seedDoc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const withHistory = createWorkbenchController(JSON.parse(JSON.stringify(seedDoc)));
    const plain = createWorkbenchController(JSON.parse(JSON.stringify(seedDoc)));

    withHistory.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });
    withHistory.undoLayout(); // exercise the ring, then land back at baseline

    plain.dispatch({ type: 'panel.add', panel: panel('panel.a'), region: 'main' });
    plain.dispatch({ type: 'panel.close', panelId: 'panel.a' }); // land back at baseline the plain way

    // Both documents serialise identically — the ring left no trace on the doc.
    expect(JSON.stringify(withHistory.document)).toBe(JSON.stringify(plain.document));
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
