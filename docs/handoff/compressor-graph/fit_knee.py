"""Solve for what FM3-Edit plots on a Threshold/Ratio compressor.

Threshold, Ratio, Knee Type and Level are known from the device for both captured presets, so the
free parameters here belong to the *editor*: its axis window (min dB, span) and the knee sharpness k
in `y = x + Level - (1 - 1/R) * softplus(x - T, k)`, all in dB.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
# From the device (ForgeFX /preset/blocks/<eid>/params), both presets Knee Type = MED-HARD (1),
# Auto Makeup OFF, Mix 100%, input Gain 0, detector RMS+PEAK.
# `auto` is COMP_AUTO (Auto Makeup); presets with it ON are excluded from the fit because the gain it
# adds is not reported by the device and is not modelled.
PRESETS = {
    '007': dict(T=-11.804, R=4.0, L=0.555, knee=1,    auto=0),  # Comp 2, Studio FB, VCA Bus Compressor
    '013': dict(T=-25.0,   R=4.0, L=6.0,   knee=1,    auto=0),  # Comp 1, Studio FF, Modern VCA Compressor
    '376': dict(T=-20.0,   R=2.0, L=0.0,   knee=None, auto=0),  # Comp 1, Analog, Analog Compressor
    '018': dict(T=-37.0,   R=4.0, L=-3.0,  knee=None, auto=1),  # Comp 1, JFET1, JFET Studio Compressor
}
FITTED = [n for n, p in PRESETS.items() if not p['auto']]

def softplus(z, k):
    kz = k * z
    if kz > 40: return z
    if kz < -40: return math.exp(kz) / k
    return math.log1p(math.exp(kz)) / k

def model(x, A, S, k, p):
    """Normalised y for normalised x, on an axis window [A, A+S] shared by both axes."""
    xdb = A + x * S
    ydb = xdb + p['L'] - (1 - 1 / p['R']) * softplus(xdb - p['T'], k)
    return (ydb - A) / S

def rms(A, S, ks, curves):
    tot = n = 0
    for name, pts in curves.items():
        p = PRESETS[name]
        for x, y in pts:
            tot += (model(x, A, S, ks[name], p) - y) ** 2
            n += 1
    return (tot / n) ** 0.5

def descend(curves, start, steps, groups):
    """Coordinate descent over [A, S, k_dropdown, k_analog]; `groups` maps a preset to a k index."""
    p = list(start); step = list(steps)
    e = lambda q: rms(q[0], q[1], {n: q[groups[n]] for n in curves}, curves)
    while max(step) > 1e-7:
        moved = False
        for i in range(len(p)):
            for s in (1, -1):
                q = p[:]; q[i] += s * step[i]
                if q[1] > 1 and q[2] > 1e-4 and q[3] > 1e-4 and e(q) < e(p):
                    p = q; moved = True
        if not moved:
            step = [t / 2 for t in step]
    return e(p), p

if __name__ == '__main__':
    raw = json.load(open(os.path.join(HERE, 'knee_curves.json')))
    curves = {n: raw[n]['pts'] for n in FITTED}
    px = raw['007']['h']  # box height in px, for reporting error in pixels
    # Presets that author a Knee dropdown share one k (all captures are MED-HARD); the variants with no
    # dropdown get their own, which is the point: 376 stores MED-HARD too and is drawn much softer.
    GROUPS = {'007': 2, '013': 2, '376': 3}

    r, (A, S, k, ka) = descend(curves, [-80.0, 100.0, 0.36, 0.11], [2.0, 2.0, 0.05, 0.02], GROUPS)
    print(f'free window: {A:.2f} .. {A+S:.2f} dB (span {S:.2f})  k(MED-HARD)={k:.3f}  k(Analog)={ka:.3f}'
          f'   rms {r:.5f} = {r*px:.2f} px')

    rk, (_, _, k2, ka2) = descend(curves, [-80.0, 100.0, 0.36, 0.11], [0.0, 0.0, 0.05, 0.02], GROUPS)
    print(f'pinned -80..+20:  k(MED-HARD)={k2:.3f}  k(Analog)={ka2:.3f}   rms {rk:.5f} = {rk*px:.2f} px')
    ks = {'007': k2, '013': k2, '376': ka2}
    for name in FITTED:
        w = max(abs(model(x, -80.0, 100.0, ks[name], PRESETS[name]) - y) for x, y in curves[name])
        print(f'   official-{name}: worst {w:.5f} = {w*px:.2f} px')

    print('\nsanity — what the old -60..+20 window and no Level would have drawn:')
    for name in FITTED:
        p = dict(PRESETS[name]); p['L'] = 0.0
        w = max(abs(model(x, -60.0, 80.0, ks[name], p) - y) for x, y in curves[name])
        print(f'   official-{name}: worst {w:.5f} = {w*px:.2f} px')

    print('\nAuto Makeup (excluded from the fit) — preset 018, COMP_AUTO ON:')
    p = PRESETS['018']; pts = raw['018']['pts']
    best = None
    for i in range(300):
        kk = 0.05 + i * 0.01
        o, st = 0.0, 8.0
        f = lambda off: sum((model(x, -80.0, 100.0, kk, dict(p, L=off)) - y) ** 2 for x, y in pts) ** 0.5
        while st > 1e-6:
            if f(o + st) < f(o): o += st
            elif f(o - st) < f(o): o -= st
            else: st /= 2
        if best is None or f(o) < best[0]: best = (f(o), kk, o)
    e, kk, o = best
    print(f'   best k={kk:.2f}/dB, total offset {o:+.2f} dB vs Level {p["L"]:+.1f}'
          f'  ->  Auto Makeup adds {o-p["L"]:+.2f} dB   (residual {e/len(pts)**0.5*px:.2f} px — the model does not fit it)')

    json.dump({'window': [-80.0, 20.0], 'k_med_hard': k2, 'k_analog': ka2, 'rms': rk},
              open(os.path.join(HERE, 'knee_fit.json'), 'w'))
