"""Fifth pass: SIGMOID / COSINE / SINE at four taps, where nothing can merge.

At sixteen and even six taps these three shapes crowd taps closer than the meter can separate, so
captures come back incomplete and the index of each surviving tap is ambiguous. Four taps over the
full 4000 ms window always resolve, which pins the curve's four sample points exactly.
"""
import sys, json, time
sys.path.insert(0, '.')
from mega import *
import rig
import capture as cap

OUT_FILE = 'fm3-megatap-times4.json'
TIME_MS = 4000
SHAPES = ['SIGMOID', 'COSINE', 'SINE', 'EXP/LOG']
ALPHAS = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]


def main():
    cap.BURST = 0.02
    cap.WINDOW = 6.4
    cap.SETTLE = 3.0
    rig.arm_synth()
    for n in (4, 5):
        rig.arm_megatap(taps=n, time_ms=TIME_MS)
        store_key = f'n{n}'
        for shape in SHAPES:
            si = TIME_SHAPES.index(shape)
            for alpha in ALPHAS:
                for name, value, disc in (('NUMTAPS', n, True), ('TIMESHAPE', si, True), ('AMPSHAPE', 0, True),
                                          ('AMPALPHA', 0.5, False), ('TIMEALPHA', alpha / 100, False)):
                    setp(MEGATAP, MT[name], value, continuous=not disc)
                    time.sleep(0.06)
                time.sleep(cap.SETTLE)
                t_imp, trace = cap.raw_capture(seconds=cap.WINDOW)
                taps = cap.onsets(trace, t_imp, rel=0.05, refractory=0.025, hold=0.04)
                rec = {'kind': 'time', 'shape': shape, 'alpha': alpha, 'numtaps': n, 'timeMs': TIME_MS,
                       'taps': [{'ms': round(t['ms'], 1), 'amp': round(t['power'] ** 0.5, 5)} for t in taps]}
                store.setdefault(store_key, []).append(rec)
                with open(OUT_FILE, 'w') as fh:
                    json.dump({'meta': meta, 'captures': store}, fh, indent=1)
                print(f"n={n} {shape:8} a={alpha:5} seen={len(taps)} "
                      + ' '.join(f"{t['ms']/TIME_MS:.4f}" for t in taps), flush=True)
    print('DONE')


meta = {'device': 'FM3', 'timeMs': TIME_MS, 'method': 'four and five taps, nothing merges',
        'captured': time.strftime('%Y-%m-%d')}
store = {}

if __name__ == '__main__':
    main()
