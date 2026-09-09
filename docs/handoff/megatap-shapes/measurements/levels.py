"""Second pass for the AMPLITUDE and PAN shapes.

Peak-picking drops any tap quieter than the detector's floor, which is exactly the information an
amplitude shape carries. Here the tap *times* are known instead — Time Shape is left at EXP/LOG
alpha 50%, which the first pass showed is dead linear (tap k of N at k*T/N) — so each tap's level is
read straight out of the trace at its own arrival time.
"""
import sys, json, time
sys.path.insert(0, '.')
from mega import *
import rig
from capture import raw_capture, SETTLE

OUT_FILE = 'fm3-megatap-levels.json'
TIME_MS = 2000
N = 8
ALPHAS = [0, 25, 50, 75, 100]
HALF = 0.045   # window either side of the expected arrival, seconds


def level_at(trace, t_impulse, ms):
    """Peak L/R power within +-HALF of the expected arrival."""
    t = t_impulse + ms / 1000
    win = [(l, r) for ti, l, r in trace if abs(ti - t) <= HALF]
    if not win:
        return 0.0, 0.0
    return max(win, key=lambda x: x[0] + x[1])


def shot(shape_pid, shape_index, alpha):
    setp(MEGATAP, shape_pid, shape_index, continuous=False)
    time.sleep(0.08)
    setp(MEGATAP, MT['AMPALPHA' if shape_pid == MT['AMPSHAPE'] else 'PANALPHA'], alpha / 100)
    time.sleep(SETTLE)
    t_imp, trace = raw_capture()
    taps = []
    for k in range(1, N + 1):
        l, r = level_at(trace, t_imp, k * TIME_MS / N)
        taps.append({'k': k, 'ms': k * TIME_MS / N, 'amp': round((l + r) ** 0.5, 5),
                     'ampL': round(l ** 0.5, 5), 'ampR': round(r ** 0.5, 5)})
    return taps


def main():
    rig.arm_synth()
    rig.arm_megatap(taps=N, time_ms=TIME_MS)
    store = {'meta': {'device': 'FM3', 'timeMs': TIME_MS, 'numtaps': N, 'method': 'level read at known tap times',
                      'captured': time.strftime('%Y-%m-%d')}, 'captures': []}
    for kind, pid, other in (('amp', MT['AMPSHAPE'], MT['PANSHAPE']), ('pan', MT['PANSHAPE'], MT['AMPSHAPE'])):
        setp(MEGATAP, other, 0, continuous=False)
        for si, shape in enumerate(AMP_SHAPES):
            for alpha in ALPHAS:
                taps = shot(pid, si, alpha)
                store['captures'].append({'kind': kind, 'shape': shape, 'alpha': alpha, 'taps': taps,
                                          'numtaps': N, 'timeMs': TIME_MS})
                with open(OUT_FILE, 'w') as fh:
                    json.dump(store, fh, indent=1)
                print(f"{kind:3} {shape:11} a={alpha:5} " + ' '.join(f"{t['amp']:.3f}" for t in taps), flush=True)
    print('DONE', len(store['captures']))


if __name__ == '__main__':
    main()
