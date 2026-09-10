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

## The Threshold/Ratio models share the same knee

The Studio / Analog / JFET1 variants need no fitting for their *curve* — Threshold and Ratio are live
and give the two asymptotes directly. What they did need is the corner. Axis drew the textbook
two-segment curve (unity below threshold, `T + (x-T)/R` above) and produced a hard corner where the
editor draws a rounded one; on preset 007 that is the entire visible difference between the two
graphs.

The rounding uses the same shape the sustain fit landed on:

```
y(x) = x - (1 - 1/R) * softplus(x - T, k)
```

which is unity gain far below threshold, `T + (x-T)/R` far above, and smooth in between. The sustain
model is this with `1 - 1/R = 1` (a limiter), so the two compressor families are now one curve with
two ways of getting its parameters — that unification is the evidence for the shape, since the sustain
form was fitted to the editor's own drawing rather than assumed.

### What the editor actually plots

`measurements/knee/official-*.png` are FM3-Edit's graph for four real presets whose parameters were
read off the device first, so unlike the sustain captures these solve for the *editor's* unknowns
rather than for the curve:

| | 007 | 013 | 376 | 018 |
|---|---|---|---|---|
| Variant | Studio FB | Studio FF | Analog | JFET1 |
| Comp Type | VCA Bus | Modern VCA | Analog | JFET Studio |
| Threshold | −11.804 dB | −25.0 dB | −20.0 dB | −37.0 dB |
| Ratio | 4 | 4 | **2** | 4 |
| Knee Type | MED-HARD | MED-HARD | *no control* (stores MED-HARD) | *no control* (stores HARD) |
| Level | +0.555 dB | **+6.0 dB** | 0 dB | **−3.0 dB** |
| Auto Makeup | OFF | OFF | OFF | **ON** |
| Mix / input Gain | 100% / 0 | 100% / 0 | 100% / 0 | 100% / 0 |
| Detector | RMS+PEAK | RMS+PEAK | RMS | PEAK |

018 is excluded from the fit — see "Auto Makeup" below. The other three cover two Ratios, a positive
and a zero Level, and both a variant that authors a Knee dropdown and one that does not.

`digitize_knee.py` extracts both curves against their own grid; `fit_knee.py` solves for the window and
`k`. Three things fall out:

- **Sub-threshold slope 0.99** on both — the two axes share one dB span, and below threshold the curve
  is exactly unity plus a constant.
- **Above-threshold slope 0.25** on both — Ratio 4 is plotted literally, no fudge.
- **That constant is COMP_LEVEL.** 007 needs +0.55 dB of lift, 013 needs +6.0 and 376 needs 0, matching
  their Level exactly. This is the whole reason 013's curve sat visibly low before: 007's Level is
  invisible and 013's is 7.5% of the box.

With Level accounted for, the presets independently place the axis floor at −79.6 / −79.9 / −78.8 dB.
Free-fitting the window over all three lands on −82.2 … +21.7 at 0.28 px rms; pinning the round
**−80 … +20** costs 0.60 px rms and **1.4 px worst case**, so that is what ships. `knee-vs-editor.svg`
overlays all four.

Note this is emphatically **not** the Threshold knob's own range. `COMP_THRESH` is served as −60 … +20
and Axis used to plot that window — the natural-looking choice, and wrong by up to **49 px** against
these captures. The grid is at quarters of the box, so on this window its lines fall on −55 / −30 / −5
dB rather than round numbers.

### Knee sharpness

`COMP_KNEE` sets `k` **only where the variant authors the dropdown** (Studio FF, Studio FB, Pedal,
JFET2). Preset 376 proves the rest: it is an Analog, which has no Knee control, and it *stores*
MED-HARD exactly like 007 and 013 — yet the editor draws it at 0.111/dB, a third as sharp. So the knee
for those variants is the model's own and the stored value is ignored.

| | k (1/dB) | source |
|---|---|---|
| COMP_KNEE = HARD / MED-HARD / MEDIUM / MED-SOFT / SOFT | 0.72 / **0.36** / 0.18 / 0.09 / 0.045 | MED-HARD measured; the rest halve and double from it |
| Analog (no control) | **0.111** | preset 376, 0.8 px worst case |
| JFET1 (no control) | 0.72 | preset 018 — only resolvable as "hard": every k ≥ 0.58 fits equally |
| any other variant with no control | 0.115 | the sustain limiter's own k (12 normalised over 100 dB = 0.12) |

That last row is worth noting: the sustain fit and Analog's fit are completely independent — different
captures, different presets, different model family — and land within 8% of each other. That is why
0.115 is a considered default rather than a shrug.

**Unmeasured:** the *spacing* between COMP_KNEE options. Every captured preset that authors the
dropdown happened to be MED-HARD. One preset captured at HARD and at SOFT, everything else held, would
pin it down — `digitize_knee.py` handles that capture shape as-is.

### Auto Makeup

Preset 018 has COMP_AUTO ON, and it is the one capture the model does not reproduce. Fitting it needs a
total offset of **+9.2 dB** against a Level of −3.0 — so Auto Makeup is adding roughly **+12 dB** — and
even then it leaves a 2.2 px residual, meaning it is not a pure constant gain either.

One data point cannot give a law: none of the obvious candidates match (−T·(1−1/R) = 27.75,
−T/R = 9.25, −T·(1−1/R)/2 = 13.88 for this preset's T = −37, R = 4). Auto Makeup is therefore **not
drawn**, and a preset with it ON renders about 12 dB low. Two captures of the same preset with Auto
Makeup toggled would isolate it exactly, and two or three more at different Thresholds would give the
law.

## Known gap

The ceiling drops by 0.33 between Compression 0 and 2 and there are **no captures in that gap** — the
exponential's shape there is extrapolation, not measurement. Captures at 0.5 / 1 / 1.5 would settle it.

COMP_MIX was 100% on every capture, so it is not drawn; below 100% the real block blends its output
back toward unity, which would flatten the curve toward the 1:1 line. Auto Makeup has its own section
above.

Orange Squeezer and Tube (COMP_TYPE 18 and 5) author Threshold *and* Compression but no Ratio. They
take the same sustain curve, driven by Compression; how their Threshold knob interacts with it is
unverified — no captures were taken for those variants.

## Reproducing

```
python3 digitize.py     # measurements/*.png  -> normalised curves
python3 fit.py          # curves -> the constants above
```
