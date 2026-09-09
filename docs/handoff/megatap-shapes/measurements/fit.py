"""Fit the amplitude/pan shape families to the level captures (fm3-megatap-levels.json).

Each capture is a full N-tap level curve read at known arrival times, so nothing drops out. Levels
are compared shape-only: both the model and the measurement are scaled to their own peak, because
the block re-normalizes the train's overall level per shape.
"""
import sys, json, math
sys.path.insert(0, '.')


def ramp(u, c):
    return u if abs(c) < 1e-6 else math.expm1(c * u) / math.expm1(c)


def norm_peak(xs):
    peak = max(xs) or 1.0
    return [x / peak for x in xs]


def rms(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / len(a))


# CONSTANT ramps end to end across the taps ((k-1)/(N-1)); every other family is a function of the
# tap's position in the window (k/N), which is why the two use different index conventions here.
RAMP_ACROSS_TAPS = {'CONSTANT'}


def model(shape, a, us, param=None):
    if shape == 'CONSTANT':
        return [2 * a + (1 - 2 * a) * u if a <= 0.5 else 1 - (2 * a - 1) * u for u in us]
    if shape == 'INCREASING':
        return [ramp(u, param) for u in us]
    if shape == 'DECREASING':
        # mirrored index: tap k reads the ramp at (N+1-k)/N, so the first tap sits at the full 1.0
        return [ramp(1 + 1 / len(us) - u, param) for u in us]
    if shape == 'UP / DOWN':
        return [ramp(1 - abs(2 * (u - 0.5 / len(us)) - 1), param) for u in us]
    if shape == 'DOWN / UP':
        return [ramp(abs(2 * (u - 0.5 / len(us)) - 1), param) for u in us]
    if shape == 'COSINE':
        return [(1 + math.cos(2 * math.pi * 4 * a * u)) / 2 for u in us]
    if shape == 'SINE':
        return [(1 + math.sin(2 * math.pi * 4 * a * u)) / 2 for u in us]
    raise ValueError(shape)


PARAMETRIC = {'INCREASING': (-14, 14), 'DECREASING': (-14, 14), 'UP / DOWN': (-14, 14), 'DOWN / UP': (-14, 14)}


def fit(shape, a, us, meas):
    if shape not in PARAMETRIC:
        return None, rms(norm_peak(model(shape, a, us)), meas)
    lo, hi = PARAMETRIC[shape]
    best = (1e9, None)
    for i in range(2001):
        p = lo + (hi - lo) * i / 2000
        e = rms(norm_peak([max(0.0, v) for v in model(shape, a, us, p)]), meas)
        if e < best[0]:
            best = (e, p)
    return best[1], best[0]


def main(path='fm3-megatap-levels.json', kind='amp'):
    data = json.load(open(path))
    for c in data['captures']:
        if c['kind'] != kind:
            continue
        n = c['numtaps']
        us = [k / (n - 1) for k in range(n)] if c['shape'] in RAMP_ACROSS_TAPS else [(k + 1) / n for k in range(n)]
        meas = norm_peak([t['amp'] for t in c['taps']])
        p, err = fit(c['shape'], c['alpha'] / 100, us, meas)
        got = ' '.join(f'{v:.3f}' for v in meas)
        print(f"{c['shape']:11} a={c['alpha']:5}  rms {err:.4f}  " +
              (f'param {p:+7.3f}  ' if p is not None else '              ') + got)


if __name__ == '__main__':
    main(*sys.argv[1:])
