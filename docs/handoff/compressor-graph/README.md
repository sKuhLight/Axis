# Compressor transfer graph — sustain-style models

Why this directory exists: the FM3 gives Axis **nothing** to compute a transfer curve from for the
sustain-style compressors (the Pedal / Pedal1 / JFET2 layout variants, which author a single
"Compression" knob and no Threshold/Ratio). The curve Axis draws for them is fitted to the FM3 editor's
own drawing, and these are the captures and the fit.

## What the device actually says

Measured on a live FM3 (preset 348 "Petrucci Rig FM3", Comp 1 / eid 46, COMP_TYPE 1 "Econo-Dyno-Comp",
layout variant Pedal1), via ForgeFX on `:5056`:

| Probe | Result |
|---|---|
| `COMP_SUSTAIN` swept 0 → 10 (normalised 0 → 1) | `COMP_THRESH` stayed **−40.0 dB**, `COMP_RATIO` stayed **2.0** |
| `COMP_TYPE` stepped through all 19 types | Same −40.0 / 2.0 for every one |
| Type change side-effects | The device *does* reload Attack / Release / EmphFreq / Drive per type — but never Threshold/Ratio |
| `COMP_XMARK` (28) / `COMP_YMARK` (29) | Absent from the stored block body entirely (`/preset/blocks/46/raw` jumps 24 → 30); they read 0 through `blockParams` |
| `COMP_GAINMONITOR` (25) | Also absent from the body — live only via `/preset/monitors/live`, where it swung −38.3 → 0 dB while playing |

So Threshold and Ratio are inert for these models: binding them would draw a curve that never moves
when the only knob the user has is turned. That is why the curve below is fitted rather than derived.

The working buffer was restored to its captured baseline afterwards (verified zero drift) and the
preset was never stored.

## What the editor draws

`measurements/comp-NN.png` are FM3-Edit's graph at Compression = NN, same window size throughout.
`digitize.py` (with `png.py`, a dependency-free PNG decoder — this box has no PIL) locates the plot
box from its grid lines and extracts the cyan curve to normalised coordinates. `fit.py` fits the model.

Two facts fall straight out of the captures:

- **At Compression 0 the curve is the identity line**, which proves both axes span the same range.
- **The plateau is fixed** while the low-level end lifts with Compression.

That is a limiter, not a ratio: unity gain, a soft knee, then a flat ceiling, with Compression moving
a gain ahead of the detector plus the ceiling itself. Fitting with the shape locked (pure limiter,
shared knee sharpness) reproduces all six captures to **0.44 px rms in a 344 px box**.

## The model, as shipped

Implemented in `src/lib/compressorGraphs.ts` (`sustainTransfer` / `sustainCurveY` /
`sustainDotPosition`), in normalised graph space:

```
gain(c)    = 0.0845 * ln(1 + 1.7 * c)          max error 0.56 px
ceiling(c) = 0.606 + 0.34 * exp(-1.6 * c)      max error 1.14 px
knee k     = 12
y(x)       = u - softplus(u - ceiling, k),  u = x + gain
```

Worst-case deviation from the editor's drawn curve, over every digitised point of all six captures:
**1.97 px**. `fit-vs-editor.svg` overlays the two. `compressorGraphs.test.ts` asserts the parity
against points embedded from these captures, so a regression fails the suite.

## Known gap

The ceiling drops by 0.33 between Compression 0 and 2 and there are **no captures in that gap** — the
exponential's shape there is extrapolation, not measurement. Captures at 0.5 / 1 / 1.5 would settle it.

Orange Squeezer and Tube (COMP_TYPE 18 and 5) author Threshold *and* Compression but no Ratio. They
take the same sustain curve, driven by Compression; how their Threshold knob interacts with it is
unverified — no captures were taken for those variants.

## Reproducing

```
python3 digitize.py     # measurements/*.png  -> normalised curves
python3 fit.py          # curves -> the constants above
```
