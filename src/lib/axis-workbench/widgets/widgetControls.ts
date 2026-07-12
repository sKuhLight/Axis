// Widget interaction helpers from the design spec (docs/workbench-dc-parity/02-widgets.md):
// hold-to-repeat for stepper controls (§1.3) and the FC-device roster/cycles (§2 fcdevice/fclayouts).

export const AXIS_HOLD_DELAY_MS = 380;
export const AXIS_HOLD_INTERVAL_MS = 100;

export interface AxisHoldRepeat {
  /** Arm on pointerdown; right-button presses are ignored. */
  start: (event?: { button?: number }) => void;
  /** Disarm on pointerup / pointerleave / teardown. */
  stop: () => void;
}

/** Design §1.3: 380ms arming delay, then repeat every 100ms; cleared on up/leave and window pointerup. */
export function createAxisHoldRepeat(fn: () => void): AxisHoldRepeat {
  let delay: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (delay) {
      clearTimeout(delay);
      delay = null;
    }
    if (repeat) {
      clearInterval(repeat);
      repeat = null;
    }
    if (typeof window !== 'undefined') window.removeEventListener('pointerup', stop);
  };
  const start = (event?: { button?: number }) => {
    if (event?.button === 2) return;
    stop();
    if (typeof window !== 'undefined') window.addEventListener('pointerup', stop);
    delay = setTimeout(() => {
      repeat = setInterval(fn, AXIS_HOLD_INTERVAL_MS);
    }, AXIS_HOLD_DELAY_MS);
  };
  return { start, stop };
}

export type AxisFcDevice = 'FM3' | 'FC-6' | 'FC-12';
export const AXIS_FC_DEVICES: readonly AxisFcDevice[] = ['FM3', 'FC-6', 'FC-12'];

export function readAxisFcDevice(value: unknown): AxisFcDevice {
  return value === 'FC-6' || value === 'FC-12' ? value : 'FM3';
}

export function cycleAxisFcDevice(device: AxisFcDevice): AxisFcDevice {
  return AXIS_FC_DEVICES[(AXIS_FC_DEVICES.indexOf(device) + 1) % AXIS_FC_DEVICES.length];
}

/** Mini fclayouts chip: tap advances (layout+1) % count (design: (fcLay+1)%9). */
export function cycleAxisFcLayout(layout: number, count: number): number {
  const span = Math.max(1, Math.floor(count));
  return (Math.max(0, Math.floor(layout)) + 1) % span;
}

/** Design chip labels: layouts 1…8 plus M(aster) at index 8. */
export function axisFcLayoutChipLabel(index: number): string {
  return index === 8 ? 'M' : String(index + 1);
}
