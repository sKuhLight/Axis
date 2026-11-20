/**
 * Capability gates for Axis widget types (legacy TopBar parity, src/lib/CLAUDE.md
 * "Feature gating"). Fed to the generic workbench through
 * `registerWidgetSizing({ isAvailable })`, so a gated widget is neither mounted
 * nor counted by the bar auto-fit. Pure so it can be unit-tested.
 */
export interface AxisWidgetCaps {
  sceneCount: number;
  hasTuner: boolean;
  hasTempo: boolean;
  hasTelemetryControl: boolean;
}

export function axisWidgetAvailable(type: string, caps: AxisWidgetCaps): boolean {
  switch (type) {
    case 'axis.scenes':
      return caps.sceneCount > 0;
    case 'axis.tuner':
      return caps.hasTuner;
    case 'axis.tempo':
      return caps.hasTempo;
    case 'axis.telemetry':
      return caps.hasTelemetryControl;
    default:
      return true;
  }
}
