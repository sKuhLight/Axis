// Pure logic for the cross-device preset-converter "fake grid" scratch buffer (P4b · META-24 · AXIS-48).
//
// This is the OFFLINE working copy of a conversion result: the converted target IR laid out on the
// target device's topology, plus the set of conflicts the converter flagged, each with a resolution
// lifecycle. It emits NO device writes — every transition here returns a new immutable ScratchState that
// the runes store (`convertScratch.svelte.ts`) swaps in. The commit step turns a resolved buffer into a
// library document (pure) or an ordered apply-plan (pure); the store performs the actual I/O.
//
// Framework-free + fully unit-tested (convertScratch.test.ts). The `.svelte.ts` store stays a thin shell.

import { z } from 'zod';
import type {
  ConversionEvent,
  ConverterBlock,
  ConverterDeviceId,
  ConverterParam,
  ConverterPreset,
  ConvertResponse
} from './types';
import type { Severity } from './convertReport';

// ── target topology ──────────────────────────────────────────────────────────────────────────────

/** How the target device lays blocks out. `grid` = 2-D routing matrix (gen-3), `chain` = a single row
 *  of ordered slots (VP4), `slots` = a vertical slot list (AM4). All three are represented internally as
 *  a (row,col) coordinate space so placement validity is one code path. */
export type TopologyKind = 'grid' | 'chain' | 'slots';

export interface Topology {
  kind: TopologyKind;
  rows: number;
  cols: number;
}

/** Device topology defaults (expanded to fit the actual IR positions in {@link seedScratch}). */
const TOPOLOGY_DEFAULTS: Record<ConverterDeviceId, Topology> = {
  'axe-fx-iii': { kind: 'grid', rows: 6, cols: 14 },
  fm9: { kind: 'grid', rows: 6, cols: 14 },
  fm3: { kind: 'grid', rows: 4, cols: 12 },
  'axe-fx-ii': { kind: 'grid', rows: 6, cols: 14 },
  'axe-fx-gen1': { kind: 'grid', rows: 4, cols: 12 },
  vp4: { kind: 'chain', rows: 1, cols: 4 },
  // AM4 is a 4-slot chain the device lays out LEFT→RIGHT (1 row × 4 cols), exactly like the live AM4
  // grid — not a vertical list. (`slots` stays a distinct kind for provenance; it renders horizontally.)
  am4: { kind: 'slots', rows: 1, cols: 4 }
};

/** Normalize an IR position (object, slot index, or null) to a (row,col) cell for the given topology,
 *  or null when the block is unplaced. */
export function normalizePosition(
  pos: ConverterBlock['position'],
  kind: TopologyKind
): { row: number; col: number } | null {
  if (pos == null) return null;
  if (typeof pos === 'number') {
    if (pos < 0) return null;
    // a bare slot index: chains AND slot lists (VP4/AM4) lay left-to-right across row 0, as do grids.
    return { row: 0, col: pos };
  }
  // slot/chain targets (AM4/VP4) carry a { slot } position — a left-to-right chain across row 0.
  if ('slot' in pos) {
    const slot = Math.floor(pos.slot);
    if (slot < 0) return null;
    return { row: 0, col: slot };
  }
  const row = Math.max(0, Math.floor(pos.row ?? 0));
  const col = Math.max(0, Math.floor(pos.col ?? 0));
  return { row, col };
}

// ── scratch model ─────────────────────────────────────────────────────────────────────────────────

export interface ScratchBlock {
  key: string;
  family: string;
  instance: number;
  typeName?: string;
  typeValue?: number;
  params: ConverterParam[];
  /** null while the block is unplaced (in the tray). */
  position: { row: number; col: number } | null;
  channels?: number;
  /** Offline edit state (set by the real-grid convert surface): per-block bypass and the routing
   *  feed-rows (which upstream rows connect INTO this block's cell — mirrors device `Cell.fromRows`). */
  bypassed?: boolean;
  fromRows?: number[];
}

export type ConflictKind = 'type' | 'clamps' | 'placement' | 'routing';

/** A clamped-parameter detail carried on a `clamps` conflict. */
export interface ClampDetail {
  nativeName: string;
  sourceValue: number;
  targetValue: number;
  targetMin?: number;
  targetMax?: number;
}

