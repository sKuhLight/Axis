// Poll-interval selection for the connection/preset-watch loops (META-17, AXIS-40).
//
// The two background loops driven from routes/+page.svelte — `editor.poll()` (connection + current
// preset) and `editor.watchPreset()` (device-side preset-change detection) — run on setIntervals whose
// period depends on the active telemetry polling mode. Faster modes reflect device changes sooner at the
// cost of more serial traffic; slower modes keep a stage rig quiet.

import type { TelemetryMode } from './types';

export interface PollIntervals {
  pollMs: number;
  watchMs: number;
}

/** Per-mode base intervals. */
const MODE_INTERVALS: Record<TelemetryMode, PollIntervals> = {
  performance: { pollMs: 5000, watchMs: 4000 },
  balanced: { pollMs: 8000, watchMs: 6000 },
  reduced: { pollMs: 15000, watchMs: 12000 }
};

/** Resolve the poll + watch interval (ms) for a telemetry mode. */
export function pollIntervalsFor(mode: TelemetryMode): PollIntervals {
  return { ...(MODE_INTERVALS[mode] ?? MODE_INTERVALS.balanced) };
}
