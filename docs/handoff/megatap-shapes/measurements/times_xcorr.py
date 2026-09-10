"""Seventh pass: the four time shapes measured by noise correlation.

Every capture returns a complete N-tap train, including the alphas where taps sit milliseconds apart
and both the VU rig and the gated-burst rig gave up. This is the data the SIGMOID / COSINE / SINE
time laws are fitted against.
"""
import sys, json, time
sys.path.insert(0, '.')
from mega import *
import rig
import xcorr

OUT_FILE = 'fm3-megatap-times-xcorr.json'
TIME_MS = xcorr.TIME_MS   # inside the Synth noise loop, so no tap is ghosted (see xcorr.py)
COUNTS = [8, 16, 32]
ALPHAS = [i * 6.25 for i in range(17)]
SECONDS = 12.0


def done_keys(store):
    return {(r['shape'], r['alpha'], r['numtaps']) for recs in store.values() for r in recs}


def main():
    rig.arm_noise(level=1.0)
    setp(SYNTH, SY['LEVEL'], 1.0)
    time.sleep(0.2)
    try:
        prior = json.load(open(OUT_FILE))
        store, meta = prior['captures'], prior['meta']
        print(f'resuming, {len(done_keys(store))} captures already on disk', flush=True)
    except (FileNotFoundError, ValueError):
        store = {}
        meta = {'device': 'FM3', 'timeMs': TIME_MS, 'instrument': 'noise correlation, USB audio 48 kHz',
                'recordSeconds': SECONDS, 'captured': time.strftime('%Y-%m-%d')}
    have = done_keys(store)
    for n in COUNTS:
        rig.arm_megatap_right(taps=n, time_ms=TIME_MS)
        time.sleep(0.3)
        for shape in TIME_SHAPES:
            for alpha in ALPHAS:
                if (shape, alpha, n) in have:
                    continue
                for name, value, disc in (('NUMTAPS', n, True), ('TIMESHAPE', TIME_SHAPES.index(shape), True),
                                          ('AMPSHAPE', 0, True), ('AMPALPHA', 0.5, False),
                                          ('TIMEALPHA', alpha / 100, False)):
                    setp(MEGATAP, MT[name], value, continuous=not disc)
                    time.sleep(0.05)
                time.sleep(0.6)
                pos, amp, floor = xcorr.capture(n, TIME_MS, SECONDS)
                rec = {'kind': 'time', 'shape': shape, 'alpha': alpha, 'numtaps': n, 'timeMs': TIME_MS,
                       'pos': [round(p, 6) for p in pos], 'amp': [round(a, 4) for a in amp],
                       'floor': round(floor, 5)}
                store.setdefault(f'n{n}', []).append(rec)
                with open(OUT_FILE, 'w') as fh:
                    json.dump({'meta': meta, 'captures': store}, fh, indent=1)
                print(f"n={n:2} {shape:8} a={alpha:6.2f} floor={floor:.4f} last={pos[-1] if pos else 0:.4f}", flush=True)
    print('DONE')


if __name__ == '__main__':
    main()
