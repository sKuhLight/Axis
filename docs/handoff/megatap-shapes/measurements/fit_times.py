"""Fit the time-shape laws to the noise-correlation captures (fm3-megatap-times-xcorr.json).

Every capture is a complete N-tap train measured to well under a millisecond, so a tap's index is
never in doubt and each shape can be fitted directly rather than scored against its nearest model
tap. `table` prints the measured trains; `fit` scores candidate laws.
"""
import sys, json, math

CURVED = lambda u, c: u if abs(c) < 1e-9 else math.expm1(c * u) / math.expm1(c)


def load(path='fm3-megatap-times-xcorr.json'):
    return json.load(open(path))['captures']


def rows(caps, shape=None, n=None):
    for key, recs in sorted(caps.items()):
        for r in recs:
            if (shape is None or r['shape'] == shape) and (n is None or r['numtaps'] == n):
                yield r


def table(path='fm3-megatap-times-xcorr.json', shape='SIGMOID', n=8):
    for r in rows(load(path), shape, n):
        pos = r['pos']
        gaps = [b - a for a, b in zip([0] + pos, pos)]
        print(f"a={r['alpha']:6.2f} seen={len(pos):2}")
        print('   pos ', ' '.join(f'{p:.4f}' for p in pos))
        print('   gap ', ' '.join(f'{g:.4f}' for g in gaps))


def rms(model, meas):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(model, meas)) / len(meas))


def fit_scalar(meas, build, lo, hi, steps=4000):
    """Best single parameter for a law `build(param) -> positions`, by scan then bisect."""
    best = (1e9, lo)
    for i in range(steps + 1):
        p = lo + (hi - lo) * i / steps
        e = rms(build(p), meas)
        if e < best[0]:
            best = (e, p)
    err, p = best
    step = (hi - lo) / steps
    for _ in range(40):
        step /= 2
        for cand in (p - step, p + step):
            e = rms(build(cand), meas)
            if e < err:
                err, p = e, cand
    return p, err


def fit_curved(r, offset=0.0):
    """The EXP/LOG law: tap k at curvedRamp((k + offset) / n, c)."""
    n = r['numtaps']
    us = [(k + offset) / n for k in range(1, n + 1)]
    return fit_scalar(r['pos'], lambda c: [CURVED(u, c) for u in us], -40, 40)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'table'
    if cmd == 'table':
        table(*sys.argv[2:])
    elif cmd == 'curved':
        for r in rows(load(), sys.argv[2] if len(sys.argv) > 2 else 'EXP/LOG'):
            c, e = fit_curved(r)
            print(f"n={r['numtaps']:2} a={r['alpha']:6.2f}  c={c:8.4f}  rms={e:.5f}")
