"""Run the full Megatap shape sweep and write raw tap tables to fm3-megatap.json.

~110 captures at ~12 s each; results are appended as they land so the run can be inspected (or
resumed) while it is still going.
"""
import sys, json, os, time
sys.path.insert(0, '.')
from mega import *
import rig
from capture import capture, dry_zero

OUT_FILE = 'fm3-megatap.json'
TIME_MS = 4000
BASE_TAPS = 8

TIME_ALPHAS = [0, 10, 25, 31.6, 50, 75, 90, 100]
LEVEL_ALPHAS = [0, 25, 50, 75, 100]


def record(store, entry):
    store['captures'].append(entry)
    with open(OUT_FILE, 'w') as fh:
        json.dump(store, fh, indent=1)
    taps = entry['taps']
    print(f"{entry['kind']:5} {entry['shape']:11} a={entry['alpha']:5} n={len(taps):2}  "
          + ' '.join(f"{t['ms']:.0f}/{t['amp']:.3f}" for t in taps[:6]), flush=True)


def shot(zero, **cfg):
    taps, _ = capture(**cfg)
    return [{'ms': round(t['ms'] - zero, 1), 'amp': round(t['power'] ** 0.5, 5),
             'ampL': round(t['panL'] ** 0.5, 5), 'ampR': round(t['panR'] ** 0.5, 5)} for t in taps]


def main():
    rig.arm_synth()
    rig.arm_megatap(taps=BASE_TAPS, time_ms=TIME_MS)
    zero = dry_zero()
    store = {'meta': {'device': 'FM3', 'timeMs': TIME_MS, 'baseTaps': BASE_TAPS, 'zeroMs': zero,
                      'meter': 'OUTPUT VU (power); amp = sqrt(meter)',
                      'timeShapes': TIME_SHAPES, 'ampShapes': AMP_SHAPES,
                      'captured': time.strftime('%Y-%m-%d')}, 'captures': []}

    # A - time shapes: even amplitude, tap times are the signal
    for si, shape in enumerate(TIME_SHAPES):
        for alpha in TIME_ALPHAS:
            taps = shot(zero, NUMTAPS=BASE_TAPS, TIMESHAPE=si, TIMEALPHA=alpha / 100,
                        AMPSHAPE=0, AMPALPHA=0.5, PANSHAPE=0, PANALPHA=0.5, PREDELAY=0.0)
            record(store, {'kind': 'time', 'shape': shape, 'alpha': alpha, 'taps': taps,
                           'numtaps': BASE_TAPS, 'timeMs': TIME_MS})

    # B - amplitude shapes over evenly spaced taps
    for si, shape in enumerate(AMP_SHAPES):
        for alpha in LEVEL_ALPHAS:
            taps = shot(zero, NUMTAPS=BASE_TAPS, TIMESHAPE=0, TIMEALPHA=0.5,
                        AMPSHAPE=si, AMPALPHA=alpha / 100, PANSHAPE=0, PANALPHA=0.5)
            record(store, {'kind': 'amp', 'shape': shape, 'alpha': alpha, 'taps': taps,
                           'numtaps': BASE_TAPS, 'timeMs': TIME_MS})

    # C - pan shapes, read off the L/R split
    for si, shape in enumerate(PAN_SHAPES):
        for alpha in LEVEL_ALPHAS:
            taps = shot(zero, NUMTAPS=BASE_TAPS, TIMESHAPE=0, TIMEALPHA=0.5,
                        AMPSHAPE=0, AMPALPHA=0.5, PANSHAPE=si, PANALPHA=alpha / 100)
            record(store, {'kind': 'pan', 'shape': shape, 'alpha': alpha, 'taps': taps,
                           'numtaps': BASE_TAPS, 'timeMs': TIME_MS})

    # D - is the shape a function of normalized tap index?
    for n in (4, 16):
        for alpha in (25, 75):
            taps = shot(zero, NUMTAPS=n, TIMESHAPE=0, TIMEALPHA=alpha / 100, AMPSHAPE=1, AMPALPHA=0.5)
            record(store, {'kind': 'count', 'shape': 'EXP/LOG+INCREASING', 'alpha': alpha,
                           'taps': taps, 'numtaps': n, 'timeMs': TIME_MS})
    setp(MEGATAP, MT['AMPSHAPE'], 0, continuous=False)

    # E - predelay offset and the two randomize controls
    taps = shot(zero, NUMTAPS=BASE_TAPS, TIMESHAPE=0, TIMEALPHA=0.5, PREDELAY=norm('PREDELAY', 500))
    record(store, {'kind': 'predelay', 'shape': 'EXP/LOG', 'alpha': 50, 'taps': taps,
                   'numtaps': BASE_TAPS, 'timeMs': TIME_MS, 'predelayMs': 500})
    setp(MEGATAP, MT['PREDELAY'], 0.0)
    for rand in (25, 50):
        taps = shot(zero, RANDOM=rand / 100)
        record(store, {'kind': 'timeRandom', 'shape': 'EXP/LOG', 'alpha': 50, 'taps': taps,
                       'numtaps': BASE_TAPS, 'timeMs': TIME_MS, 'random': rand})
    setp(MEGATAP, MT['RANDOM'], 0.0)
    for rand in (25, 50):
        taps = shot(zero, AMPRAND=rand / 100)
        record(store, {'kind': 'ampRandom', 'shape': 'CONSTANT', 'alpha': 50, 'taps': taps,
                       'numtaps': BASE_TAPS, 'timeMs': TIME_MS, 'ampRandom': rand})
    setp(MEGATAP, MT['AMPRAND'], 0.0)
    print('DONE', len(store['captures']), 'captures')


if __name__ == '__main__':
    main()
