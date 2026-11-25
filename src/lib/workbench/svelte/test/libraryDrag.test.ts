import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../../core';
import { createWorkbenchController } from '../controller.svelte';
import { commitPanelDragOut } from '../libraryDrag';

function controller() {
  return createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
}

describe('commitPanelDragOut (library drag-out drop)', () => {
  it('nothing to run counts as cancelled', () => {
    const c = controller();
    expect(commitPanelDragOut(c, null)).toBe(false);
    expect(commitPanelDragOut(c, [])).toBe(false);
  });

  it('a committed batch reports true', () => {
    const c = controller();
    const result = commitPanelDragOut(c, [{ type: 'panel.add', panel: { id: 'p', type: 't.p', title: 'P' }, region: 'main' }]);
    expect(result).toBe(true);
    expect(c.activeLayout!.panels.p).toBeDefined();
  });

  it('a refused batch reports "refused" and keeps the reducer error for the edit bar', () => {
    const c = controller();
    commitPanelDragOut(c, [{ type: 'panel.add', panel: { id: 'p', type: 't.p', title: 'P', singletonKey: 'k' }, region: 'main' }]);
    const result = commitPanelDragOut(c, [{ type: 'panel.add', panel: { id: 'q', type: 't.p', title: 'Q', singletonKey: 'k' }, region: 'main' }]);
    expect(result).toBe('refused');
    expect(c.lastResult?.error?.code).toBe('duplicate-singleton');
  });
});
