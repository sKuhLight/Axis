import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, ensureAxisGridControlWidgets } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

const stripGridControls = (doc: ReturnType<typeof createAxisWorkbenchDefaultDocument>) => {
  const layout = selectActiveLayout(doc)!;
  delete layout.widgets['axis.widget.gridMode'];
  delete layout.widgets['axis.widget.blockSize'];
  return doc;
};

describe('ensureAxisGridControlWidgets', () => {
  it('seeds gridMode/blockSize into a grid layout that lost both', () => {
    const doc = ensureAxisGridControlWidgets(stripGridControls(createAxisWorkbenchDefaultDocument()));
    const layout = selectActiveLayout(doc)!;
    expect(layout.widgets['axis.widget.gridMode']).toMatchObject({ type: 'axis.gridMode', zone: 'gridbar' });
    expect(layout.widgets['axis.widget.blockSize']).toMatchObject({ type: 'axis.blockSize', zone: 'gridbar' });
  });

  it('is a no-op when the widgets exist — including when hidden by the user', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.gridMode'].zone = 'hidden';
    const before = JSON.stringify(doc);
    ensureAxisGridControlWidgets(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('ignores layouts without a signal grid panel', () => {
    const doc = stripGridControls(createAxisWorkbenchDefaultDocument());
    const layout = selectActiveLayout(doc)!;
    delete layout.panels['axis.signalGrid'];
    ensureAxisGridControlWidgets(doc);
    expect(layout.widgets['axis.widget.gridMode']).toBeUndefined();
  });

  it('is idempotent', () => {
    const doc = ensureAxisGridControlWidgets(stripGridControls(createAxisWorkbenchDefaultDocument()));
    const once = JSON.stringify(doc);
    ensureAxisGridControlWidgets(doc);
    expect(JSON.stringify(doc)).toBe(once);
  });
});
