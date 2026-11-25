import { describe, expect, it } from 'vitest';
import {
  AXIS_STATIC_PREVIEW_WIDGET_TYPES,
  AXIS_WIDGET_LABELS,
  axisCanonicalWidgets,
  axisPanelGlyph,
  axisWidgetGlyph,
  axisWidgetPreviewIsStatic,
  axisWidgetPreviewScale
} from '../axisAddPalette';
import { AXIS_WORKBENCH_WIDGET_TYPES } from '../axisWorkbenchRegistryManifest';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { buildWidgetCatalog, selectActiveLayout, widgetCatalogAddCommands, reduceWorkbenchDocument } from '../../workbench/core';

describe('axisCanonicalWidgets', () => {
  it('offers every manifest widget type except the parameter control, once, with a label and the default id', () => {
    const specs = axisCanonicalWidgets();
    const types = specs.map((spec) => spec.type);
    expect(types).toEqual(AXIS_WORKBENCH_WIDGET_TYPES.filter((type) => type !== 'axis.paramControl'));
    expect(new Set(types).size).toBe(types.length);
    for (const spec of specs) {
      expect(spec.label).toBe(AXIS_WIDGET_LABELS[spec.type]);
      expect(spec.id).toBe(`axis.widget.${spec.type.replace(/^axis\./, '')}`);
    }
  });

  it('adds multiple independent dividers instead of moving the previous one', () => {
    let doc = createAxisWorkbenchDefaultDocument();
    const canonical = axisCanonicalWidgets();
    const spec = canonical.find((s) => s.type === 'axis.horizontalDivider')!;
    expect(spec.repeatable).toBe(true);
    expect(spec.state).toEqual({ label: 'Section', grid: { fullRow: true } });
    for (let i = 0; i < 2; i++) {
      const entry = buildWidgetCatalog(selectActiveLayout(doc), { canonical }).find((e) => e.type === spec.type)!;
      expect(entry.placement).toBe('absent');
      const commands = widgetCatalogAddCommands(doc, entry, { zone: 'top.left' });
      expect(commands[0].type).toBe('widget.add');
      for (const command of commands) doc = reduceWorkbenchDocument(doc, command).next;
    }
    const dividers = Object.values(selectActiveLayout(doc)!.widgets).filter((w) => w.type === spec.type);
    expect(dividers).toHaveLength(2);
    expect(new Set(dividers.map((w) => w.id)).size).toBe(2);
    expect(dividers[0].state).not.toBe(dividers[1].state);
  });

  it('every manifest type has a card label', () => {
    for (const type of AXIS_WORKBENCH_WIDGET_TYPES) expect(AXIS_WIDGET_LABELS[type]).toBeTruthy();
  });

  it('fresh grid controls start like the default document seeds', () => {
    const specs = axisCanonicalWidgets();
    expect(specs.find((spec) => spec.type === 'axis.gridMode')?.state).toEqual({ mode: 'auto' });
    expect(specs.find((spec) => spec.type === 'axis.blockSize')?.state).toEqual({ size: 'M' });
  });

  it('against the default document: seeded widgets are placed, the rest absent (built-ins move, never duplicate)', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const entries = buildWidgetCatalog(selectActiveLayout(doc), { canonical: axisCanonicalWidgets(), templates: doc.widgetLibrary });
    const preset = entries.find((entry) => entry.key === 'builtin:axis.preset');
    expect(preset).toMatchObject({ placement: 'placed', zone: 'top.left', instanceId: 'axis.widget.preset' });
    expect(entries.find((entry) => entry.key === 'builtin:axis.search')).toMatchObject({ placement: 'hidden' });
    expect(entries.find((entry) => entry.key === 'builtin:axis.gridMap')).toMatchObject({ placement: 'absent' });
    expect(entries.filter((entry) => entry.source === 'template').map((entry) => entry.title)).toEqual([
      'Grid Controls',
      'History',
      'Preset',
      'Status',
      'Tuner + Tempo'
    ]);
  });
});

describe('previews', () => {
  it('types with mount side effects get a static preview', () => {
    expect([...AXIS_STATIC_PREVIEW_WIDGET_TYPES].sort()).toEqual(
      ['axis.fcDevice', 'axis.fcLayouts', 'axis.fcSwitchView', 'axis.paramControl', 'axis.telemetry'].sort()
    );
    expect(axisWidgetPreviewIsStatic('axis.telemetry')).toBe(true);
    expect(axisWidgetPreviewIsStatic('axis.preset')).toBe(false);
    expect(axisWidgetGlyph('axis.fcLayouts')).toBe('⬚');
    expect(axisWidgetGlyph('axis.paramControl')).toBe('◔');
  });

  it('wide widgets scale down to the card, never up', () => {
    expect(axisWidgetPreviewScale(250)).toBeCloseTo(0.7, 2);
    expect(axisWidgetPreviewScale(80)).toBe(1);
    expect(axisWidgetPreviewScale(0)).toBe(1);
  });

  it('panel schematics: a glyph per panel family', () => {
    expect(axisPanelGlyph('axis.signalGrid')).toBe('▦');
    expect(axisPanelGlyph('axis.presetBrowser.list')).toBe('≣');
    expect(axisPanelGlyph('axis.fc.switches')).toBe('⬚');
    expect(axisPanelGlyph('axis.blockEditor.modifiers')).toBe('◧');
    expect(axisPanelGlyph('axis.convertGrid')).toBe('⇄');
    expect(axisPanelGlyph('other.panel')).toBe('▢');
  });
});
