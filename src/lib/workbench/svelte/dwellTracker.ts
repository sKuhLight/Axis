/**
 * Dwell-to-group (slice 4b). A plain widget drop always INSERTS; grouping needs
 * intent: the pointer has to rest on a foreign unit (a loose widget or a group
 * module) for {@link WIDGET_DWELL_MS} without drifting more than
 * {@link WIDGET_DWELL_RADIUS_PX} from where the rest began. That arms grouping
 * with the unit — the drag shows a "Group" frame and a release groups (or adds
 * to the group) instead of inserting.
 *
 * Rules (from the layout-editor prototype's `moveWidgetDrag`):
 *  - a new unit under the pointer, or a drift past the radius, restarts the rest;
 *  - once armed, the arm holds while the pointer stays on that unit (it may move
 *    around inside it);
 *  - leaving the unit (another unit, a gap, nothing) drops the arm and the rest.
 *
 * Pure: time is injected (`now`), so every rule is unit-tested. The drag
 * session owns the timer that re-checks at the deadline ({@link dwellRemaining})
 * so the frame appears while the pointer is perfectly still.
 */
import { pointerDistance, type WorkbenchPointer } from './drag';

/** How long the pointer rests on a foreign unit before grouping arms. */
export const WIDGET_DWELL_MS = 350;
/** How far (px) the pointer may drift during the rest. */
export const WIDGET_DWELL_RADIUS_PX = 10;

export interface DwellConfig {
  ms: number;
  radius: number;
}

export const DEFAULT_DWELL_CONFIG: DwellConfig = { ms: WIDGET_DWELL_MS, radius: WIDGET_DWELL_RADIUS_PX };

export interface DwellState {
  /** The unit the pointer is resting on (null = none). */
  candidate: string | null;
  /** Where the current rest began; the radius is measured from here. */
  anchor: WorkbenchPointer | null;
  /** When the current rest began (same clock as `now`). */
  since: number;
  /** The unit grouping is armed for (always the candidate), or null. */
  armed: string | null;
}

export const DWELL_IDLE: DwellState = Object.freeze({ candidate: null, anchor: null, since: 0, armed: null });

/** Feed the unit under the pointer (null = none) at `now`. */
export function dwellMove(
  state: DwellState,
  target: string | null,
  pointer: WorkbenchPointer,
  now: number,
  config: DwellConfig = DEFAULT_DWELL_CONFIG
): DwellState {
  if (!target) return state.candidate || state.armed ? DWELL_IDLE : state;
  // Armed: the arm holds while the pointer stays on the same unit.
  if (state.armed === target) return state;
  if (state.candidate !== target || !state.anchor || pointerDistance(state.anchor, pointer) > config.radius) {
    return { candidate: target, anchor: { x: pointer.x, y: pointer.y }, since: now, armed: null };
  }
  return dwellTick(state, now, config);
}

/** Re-check a rest without a pointer change (the session's deadline timer). */
export function dwellTick(state: DwellState, now: number, config: DwellConfig = DEFAULT_DWELL_CONFIG): DwellState {
  if (!state.candidate || state.armed) return state;
  return now - state.since >= config.ms ? { ...state, armed: state.candidate } : state;
}

/** Ms until the pending rest arms (0 = due now), or null when nothing is pending. */
export function dwellRemaining(state: DwellState, now: number, config: DwellConfig = DEFAULT_DWELL_CONFIG): number | null {
  if (!state.candidate || state.armed) return null;
  return Math.max(0, state.since + config.ms - now);
}

export interface DwellTracker {
  readonly state: DwellState;
  /** Feed the unit under the pointer (null = none); returns the new state. */
  move(target: string | null, pointer: WorkbenchPointer): DwellState;
  /** Re-check at the current time; returns the new state. */
  tick(): DwellState;
  /** Ms until the pending rest arms, or null when nothing is pending. */
  remaining(): number | null;
  reset(): void;
}

/** A stateful wrapper over the pure steps, with an injected clock. */
export function createDwellTracker(options: { now: () => number; config?: DwellConfig }): DwellTracker {
  const config = options.config ?? DEFAULT_DWELL_CONFIG;
  let state: DwellState = DWELL_IDLE;
  return {
    get state() {
      return state;
    },
    move(target, pointer) {
      state = dwellMove(state, target, pointer, options.now(), config);
      return state;
    },
    tick() {
      state = dwellTick(state, options.now(), config);
      return state;
    },
    remaining() {
      return dwellRemaining(state, options.now(), config);
    },
    reset() {
      state = DWELL_IDLE;
    }
  };
}
