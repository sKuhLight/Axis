"""Capture the FM3 Megatap tap train off the output VU meters.

The meters read *power*: a +3 dB change doubles the reading (calibrated over -30..+6 dB, see README),
so tap amplitude is sqrt(meter) and pan comes from the L/R power split. The impulse is a ~30 ms
Synth burst; each tap arrives as a sharp onset into a short plateau, and the onset is the tap time.
"""
import sys, json, time, threading
sys.path.insert(0, '.')
from mega import *
import rig

BURST = 0.03          # impulse width, seconds - short enough to resolve bunched taps
LEAD = 0.5            # quiet lead-in before the impulse
WINDOW = 3.4          # capture length; must outlast predelay + Delay Time
SETTLE = 2.6          # silence between captures so the previous tail has died away


def fire_at(box, width=BURST):
    box.append(time.time())
    impulse(width=width)


def raw_capture(seconds=WINDOW):
    """Fire one impulse and sample both VU meters. Returns (t_impulse, [(t, L, R)])."""
    box = []
    threading.Timer(LEAD, fire_at, args=(box,)).start()
    t_start = time.time()
    rows = sample(OUTPUT, [OUT['VUL'], OUT['VUR']], seconds)
    t0 = t_start
    trace = [(t, r[str(OUT['VUL'])], r[str(OUT['VUR'])]) for t, r in rows]
    return (box[0] - t0 if box else LEAD), trace


def onsets(trace, t_impulse, rel=0.08, refractory=0.045, hold=0.05):
    """Tap onsets: rising crossings of `rel` x peak power, one per `refractory` seconds.

    Returns [{'ms', 'power', 'panL', 'panR'}] with `ms` measured from the impulse.
    """
    ts = [t for t, _, _ in trace]
    p = [l + r for _, l, r in trace]
    peak = max(p) if p else 0.0
    thresh = max(peak * rel, 3e-4)
    out = []
    armed = True
    for i, (t, v) in enumerate(zip(ts, p)):
        if v < thresh:
            armed = True
            continue
        if not armed or (out and t - out[-1]['t'] < refractory):
            continue
        armed = False
        j = i
        best = i
        while j < len(ts) and ts[j] - t <= hold:
            if p[j] > p[best]:
                best = j
            j += 1
        out.append({'t': t, 'ms': (t - t_impulse) * 1000, 'power': p[best],
                    'panL': trace[best][1], 'panR': trace[best][2]})
    for o in out:
        del o['t']
    return out


def capture(**cfg):
    """Set Megatap params, fire, and return the extracted taps. cfg keys are MT names."""
    for name, value in cfg.items():
        discrete = name in ('NUMTAPS', 'TIMESHAPE', 'AMPSHAPE', 'PANSHAPE', 'KILLDRY', 'FDBKTAP')
        setp(MEGATAP, MT[name], value, continuous=not discrete)
        time.sleep(0.06)
    time.sleep(SETTLE)
    t_imp, trace = raw_capture()
    return onsets(trace, t_imp), trace


def dry_zero():
    """Impulse arrival time with the block bypassed - the zero for every tap delay."""
    req(f'/preset/blocks/{MEGATAP}/bypass', {'bypassed': True}, 'POST')
    time.sleep(SETTLE)
    t_imp, trace = raw_capture(seconds=2.0)
    req(f'/preset/blocks/{MEGATAP}/bypass', {'bypassed': False}, 'POST')
    taps = onsets(trace, t_imp)
    return taps[0]['ms'] if taps else 0.0


if __name__ == '__main__':
    rig.arm_synth()
    rig.arm_megatap(taps=8, time_ms=4000)
    z = dry_zero()
    print(f'dry zero = {z:.1f} ms')
    taps, _ = capture(NUMTAPS=8, TIMESHAPE=0, TIMEALPHA=0.5, AMPSHAPE=0, AMPALPHA=0.5)
    for i, t in enumerate(taps):
        print(f'  tap {i+1:2d}  {t["ms"] - z:8.1f} ms   amp {(t["power"] ** 0.5):.4f}')
