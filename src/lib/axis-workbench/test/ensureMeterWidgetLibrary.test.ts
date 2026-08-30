import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument, ensureAxisMeterWidgetLibrary } from '../axisWorkbenchDefaults';

const stripMeterTemplate = (doc: ReturnType<typeof createAxisWorkbenchDefaultDocument>) => {
  delete doc.widgetLibrary['axis.library.widget.meter'];
  return doc;
};

describe('ensureAxisMeterWidgetLibrary', () => {
  it('seeds the Meter template into a doc that lost it', () => {
    const doc = ensureAxisMeterWidgetLibrary(stripMeterTemplate(createAxisWorkbenchDefaultDocument()));
    expect(doc.widgetLibrary['axis.library.widget.meter']).toMatchObject({
      title: 'Meter'
    });
    expect(doc.widgetLibrary['axis.library.widget.meter'].widgets['axis.widget.meterToggle']).toMatchObject({
      type: 'axis.meterToggle',
      zone: 'top.right'
    });
  });

  it('is a no-op when the template already exists', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const before = JSON.stringify(doc);
    ensureAxisMeterWidgetLibrary(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('is idempotent', () => {
    const doc = ensureAxisMeterWidgetLibrary(stripMeterTemplate(createAxisWorkbenchDefaultDocument()));
    const once = JSON.stringify(doc);
    ensureAxisMeterWidgetLibrary(doc);
    expect(JSON.stringify(doc)).toBe(once);
  });
});
