"""Digitise FM3-Edit's Threshold/Ratio compressor graph.

Same idea as `digitize.py`, but these captures come from real presets whose Threshold / Ratio / Level
are known from the device, so the fit solves for the *editor's* unknowns (axis window, knee sharpness,
any fixed offset) instead of for the curve itself. Anti-aliasing is handled by a weighted centroid over
cyan-ish pixels rather than an exact colour match, which the six sustain captures did not need.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from png import read_png, pix

GRID = (41, 41, 41)

def plot_box(P, w, h):
    """The box is the outermost pair of full-height / full-width grid lines."""
    vs = [x for x in range(w) if sum(1 for y in range(h) if P[y][x] == GRID) > h * 0.5]
    hs = [y for y in range(h) if sum(1 for x in range(w) if P[y][x] == GRID) > w * 0.5]
    return min(vs), min(hs), max(vs), max(hs)

def cyanness(p):
    r, g, b = p[:3]
    return (b - r) if (b > 150 and g > 90 and b > r + 60) else 0

def digitize(f):
    w, h, ch, px = read_png(f)
    P = [[pix(px, ch, w, x, y)[:3] for x in range(w)] for y in range(h)]
    x0, y0, x1, y1 = plot_box(P, w, h)
    pts = []
    for x in range(x0, x1 + 1):
        ws = [(y, cyanness(P[y][x])) for y in range(y0, y1 + 1)]
        ws = [(y, c) for y, c in ws if c > 0]
        if not ws:
            continue
        tot = sum(c for _, c in ws)
        cy = sum(y * c for y, c in ws) / tot
        pts.append(((x - x0) / (x1 - x0), 1 - (cy - y0) / (y1 - y0)))
    return {'box': [x0, y0, x1, y1], 'w': x1 - x0, 'h': y1 - y0, 'pts': pts}

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = {}
    for name in ('007', '013'):
        r = digitize(os.path.join(here, f'measurements/knee/official-{name}.png'))
        out[name] = r
        p = r['pts']
        at = lambda q: [t for t in p if t[0] >= q][0][1]
        print(f"official-{name}: box {r['w']}x{r['h']} cols={len(p)} "
              f"y@0={p[0][1]:.4f} y@.25={at(.25):.4f} y@.5={at(.5):.4f} y@.75={at(.75):.4f} y@1={p[-1][1]:.4f}")
    json.dump(out, open(os.path.join(here, 'knee_curves.json'), 'w'))
