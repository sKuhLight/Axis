# FM3 LFO waveform measurements

Ground truth for `modulationValue` in `src/lib/modulationGraphs.ts`, sampled from a
live FM3 rather than traced off fm3-edit's thumbnails.

## Why

fm3-edit's LFO graph is a static illustration the editor draws itself — it renders a
full period regardless of Rate (verified at 0.267 Hz). It is therefore a second-hand
source, and on `saw` it visibly disagrees with the firmware: fitting the thumbnail
gives an inverted curvature versus the device.

## Method

The FM3 exposes no readable "current LFO value". An LFO only becomes observable when a
modifier routes it onto an ordinary parameter, which `POST /preset/blocks/:eid/readrange`
(gen-3 sub `0x1a`) reads back live at ~400 Hz.

- Preset 348 "Petrucci Rig FM3"; the factory modifier on Pitch (eid 110) Detune 2, pid 12.
- Source confirmed as LFO 1 by matching the observed period to `CONTROLLERS_LFO1FREQ`.
- LFO run at **0.1 Hz** (10 s period). The modifier applies a fixed ~0.18 s damping; at
  0.1 Hz that is under 2% of a period, so corners stay sharp. At 0.5 Hz it visibly rounds
  them — do not sample fast.
- Channel linearity verified two ways: a symmetric TRIANGLE returns straight ramps, and
  SINE measures 14% of its period above 0.9 against 14.4% exact (0.017 RMS).
- Per waveform: ~8,350 samples over ~2 periods, folded into 200 phase bins, normalized.

`fm3-lfo-folded.json` holds the folded 200-point curve per capture, at Shape 0.5 and
0.242. The scripts alongside reproduce it (`capture.py` → `sweep.py` → `analyze.py`;
`verify.py` scores a candidate implementation against the data).

Folding recovers a waveform's shape but not where in the cycle it starts. `phase.py`
recovers that: it stops LFO 1 and restarts it, which resets the LFO to its start phase
and so gives an absolute time reference.

## What the data settled

| finding | evidence |
|---|---|
| Exp/Log bend a Shape ramp, not a sine | crest tracks Shape at both settings |
| Exp and Log are mirrored **in time** — Log rises over Shape, Exp over `1 - Shape` | Exp crest @0.71 vs Log @0.31 at Shape 0.242 |
| Curvature is gentler than base-10 and Shape-independent | fitted k = +1.45 / −1.35 vs ln(10) ≈ 2.30 |
| Saw curvature tracks Shape | k = +0.90 at Shape 0.5, +3.70 at Shape 0.242 ≈ `(1-shape)/shape` |
| Saw directions are time-mirrors, not negations | Saw Up fits negative k at the same Shape |
| Trapezoid's 25% plateaus were already correct | 24%/26% measured vs 25%/25% modelled |
| Triangle needed no change | asymmetry is just Shape, 0.047 RMS |
| Sine is Shape-skewed too, by exactly the triangle's ratio | crest @0.30 at Shape 0.242 vs the triangle's @0.28; `sin(π/2 · triangle)` scores 0.026 where a plain sine scores 0.186, and the mirrored direction 0.356 |
| Every waveform starts at its **trough** at LFO Phase 0 | restart capture reads −1.00 at t0 for both sine and triangle (`phase.py`) |

Mean RMS against the hardware fell from 0.201 to 0.091 across all thirteen captures.

## Known residual

Saw still scores 0.17–0.22 where continuous waveforms score 0.04–0.06. The measured saw
holds near its crest for 13% (Shape 0.5) to 26% (Shape 0.242) of the period before
decaying; a single exponential ramp does not reproduce that plateau. The discontinuity
also interacts with the modifier damping, so part of that residual is measurement, not
model. Unresolved.
