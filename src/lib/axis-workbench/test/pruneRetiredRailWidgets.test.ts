import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, pruneAxisRetiredRailWidgets } from '../axisWorkbenchDefaults';
import { selectActiveLayout } from '../../workbench';

describe('V13c rail cleanup — default document', () => {
  it('seeds no History or account-avatar widget onto the rail (connection only)', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    const railTypes = Object.values(layout.widgets)
      .filter((w) => w.zone === 'rail')
      .map((w) => w.type);
    expect(railTypes).toEqual(['axis.connection']);
    expect(layout.widgets['axis.widget.history']).toBeUndefined();
    expect(layout.widgets['axis.widget.account']).toBeUndefined();
  });

  it('keeps the single account entry on the nav rail (Axis Cloud)', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    expect(layout.navigation.entries.account).toMatchObject({ label: 'Axis Cloud', fixedSlot: 'rail.footer' });
    expect(layout.navigation.order).toContain('account');
  });

  it('still offers the History widget in the widget library so it can be re-added', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const template = doc.widgetLibrary['axis.library.widget.history'];
    expect(template).toBeDefined();
    expect(Object.values(template.widgets).map((w) => w.type)).toContain('axis.history');
  });
});

describe('pruneAxisRetiredRailWidgets — persisted-doc migration', () => {
  it('strips pre-V13c rail History and account-avatar widget instances', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    // Re-introduce the retired instances as a pre-V13c persisted doc would carry them.
    layout.widgets['axis.widget.history'] = { id: 'axis.widget.history', type: 'axis.history', zone: 'rail', order: 0, size: 'compact' };
    layout.widgets['axis.widget.account'] = { id: 'axis.widget.account', type: 'axis.account', zone: 'rail', order: 1, size: 'compact', locked: true };

    pruneAxisRetiredRailWidgets(doc);

    expect(layout.widgets['axis.widget.history']).toBeUndefined();
    expect(layout.widgets['axis.widget.account']).toBeUndefined();
  });

  it('leaves a same-id widget the user placed outside the rail untouched', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.history'] = { id: 'axis.widget.history', type: 'axis.history', zone: 'top.right', order: 3, size: 'default' };

    pruneAxisRetiredRailWidgets(doc);

    expect(layout.widgets['axis.widget.history']).toMatchObject({ zone: 'top.right' });
  });

  it('is idempotent and never crashes on a clean document', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    expect(() => pruneAxisRetiredRailWidgets(pruneAxisRetiredRailWidgets(doc))).not.toThrow();
  });
});
