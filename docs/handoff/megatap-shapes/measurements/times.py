"""Third pass for the TIME shapes, at a tap count the meter can always resolve.

The 8-tap sweep loses taps wherever a shape bunches them tighter than the detector's refractory
window, which is exactly where the curve is most informative. Six taps over the full 4000 ms window
keeps every tap separable at every alpha, so each capture yields a complete curve.
"""
import sys, json, time
sys.path.insert(0, '.')
from mega import *
import rig
import capture as cap

OUT_FILE = 'fm3-megatap-times.json'
TIME_MS = 4000
N = 6
ALPHAS = [0, 12.5, 25, 31.6, 37.5, 50, 62.5, 75, 87.5, 100]


def main():
    cap.BURST = 0.02
    rig.arm_synth()
    rig.arm_megatap(taps=N, time_ms=TIME_MS)
    store = {'meta': {'device': 'FM3', 'timeMs': TIME_MS, 'numtaps': N,
                      'method': 'short burst, refractory 25 ms', 'captured': time.strftime('%Y-%m-%d')},
             'captures': []}
    for si, shape in enumerate(TIME_SHAPES):
        for alpha in ALPHAS:
            for name, value, disc in (('NUMTAPS', N, True), ('TIMESHAPE', si, True), ('AMPSHAPE', 0, True),
                                      ('AMPALPHA', 0.5, False), ('TIMEALPHA', alpha / 100, False)):
                setp(MEGATAP, MT[name], value, continuous=not disc)
                time.sleep(0.06)
            time.sleep(cap.SETTLE)
            t_imp, trace = cap.raw_capture()
            taps = cap.onsets(trace, t_imp, rel=0.06, refractory=0.025, hold=0.04)
            store['captures'].append({'kind': 'time', 'shape': shape, 'alpha': alpha, 'numtaps': N,
                                      'timeMs': TIME_MS,
                                      'taps': [{'ms': round(t['ms'], 1), 'amp': round(t['power'] ** 0.5, 5)} for t in taps]})
            with open(OUT_FILE, 'w') as fh:
                json.dump(store, fh, indent=1)
            print(f"{shape:8} a={alpha:5} n={len(taps)} "
                  + ' '.join(f"{t['ms']/TIME_MS:.4f}" for t in taps), flush=True)
    print('DONE', len(store['captures']))


if __name__ == '__main__':
    main()
