"""Fit the Megatap shape curves to the captured tap tables.

Time shapes are fitted as a curvature `c` per capture: the model places tap k (1..N) at
t/T = curvedRamp(k/N, c) with curvedRamp(u, c) = expm1(c*u)/expm1(c), matching the helper
`src/lib/modulationGraphs.ts` already uses for the LFO bends. Taps that the VU could not separate
simply drop out of the capture, so each measured onset is scored against its *nearest* model tap
rather than against a fixed index.
"""
import sys, json, math
sys.path.insert(0, '.')
from mega import TIME_SHAPES, AMP_SHAPES


def ramp(u, c):
    return u if abs(c) < 1e-6 else math.expm1(c * u) / math.expm1(c)


def model_times(n, c, shape='EXP/LOG'):
    return [ramp((k + 1) / n, c) for k in range(n)]


def fit_c(taps, n, time_ms, lo=-30.0, hi=30.0, steps=2400):
    """Curvature whose model taps sit closest to the measured onsets (ms RMS)."""
    meas = [t['ms'] / time_ms for t in taps]
    best = (1e9, 0.0)
    for i in range(steps + 1):
        c = lo + (hi - lo) * i / steps
        mt = model_times(n, c)
        err = math.sqrt(sum(min((m - x) ** 2 for x in mt) for m in meas) / len(meas))
        if err < best[0]:
            best = (err, c)
    return best[1], best[0] * time_ms


def main(path='fm3-megatap.json'):
    data = json.load(open(path))
    caps = data['captures']

    print('== TIME shapes: fitted curvature per alpha ==')
    for shape in TIME_SHAPES:
        rows = [c for c in caps if c['kind'] == 'time' and c['shape'] == shape]
        if not rows:
            continue
        print(f'-- {shape}')
        for r in rows:
            c, rms = fit_c(r['taps'], r['numtaps'], r['timeMs'])
            print(f"   alpha {r['alpha']:5}  c = {c:7.3f}   rms {rms:6.1f} ms   taps seen {len(r['taps'])}/{r['numtaps']}")

    print('\n== AMPLITUDE shapes: tap amplitude, normalized to the loudest tap ==')
    for shape in AMP_SHAPES:
        for r in [c for c in caps if c['kind'] == 'amp' and c['shape'] == shape]:
            peak = max((t['amp'] for t in r['taps']), default=1) or 1
            print(f"   {shape:11} alpha {r['alpha']:5}  " + ' '.join(f'{t["amp"]/peak:.3f}' for t in r['taps']))

    print('\n== PAN shapes: (L-R)/(L+R) in amplitude ==')
    for shape in AMP_SHAPES:
        for r in [c for c in caps if c['kind'] == 'pan' and c['shape'] == shape]:
            vals = []
            for t in r['taps']:
                s = t['ampL'] + t['ampR']
                vals.append((t['ampL'] - t['ampR']) / s if s else 0)
            print(f"   {shape:11} alpha {r['alpha']:5}  " + ' '.join(f'{v:+.2f}' for v in vals))

    for kind in ('count', 'predelay', 'timeRandom', 'ampRandom'):
        rows = [c for c in caps if c['kind'] == kind]
        if rows:
            print(f'\n== {kind} ==')
            for r in rows:
                print(f"   {r['shape']:20} alpha {r['alpha']:5} n={r['numtaps']:2}  "
                      + ' '.join(f"{t['ms']:.0f}/{t['amp']:.3f}" for t in r['taps']))


if __name__ == '__main__':
    main(*sys.argv[1:])
