"""Fourth pass: the periodic and sigmoid TIME shapes at a dense tap count.

EXP/LOG is settled, but SIGMOID / COSINE / SINE modulate the *spacing* between taps, and six taps
only sample that modulation six times. Sixteen taps over the full 4000 ms window sample it densely
enough to read the modulating function itself out of the increments.
"""
import sys, json, time
sys.path.insert(0, '.')
from mega import *
import rig
import capture as cap

OUT_FILE = 'fm3-megatap-times16.json'
TIME_MS = 4000
N = 16
SHAPES = ['SIGMOID', 'COSINE', 'SINE']
ALPHAS = [0, 25, 37.5, 50, 62.5, 75, 100]


def main():
    cap.BURST = 0.02
    cap.WINDOW = 6.4
    cap.SETTLE = 3.0
    rig.arm_synth()
    rig.arm_megatap(taps=N, time_ms=TIME_MS)
    store = {'meta': {'device': 'FM3', 'timeMs': TIME_MS, 'numtaps': N,
                      'method': '16 taps, short burst, refractory 25 ms', 'captured': time.strftime('%Y-%m-%d')},
             'captures': []}
    for shape in SHAPES:
        si = TIME_SHAPES.index(shape)
        for alpha in ALPHAS:
            for name, value, disc in (('NUMTAPS', N, True), ('TIMESHAPE', si, True), ('AMPSHAPE', 0, True),
                                      ('AMPALPHA', 0.5, False), ('TIMEALPHA', alpha / 100, False)):
                setp(MEGATAP, MT[name], value, continuous=not disc)
                time.sleep(0.06)
            time.sleep(cap.SETTLE)
            t_imp, trace = cap.raw_capture(seconds=cap.WINDOW)
            taps = cap.onsets(trace, t_imp, rel=0.05, refractory=0.025, hold=0.04)
            store['captures'].append({'kind': 'time', 'shape': shape, 'alpha': alpha, 'numtaps': N,
                                      'timeMs': TIME_MS,
                                      'taps': [{'ms': round(t['ms'], 1), 'amp': round(t['power'] ** 0.5, 5)} for t in taps]})
            with open(OUT_FILE, 'w') as fh:
                json.dump(store, fh, indent=1)
            print(f"{shape:8} a={alpha:5} n={len(taps):2} "
                  + ' '.join(f"{t['ms']/TIME_MS:.3f}" for t in taps), flush=True)
    print('DONE', len(store['captures']))


if __name__ == '__main__':
    main()
