import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../../core';
import { createWorkbenchController } from '../controller.svelte';
import { createWorkbenchRenderRegistry, shouldShowPageHints } from '../renderRegistry';

const fallback = (() => null) as never;
const specific = (() => null) as never;

describe('WorkbenchRenderRegistry', () => {
  it('returns registered renderers and fallback renderers', () => {
    const registry = createWorkbenchRenderRegistry(fallback, fallback, fallback);
    registry.registerPanel({ type: 'known.panel', component: specific });
    registry.registerWidget({ type: 'known.widget', component: specific });
    registry.registerNavigation({ id: 'known.nav', component: specific });

    expect(registry.panel('known.panel')).toBe(specific);
    expect(registry.widget('known.widget')).toBe(specific);
    expect(registry.navigation('known.nav')).toBe(specific);
    expect(registry.panel('missing.panel')).toBe(fallback);
    expect(registry.widget('missing.widget')).toBe(fallback);
    expect(registry.navigation('missing.nav')).toBe(fallback);
  });

  it('serves the app panel catalog and page hints (empty without providers)', () => {
    const registry = createWorkbenchRenderRegistry();
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const layout = controller.activeLayout;
    const page = controller.activePage;
    expect(registry.canonicalPanels()).toEqual([]);
    expect(registry.panelCatalogHiddenTypes).toEqual([]);
    expect(registry.pageHints(layout, page)).toEqual([]);

    registry.registerPanelCatalogProvider({
      canonical: () => [{ key: 'a', panel: { id: 'a', type: 'x.a', title: 'A' } }],
      hiddenTypes: ['x.internal']
    });
    registry.registerPageHints((_layout, p) => [{ id: `hint.${p.id}`, text: 'T', actionLabel: 'Go', commands: () => [] }]);
    expect(registry.canonicalPanels().map((spec) => spec.key)).toEqual(['a']);
    expect(registry.panelCatalogHiddenTypes).toEqual(['x.internal']);
    expect(registry.pageHints(layout, page).map((hint) => hint.id)).toEqual([`hint.${page!.id}`]);
    expect(registry.pageHints(undefined, page)).toEqual([]);

    expect(registry.pageProtection(page)).toBeNull();
    registry.registerPageProtection((p) => (p.id === page!.id ? 'Used elsewhere' : null));
    expect(registry.pageProtection(page)).toBe('Used elsewhere');
    expect(registry.pageProtection(undefined)).toBeNull();
  });

  it('shows page hints always while editing, in view mode only on an empty main region', () => {
    expect(shouldShowPageHints({ count: 0, editMode: true, mainEmpty: true })).toBe(false);
    expect(shouldShowPageHints({ count: 1, editMode: true, mainEmpty: false })).toBe(true);
    expect(shouldShowPageHints({ count: 1, editMode: false, mainEmpty: true })).toBe(true);
    expect(shouldShowPageHints({ count: 1, editMode: false, mainEmpty: false })).toBe(false);
  });

  it('resolves the active navigation entry via the registered provider', () => {
    const registry = createWorkbenchRenderRegistry();
    // No provider registered → nothing is active.
    expect(registry.isNavigationEntryActive('grid')).toBe(false);
    expect(registry.navigationState).toBeNull();

    registry.registerNavigationState({ isActive: (id) => id === 'grid' });
    expect(registry.isNavigationEntryActive('grid')).toBe(true);
    expect(registry.isNavigationEntryActive('fc')).toBe(false);
  });

  it('registers and runs host action handlers', () => {
    const registry = createWorkbenchRenderRegistry();
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const seen: string[] = [];

    registry.registerAction({
      id: 'test.open',
      run: ({ source, args }) => {
        seen.push(`${source}:${args?.slug ?? 'none'}`);
      }
    });

    expect(registry.hasAction('test.open')).toBe(true);
    expect(registry.runAction('test.open', { controller, source: 'navigation', args: { slug: 'library' } })).toBe(true);
    expect(registry.runAction('missing.action', { controller, source: 'navigation' })).toBe(false);
    expect(seen).toEqual(['navigation:library']);
  });

  it('reports action result details for missing and failing handlers', async () => {
    const registry = createWorkbenchRenderRegistry();
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));

    registry.registerAction({
      id: 'test.fail',
      run: () => {
        throw new Error('Nope');
      }
    });

    const missing = await registry.runActionResult('missing.action', { controller, source: 'host' });
    const failed = await registry.runActionResult('test.fail', { controller, source: 'host' });

    expect(missing).toEqual({ handled: false, success: false });
    expect(failed.handled).toBe(true);
    expect(failed.success).toBe(false);
    expect(failed.error?.actionId).toBe('test.fail');
    expect(failed.error?.message).toBe('Nope');
    expect(registry.lastActionResult).toBe(failed);
  });
});
