"""Recover the Megatap's impulse response by correlating the excitation against the response.

The block is driven with drone white noise. Row 2 of the grid carries a dry shunt straight to the
Output and the Megatap is panned hard right, so the left channel is the excitation and the right is
the excitation plus the taps. Wiener-deconvolving left out of right leaves a delta train: one spike
per tap, at the tap's delay.

This replaces the gated-burst instrument. Pulsing the Synth's level costs two HTTP round trips, so
the impulse is ~50 ms wide no matter how short the sleep between them, and EXP/LOG at Alpha 100 puts
its first four taps inside 55 ms - unresolvable by any gate. Correlation is limited by the noise
bandwidth instead, which separates taps about 1 ms apart.

**The Synth's white noise is a loop, not a stream.** Its autocorrelation reads 0.81 at a lag of
exactly 3750 ms, so the excitation is periodic and the deconvolution is ill-posed: every tap is
ghosted at +/- LOOP_MS, and a 4000 ms window folds its last tap back onto 250 ms as the strongest
spike in the response. Measuring at a Delay Time inside one loop period puts every ghost outside the
window instead. Tap positions are a pure fraction of Delay Time, so a 3000 ms window measures the
same shapes a 4000 ms one would.
"""
import time
import numpy as np
import sounddevice as sd

SR = 48000
DEVICE = 'FM3'
DRY_GUARD_MS = 1.5     # the lag-0 spike is the dry shunt leaking into both channels, not a tap
LOOP_MS = 3750.0       # the Synth noise loop; keep Delay Time and the analysis window inside it
TIME_MS = 3000         # the Delay Time every correlation capture uses


def record(seconds=12.0, attempts=6):
    """Record both channels. CoreAudio drops the FM3's stream occasionally over a long sweep, so a
    failed open is retried rather than losing the run."""
    for attempt in range(attempts):
        try:
            buf = sd.rec(int(seconds * SR), samplerate=SR, channels=2, device=DEVICE, dtype='float32')
            sd.wait()
            return buf.astype(np.float64)
        except sd.PortAudioError:
            if attempt == attempts - 1:
                raise
            sd._terminate()
            time.sleep(2.0 + attempt)
            sd._initialize()
    raise RuntimeError('unreachable')


def impulse_response(audio, length_s=3.5, reg=1e-3):
    """Wiener deconvolution of ch1 out of ch2, corrected for the correlation's finite overlap."""
    left, right = audio[:, 0], audio[:, 1]
    n = len(left)
    size = 1 << int(np.ceil(np.log2(2 * n)))
    fl = np.fft.rfft(left, size)
    fr = np.fft.rfft(right, size)
    power = np.abs(fl) ** 2
    ir = np.fft.irfft(np.conj(fl) * fr / (power + reg * power.mean()), size)[:int(length_s * SR)]
    # A tap at delay d only overlaps the record for (n - d) samples, so its spike is scaled by that.
    return np.abs(ir) / (1 - np.arange(len(ir)) / n)


def peaks(ir, count, min_gap_ms=1.0):
    """The `count` strongest spikes, in time order, as (ms, height)."""
    env = ir.copy()
    env[:int(DRY_GUARD_MS / 1000 * SR)] = 0
    gap = max(1, int(min_gap_ms / 1000 * SR))
    local = [i for i in range(1, len(env) - 1) if env[i] >= env[i - 1] and env[i] > env[i + 1]]
    local.sort(key=lambda i: -env[i])
    picked: list[int] = []
    for i in local:
        if all(abs(i - j) >= gap for j in picked):
            picked.append(i)
        if len(picked) == count:
            break
    picked.sort()
    return [(i / SR * 1000, float(env[i])) for i in picked]


def capture(count, time_ms, seconds=12.0):
    """One capture: returns (positions as a fraction of the window, heights relative to the loudest)."""
    ir = impulse_response(record(seconds))
    found = peaks(ir, count)
    if not found:
        return [], [], 0.0
    top = max(h for _, h in found)
    floor = float(np.median(ir)) / top if top else 0.0
    return [ms / time_ms for ms, _ in found], [h / top for _, h in found], floor
