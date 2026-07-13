// Pure per-second rate computation for the workbench telemetry widget (META-17, AXIS-43).
//
// The device pushes CUMULATIVE traffic counters (`traffic` DeviceEvent → editor.traffic). The widget
// keeps the previous snapshot locally and derives instantaneous rates from the delta over the wall-clock
// gap between two snapshots. Kept pure + unit-tested; the widget only holds the "previous snapshot" state.

import type { TrafficSnapshot } from '../../types';

export interface TrafficRates {
  /** TX/RX messages per second. */
  txMsgs: number;
  rxMsgs: number;
  /** TX/RX kilobytes per second. */
  txKB: number;
  rxKB: number;
}

/**
 * Compute per-second TX/RX rates from two cumulative snapshots taken at `prevAtMs` and `nextAtMs`.
 * Returns null when a rate can't be derived: missing snapshot, non-positive time gap, or a counter reset
 * (any counter went backwards — e.g. a reconnect zeroed `since`). A reset yields null rather than a
 * bogus negative/huge spike; the widget then just shows the fresh snapshot and waits for the next one.
 */
export function computeTrafficRates(
  prev: TrafficSnapshot | null,
  prevAtMs: number,
  next: TrafficSnapshot | null,
  nextAtMs: number
): TrafficRates | null {
  if (!prev || !next) return null;
  const dtSec = (nextAtMs - prevAtMs) / 1000;
  if (!(dtSec > 0)) return null;
  const dTxMsgs = next.txMsgs - prev.txMsgs;
  const dRxMsgs = next.rxMsgs - prev.rxMsgs;
  const dTxBytes = next.txBytes - prev.txBytes;
  const dRxBytes = next.rxBytes - prev.rxBytes;
  // Counter reset (reconnect) — any delta below zero → don't emit a rate this tick.
  if (dTxMsgs < 0 || dRxMsgs < 0 || dTxBytes < 0 || dRxBytes < 0) return null;
  return {
    txMsgs: dTxMsgs / dtSec,
    rxMsgs: dRxMsgs / dtSec,
    txKB: dTxBytes / 1024 / dtSec,
    rxKB: dRxBytes / 1024 / dtSec
  };
}

/** Format a rate for the compact readout: <10 → one decimal, else rounded. */
export function formatRate(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}
