import { describe, expect, it } from 'vitest';
import { axisWidgetAvailable, axisWidgetUnavailableReason, type AxisWidgetCaps } from '../widgets/widgetAvailability';

const ALL: AxisWidgetCaps = { sceneCount: 8, hasTuner: true, hasTempo: true, hasTelemetryControl: true };
const NONE: AxisWidgetCaps = { sceneCount: 0, hasTuner: false, hasTempo: false, hasTelemetryControl: false };

describe('axisWidgetAvailable', () => {
  it('shows every gated widget when the device has the capability', () => {
    for (const type of ['axis.scenes', 'axis.tuner', 'axis.tempo', 'axis.telemetry']) {
      expect(axisWidgetAvailable(type, ALL)).toBe(true);
    }
  });

  it('hides scenes, tuner, tempo and telemetry without the capability (or before caps load)', () => {
    for (const type of ['axis.scenes', 'axis.tuner', 'axis.tempo', 'axis.telemetry']) {
      expect(axisWidgetAvailable(type, NONE)).toBe(false);
    }
  });

  it('gates each widget on its own capability', () => {
    const am4Like: AxisWidgetCaps = { sceneCount: 4, hasTuner: true, hasTempo: false, hasTelemetryControl: false };
    expect(axisWidgetAvailable('axis.scenes', am4Like)).toBe(true);
    expect(axisWidgetAvailable('axis.tuner', am4Like)).toBe(true);
    expect(axisWidgetAvailable('axis.tempo', am4Like)).toBe(false);
  });

  it('never gates ungated widget types', () => {
    for (const type of ['axis.preset', 'axis.save', 'axis.view', 'axis.cpu', 'axis.connection', 'custom.widget']) {
      expect(axisWidgetAvailable(type, NONE)).toBe(true);
    }
  });
});

describe('axisWidgetUnavailableReason', () => {
  it('names the missing capability of each gated widget', () => {
    expect(axisWidgetUnavailableReason('axis.scenes', NONE)).toBe('Needs a device with scenes');
    expect(axisWidgetUnavailableReason('axis.tuner', NONE)).toBe('Needs a device with a tuner');
    expect(axisWidgetUnavailableReason('axis.tempo', NONE)).toBe('Needs a device with tempo');
    expect(axisWidgetUnavailableReason('axis.telemetry', NONE)).toBe('Needs telemetry control (newer server)');
  });

  it('is null whenever the widget can render (and agrees with axisWidgetAvailable)', () => {
    for (const type of ['axis.scenes', 'axis.tuner', 'axis.tempo', 'axis.telemetry', 'axis.preset', 'custom.widget']) {
      expect(axisWidgetUnavailableReason(type, ALL)).toBeNull();
      for (const caps of [ALL, NONE]) {
        expect(axisWidgetAvailable(type, caps)).toBe(axisWidgetUnavailableReason(type, caps) === null);
      }
    }
  });
});
