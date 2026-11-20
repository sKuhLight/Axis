/**
 * Status text for the workbench preset and connection widgets. Kept pure so it
 * can be unit-tested (vitest runs without a DOM).
 */
export type AxisConnState = 'connecting' | 'online' | 'offline';

export interface AxisConnLike {
  state: AxisConnState;
  /**
   * Name of the auto-detected unit (`editor.detected.short`, e.g. "AM4"). Not
   * `conn.device`: /healthz reports the provisional FM3 profile for non-gen-3
   * devices and when nothing is attached.
   */
  device?: string;
  /** Firmware version as reported by `/device`. */
  fw?: string;
}

/**
 * Preset-name text: the live name, an em dash while online before a name is
 * known, otherwise "offline". Mirrors the legacy TopBar.
 */
export function axisPresetDisplayName(name: string | null | undefined, state: AxisConnState): string {
  if (name) return name;
  return state === 'online' ? '—' : 'offline';
}

/**
 * Connection-widget text: "<device> · FW<version>" built from what the device
 * reported, falling back to "online" when neither is known and to the bare
 * connection state while not online.
 */
export function axisConnectionLabel(conn: AxisConnLike): string {
  if (conn.state !== 'online') return conn.state;
  const parts = [conn.device?.trim(), conn.fw ? `FW${conn.fw}` : ''].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : 'online';
}
