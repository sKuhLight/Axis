// Tempo divisions and LFO rates for the read-only graph tiles.
//
// Computes: a tempo-division label ('1/8 DOT', '1/4 TRIP', '4/3', '10/64 (5/32)', 'NONE ') → fraction of a whole note,
// the period of that division at a given BPM, the effective LFO rate (tempo-synced or free-running) and two readout
// formatters (Hz and period).
//
// Own math, no editor-derived constants. The only arithmetic is standard music notation:
//   - a whole note lasts four beats, so a division d (fraction of a whole note) lasts 4·d·60/bpm seconds;
//   - DOT (dotted) lengthens a note by half (×1.5), TRIP (triplet) fits three in the space of two (×2/3).
//
// Assumptions:
//   - the label's leading `a/b` or plain number is the division; anything after it other than DOT / TRIP
//     (e.g. the '(5/32)' alias in '10/64 (5/32)') is ignored;
//   - a missing / empty / 'NONE' / unparseable / non-positive label means "not synced" (null);
//   - when a division is set but the tempo is unknown, the LFO is drawn at its free Rate value and flagged with a note.
//
// Pure — no DOM, no Svelte (tempo.test.ts).

// ── divisions ────────────────────────────────────────────────────────────────────────────────────

/** Dotted note: one and a half times the plain length (standard notation). */
export const DOT_FACTOR = 1.5;
/** Triplet: three notes in the time of two (standard notation). */
export const TRIP_FACTOR = 2 / 3;
/** Beats per whole note (standard notation: a whole note is four quarter-note beats). */
export const BEATS_PER_WHOLE = 4;

const LEADING_NUMBER = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/;

/** Tempo-division label → fraction of a WHOLE note ('1/4' → 0.25, '1/8 DOT' → 0.1875), or null when not a division. */
export function parseDivision(label: string | null | undefined): number | null {
  if (typeof label !== 'string') return null;
  const s = label.trim().toUpperCase();
  if (s === '' || s.startsWith('NONE')) return null;
  const m = LEADING_NUMBER.exec(s);
  if (!m) return null;
  const num = Number(m[1]);
  const den = m[2] === undefined ? 1 : Number(m[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  let d = num / den;
  const rest = s.slice(m[0].length);
  if (/\bDOT(?:TED)?\b/.test(rest)) d *= DOT_FACTOR;
  if (/\bTRIP(?:LET)?\b/.test(rest)) d *= TRIP_FACTOR;
  return Number.isFinite(d) && d > 0 ? d : null;
}

const validBpm = (bpm: number): boolean => typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0;

/** Period in seconds of a tempo division at `bpm` (`4·d·60/bpm`), or null without a division / valid tempo. */
export function divisionSeconds(label: string | null | undefined, bpm: number): number | null {
  const d = parseDivision(label);
  if (d === null || !validBpm(bpm)) return null;
  return (BEATS_PER_WHOLE * d * 60) / bpm;
}

// ── LFO rate ─────────────────────────────────────────────────────────────────────────────────────

export interface LfoRate {
  hz: number;
  synced: boolean;
  note?: string;
}

/** Note attached when a tempo division is set but the tempo is unknown. */
export const TEMPO_UNKNOWN_NOTE = 'tempo unknown — drawn at the Rate value';

/**
 * Effective LFO rate. A tempo division wins when the tempo is known; with a division but no tempo the free `rate`
 * is used and flagged; without a division the free `rate` is used. Null when nothing usable is left.
 */
export function lfoRateHz(
  rate: number | null | undefined,
  tempoLabel: string | null | undefined,
  bpm: number,
  hasTempo: boolean
): LfoRate | null {
  const rateOk = typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  const d = parseDivision(tempoLabel);
  if (d !== null) {
    // bpm / (4·d·60) rather than 1 / period: same value, exact for round tempos (1/4 at 90 bpm → 1.5 Hz).
    if (hasTempo === true && validBpm(bpm)) return { hz: bpm / (BEATS_PER_WHOLE * d * 60), synced: true };
    return rateOk ? { hz: rate, synced: false, note: TEMPO_UNKNOWN_NOTE } : null;
  }
  return rateOk ? { hz: rate, synced: false } : null;
}

// ── readouts ─────────────────────────────────────────────────────────────────────────────────────

/** Shown for a value that cannot be formatted. */
export const NO_VALUE = '—';

/**
 * Frequency readout: ≥ 10 Hz → whole Hz ('12 Hz'), 1..10 Hz → one decimal ('2.0 Hz'), 0.1..1 Hz → two decimals
 * ('0.25 Hz'), below 0.1 Hz → three decimals ('0.050 Hz').
 */
export function formatHz(hz: number): string {
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz < 0) return NO_VALUE;
  if (hz >= 9.95) return `${Math.round(hz)} Hz`;
  if (hz >= 0.995) return `${hz.toFixed(1)} Hz`;
  if (hz >= 0.0995) return `${hz.toFixed(2)} Hz`;
  return `${hz.toFixed(3)} Hz`;
}

/**
 * Period readout: below 1 s in milliseconds (whole ms, one decimal below 10 ms: '667 ms', '2.5 ms'); from 1 s up in
 * seconds with one decimal below 10 s ('2.0 s', '1.5 s') and whole seconds above ('12 s').
 */
export function formatPeriod(sec: number): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return NO_VALUE;
  const ms = sec * 1000;
  if (ms < 9.95) return `${ms.toFixed(1)} ms`;
  if (Math.round(ms) < 1000) return `${Math.round(ms)} ms`;
  if (sec < 9.95) return `${sec.toFixed(1)} s`;
  return `${Math.round(sec)} s`;
}
