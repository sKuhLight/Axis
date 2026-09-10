# FM3 Megatap tap pattern — measurements

Ground truth for `src/lib/megaTapPattern.ts`. The Megatap block computes its taps in DSP and exposes
none of them over MIDI, so the taps were measured as **audio**.

Two instruments, in this order:

1. **VU meters** (`capture.py`) — an impulse through the block, its taps read off the output meters
   over HTTP. This settled the amplitude and pan shapes. It cannot separate taps closer than ~25 ms.
2. **Noise correlation** (`xcorr.py`) — white noise through the block with a dry reference beside it,
   deconvolved into an impulse response. This settled the time shapes, which crowd far past what the
   meters resolve. See *The correlation rig* below.

## The VU rig

`rig.py --grid` builds `Input → Synth 1 → Megatap 1 → Output` in the edit buffer of a scratch preset
and arms it (no feedback, no diffusion, no randomize, Kill Dry on). The impulse is a ~30 ms Synth
burst — Voice 1 Level pulsed up and back down — so no playing is involved and every shot is
identical. `capture.py` fires one and samples `OUTPUT_VUL`/`OUTPUT_VUR` (eid 42, pids 16/17) through
`POST /preset/blocks/:eid/readrange` at ~400 Hz. Nothing is ever stored to the device.

**The meter reads power, not dB.** Calibrated against Megatap Level over −30…+6 dB: 0.0030 / 0.0120 /
0.0479 / 0.1909 / 0.7603 — every +3 dB doubles it. So tap amplitude is `sqrt(meter)`, and pan is the
L/R power split.

Each tap arrives as a sharp onset into a short plateau: onset = tap time, plateau = tap level. Taps
under ~80 ms hide inside the impulse itself, and two taps closer than ~25 ms cannot be separated.

## Passes

| file | what |
|---|---|
| `fm3-megatap.json` | `sweep.py` — 111 captures: 4 time shapes × 8 alphas, 7 amplitude and 7 pan shapes × 5 alphas, tap-count and predelay checks, both Randomize controls |
| `fm3-megatap-times.json` | `times.py` — time shapes at 6 taps, where less merges |
| `fm3-megatap-times16.json` | `times2.py` — 16 taps, to sample the spacing modulation densely |
| `fm3-megatap-times4.json` | `times3.py` — 4 and 5 taps, where nothing merges |
| `fm3-megatap-levels.json` | `levels.py` — amplitude and pan levels read at *known* tap times, so no quiet tap drops out |
| `fm3-megatap-times-xcorr.json` | `times_xcorr.py` — **the time shapes, by noise correlation**: 4 shapes × 17 alphas × 8/16/32 taps, every train complete |

`analyze.py` and `fit.py` fit the amplitude families and print per-capture residuals. `fit_times.py`
and `laws.py` do the same for the time shapes against the correlation captures.

## The correlation rig (`xcorr.py`, `rig.py --grid` + `build_grid_parallel`)

The VU instrument settled the amplitude shapes but never the time shapes: it samples at ~400 Hz
through HTTP and cannot separate two taps closer than ~25 ms, and SIGMOID / COSINE / SINE crowd taps
far past that. Two things were needed to fix it.

**Recording the audio directly is not enough.** The FM3 is a USB audio interface, so the same impulse
can be recorded at 48 kHz — but the impulse itself is the problem. Pulsing the Synth's Voice 1 Level
costs two HTTP round trips, so the burst is ~50 ms wide however short the sleep between them, and
EXP/LOG at Alpha 100% puts its first four taps inside 55 ms. No gated impulse can resolve that.

**So drive the block with noise and correlate.** `build_grid_parallel` puts a dry shunt on row 2
straight to the Output and pans the Megatap hard right, so the left channel is the excitation and
the right is the excitation plus the taps. Wiener-deconvolving left out of right leaves one spike per
tap. Resolution is set by the noise bandwidth, not by any gate: taps ~1 ms apart separate cleanly,
and a 16-tap train reads back at exactly k/16 with the last tap on 3999.98 ms of a 4000 ms window.

