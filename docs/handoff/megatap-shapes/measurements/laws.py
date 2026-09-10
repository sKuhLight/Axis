"""Candidate laws for the three time shapes the VU rig could not pin, scored against the correlation
captures.

Each law places tap k (1..N) at a fraction of the delay window. Scoring is two-sided and tolerant:
a capture can carry a spurious peak (the deconvolution's noise floor) or lose a tap (two taps closer
than ~1 ms, or a first tap inside the dry-leak guard), so both directions - measured to nearest model
and model to nearest measured - are reported. A law is only believed when both are small.
"""
import math

expm1, exp, pi, cos, sin, tanh = math.expm1, math.exp, math.pi, math.cos, math.sin, math.tanh


def curved(u, c):
    return u if abs(c) < 1e-9 else expm1(c * u) / expm1(c)


def normalise(vals):
    """Pin the last tap to the end of the window, which every capture agrees it lands on."""
    last = vals[-1]
    return [v / last for v in vals] if last else vals


# --- symmetric warps for SIGMOID ---------------------------------------------------------------
# Positions come out obeying p_k + p_(N+1-k) = const, which is what a warp S with S(x) + S(1-x) = 1
# sampled at u_k = (k - 0.5)/N gives once the train is normalised onto the window. Each candidate
# below is such an S, steepness set by `s`.

def s_logistic(x, s):
    f = lambda t: 1 / (1 + exp(-s * (t - 0.5)))
    lo, hi = f(0), f(1)
    return (f(x) - lo) / (hi - lo)


def s_tanh(x, s):
    f = lambda t: tanh(s * (t - 0.5))
    return (f(x) - f(0)) / (f(1) - f(0))


def s_halframp(x, s):
    """The module's own idiom: one curvedRamp bend over each half of the train, mirrored."""
    return 0.5 * curved(2 * x, s) if x <= 0.5 else 1 - 0.5 * curved(2 * (1 - x), s)


def s_power(x, s):
    a, b = x ** s, (1 - x) ** s
    return a / (a + b) if a + b else 0.0


SYMMETRIC = {'logistic': s_logistic, 'tanh': s_tanh, 'halframp': s_halframp, 'power': s_power}


# The warp is sampled at v_k = k/(n+1). That is the only sampling that is symmetric about its own
# centre (v_k + v_(N+1-k) = 1, which is what makes the pair sums constant) *and* collapses to the
# measured k/N at Alpha 50%, where the warp is the identity. Sampling at k/N instead puts the centre
# at (N+1)/2N - the "centre would have to sit at u = 0.62" that the VU-era analysis ran into, which
# was an artifact of the index convention rather than anything the block does.
def sigmoid_law(name, n, s, offset=0.0):
    warp = SYMMETRIC[name]
    span = n + 1 - 2 * offset
    us = [(k - offset) / span for k in range(1, n + 1)]
    return normalise([warp(u, s) for u in us])


# --- gap modulation for COSINE / SINE ------------------------------------------------------------
# These two visibly modulate the spacing rather than bending it one way, so the candidates are a
# periodic gap width accumulated across the train.

def periodic_law(n, depth, freq, phase):
    gaps = [1 + depth * cos(2 * pi * freq * (k - 0.5) / n + phase) for k in range(1, n + 1)]
    acc, out = 0.0, []
    for g in gaps:
        acc += max(1e-6, g)
        out.append(acc)
    return normalise(out)


# --- scoring -------------------------------------------------------------------------------------

def two_sided(model, meas):
    """(measured->model RMS, model->measured RMS). Both small means the law explains the train."""
    if not meas or not model:
        return 9.9, 9.9
    fwd = math.sqrt(sum(min((m - x) ** 2 for x in model) for m in meas) / len(meas))
    rev = math.sqrt(sum(min((m - x) ** 2 for x in meas) for m in model) / len(model))
    return fwd, rev


def scan(build, lo, hi, meas, steps=3000):
    """Best single parameter for `build(param) -> positions`, scored two-sided then refined."""
    best = (9.9, lo)
    for i in range(steps + 1):
        p = lo + (hi - lo) * i / steps
        fwd, rev = two_sided(build(p), meas)
        score = max(fwd, rev)
        if score < best[0]:
            best = (score, p)
    score, p = best
    step = (hi - lo) / steps
    for _ in range(40):
        step /= 2
        for cand in (p - step, p + step):
            fwd, rev = two_sided(build(cand), meas)
            if max(fwd, rev) < score:
                score, p = max(fwd, rev), cand
    return p, score
