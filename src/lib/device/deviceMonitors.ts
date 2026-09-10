// The per-block monitor (meter) param table, scoped to one device family.
//
// `GET /preset/monitors` returns a flat `paramName → { pid, role, family, dB range }` table. Blocks read
// it to tell which of their controls are read-only meters rather than editable knobs.

import type { MonitorEntry, MonitorParams } from '$lib/types';

/** Monitor rows for ONE device family (e.g. `DISTORT`), keyed by device-true pid.
 *
 *  Family scoping is NOT optional. Monitor pids are unique only within a family: pid 8 is
 *  `INPUT_GAINMONITOR` in INPUT but `Bass 1` in the amp, and pid 61 is `CABINET_VUMETER` in CABINET but
 *  `Freq 1` in the delay. Matching a monitor on pid alone would render real, editable knobs as
 *  read-only meters in unrelated blocks. */
export function monitorsByFamily(
  table: MonitorParams | null | undefined,
  family: string | null | undefined
): Map<number, MonitorEntry> {
  const out = new Map<number, MonitorEntry>();
  if (!table || !family) return out;
  for (const [token, m] of Object.entries(table)) {
    if (m.family === family) out.set(m.pid, { ...m, token });
  }
  return out;
}