/** One resolvable conflict. Non-actionable losses (dropped blocks/params, collapsed scenes/channels,
 *  partial decode, unverified params) are NOT conflicts — they're informational notes rendered straight
 *  from the event log and never gate the commit. */
export interface Conflict {
  id: string;
  kind: ConflictKind;
  /** undefined for preset-wide conflicts (routing). */
  blockKey?: string;
  severity: Severity;
  resolved: boolean;
  /** type conflicts: the substitution/unresolved context to surface in the resolve panel. */
  type?: {
    unresolved: boolean;
    sourceTypeName: string;
    targetTypeName?: string;
    confidence?: 'fuzzy' | 'fallback';
    score?: number;
  };
  /** clamps conflicts: the list of source→target clamps to review. */
  clamps?: ClampDetail[];
  /** placement conflicts (an unplaced block): why it was left off. */
  placement?: { family: string; reason: string };
  /** routing conflicts: the simplification note. */
  routing?: { detail: string; affectedBlockKeys: string[] };
}

export interface ScratchState {
  sourceDevice: string;
  targetDevice: ConverterDeviceId;
  name: string;
  topology: Topology;
  blocks: ScratchBlock[];
  conflicts: Conflict[];
  /** the untouched source preset IR (routing / scenes / meta carried through the commit). */
  base: ConverterPreset;
}

// ── seeding ──────────────────────────────────────────────────────────────────────────────────────

/** Build a scratch buffer from a conversion result + the resolved target device id. */
export function seedScratch(
  target: ConverterPreset,
  events: ConversionEvent[],
  targetDevice: ConverterDeviceId
): ScratchState {
  const def = TOPOLOGY_DEFAULTS[targetDevice] ?? { kind: 'grid', rows: 6, cols: 14 };

  const blocks: ScratchBlock[] = target.blocks.map((b) => ({
    // spread the original block first so loose device-address extras (e.g. `effectId`) survive for the
    // apply-plan; then override with the editable/normalized fields.
    ...b,
    key: b.key,
    family: b.family,
    instance: b.instance,
    typeName: b.typeName,
    typeValue: b.typeValue,
    params: b.params.map((p) => ({ ...p })),
    position: normalizePosition(b.position, def.kind),
    channels: b.channels
  }));

  // block-unplaced events force the block into the tray even if the IR carried a stale position.
  const unplacedKeys = new Set(
    events.filter((e) => e.kind === 'block-unplaced').map((e) => (e as { blockKey: string }).blockKey)
  );
  for (const b of blocks) if (unplacedKeys.has(b.key)) b.position = null;

  // Grid targets expand to fit every placed position (never shrink below the device default).
  // Slot/chain targets (AM4/VP4) keep their FIXED slot count — the device has exactly that many slots,
  // and the user assigns blocks into them from the tray (overflow candidates stay in the tray).
  let rows = def.rows;
  let cols = def.cols;
  if (def.kind === 'grid') {
    for (const b of blocks) {
      if (!b.position) continue;
      rows = Math.max(rows, b.position.row + 1);
      cols = Math.max(cols, b.position.col + 1);
    }
  }
  const topology: Topology = { kind: def.kind, rows, cols };

  const conflicts = deriveConflicts(events, blocks);

  return {
    sourceDevice: target.sourceDevice,
    targetDevice,
    name: target.name,
    topology,
    blocks,
    conflicts,
    base: target
  };
}

/** Convenience: seed straight from a ConvertResponse. */
export function seedScratchFromResponse(res: ConvertResponse, targetDevice: ConverterDeviceId): ScratchState {
  return seedScratch(res.target, res.events, targetDevice);
}

