# FM3 Megatap tap pattern — measurements

Ground truth for `src/lib/megaTapPattern.ts`. The Megatap block computes its taps in DSP and exposes
none of them over MIDI, so the taps were measured as **audio**: an impulse through the block, its
taps read off the output VU meters.

## Rig

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

`analyze.py` and `fit.py` fit the families and print per-capture residuals.

## What the data settled

| finding | evidence |
|---|---|
| Taps run k = 1…N across the window; the last tap always lands on Delay Time | every capture ends at 1.000 |
| Predelay shifts the whole train; the window is predelay + Delay Time | 500 ms predelay → taps at 1001…4503 ms |
| EXP/LOG bends the spacing exponentially, curvature linear in Alpha | c = −8.58 / −4.30 / 0 / +4.28 / +8.55 at Alpha 0/25/50/75/100%, RMS 1.5–3 ms in a 4000 ms window |
| **CONSTANT amplitude is a constant *slope*, not a constant level** | Alpha 0% ramps 0 → 1 across the taps, 50% is flat, 100% ramps 1 → 0 |
| INCREASING / DECREASING are exponential bends | c = ±20.0 (rise) and ∓17.7 (fall) per unit Alpha, RMS ≤ 0.004 |
| UP / DOWN and DOWN / UP are one half-length bend and its mirror | c = ±20.0 and ∓16.0 per unit Alpha, RMS ≤ 0.004 |
| COSINE / SINE amplitude sweep *frequency*, not curvature | Alpha 25% = 1 cycle across the taps, 50% = 2, 100% = 4 (every second tap silent) |
| Randomize is a nudge, not a scatter | at 50%, taps moved ≲0.5% of the window and the last stayed pinned |

Pan was captured for all 7 shapes (`kind: "pan"`, L/R split) and is not modelled — the FM3 editor
does not draw pan either. The data is here if that changes.

## Unresolved

The **SIGMOID, COSINE and SINE time shapes**. All three modulate the spacing between taps, and over
much of the Alpha range they crowd taps closer than the meter's ~25 ms resolution, so captures come
back incomplete and each surviving onset's index is ambiguous. Four- and five-tap probes resolve
every tap but alias the periodic pair. Laws tried and rejected: the EXP/LOG exponential bend
(RMS 0.08), a logistic in tap index (its centre would have to sit at u ≈ 0.62, not 0.5), sinusoidal
displacement (fitted frequency jumps between alphas), and accumulated Gaussian spacing (RMS
0.03–0.08, and the fitted spread does not track Alpha consistently across tap counts).

`megaTapPattern.ts` therefore approximates these three: SIGMOID keeps the shape it plainly has —
spacing widest in the middle below Alpha 50%, narrowest above — and COSINE/SINE fall back to even
spacing, which is exact at Alpha 50% and never more than ~0.09 of the window off elsewhere.
