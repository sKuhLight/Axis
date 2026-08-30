import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, pruneAxisAddBlockWidgets } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

describe('Add Block widget removal — default document', () => {
  it('seeds no addBlock widget anywhere', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    const types = Object.values(layout.widgets).map((w) => w.type);
    expect(types).not.toContain('axis.addBlock');
    expect(layout.widgets['axis.widget.addBlock']).toBeUndefined();
  });
});

describe('pruneAxisAddBlockWidgets — persisted-doc migration', () => {
  it('strips a pre-removal addBlock widget from any zone', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.addBlock'] = { id: 'axis.widget.addBlock', type: 'axis.addBlock', zone: 'top.right', order: 1, size: 'default' };

    pruneAxisAddBlockWidgets(doc);

    expect(layout.widgets['axis.widget.addBlock']).toBeUndefined();
  });

  it('leaves every other widget untouched', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    const before = Object.keys(layout.widgets);

    pruneAxisAddBlockWidgets(doc);

    expect(Object.keys(layout.widgets).sort()).toEqual(before.sort());
  });

  it('is idempotent and never crashes on a clean document', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    expect(() => pruneAxisAddBlockWidgets(pruneAxisAddBlockWidgets(doc))).not.toThrow();
  });
});