/** Derive the resolvable-conflict set from the event log, grouped per block. */
export function deriveConflicts(events: ConversionEvent[], blocks: ScratchBlock[]): Conflict[] {
  const known = new Set(blocks.map((b) => b.key));
  const out: Conflict[] = [];
  const clampsByBlock = new Map<string, ClampDetail[]>();

  for (const e of events) {
    switch (e.kind) {
      case 'type-unresolved':
        if (!known.has(e.blockKey)) break;
        out.push({
          id: `type:${e.blockKey}`,
          kind: 'type',
          blockKey: e.blockKey,
          severity: 'warn',
          resolved: false,
          type: { unresolved: true, sourceTypeName: e.sourceTypeName }
        });
        break;
      case 'type-substituted':
        // exact/lineage matches are trustworthy (info) — only fuzzy/fallback need review.
        if (!known.has(e.blockKey)) break;
        if (e.confidence !== 'fuzzy' && e.confidence !== 'fallback') break;
        out.push({
          id: `type:${e.blockKey}`,
          kind: 'type',
          blockKey: e.blockKey,
          severity: 'warn',
          resolved: false,
          type: {
            unresolved: false,
            sourceTypeName: e.sourceTypeName,
            targetTypeName: e.targetTypeName,
            confidence: e.confidence,
            score: e.score
          }
        });
        break;
      case 'param-clamped': {
        if (!known.has(e.blockKey)) break;
        const arr = clampsByBlock.get(e.blockKey) ?? [];
        arr.push({
          nativeName: e.nativeName,
          sourceValue: e.sourceValue,
          targetValue: e.targetValue,
          targetMin: e.targetMin,
          targetMax: e.targetMax
        });
        clampsByBlock.set(e.blockKey, arr);
        break;
      }
      case 'block-unplaced':
        if (!known.has(e.blockKey)) break;
        out.push({
          id: `placement:${e.blockKey}`,
          kind: 'placement',
          blockKey: e.blockKey,
          severity: 'loss',
          resolved: false,
          placement: { family: e.family, reason: e.reason }
        });
        break;
      case 'routing-simplified':
        out.push({
          id: 'routing',
          kind: 'routing',
          severity: 'warn',
          resolved: false,
          routing: { detail: e.detail, affectedBlockKeys: e.affectedBlockKeys }
        });
        break;
      default:
        break;
    }
  }

  for (const [blockKey, clamps] of clampsByBlock) {
    out.push({
      id: `clamps:${blockKey}`,
      kind: 'clamps',
      blockKey,
      severity: 'warn',
      resolved: false,
      clamps
    });
  }

  // de-dupe by id (a block with both type-unresolved AND a fuzzy substitution keeps the first).
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

// ── selectors ────────────────────────────────────────────────────────────────────────────────────

/** Count of unresolved conflicts that actually gate the commit. A type/clamps conflict on a block still
 *  sitting in the tray does NOT block commit — that block won't be written unless the user places it
 *  (which re-arms the gate). This is what makes slot/chain targets (AM4/VP4) usable: every convertible
 *  block starts in the tray, and you only owe a decision on the ones you place. Placement conflicts
 *  (an overflow block you must place-or-discard) and preset-wide conflicts (routing) always gate, as do
 *  all conflicts on placed blocks. */
export function remainingConflicts(state: ScratchState): number {
  const placed = new Set(state.blocks.filter((b) => b.position !== null).map((b) => b.key));
  return state.conflicts.filter((c) => {
    if (c.resolved) return false;
    // `clamps` and `routing` are INFORMATIONAL (mockup: WARN/INFO with no action) — they never gate the
    // commit. A grid→slot remap ("routing simplified") or a clamped param must not block Save/Apply,
    // otherwise the user can never commit (there is no acknowledge control, by design).
    if (c.kind === 'clamps' || c.kind === 'routing') return false;
    // a type conflict (unresolved type OR unverified substitution) gates only once its block is PLACED —
    // convertible candidates resting in the tray (slot targets) don't block until the user keeps them.
    if (c.kind === 'type' && c.blockKey != null && !placed.has(c.blockKey)) return false;
    return true;
  }).length;
}

/** Unresolved conflicts for one block (type/clamps/placement), most-severe first. */
export function conflictsForBlock(state: ScratchState, blockKey: string): Conflict[] {
  const order: Record<Severity, number> = { loss: 0, warn: 1, info: 2 };
  return state.conflicts
    .filter((c) => c.blockKey === blockKey)
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/** The badge severity for a block cell: the worst UNRESOLVED conflict, or null if all clear. */
export function blockBadgeSeverity(state: ScratchState, blockKey: string): Severity | null {
  const unresolved = state.conflicts.filter((c) => c.blockKey === blockKey && !c.resolved);
  if (unresolved.length === 0) return null;
  if (unresolved.some((c) => c.severity === 'loss')) return 'loss';
  if (unresolved.some((c) => c.severity === 'warn')) return 'warn';
  return 'info';
}

/** Blocks with no position → the unplaced tray. */
export function unplacedBlocks(state: ScratchState): ScratchBlock[] {
  return state.blocks.filter((b) => b.position === null);
}

export function blockAt(state: ScratchState, row: number, col: number): ScratchBlock | undefined {
  return state.blocks.find((b) => b.position && b.position.row === row && b.position.col === col);
}

/** Whether (row,col) is a legal free target. `exceptKey` lets a block "move onto itself" (a no-op). */
export function canPlaceAt(state: ScratchState, row: number, col: number, exceptKey?: string): boolean {
  const { rows, cols } = state.topology;
  if (row < 0 || col < 0 || row >= rows || col >= cols) return false;
  const occ = blockAt(state, row, col);
  return !occ || occ.key === exceptKey;
}

// ── transitions (pure — each returns a new ScratchState) ─────────────────────────────────────────

function patchBlocks(state: ScratchState, fn: (b: ScratchBlock) => ScratchBlock): ScratchState {
  return { ...state, blocks: state.blocks.map(fn) };
}
function resolveConflict(state: ScratchState, id: string): ScratchState {
  return { ...state, conflicts: state.conflicts.map((c) => (c.id === id ? { ...c, resolved: true } : c)) };
}

/** Set a block's type (offline). Resolves its type conflict if one is open. */
export function setBlockType(
  state: ScratchState,
  blockKey: string,
  type: { typeName?: string; typeValue?: number }
): ScratchState {
  let next = patchBlocks(state, (b) =>
    b.key === blockKey ? { ...b, typeName: type.typeName ?? b.typeName, typeValue: type.typeValue ?? b.typeValue } : b
  );
  next = resolveConflict(next, `type:${blockKey}`);
  return next;
}

/** Accept the converter's suggested substitution as-is (resolve the type conflict, no type change). */
export function acceptType(state: ScratchState, blockKey: string): ScratchState {
  return resolveConflict(state, `type:${blockKey}`);
}

/** Acknowledge a block's clamped-parameter review. */
export function acknowledgeClamps(state: ScratchState, blockKey: string): ScratchState {
  return resolveConflict(state, `clamps:${blockKey}`);
}

/** Acknowledge the routing-simplified note. */
export function acknowledgeRouting(state: ScratchState): ScratchState {
  return resolveConflict(state, 'routing');
}

/** Place (or re-place) a block at a free cell. No-op returning the same state on an illegal target. */
export function placeBlock(state: ScratchState, blockKey: string, row: number, col: number): ScratchState {
  if (!canPlaceAt(state, row, col, blockKey)) return state;
  let next = patchBlocks(state, (b) => (b.key === blockKey ? { ...b, position: { row, col } } : b));
  next = resolveConflict(next, `placement:${blockKey}`);
  return next;
}

/** Move a placed block to another free cell (offline). */
export function moveBlock(state: ScratchState, blockKey: string, row: number, col: number): ScratchState {
  return placeBlock(state, blockKey, row, col);
}

/** Discard a block entirely: drop it and resolve every conflict that referenced it. */
export function discardBlock(state: ScratchState, blockKey: string): ScratchState {
  return {
    ...state,
    blocks: state.blocks.filter((b) => b.key !== blockKey),
    conflicts: state.conflicts.map((c) => (c.blockKey === blockKey ? { ...c, resolved: true } : c))
  };
}

/** Remove a placed block back into the tray (opposite of place) without discarding it. Also clears its
 *  routing (a tray block feeds from nothing). */
export function unplaceBlock(state: ScratchState, blockKey: string): ScratchState {
  return patchBlocks(state, (b) => (b.key === blockKey ? { ...b, position: null, fromRows: [] } : b));
}

/** Set one param's value on a block (offline), addressed by its index in the block's `params` array —
 *  the convert surface maps a NamedParam id 1:1 to this index. No-op on an out-of-range index. */
export function setBlockParam(state: ScratchState, blockKey: string, paramIndex: number, value: number): ScratchState {
  return patchBlocks(state, (b) => {
    if (b.key !== blockKey) return b;
    if (paramIndex < 0 || paramIndex >= b.params.length) return b;
    const params = b.params.map((p, i) => (i === paramIndex ? { ...p, value } : p));
    return { ...b, params };
  });
}

/** Toggle a block's bypass (offline). */
export function toggleBlockBypass(state: ScratchState, blockKey: string): ScratchState {
  return patchBlocks(state, (b) => (b.key === blockKey ? { ...b, bypassed: !b.bypassed } : b));
}

/** Replace a placed block's routing feed-rows (offline). The convert surface computes the new set from
 *  a cable gesture (reusing the grid's own connect planner) and hands the result here. A no-op for a
 *  tray block (unplaced blocks feed from nothing). */
export function setBlockRouting(state: ScratchState, blockKey: string, fromRows: number[]): ScratchState {
  const uniqSorted = [...new Set(fromRows.filter((r) => Number.isInteger(r) && r >= 0))].sort((a, b) => a - b);
  return patchBlocks(state, (b) => (b.key === blockKey && b.position ? { ...b, fromRows: uniqSorted } : b));
}

// ── commit: library document ───────────────────────────────────────────────────────────────────────

/** Rebuild a ConverterPreset from the resolved scratch buffer (edits reflected; discarded blocks gone). */
export function scratchToPreset(state: ScratchState): ConverterPreset {
  const blocks: ConverterBlock[] = state.blocks.map((b) => ({
    key: b.key,
    family: b.family,
    instance: b.instance,
    typeName: b.typeName,
    typeValue: b.typeValue,
    params: b.params,
    channels: b.channels,
    position: b.position
  }));
  return { ...state.base, name: state.name, blocks };
}

/** The persisted library-document shape (store collection `converted`). */
export interface ConvertedPresetDoc {
  v: 1;
  name: string;
  sourceDevice: string;
  targetDevice: ConverterDeviceId;
  savedAt: number;
  /** The target slot the user chose to save this conversion into (optional — free-form, non-negative;
   *  purely metadata today: the true `.syx` store/export happens in the separate codec-authoring task). */
  slot?: number;
  preset: ConverterPreset;
}

/** Name/slot overrides captured by the save flow, threaded into {@link buildLibraryDoc}. */
export interface SaveOverrides {
  /** Rename the saved preset (falls back to the scratch buffer's name when blank). */
  name?: string;
  /** The target slot number the user picked (already validated — see {@link validateSlot}). */
  slot?: number;
}

/** Validate a user-entered slot value against an optional target-device preset count. A blank value is
 *  valid (slot is optional). Otherwise it must be a non-negative whole number and, when `count` is known,
 *  within `0..count-1`. Pure + unit-tested; the save UI renders `error` and only saves when `ok`. */
export interface SlotValidation {
  ok: boolean;
  slot?: number;
  error?: string;
}
export function validateSlot(raw: string | number | null | undefined, count?: number): SlotValidation {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return { ok: true };
  const n = typeof raw === 'number' ? raw : Number(raw.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { ok: false, error: 'Enter a non-negative whole number.' };
  if (count != null && count > 0 && n >= count) return { ok: false, error: `Slot must be 0–${count - 1}.` };
  return { ok: true, slot: n };
}

// ── persisted-doc validation (Zod) ─────────────────────────────────────────────────────────────────
// Validate a ConvertedPresetDoc read back from the store → drop anything corrupt or from an older schema
// (mirrors library.svelte.ts `summarySchema`). Permissive on the nested preset: only the fields the
// library + re-open path rely on are required; unknown extras pass through untouched.
const converterParamSchema = z.object({ nativeName: z.string(), value: z.number() }).passthrough();
const converterBlockSchema = z
  .object({
    key: z.string(),
    family: z.string(),
    instance: z.number(),
    typeName: z.string().optional(),
    typeValue: z.number().optional(),
    params: z.array(converterParamSchema),
    channels: z.number().optional(),
    position: z.any().optional()
  })
  .passthrough();
const converterPresetSchema = z
  .object({
    sourceDevice: z.string(),
    name: z.string(),
    sceneCount: z.number(),
    blocks: z.array(converterBlockSchema),
    routing: z.any(),
    decodeDepth: z.string()
  })
  .passthrough();
export const convertedPresetDocSchema = z.object({
  v: z.literal(1),
  name: z.string(),
  sourceDevice: z.string(),
  targetDevice: z.enum(['axe-fx-iii', 'fm9', 'fm3', 'vp4', 'am4', 'axe-fx-ii', 'axe-fx-gen1']),
  savedAt: z.number(),
  slot: z.number().int().nonnegative().optional(),
  preset: converterPresetSchema
});

/** Parse an untrusted store value into a ConvertedPresetDoc, or null when it fails validation. */
export function parseConvertedDoc(raw: unknown): ConvertedPresetDoc | null {
  const r = convertedPresetDocSchema.safeParse(raw);
  return r.success ? (r.data as ConvertedPresetDoc) : null;
}

/** URL/id-safe slug from a preset name. */
export function slugifyName(name: string): string {
  const s = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'preset';
}

/** Build the library document + its store id from a resolved scratch buffer. `overrides` carries the
 *  name + slot the save flow captured; a blank name falls back to the buffer's own name. The chosen name
 *  is reflected in BOTH the doc and the embedded preset so a re-open shows it. */
export function buildLibraryDoc(
  state: ScratchState,
  savedAt: number,
  overrides: SaveOverrides = {}
): { id: string; doc: ConvertedPresetDoc } {
  const name = overrides.name?.trim() || state.name;
  const slot =
    Number.isInteger(overrides.slot) && (overrides.slot as number) >= 0 ? (overrides.slot as number) : undefined;
  const preset: ConverterPreset = { ...scratchToPreset(state), name };
  const doc: ConvertedPresetDoc = {
    v: 1,
    name,
    sourceDevice: state.sourceDevice,
    targetDevice: state.targetDevice,
    savedAt,
    ...(slot != null ? { slot } : {}),
    preset
  };
  const id = `${state.targetDevice}-${slugifyName(name)}-${savedAt}`;
  return { id, doc };
}

// ── commit: device apply-plan ────────────────────────────────────────────────────────────────────

/** One executable device op. Ordered place → set-type → set-param (a block must exist before its type
 *  is set, and its type before its params). Only emitted when the numeric device address is resolvable
 *  from the IR — see {@link buildApplyPlan}. */
export type ApplyOp =
  | { kind: 'place'; blockKey: string; effectId: number; row: number; col: number }
  | { kind: 'set-type'; blockKey: string; effectId: number; value: number }
  | { kind: 'set-param'; blockKey: string; effectId: number; paramId: number; value: number };

export interface ApplyPlan {
  ops: ApplyOp[];
  /** Placed blocks whose device effect-id couldn't be resolved from the IR (can't be applied). */
  unresolvedBlocks: number;
  /** Params carried in resolvable blocks but lacking a numeric paramId (can't be written). */
  unresolvedParams: number;
}

/** Read a numeric extra attribute off a loosely-typed IR object (the wire may carry device addresses the
 *  IR interface doesn't formally declare — e.g. a target `effectId` or a param `paramId`). */
function numAttr(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Resolve a block's device effect-id from the IR (extra `effectId` key), if present. */
export function blockEffectId(b: ScratchBlock): number | undefined {
  return numAttr(b as unknown as Record<string, unknown>, 'effectId');
}

/**
 * Generate the ordered apply-plan for the CONNECTED device (best-effort). Pure + testable.
 *
 * Only PLACED blocks are applied. Each op needs a numeric device address that the converter IR carries
 * as an extra key (`effectId` on the block, `paramId` on the param). Blocks/params without one are
 * counted in `unresolvedBlocks`/`unresolvedParams` and skipped rather than guessed — the current IR does
 * not universally carry device-native addressing, so a full apply is inherently best-effort.
 */
export function buildApplyPlan(state: ScratchState): ApplyPlan {
  const places: ApplyOp[] = [];
  const types: ApplyOp[] = [];
  const params: ApplyOp[] = [];
  let unresolvedBlocks = 0;
  let unresolvedParams = 0;

  for (const b of state.blocks) {
    if (!b.position) continue; // tray blocks aren't applied
    const eid = blockEffectId(b);
    if (eid == null) {
      unresolvedBlocks++;
      continue;
    }
    places.push({ kind: 'place', blockKey: b.key, effectId: eid, row: b.position.row, col: b.position.col });
    if (b.typeValue != null) types.push({ kind: 'set-type', blockKey: b.key, effectId: eid, value: b.typeValue });
    for (const p of b.params) {
      const pid = numAttr(p as unknown as Record<string, unknown>, 'paramId');
      if (pid == null) {
        unresolvedParams++;
        continue;
      }
      params.push({ kind: 'set-param', blockKey: b.key, effectId: eid, paramId: pid, value: p.value });
    }
  }

  return { ops: [...places, ...types, ...params], unresolvedBlocks, unresolvedParams };
}
