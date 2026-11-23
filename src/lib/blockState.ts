// Block state of the open block (Scene Ignore + Bypass Mode, from the ForgeFX `blockState` tag on the
// block-params response): parse what the server sent (tolerating its absence or an unexpected shape) and
// read the CURRENT values from the block's live enums, so the Block Editor header and the board's own
// control of the same param can never disagree. Which param is which is decided by the server (from the
// codec's per-device catalog); nothing here matches display names or knows ids. Pure (blockState.test.ts).

import type { BlockBypassMode, BlockSceneIgnore, BlockState, BypassModeOption, EnumParam } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function parseSceneIgnore(raw: unknown): BlockSceneIgnore | null {
  if (!isObj(raw) || !isInt(raw.paramId) || !isInt(raw.value) || typeof raw.supported !== 'boolean') return null;
  const out: BlockSceneIgnore = { paramId: raw.paramId, value: raw.value, supported: raw.supported };
  if (typeof raw.reason === 'string' && raw.reason) out.reason = raw.reason;
  return out;
}

function parseBypassMode(raw: unknown): BlockBypassMode | null {
  if (!isObj(raw) || !isInt(raw.paramId) || !isInt(raw.value) || !Array.isArray(raw.options)) return null;
  const options: BypassModeOption[] = [];
  for (const o of raw.options) {
    if (!isObj(o) || !isInt(o.value)) continue;
    options.push({ value: o.value, label: typeof o.label === 'string' ? o.label : String(o.value), muting: o.muting === true });
  }
  if (options.length < 2) return null; // nothing to choose between
  return { paramId: raw.paramId, value: raw.value, options };
}

/** The server's `blockState`, or undefined when it sent none (older server, other device) or something
 *  that is not one. A malformed member reads as null (the block then has no such control); `readError`
 *  (the server could not read the block) is kept so the header can say so. */
export function parseBlockState(raw: unknown): BlockState | undefined {
  if (!isObj(raw)) return undefined;
  const out: BlockState = { sceneIgnore: parseSceneIgnore(raw.sceneIgnore), bypassMode: parseBypassMode(raw.bypassMode) };
  if (raw.readError === true) out.readError = true;
  return out;
}

/** `blockState` with its values taken from the block's live enums (the same param ids the board edits), so
 *  an edit on either side shows on both. A tagged param the enums do not list is no control (null). */
export function liveBlockState(state: BlockState | null | undefined, enums: readonly { id: number; value: number }[]): BlockState | null {
  if (!state) return null;
  const live = (paramId: number) => enums.find((e) => e.id === paramId);
  const si = state.sceneIgnore;
  const bm = state.bypassMode;
  const siE = si ? live(si.paramId) : undefined;
  const bmE = bm ? live(bm.paramId) : undefined;
  const out: BlockState = {
    sceneIgnore: si && siE ? { ...si, value: siE.value } : null,
    bypassMode: bm && bmE ? { ...bm, value: bmE.value } : null
  };
  if (state.readError) out.readError = true;
  return out;
}

/** A device bypass-mode label as it is shown: "THRU" → "Thru", "MUTE FX OUT" → "Mute FX Out"; a label the
 *  device did not name (the bare ordinal) → "Mode 1", "Mode 2", … */
export function formatBypassModeLabel(label: string, value: number): string {
  const t = label.trim();
  if (!t || /^\d+$/.test(t)) return `Mode ${value + 1}`;
  return t
    .split(/\s+/)
    .map((w) => (/^fx$/i.test(w) ? 'FX' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/** The block's enums with the tagged Bypass Mode's option labels shown like the header shows them, so the
 *  board's own select (and the history labels) read the same as the header. Other enums are untouched;
 *  the input is not mutated. */
export function withBypassModeLabels(enums: EnumParam[], state: BlockState | null | undefined): EnumParam[] {
  const pid = state?.bypassMode?.paramId;
  if (pid == null) return enums;
  return enums.map((e) => (e.id === pid ? { ...e, options: e.options.map((o) => ({ ...o, label: formatBypassModeLabel(o.label, o.value) })) } : e));
}
