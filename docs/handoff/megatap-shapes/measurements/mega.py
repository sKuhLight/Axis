"""Shared helpers for the FM3 Megatap capture rig.

Same ForgeFX HTTP surface the LFO rig used (docs/handoff/modulation-graph-shapes/measurements/lfo.py):
127.0.0.1:5056, params by (eid, pid) in normalized 0..1, `readrange` as the fast read channel.
The Megatap taps are not readable as parameters -- they only exist as audio -- so the instrument
here is the Output block's VU meters, sampled while a Synth-generated impulse runs through the block.
"""
import json, time, urllib.request, math

BASE = 'http://127.0.0.1:5056'

# Block families, from forgefx-midi/src/gen3/fm3/effectIds.ts
INPUT, OUTPUT, SYNTH, MEGATAP = 37, 42, 130, 138

# forgefx-midi/src/gen3/fm3/params.ts
MT = {'INGAIN': 0, 'MASTERLVL': 1, 'TIME': 2, 'NUMTAPS': 3, 'PREDELAY': 4, 'TIMESHAPE': 5,
      'TIMEALPHA': 6, 'AMPSHAPE': 7, 'AMPALPHA': 8, 'PANSHAPE': 9, 'PANALPHA': 10, 'RANDOM': 11,
      'DIFFMIX': 12, 'DIFFTIME': 13, 'MIX': 17, 'LEVEL': 18, 'PAN': 19, 'FEEDBACK': 24,
      'FDBKTAP': 25, 'LOWCUT': 26, 'HICUT': 27, 'SPREAD': 29, 'AMPRAND': 30, 'KILLDRY': 34}
SY = {'TYPE1': 0, 'FREQ1': 1, 'TRACK1': 2, 'LEVEL1': 6, 'PAN1': 7, 'ATTACK1': 8, 'HICUT1': 9,
      'LEVEL2': 17, 'MIX': 23, 'LEVEL': 24, 'PAN': 25}
OUT = {'VUL': 16, 'VUR': 17}

TIME_SHAPES = ['EXP/LOG', 'SIGMOID', 'COSINE', 'SINE']
AMP_SHAPES = ['CONSTANT', 'INCREASING', 'DECREASING', 'UP / DOWN', 'DOWN / UP', 'COSINE', 'SINE']
PAN_SHAPES = AMP_SHAPES

# MEGATAP ranges (forgefx-midi/src/gen3/fm3/ranges.generated.ts): the rig speaks display units and
# converts, so captures read the way the editor does.
RANGE = {'TIME': (1, 4000), 'NUMTAPS': (1, 64), 'PREDELAY': (0, 1000)}


def req(path, body=None, method='GET'):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data,
                               headers={'content-type': 'application/json'} if data else {}, method=method)
    return json.load(urllib.request.urlopen(r, timeout=20))


def setp(eid, pid, value, continuous=True):
    return req(f'/preset/blocks/{eid}/params/{pid}', {'value': value, 'continuous': continuous}, 'PUT')


def norm(name, display):
    lo, hi = RANGE[name]
    return (display - lo) / (hi - lo)


def readrange(eid, pids):
    return req(f'/preset/blocks/{eid}/readrange', {'pids': pids}, 'POST')


def sample(eid, pids, seconds, max_hz=400):
    """Poll `pids` as fast as the transport allows, returning [(t_since_start, {pid: value})]."""
    out = []
    t0 = time.time()
    gap = 1.0 / max_hz
    nxt = t0
    while time.time() - t0 < seconds:
        now = time.time()
        if now < nxt:
            continue
        nxt = now + gap
        try:
            d = readrange(eid, pids)
        except Exception:
            continue
        out.append((time.time() - t0, d))
    return out


def grid():
    return req('/preset/grid')


def blocks():
    return req('/preset/blocks')


def peaks(ts, vs, floor=0.05, min_gap=0.06):
    """Peak-pick a VU trace: local maxima above `floor`, at least `min_gap` seconds apart.

    The VU has release ballistics, so each tap is a fast rise into a slow decay; the rise crest is
    the tap. Returns [(t, v)] in time order.
    """
    out = []
    n = len(vs)
    for i in range(1, n - 1):
        if vs[i] < floor:
            continue
        if vs[i] < vs[i - 1] or vs[i] < vs[i + 1]:
            continue
        if out and ts[i] - out[-1][0] < min_gap:
            if vs[i] > out[-1][1]:
                out[-1] = (ts[i], vs[i])
            continue
        out.append((ts[i], vs[i]))
    return out


def impulse(width=0.012, level=1.0):
    """Fire one click out of the Synth block: voice 1 level up, then straight back down."""
    setp(SYNTH, SY['LEVEL1'], level)
    time.sleep(width)
    setp(SYNTH, SY['LEVEL1'], 0.0)
