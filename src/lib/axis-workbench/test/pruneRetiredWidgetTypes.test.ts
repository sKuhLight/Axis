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

  it('seeds no meter toggle widget anywhere', () => {
    const layout = selectActiveLayout(createAxisWorkbenchDefaultDocument())!;
    const types = Object.values(layout.widgets).map((w) => w.type);
    expect(types).not.toContain('axis.meterToggle');
    expect(layout.widgets['axis.widget.meterToggle']).toBeUndefined();
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

  it('strips a pre-removal meter toggle widget from any zone', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const layout = selectActiveLayout(doc)!;
    layout.widgets['axis.widget.meterToggle'] = {
      id: 'axis.widget.meterToggle',
      type: 'axis.meterToggle',
      zone: 'top.right',
      order: 5,
      size: 'default'
    };

    pruneAxisRetiredWidgetTypes(doc);

    expect(layout.widgets['axis.widget.meterToggle']).toBeUndefined();
  });

  it('drops a widget-library template left holding only retired types', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    doc.widgetLibrary['axis.library.widget.meter'] = {
      id: 'axis.library.widget.meter',
      title: 'Meter',
      widgets: {
        'axis.widget.meterToggle': {
          id: 'axis.widget.meterToggle',
          type: 'axis.meterToggle',
          zone: 'top.right',
          order: 0,
          size: 'default'
        }
      }
    };

    pruneAxisRetiredWidgetTypes(doc);

    expect(doc.widgetLibrary['axis.library.widget.meter']).toBeUndefined();
  });

  it('keeps a widget-library template that still holds a live widget', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    doc.widgetLibrary['axis.library.widget.mixed'] = {
      id: 'axis.library.widget.mixed',
      title: 'Mixed',
      widgets: {
        'axis.widget.meterToggle': {
          id: 'axis.widget.meterToggle',
          type: 'axis.meterToggle',
          zone: 'top.right',
          order: 0,
          size: 'default'
        },
        'axis.widget.cpu': { id: 'axis.widget.cpu', type: 'axis.cpu', zone: 'top.right', order: 1, size: 'default' }
      }
    };

    pruneAxisRetiredWidgetTypes(doc);

    expect(doc.widgetLibrary['axis.library.widget.mixed'].widgets['axis.widget.meterToggle']).toBeUndefined();
    expect(doc.widgetLibrary['axis.library.widget.mixed'].widgets['axis.widget.cpu']).toBeDefined();
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
