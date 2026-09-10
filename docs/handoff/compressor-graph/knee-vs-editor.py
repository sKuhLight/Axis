"""Overlay the shipped curve on the digitised editor captures -> knee-vs-editor.svg"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
from fit_knee import PRESETS, softplus
A, S = -80.0, 100.0
K = {'007': 0.36, '013': 0.36, '376': 0.111, '018': 0.72}
raw = json.load(open(os.path.join(HERE, 'knee_curves.json')))
W = 240; PAD = 30
TW = W * 4 + PAD * 5; TH = W + PAD * 2 + 14
parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (TW, TH, TW, TH),
         '<rect width="100%%" height="100%%" fill="#111"/>']
for i, name in enumerate(('007', '013', '376', '018')):
    p = PRESETS[name]; ox = PAD + i * (W + PAD)
    parts.append(f'<rect x="{ox}" y="{PAD}" width="{W}" height="{W}" fill="#0b0b0b" stroke="#333"/>')
    for q in (0.25, 0.5, 0.75):
        parts.append(f'<line x1="{ox+q*W}" y1="{PAD}" x2="{ox+q*W}" y2="{PAD+W}" stroke="#242424"/>')
        parts.append(f'<line x1="{ox}" y1="{PAD+q*W}" x2="{ox+W}" y2="{PAD+q*W}" stroke="#242424"/>')
    ed = " ".join(f"{ox+x*W:.1f},{PAD+(1-y)*W:.1f}" for x, y in raw[name]['pts'])
    parts.append(f'<polyline points="{ed}" fill="none" stroke="#35c9d6" stroke-width="4" opacity="0.55"/>')
    ours = []
    for j in range(201):
        x = j / 200; xdb = A + x * S
        ydb = xdb + p['L'] - (1 - 1 / p['R']) * softplus(xdb - p['T'], K[name])
        ours.append(f"{ox+x*W:.1f},{PAD+(1-(ydb-A)/S)*W:.1f}")
    parts.append(f'<polyline points="{" ".join(ours)}" fill="none" stroke="#e8c547" stroke-width="1.6"/>')
    note = '  AUTO MAKEUP ON — not modelled' if p['auto'] else ''
    parts.append(f'<text x="{ox}" y="{PAD-10}" fill="{"#e06c6c" if p["auto"] else "#bbb"}" font-size="10" font-family="monospace">{name}: T={p["T"]} R={p["R"]} Lvl={p["L"]}{note}</text>')
parts.append(f'<text x="{PAD}" y="{PAD+W+22}" fill="#35c9d6" font-size="11" font-family="monospace">thick = FM3-Edit (digitised)</text>')
parts.append(f'<text x="{PAD+250}" y="{PAD+W+22}" fill="#e8c547" font-size="11" font-family="monospace">thin = Axis (window -80..+20, Level drawn, per-variant knee)</text>')
parts.append('</svg>')
open(os.path.join(HERE, 'knee-vs-editor.svg'), 'w').write("".join(parts))
print('wrote knee-vs-editor.svg')
