import { describe, expect, it } from 'vitest';
import {
  createDwellTracker,
  dwellMove,
  dwellRemaining,
  dwellTick,
  DWELL_IDLE,
  WIDGET_DWELL_MS,
  WIDGET_DWELL_RADIUS_PX
} from '../dwellTracker';

const at = (x: number, y = 0) => ({ x, y });

describe('dwellTracker (slice 4b: grouping only by dwelling)', () => {
  it('uses the agreed 350 ms / 10 px', () => {
    expect(WIDGET_DWELL_MS).toBe(350);
    expect(WIDGET_DWELL_RADIUS_PX).toBe(10);
  });

  it('arms after 350 ms resting on one unit, not before', () => {
    let s = dwellMove(DWELL_IDLE, 'tuner', at(100), 1000);
    expect(s).toMatchObject({ candidate: 'tuner', armed: null, since: 1000 });
    s = dwellMove(s, 'tuner', at(103, 2), 1349);
    expect(s.armed).toBeNull();
    s = dwellMove(s, 'tuner', at(104, 3), 1350);
    expect(s.armed).toBe('tuner');
  });

  it('a timer tick arms a perfectly still pointer', () => {
    const s = dwellMove(DWELL_IDLE, 'tuner', at(100), 0);
    expect(dwellTick(s, 349).armed).toBeNull();
    expect(dwellTick(s, 350).armed).toBe('tuner');
    expect(dwellRemaining(s, 100)).toBe(250);
    expect(dwellRemaining(s, 900)).toBe(0);
    expect(dwellRemaining(dwellTick(s, 400), 400)).toBeNull();
    expect(dwellRemaining(DWELL_IDLE, 0)).toBeNull();
  });

  it('drifting more than 10 px restarts the rest (within 10 px does not)', () => {
    let s = dwellMove(DWELL_IDLE, 'tuner', at(100), 0);
    s = dwellMove(s, 'tuner', at(110), 200); // exactly 10 px: still the same rest
    expect(s.since).toBe(0);
    s = dwellMove(s, 'tuner', at(111), 300); // 11 px from the anchor: restart
    expect(s).toMatchObject({ candidate: 'tuner', since: 300, armed: null, anchor: { x: 111, y: 0 } });
    expect(dwellTick(s, 600).armed).toBeNull();
    expect(dwellTick(s, 650).armed).toBe('tuner');
  });

  it('another unit restarts; leaving every unit resets', () => {
    let s = dwellMove(DWELL_IDLE, 'tuner', at(100), 0);
    s = dwellMove(s, 'cpu', at(102), 300);
    expect(s).toMatchObject({ candidate: 'cpu', since: 300, armed: null });
    s = dwellMove(s, null, at(102), 320);
    expect(s).toBe(DWELL_IDLE);
    // Idle stays the same object (cheap change checks).
    expect(dwellMove(DWELL_IDLE, null, at(0), 10)).toBe(DWELL_IDLE);
  });

  it('once armed, the arm holds while the pointer stays on that unit — even past the radius', () => {
    let s = dwellTick(dwellMove(DWELL_IDLE, 'tuner', at(100), 0), 400);
    expect(s.armed).toBe('tuner');
    s = dwellMove(s, 'tuner', at(160, 8), 500);
    expect(s.armed).toBe('tuner');
    // Off the unit drops the arm; coming back needs a new rest.
    s = dwellMove(s, null, at(200), 600);
    expect(s.armed).toBeNull();
    s = dwellMove(s, 'tuner', at(160), 700);
    expect(s.armed).toBeNull();
    expect(dwellTick(s, 1050).armed).toBe('tuner');
  });

  it('createDwellTracker wraps the steps with an injected clock and config', () => {
    let now = 0;
    const tracker = createDwellTracker({ now: () => now, config: { ms: 100, radius: 4 } });
    tracker.move('a', at(0));
    now = 60;
    expect(tracker.remaining()).toBe(40);
    tracker.move('a', at(5)); // past the 4 px radius → restart at 60
    now = 150;
    expect(tracker.tick().armed).toBeNull();
    now = 160;
    expect(tracker.tick().armed).toBe('a');
    tracker.reset();
    expect(tracker.state).toBe(DWELL_IDLE);
  });
});
