// Poll-interval selection for the connection/preset-watch loops (META-17, AXIS-40).
//
// The two background loops driven from routes/+page.svelte — `editor.poll()` (connection + current
// preset) and `editor.watchPreset()` (device-side preset-change detection) — run on setIntervals whose
// period depends on the active telemetry polling mode. Faster modes reflect device changes sooner at the
// cost of more serial/relay traffic; slower modes keep a stage rig quiet.
//
// Remote (Axis Cloud Remote) sessions are event-driven — the host pushes live changes over the relay, so
// each poll is a metered Realtime round-trip we want to keep rare. When remote is active we take the
// SLOWER of the remote floor and the mode's own intervals (max), so switching to a faster mode never
// makes a remote session poll more aggressively than the relay budget allows.

import type { TelemetryMode } from './types';

export interface PollIntervals {
  pollMs: number;
  watchMs: number;
}

/** Per-mode base intervals for the local/direct path. */
const MODE_INTERVALS: Record<TelemetryMode, PollIntervals> = {
  performance: { pollMs: 5000, watchMs: 4000 },
  balanced: { pollMs: 8000, watchMs: 6000 },
  reduced: { pollMs: 15000, watchMs: 12000 }
};

/** Relay floor for remote sessions — a slow heartbeat is enough to track connection + slot changes. */
const REMOTE_INTERVALS: PollIntervals = { pollMs: 20000, watchMs: 25000 };

/**
 * Resolve the poll + watch interval (ms) for a telemetry mode. When `remoteActive`, the remote floor and
 * the mode intervals are combined per-loop with `max`, so a remote session never polls faster than the
 * relay floor even under `performance`.
 */
export function pollIntervalsFor(mode: TelemetryMode, remoteActive: boolean): PollIntervals {
  const base = MODE_INTERVALS[mode] ?? MODE_INTERVALS.balanced;
  if (!remoteActive) return { ...base };
  return {
    pollMs: Math.max(REMOTE_INTERVALS.pollMs, base.pollMs),
    watchMs: Math.max(REMOTE_INTERVALS.watchMs, base.watchMs)
  };
}
