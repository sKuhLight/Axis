/**
 * Capability gates for Axis widget types (legacy TopBar parity, src/lib/CLAUDE.md
 * "Feature gating"). Fed to the generic workbench through
 * `registerWidgetSizing({ isAvailable })`, so a gated widget is neither mounted
 * nor counted by the bar auto-fit, and through `registerWidgetCatalogProvider`
 * (`unavailableReason`), so the Add palette lists it greyed at the end with the
 * reason. Pure so it can be unit-tested.
 */
export interface AxisWidgetCaps {
  sceneCount: number;
  hasTuner: boolean;
  hasTempo: boolean;
  hasTelemetryControl: boolean;
}

/**
 * Why a widget type cannot render right now, or null when it can. Before the
 * caps load (no device yet) every gated type reports its reason.
 */
export function axisWidgetUnavailableReason(type: string, caps: AxisWidgetCaps): string | null {
  switch (type) {
    case 'axis.scenes':
      return caps.sceneCount > 0 ? null : 'Needs a device with scenes';
    case 'axis.tuner':
      return caps.hasTuner ? null : 'Needs a device with a tuner';
    case 'axis.tempo':
      return caps.hasTempo ? null : 'Needs a device with tempo';
    case 'axis.telemetry':
      return caps.hasTelemetryControl ? null : 'Needs telemetry control (newer server)';
    default:
      return null;
  }
}

export function axisWidgetAvailable(type: string, caps: AxisWidgetCaps): boolean {
  return axisWidgetUnavailableReason(type, caps) === null;
}
