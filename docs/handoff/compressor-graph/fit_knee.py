"""Solve for what FM3-Edit plots on a Threshold/Ratio compressor.

Threshold, Ratio, Knee Type and Level are known from the device for both captured presets, so the
free parameters here belong to the *editor*: its axis window (min dB, span) and the knee sharpness k
in `y = x + Level - (1 - 1/R) * softplus(x - T, k)`, all in dB.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
# From the device (ForgeFX /preset/blocks/<eid>/params), both presets Knee Type = MED-HARD (1),
# Auto Makeup OFF, Mix 100%, input Gain 0, detector RMS+PEAK.
PRESETS = {
    '007': dict(T=-11.804, R=4.0, L=0.555),   # Comp 2, Studio FB, VCA Bus Compressor
    '013': dict(T=-25.0,   R=4.0, L=6.0),     # Comp 1, Studio FF, Modern VCA Compressor
}

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

def rms(A, S, k, curves):
    tot = n = 0
    for name, pts in curves.items():
        p = PRESETS[name]
        for x, y in pts:
            tot += (model(x, A, S, k, p) - y) ** 2
            n += 1
    return (tot / n) ** 0.5

def descend(curves, start, steps):
    p = list(start)
    step = list(steps)
    e = lambda q: rms(q[0], q[1], q[2], curves)
    while max(step) > 1e-6:
        moved = False
        for i in range(3):
            for s in (1, -1):
                q = p[:]; q[i] += s * step[i]
                if q[1] > 1 and q[2] > 1e-4 and e(q) < e(p):
                    p = q; moved = True
        if not moved:
            step = [t / 2 for t in step]
    return e(p), p

if __name__ == '__main__':
    raw = json.load(open(os.path.join(HERE, 'knee_curves.json')))
    curves = {n: raw[n]['pts'] for n in PRESETS}
    px = raw['007']['h']  # box height in px, for reporting error in pixels

    r, (A, S, k) = descend(curves, [-80.0, 100.0, 0.3], [2.0, 2.0, 0.05])
    print(f'free fit:      window {A:.2f} .. {A+S:.2f} dB (span {S:.2f})  k={k:.4f}/dB'
          f'   rms {r:.5f} = {r*px:.2f} px')

    rk, (_, _, k2) = descend({n: curves[n] for n in curves}, [-80.0, 100.0, 0.3], [0.0, 0.0, 0.05])
    print(f'window pinned to -80..+20:  k={k2:.4f}/dB   rms {rk:.5f} = {rk*px:.2f} px')

    for name in PRESETS:
        p = PRESETS[name]
        w = max(abs(model(x, -80.0, 100.0, k2, p) - y) for x, y in curves[name])
        print(f'   official-{name}: worst {w:.5f} = {w*px:.2f} px')

    print('\nsanity — what the old -60..+20 window and no Level would have drawn:')
    for name in PRESETS:
        p = dict(PRESETS[name]); p['L'] = 0.0
        w = max(abs(model(x, -60.0, 80.0, k2, p) - y) for x, y in curves[name])
        print(f'   official-{name}: worst {w:.5f} = {w*px:.2f} px')

    json.dump({'window': [-80.0, 20.0], 'k_med_hard': k2, 'rms': rk},
              open(os.path.join(HERE, 'knee_fit.json'), 'w'))
