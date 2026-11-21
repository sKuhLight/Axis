// Save / store-target guard — pure, DOM-free helpers shared by the forgefx client, the editor store, the
// Save dialog and Device Tools.
//
// A device "store" overwrites a preset slot, so the target must be an explicit slot number that is KNOWN to
// be the one the user means. Nothing may be guessed — in particular never slot 0, which is a real,
// overwritable slot. "No target" is `null`. Cached values (`preset` / `lastPreset`) can be stale: a preset
// switched on the unit and then edited makes the live query return -1, and the cache keeps the old slot. So
// the Save flow re-reads the device's own answer when it can (see `resolveCurrentSlot`) and treats anything
// it cannot confirm as unknown.
//
// The upper bound is deliberately NOT a gate: the server's reported `presets.count` can be wrong for a
// device (a fixed 512 is reported for every grid device while some have more), so a slot beyond it only gets
// a warning (`slotRangeWarning`); the codec/device rejects what it cannot address.

/** Why a target was refused: `none` = nothing chosen (null/undefined); `invalid` = something that is not a slot number. */
export type SaveBlockReason = 'none' | 'invalid';

export type SaveTargetCheck = { ok: true; slot: number } | { ok: false; reason: SaveBlockReason };

/** A usable slot number: a finite integer >= 0. (0 is a valid slot — only non-numbers/negatives are refused.) */
export function isSlotNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/** The first KNOWN slot among `candidates` (in order), else `null`. Never falls back to a slot. */
export function resolveSaveTarget(...candidates: (number | null | undefined)[]): number | null {
  for (const c of candidates) if (isSlotNumber(c)) return c;
  return null;
}

/** The slot to propose as "current" when Save opens. On a device with a live preset query ONLY a fresh read
 *  counts — the cached `preset`/`lastPreset` may be stale, and `-1`/failure/timeout means unknown. Without a
 *  live query nothing can be re-read, so the last slot selected here is the best (unverifiable) answer. */
export function resolveCurrentSlot(o: {
  live: boolean;
  fresh: number | null | undefined;
  preset: number | null | undefined;
  last: number | null | undefined;
}): number | null {
  return o.live ? resolveSaveTarget(o.fresh) : resolveSaveTarget(o.preset, o.last);
}

/** Validate a store target (shape only — see the header note on the upper bound). */
export function checkSaveTarget(raw: unknown): SaveTargetCheck {
  if (raw === null || raw === undefined) return { ok: false, reason: 'none' };
  if (!isSlotNumber(raw)) return { ok: false, reason: 'invalid' };
  return { ok: true, slot: raw };
}

/** Advisory only (never blocks): the slot lies beyond the slot count the device reports. */
export function slotRangeWarning(slot: number, count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !(count > 0) || slot < count) return null;
  return `The device reports ${count} preset slots; slot ${slot} is beyond that. It may be rejected — double-check.`;
}

/** User-facing explanation for a refused target. `currentKnown` = whether the loaded preset's slot is known. */
export function saveBlockedText(reason: SaveBlockReason, currentKnown = true): string {
  if (reason === 'invalid') return 'Not a valid slot — enter a whole number, 0 or higher.';
  return currentKnown
    ? 'No target slot chosen — enter the slot to write. Nothing is written until you do.'
    : 'Current preset unknown — choose a target slot. Nothing is written until you do.';
}

/** Run `store` ONLY for a valid target; otherwise refuse without touching the device. UI-level gate in front
 *  of the client-level guard (`forgefx.store` itself rejects a non-slot too), so a refusal is a message, not
 *  a thrown request error. */
export async function guardedStore<R>(
  target: unknown,
  store: (slot: number) => Promise<R>
): Promise<{ ok: true; slot: number; result: R } | { ok: false; reason: SaveBlockReason }> {
  const check = checkSaveTarget(target);
  if (!check.ok) return check;
  return { ok: true, slot: check.slot, result: await store(check.slot) };
}

/** Is `slot` CONFIRMED as the preset now loaded in the edit buffer? Live-query devices: only the device's own
 *  answer counts. Others can't be asked, so the best available evidence is that the select request did not
 *  fail — a WEAK check: where the select is fire-and-forget (AM4, gen-2) "ok" only means the command was
 *  sent, not that the unit switched, and there is no way to verify it there. */
export function isSlotConfirmed(
  slot: number,
  o: { live: boolean; reported: number | null | undefined; selectAcked: boolean }
): boolean {
  if (!isSlotNumber(slot)) return false;
  return o.live ? o.reported === slot : o.selectAcked;
}

/** May the current-preset query run now? Only on a live-query device, and never while a definitions
 *  walk/import owns the transport — preset reads interleaved with that stream can freeze an FM3 (the same
 *  reason `poll`/`watchPreset` sit those ticks out). A refused probe means "slot unknown", never a guess. */
export function canProbePreset(o: { live: boolean; walking: boolean }): boolean {
  return o.live && !o.walking;
}

/** How long to wait for a fresh current-preset answer. The server allows up to 4000 ms for the preset-ref
 *  query on a slow (DIN-MIDI) link, so waiting less there would call a merely slow answer "unknown". */
export function saveProbeMs(slowLink: boolean): number {
  return slowLink ? 5000 : 3000;
}

/** Resolve with `fallback` if `p` neither settles nor succeeds within `ms` (a rejection also yields the fallback). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); }
    );
  });
}

/** Seed-once-per-open state for dialog drafts (target slot, name, …). */
export interface OpenSeed<T> {
  wasOpen: boolean;
  value: T;
}

/** Advance a dialog draft: seed it ONLY on the closed → open transition. While the dialog stays open, a
 *  re-evaluation (a background poll refreshing the preset, say) must neither overwrite what the user typed
 *  nor silently move the target — `seed` is not even called then. */
export function seedOnOpen<T>(prev: OpenSeed<T>, open: boolean, seed: () => T): OpenSeed<T> {
  if (open && !prev.wasOpen) return { wasOpen: true, value: seed() };
  return { wasOpen: open, value: prev.value };
}

/** Minimal structural view of a decoded `.syx` (gen-3 summary or AM4-style bank) — just what names the target. */
export type RestoreDecode =
  | { presets: { location: number | null; code: string | null }[] }
  | { number?: number | null; name?: string };

/** Name where a verbatim "Restore .syx" will write, from the file's own decode — for the confirm prompt.
 *  `fmt` renders one slot (e.g. bank code or zero-padded number). */
export function describeRestoreTarget(dec: RestoreDecode, fmt: (slot: number) => string): string {
  if ('presets' in dec) {
    const labels = dec.presets.map((p) => p.code ?? (isSlotNumber(p.location) ? fmt(p.location) : '?'));
    if (labels.length === 0) return 'an unknown location';
    if (labels.length === 1) return `location ${labels[0]}`;
    const shown = labels.slice(0, 6).join(', ');
    return `${labels.length} locations (${shown}${labels.length > 6 ? ', …' : ''})`;
  }
  const where = isSlotNumber(dec.number) ? `preset ${fmt(dec.number)}` : 'the location stored inside the file (could not be determined)';
  return dec.name ? `${where} — "${dec.name}"` : where;
}
