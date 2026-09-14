import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, ensureAxisSaveWidgetPlacement } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

describe('default document — Save placement', () => {
  it('seeds Save beside the preset/scene names in top.left', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    expect(layout.widgets['axis.widget.save']).toMatchObject({ type: 'axis.save', zone: 'top.left' });
    expect(layout.widgets['axis.widget.save'].order).toBeGreaterThan(layout.widgets['axis.widget.scenes'].order);
  });
});

describe('ensureAxisSaveWidgetPlacement — persisted-doc migration', () => {
  it('moves a legacy top.right Save into top.left, after the names', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.save'].zone = 'top.right';
    layout.widgets['axis.widget.save'].order = 6;

    ensureAxisSaveWidgetPlacement(doc);

    expect(layout.widgets['axis.widget.save'].zone).toBe('top.left');
    expect(layout.widgets['axis.widget.save'].order).toBeGreaterThan(layout.widgets['axis.widget.scenes'].order);
  });

  it('follows Scenes into top.center when the layout parks it there', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    const scenes = layout.widgets['axis.widget.scenes'];
    scenes.zone = 'top.center';
    scenes.order = 0;
    layout.widgets['axis.widget.save'].zone = 'top.right';
    layout.widgets['axis.widget.save'].order = 1;

    ensureAxisSaveWidgetPlacement(doc);

    expect(layout.widgets['axis.widget.save'].zone).toBe('top.center');
    expect(layout.widgets['axis.widget.save'].order).toBe(scenes.order + 1);
    // Scenes itself is never displaced.
    expect(scenes.order).toBe(0);
  });

  it('leaves a Save parked outside the top bar alone when there is no Scenes', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    delete layout.widgets['axis.widget.scenes'];
    layout.widgets['axis.widget.save'].zone = 'hidden';

    ensureAxisSaveWidgetPlacement(doc);

    expect(layout.widgets['axis.widget.save'].zone).toBe('hidden');
  });

  it('does not resurrect a hidden Save even when Scenes is present', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.save'].zone = 'hidden';

    ensureAxisSaveWidgetPlacement(doc);

    expect(layout.widgets['axis.widget.save'].zone).toBe('hidden');
  });

  it('is a no-op when Save is already right after Scenes', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    const before = JSON.stringify(doc);
    ensureAxisSaveWidgetPlacement(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('is idempotent', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.save'].zone = 'top.right';
    layout.widgets['axis.widget.save'].order = 6;
    ensureAxisSaveWidgetPlacement(doc);
    const once = JSON.stringify(doc);
    ensureAxisSaveWidgetPlacement(doc);
    expect(JSON.stringify(doc)).toBe(once);
  });
});