**The Synth's white noise is a loop.** Its autocorrelation reads 0.81 at a lag of exactly 3750 ms, so
the excitation is periodic and the deconvolution is ill-posed: every tap is ghosted at ±3750 ms. With
Delay Time at 4000 ms the last tap folds back onto 250 ms and lands as the *strongest* peak in the
response — a tap that does not exist. Measuring at **Delay Time 3000 ms** puts every ghost outside
the window. Tap positions are a pure fraction of Delay Time, so nothing is lost by shortening it.

Two detector limits are worth knowing when reading the captures back: a spurious peak near the noise
floor can appear (real taps sit at amplitude 0.15–1.0, junk at ~0.03, so filter on `amp`), and a
first tap landing inside 1.5 ms is swallowed by the dry-leak guard. Both cost a tap in the extreme
Alpha captures; neither changes the fitted law.

## What the data settled

| finding | evidence |
|---|---|
| Taps run k = 1…N across the window; the last tap always lands on Delay Time | every capture ends at 1.000, to 0.02 ms |
| Predelay shifts the whole train; the window is predelay + Delay Time | 500 ms predelay → taps at 1001…4503 ms |
| **Every time shape samples its curve at k/(N+1)**, then normalises so the last tap ends the window | the only sampling that is symmetric about its own centre *and* collapses to the measured k/N at Alpha 50% |
| **EXP/LOG and SIGMOID are one law at one curvature: 20.0 per unit Alpha** | fitted c = ∓8.75 at Alpha 6.25/93.75% and dead linear between, RMS ≤ 0.0009 of the window at 8, 16 and 32 taps |
| EXP/LOG bends the whole train; SIGMOID bends each half and mirrors them | SIGMOID trains satisfy p(k) + p(N+1−k) = const at every Alpha |
| **COSINE / SINE modulate the gap, at full depth, 1 → 8 cycles across the train** | fitted f = 1.00, 1.44, … 8.00 against 1 + 7α at 32 taps, RMS ≤ 0.002 |
| COSINE leads SINE by a quarter cycle | phase π/2 vs 0, constant across every Alpha and tap count |
| **CONSTANT amplitude is a constant *slope*, not a constant level** | Alpha 0% ramps 0 → 1 across the taps, 50% is flat, 100% ramps 1 → 0 |
| INCREASING / DECREASING are exponential bends | c = ±20.0 (rise) and ∓17.7 (fall) per unit Alpha, RMS ≤ 0.004 |
| UP / DOWN and DOWN / UP are one half-length bend and its mirror | c = ±20.0 and ∓16.0 per unit Alpha, RMS ≤ 0.004 |
| COSINE / SINE amplitude sweep *frequency*, not curvature | Alpha 25% = 1 cycle across the taps, 50% = 2, 100% = 4 (every second tap silent) |
| Randomize is a nudge, not a scatter | at 50%, taps moved ≲0.5% of the window and the last stayed pinned |

Pan was captured for all 7 shapes (`kind: "pan"`, L/R split) and is not modelled — the FM3 editor
does not draw pan either. The data is here if that changes.

## Two corrections to the earlier VU-era analysis

**The time curvature was 17.2; it is 20.0.** The old figure came from reading the tap index as k/N.
Under the correct k/(N+1) sampling the same captures give exactly 20.0 — the same constant the
INCREASING and UP / DOWN amplitude shapes already used.

**"The centre would have to sit at u ≈ 0.62" was an artifact.** Fitting SIGMOID against k/N forces
its centre to (N+1)/2N — 0.625 at 4 taps, 0.5625 at 8 — which is what made a logistic look wrong.
Sampled at k/(N+1) the centre is 0.5, and SIGMOID falls out as the EXP/LOG bend folded in half.

## Still approximate

**COSINE and SINE at low tap counts above Alpha 50%.** The law asks for up to eight cycles of gap
modulation across as few as eight taps, so the modulation runs past its own Nyquist limit and the
result is very sensitive to the exact index convention. At 32 taps the model tracks the hardware to
~0.002 of the window and at 16 taps to ~0.008, but at 8 taps and high Alpha it drifts up to ~0.06.
A search over denominators (N−1 … N+2) and index offsets found nothing better than the k/(N+1),
gap-centred convention used everywhere else, so the remaining error is a detail of the firmware's
own indexing rather than a wrong family.

The amplitude captures **cannot** discriminate the sampling convention — peak-normalisation absorbs
it, and k/N and k/(N+1) fit identically at RMS ≤ 0.0009 — so the amplitude constants are left as the
VU rig fitted them.
