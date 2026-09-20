// The metronome: the device's global metronome switch/level plus the Tempo/Pitch page's
// Tempo knob. All sound comes from the device — this store makes none. Own state only; it
// imports no sibling slice, so the UI hands it the preset tempo to seed from.
import { forgefx } from '$lib/api/forgefx';

// Verified device addresses (FM3):
//   GLOBAL_METRONOME   enum    eid 1, pid 14878  0=OFF / 1=ON
//   GLOBAL_METLEVEL1   named   eid 1, pid 119    -40..20 dB
//   CONTROLLERS_TEMPO  named   eid 2, pid 32     24..250 BPM (the Tempo/Pitch page knob)
export const METRONOME_DEVICE = {
  switchEid: 1,
  switchPid: 14878,
  levelEid: 1,
  levelPid: 119,
  levelMin: -40,
  levelMax: 20,
  tempoEid: 2,
  tempoPid: 32,
  tempoMin: 24,
  tempoMax: 250
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number) => clamp(n, 0, 1);

/** True for the GLOBAL metronome switch — the same enum the Controllers Tempo/Pitch page renders. */
export const isMetronomeSwitch = (eid: number | null | undefined, paramName: string | null | undefined): boolean =>
  eid === METRONOME_DEVICE.switchEid && paramName === 'GLOBAL_METRONOME';
/** True for the GLOBAL metronome level (Output 1 on the Controllers Tempo/Pitch page). */
export const isMetronomeLevel = (eid: number | null | undefined, paramName: string | null | undefined): boolean =>
  eid === METRONOME_DEVICE.levelEid && paramName === 'GLOBAL_METLEVEL1';
const levelNorm = (db: number) =>
  clamp01((db - METRONOME_DEVICE.levelMin) / (METRONOME_DEVICE.levelMax - METRONOME_DEVICE.levelMin));
const tempoNorm = (bpm: number) =>
  clamp01((bpm - METRONOME_DEVICE.tempoMin) / (METRONOME_DEVICE.tempoMax - METRONOME_DEVICE.tempoMin));

export class MetronomeStore {
  /** Metronome tempo in BPM — seeds from the preset tap tempo, writes the device Tempo knob. */
  bpm = $state(120);
  /** Metronome level in dB (device range -40..20). */
  level = $state(-18);
  running = $state(false);
  /** 0..3 within the 4/4 bar, or -1 when stopped. Drives the beat dots only (the device clicks). */
  beat = $state(-1);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #beat = 0;
  // The switch has two UI surfaces (the Controllers Tempo/Pitch page + the modal/widget). The
  // Controllers slice subscribes here so a change made from either surface repaints the other.
  #listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  }

  get levelText(): string {
    return this.level <= -39.5 ? '−∞ dB' : `${this.level.toFixed(1).replace('-', '−')} dB`;
  }

  /** Seed the tempo from the preset's tap tempo (called when the modal opens). */
  seed(presetBpm: number) {
    if (Number.isFinite(presetBpm)) this.bpm = clamp(Math.round(presetBpm), METRONOME_DEVICE.tempoMin, METRONOME_DEVICE.tempoMax);
  }

  setBpm(value: number) {
    const next = clamp(Math.round(value), METRONOME_DEVICE.tempoMin, METRONOME_DEVICE.tempoMax);
    this.bpm = next;
    if (this.running) this.#restart();
    forgefx
      .setParam(METRONOME_DEVICE.tempoEid, METRONOME_DEVICE.tempoPid, tempoNorm(next), true)
      .catch(() => {});
  }

  setLevel(db: number) {
    this.applyLevel(db);
    forgefx
      .setParam(METRONOME_DEVICE.levelEid, METRONOME_DEVICE.levelPid, levelNorm(this.level), true)
      .catch(() => {});
  }

  /** Adopt a switch state produced elsewhere (the Controllers page) — no device write. */
  applySwitch(on: boolean) {
    this.#applyRunning(on);
  }

  /** Adopt a level produced elsewhere (the Controllers page) — no device write. */
  applyLevel(db: number) {
    const next = clamp(db, METRONOME_DEVICE.levelMin, METRONOME_DEVICE.levelMax);
    if (next === this.level) return;
    this.level = next;
    this.#emit();
  }

  #emit() {
    for (const fn of [...this.#listeners]) fn();
  }

  /**
   * Mirror the device's metronome switch — the same GLOBAL_METRONOME enum the Controllers >
   * Tempo/Pitch page renders — plus its level, so the modal opens showing the real state
   * rather than an assumed one. Best-effort: a failed read leaves the current state.
   */
  async syncFromDevice() {
    if (!forgefx.blockParams) return;
    try {
      const r = await forgefx.blockParams(METRONOME_DEVICE.switchEid, { observe: false });
      const sw = (r.enums ?? []).find((e) => e.paramName === 'GLOBAL_METRONOME');
      if (sw) this.#applyRunning(sw.value > 0);
      const level = (r.named ?? []).find((p) => p.paramName === 'GLOBAL_METLEVEL1');
      if (level) this.applyLevel(level.value);
    } catch {
      /* leave the current state */
    }
  }

  start() {
    if (this.running) return;
    this.#applyRunning(true);
    forgefx.setParam(METRONOME_DEVICE.switchEid, METRONOME_DEVICE.switchPid, 1, false).catch(() => {});
  }

  stop() {
    if (!this.running) return;
    this.#applyRunning(false);
    forgefx.setParam(METRONOME_DEVICE.switchEid, METRONOME_DEVICE.switchPid, 0, false).catch(() => {});
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
  }

  /** Set the running state (and its beat-dot clock) WITHOUT a device write. */
  #applyRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    if (on) {
      this.#beat = 0;
      this.#tick();
    } else {
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = null;
      this.beat = -1;
    }
    this.#emit();
  }

  #restart() {
    if (!this.running) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#beat = 0;
    this.#timer = setTimeout(() => this.#tick(), 60000 / this.bpm);
  }

  #tick() {
    if (!this.running) return;
    this.beat = this.#beat % 4;
    this.#beat += 1;
    this.#timer = setTimeout(() => this.#tick(), 60000 / this.bpm);
  }
}

export const metronome = new MetronomeStore();
