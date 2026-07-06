import { describe, expect, it } from 'vitest';
import {
  AXIS_WIDGET_EST_WIDTH_FALLBACK,
  axisUnitEstWidth,
  axisUnitIsKeep,
  axisWidgetEstWidth,
  axisWidgetIsKeep
} from '../widgets/widgetEstWidths';

describe('axisWidgetEstWidth', () => {
  it('returns the design estW for known widget types', () => {
    expect(axisWidgetEstWidth('axis.preset')).toBe(250);
    expect(axisWidgetEstWidth('axis.scenes')).toBe(240);
    expect(axisWidgetEstWidth('axis.fcSwitchView')).toBe(220);
    expect(axisWidgetEstWidth('axis.tuner')).toBe(78);
    expect(axisWidgetEstWidth('axis.paramControl')).toBe(128);
  });

  it('falls back to the design fallback for unknown types', () => {
    expect(axisWidgetEstWidth('axis.unknownWidget')).toBe(AXIS_WIDGET_EST_WIDTH_FALLBACK);
    expect(AXIS_WIDGET_EST_WIDTH_FALLBACK).toBe(120);
  });

  it('keeps the flexing hint widget small so it never forces a squeeze', () => {
    expect(axisWidgetEstWidth('axis.hint')).toBeLessThanOrEqual(40);
  });
});

describe('axis keep-set (design {preset, save})', () => {
  it('protects preset and save', () => {
    expect(axisWidgetIsKeep('axis.preset')).toBe(true);
    expect(axisWidgetIsKeep('axis.save')).toBe(true);
  });

  it('does not protect other widgets', () => {
    expect(axisWidgetIsKeep('axis.scenes')).toBe(false);
    expect(axisWidgetIsKeep('axis.cpu')).toBe(false);
  });
});

describe('unit-level helpers (groups)', () => {
  it('sums member estW for a group unit', () => {
    expect(axisUnitEstWidth([{ type: 'axis.tuner' }, { type: 'axis.tempo' }])).toBe(78 + 82);
  });

  it('a unit is keep-protected if any member is in the keep-set', () => {
    expect(axisUnitIsKeep([{ type: 'axis.scenes' }, { type: 'axis.preset' }])).toBe(true);
    expect(axisUnitIsKeep([{ type: 'axis.scenes' }, { type: 'axis.cpu' }])).toBe(false);
  });
});
