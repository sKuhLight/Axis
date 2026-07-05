import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../../core';
import { createWorkbenchController } from '../controller.svelte';
import { createWorkbenchRenderRegistry } from '../renderRegistry';

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
