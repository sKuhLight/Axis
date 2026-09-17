import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, ensureAxisNewPresetWidgetPlacement, ensureAxisSaveWidgetPlacement } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

describe('default document — New preset (+) placement', () => {
  it('seeds the + to the right of the scene/pencil widget, before Save, in top.left', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    const scenes = layout.widgets['axis.widget.scenes'];
    const plus = layout.widgets['axis.widget.newPreset'];
    const save = layout.widgets['axis.widget.save'];
    expect(plus).toMatchObject({ type: 'axis.newPreset', zone: 'top.left' });
    expect(plus.order).toBe(scenes.order + 1);
    expect(save.order).toBe(plus.order + 1);
  });
});

describe('ensureAxisNewPresetWidgetPlacement — persisted-doc migration', () => {
  it('inserts the + after Scenes and opens a slot for Save on a doc minted without it', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    delete layout.widgets['axis.widget.newPreset'];

    ensureAxisNewPresetWidgetPlacement(doc);

    const plus = layout.widgets['axis.widget.newPreset'];
    expect(plus).toMatchObject({ type: 'axis.newPreset', zone: 'top.left' });
    expect(plus.order).toBe(layout.widgets['axis.widget.scenes'].order + 1);
    // Save is re-seated after the + by its own normalization.
    ensureAxisSaveWidgetPlacement(doc);
    expect(layout.widgets['axis.widget.save'].order).toBe(plus.order + 1);
  });

  it('leaves a layout with no top-bar Scenes alone', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    delete layout.widgets['axis.widget.newPreset'];
    delete layout.widgets['axis.widget.scenes'];

    ensureAxisNewPresetWidgetPlacement(doc);

    expect(layout.widgets['axis.widget.newPreset']).toBeUndefined();
  });

  it('is idempotent once present', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    ensureAxisNewPresetWidgetPlacement(doc);
    const once = JSON.stringify(doc);
    ensureAxisNewPresetWidgetPlacement(doc);
    expect(JSON.stringify(doc)).toBe(once);
  });
});
