import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, pruneAxisRetiredWidgetTypes } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

describe('retired widget types — default document', () => {
  it('seeds no addBlock widget anywhere', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    const types = Object.values(layout.widgets).map((w) => w.type);
    expect(types).not.toContain('axis.addBlock');
    expect(layout.widgets['axis.widget.addBlock']).toBeUndefined();
  });

  it('seeds no view widget anywhere', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    const types = Object.values(layout.widgets).map((w) => w.type);
    expect(types).not.toContain('axis.view');
    expect(layout.widgets['axis.widget.view']).toBeUndefined();
  });
});

describe('pruneAxisRetiredWidgetTypes — persisted-doc migration', () => {
  it('strips a pre-removal addBlock widget from any zone', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.addBlock'] = { id: 'axis.widget.addBlock', type: 'axis.addBlock', zone: 'top.right', order: 1, size: 'default' };

    pruneAxisRetiredWidgetTypes(doc);

    expect(layout.widgets['axis.widget.addBlock']).toBeUndefined();
  });

  it('strips a pre-removal view widget from any zone', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.view'] = { id: 'axis.widget.view', type: 'axis.view', zone: 'top.right', order: 0, size: 'default' };

    pruneAxisRetiredWidgetTypes(doc);

    expect(layout.widgets['axis.widget.view']).toBeUndefined();
  });

  it('leaves every other widget untouched', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    const before = Object.keys(layout.widgets);

    pruneAxisRetiredWidgetTypes(doc);

    expect(Object.keys(layout.widgets).sort()).toEqual(before.sort());
  });

  it('is idempotent and never crashes on a clean document', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    expect(() => pruneAxisRetiredWidgetTypes(pruneAxisRetiredWidgetTypes(doc))).not.toThrow();
  });
});
