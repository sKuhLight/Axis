import type { LiveMonitor, NamedParam } from '../types';
import type { BeCtl } from './catalog';
import type { MeterReading } from './boardView';

/** A parameter meter is bound by its served symbol. Never substitute another meter's reading. */
export function controlMeterReadings(
  ctl: BeCtl | undefined,
  monitors: readonly LiveMonitor[],
  enabled: boolean,
  param?: NamedParam
): (MeterReading | null)[] {
  if (!enabled || ctl?.kind !== 'meter') return [null];
  if (ctl.id < 0) return monitors.length ? [...monitors] : [null];
  const live = ctl.meterParamName ? monitors.find((m) => m.paramName === ctl.meterParamName) : undefined;
  if (live) return [live];
  // A named reading may expose a normalized value even when no audio monitor stream exists.
  // Missing norms/ranges stay unavailable instead of inventing a scale from display text.
  if (param?.norm == null || !Number.isFinite(param.norm)) return [null];
  return [{
    paramName: ctl.meterParamName ?? '',
    role: 'value',
    norm: Math.min(1, Math.max(0, param.norm)),
    db: param.unit === 'dB' && Number.isFinite(param.value) ? param.value : null
  }];
}
