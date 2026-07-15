// Pure data foundation for the cross-device preset-converter CONFLICT-VISUALIZATION pass
// (Phase 1 · META-24 · AXIS-47/48). This module derives, from the raw `ConversionEvent[]` (+ the
// offline `ScratchState`), the per-surface view data the converter UI renders: per-block conflict
// badges, per-param status, the click-to-locate report, hover tooltips, and per-source-block outcome
// markers. It defines the CONTRACT the UI phase paints from — no `.svelte`, no DOM, no network.
//
// Severity is NEVER re-derived here: every severity comes from `convertReport.eventSeverity` (the single
// client-side severity authority per the design brief §2.1). Device display names come from
// `convertReport.deviceName`. The commit-gate count reuses `convertScratch.remainingConflicts`. Where the
// design mockup hand-tuned a severity that differs from `eventSeverity`, we follow `eventSeverity` and
// call the divergence out in a comment (see the header of each affected export).
//
// Framework-free; fully unit-tested in convertConflicts.test.ts.

import type { ConversionEvent, ConverterDeviceId, ConverterParam } from './types';
import {
  eventSeverity,
  eventBlockKey,
  familyLabel,
  deviceName,
  SEVERITY_ORDER,
  type Severity
} from './convertReport';
import { remainingConflicts, type ScratchState } from './convertScratch';
import { catFor, type CatEntry } from './catalog';

// ── constants ───────────────────────────────────────────────────────────────────────────────────────

/** Numeric rank per severity — highest wins when picking the "worst" conflict on a surface. */
export const SEV_RANK: Record<Severity, number> = { info: 1, warn: 2, loss: 3 };

/** The single-glyph badge shown on a block/report chip per UI-level conflict kind. Keyed by the
 *  collapsed UI kind (note the plural `params-*`), NOT by the raw `ConversionEvent['kind']`. */
export const CONFLICT_BADGE: Record<string, string> = {
  'type-unresolved': '!',
  'type-substituted': '~',
  'params-clamped': '±',
  'params-unverified': '?',
  'params-dropped': '−',
  unplaced: '⇱',
  merged: '⤵',
  'routing-simplified': '↳'
};

/** The CSS custom-property reference for a severity (or the neutral `ok` token). Returns the full
 *  `var(--…)` form so it drops straight into an inline style. Mirrors the mockup's `sevVar`. */
export function sevToken(sev: Severity | 'ok'): string {
  switch (sev) {
    case 'loss':
      return 'var(--danger)';
    case 'warn':
      return 'var(--amber)';
    case 'ok':
      return 'var(--ok)';
    case 'info':
    default:
      return 'var(--accent)';
  }
}

/** The block-family visual entry (accent + glyph) for a family slug — thin adapter over `catalog.catFor`
 *  so the UI can colour conversion surfaces with the SAME per-family palette the normal grid uses. */
export function familyCat(family: string): CatEntry {
  return catFor(null, familyLabel(family));
}

// Param-group severities, resolved ONCE from eventSeverity so the collapsed report rows never duplicate
// the mapping (a representative event per kind).
const CLAMP_SEV = eventSeverity({ kind: 'param-clamped', blockKey: '', nativeName: '', sourceValue: 0, targetValue: 0 });
const DROP_SEV = eventSeverity({ kind: 'param-dropped', blockKey: '', nativeName: '', reason: 'no-concept-mapping' });
const UNVERIFIED_SEV = eventSeverity({ kind: 'param-unverified', blockKey: '', nativeName: '', value: 0 });

// ── per-block conflicts ───────────────────────────────────────────────────────────────────────────────

/** The collapsed, UI-level conflict kinds a block cell can carry (param events collapse to a single
 *  `params-*` summary; block-merged folds onto its host block; routing marks affected blocks). */
export type BlockConflictKind =
  | 'type-unresolved'
  | 'type-substituted'
  | 'params-clamped'
  | 'params-dropped'
  | 'params-unverified'
  | 'unplaced'
  | 'merged'
  | 'routing-simplified'
  | 'channel-collapsed'
  | 'scene-collapsed';

export interface BlockConflict {
  kind: BlockConflictKind;
  sev: Severity;
  text: string;
}

/** Current resolution state of a block, as the resolve UI tracks it. When omitted, conflicts are
 *  reported in their AS-CONVERTED state (unresolved / unverified). When provided, these flags gate the
 *  type conflicts exactly like the mockup's `activeConf`: a type-unresolved conflict shows only while
 *  `typeUnresolved` is truthy, and a substitution shows only while NOT `verified`. */
export interface BlockResolution {
  typeUnresolved?: boolean;
  substituted?: boolean;
  verified?: boolean;
}

/** The key the event "owns" for grid placement: block-merged is shown on its HOST block (intoBlockKey),
 *  not the merged-away source block (which has no target cell). */
function ownerKey(e: ConversionEvent): string | undefined {
  if (e.kind === 'block-merged') return e.intoBlockKey ?? e.blockKey;
  return eventBlockKey(e);
}

/**
 * The ACTIVE per-block conflicts for one target block, derived from the event log.
 *
 * - param-clamped / param-dropped / param-unverified events collapse into a single `params-*` summary
 *   conflict ("N parameter(s) …").
 * - block-merged attaches to its host block; routing-simplified attaches to every affected block.
 * - type-unresolved is dropped once resolved; a (fuzzy/fallback) substitution is dropped once verified —
 *   driven by the optional `resolution` flags (exact/lineage substitutions are trustworthy and never
 *   surface as a conflict, mirroring `convertScratch.deriveConflicts`).
 *
 * Severity is always `eventSeverity(event)`. `targetDevice`, when given, enriches the text with the
 * device's display name (e.g. "not on AM4"); otherwise the text reads "the target".
 */
export function blockConflicts(
  events: ConversionEvent[],
  blockKey: string,
  resolution?: BlockResolution,
  targetDevice?: ConverterDeviceId
): BlockConflict[] {
  const dev = targetDevice ? deviceName(targetDevice) : 'the target';
  const mine = events.filter((e) => ownerKey(e) === blockKey);
  const out: BlockConflict[] = [];

  const clamped = mine.filter((e) => e.kind === 'param-clamped');
  const dropped = mine.filter((e) => e.kind === 'param-dropped');
  const unverified = mine.filter((e) => e.kind === 'param-unverified');

  for (const e of mine) {
    switch (e.kind) {
      case 'type-unresolved': {
        const active = resolution ? !!resolution.typeUnresolved : true;
        if (active) out.push({ kind: 'type-unresolved', sev: eventSeverity(e), text: `Type ‘${e.sourceTypeName}’ not on ${dev} — pick one` });
        break;
      }
      case 'type-substituted': {
        // only fuzzy/fallback substitutions are actionable conflicts (exact/lineage are trustworthy).
        if (e.confidence !== 'fuzzy' && e.confidence !== 'fallback') break;
        const active = resolution ? !resolution.verified : true;
        if (active) out.push({ kind: 'type-substituted', sev: eventSeverity(e), text: `Substituted — nearest ${dev} ${familyLabel(e.family).toLowerCase()}` });
        break;
      }
      case 'block-unplaced':
        out.push({ kind: 'unplaced', sev: eventSeverity(e), text: `Converted — ${e.reason}` });
        break;
      case 'block-merged':
        out.push({ kind: 'merged', sev: eventSeverity(e), text: `${familyLabel(e.family)} folded into ${familyLabel(e.intoFamily)}` });
        break;
      case 'channel-collapsed':
        out.push({ kind: 'channel-collapsed', sev: eventSeverity(e), text: `Channels ${e.sourceChannels} → ${e.targetChannels}` });
        break;
      default:
        break;
    }
  }

  // routing-simplified is preset-wide but marks its affected blocks.
  const routing = events.find(
    (e): e is Extract<ConversionEvent, { kind: 'routing-simplified' }> =>
      e.kind === 'routing-simplified' && e.affectedBlockKeys.includes(blockKey)
  );
  if (routing) out.push({ kind: 'routing-simplified', sev: eventSeverity(routing), text: routing.detail });

  if (clamped.length) out.push({ kind: 'params-clamped', sev: eventSeverity(clamped[0]), text: `${clamped.length} parameter${plural(clamped.length)} clamped to ${dev} range` });
  if (dropped.length) out.push({ kind: 'params-dropped', sev: eventSeverity(dropped[0]), text: `${dropped.length} parameter${plural(dropped.length)} dropped — no ${dev} equivalent` });
  if (unverified.length) out.push({ kind: 'params-unverified', sev: eventSeverity(unverified[0]), text: `${unverified.length} parameter${plural(unverified.length)} carried — verify mapping` });

  return out;
}

/** The highest-rank severity among a block's conflicts, or null if it's clear. */
export function worstSev(conflicts: BlockConflict[]): Severity | null {
  let rank = 0;
  let sev: Severity | null = null;
  for (const c of conflicts) {
    const r = SEV_RANK[c.sev];
    if (r > rank) {
      rank = r;
      sev = c.sev;
    }
  }
  return sev;
}

/** The cell badge for a block: the worst severity's first conflict → its `CONFLICT_BADGE` glyph. Null
 *  when the block has no active conflict. Falls back to a neutral dot for kinds without a mapped badge. */
export function blockBadge(conflicts: BlockConflict[]): { icon: string; sev: Severity } | null {
  const sev = worstSev(conflicts);
  if (!sev) return null;
  const first = conflicts.find((c) => c.sev === sev)!;
  return { icon: CONFLICT_BADGE[first.kind] ?? '•', sev };
}

/**
 * Whether a block still gates the commit for TYPE reasons: an unresolved type OR an unverified
 * (fuzzy/fallback) substitution. Mirrors the mockup's `blocking(b)`. Note this is the block-level
 * type gate only — the preset-level commit gate is `unresolvedCount` / `convertScratch.canCommit`,
 * which also weighs clamps, placement and routing.
 */
export function isBlocking(events: ConversionEvent[], blockKey: string, resolution?: BlockResolution): boolean {
  const hasUnresolved = events.some((e) => e.kind === 'type-unresolved' && e.blockKey === blockKey);
  const hasSubst = events.some(
    (e) => e.kind === 'type-substituted' && e.blockKey === blockKey && (e.confidence === 'fuzzy' || e.confidence === 'fallback')
  );
  const stillUnresolved = hasUnresolved && (resolution ? !!resolution.typeUnresolved : true);
  const stillUnverified = hasSubst && !resolution?.verified;
  return stillUnresolved || stillUnverified;
}

// ── per-param status ────────────────────────────────────────────────────────────────────────────────

export type ParamStatus = 'ok' | 'clamped' | 'unverified' | 'dropped';

export interface ParamView {
  name: string;
  status: ParamStatus;
  value?: string | number;
  from?: number | string;
  to?: number | string;
  range?: string;
  reason?: string;
}

function dropReason(reason: 'no-concept-mapping' | 'target-lacks-param'): string {
  return reason === 'no-concept-mapping' ? 'No equivalent on the target' : 'Target block lacks this parameter';
}

/**
 * Status of one converted parameter, joined by blockKey + nativeName against the event log. Priority
 * dropped → clamped → unverified → ok (most-consequential wins if the wire ever emits several).
 */
export function paramStatusFor(
  events: ConversionEvent[],
  blockKey: string,
  nativeName: string
): { status: ParamStatus; from?: number; to?: number; range?: string; reason?: string } {
  const drop = events.find(
    (e): e is Extract<ConversionEvent, { kind: 'param-dropped' }> => e.kind === 'param-dropped' && e.blockKey === blockKey && e.nativeName === nativeName
  );
  if (drop) return { status: 'dropped', reason: dropReason(drop.reason) };

  const clamp = events.find(
    (e): e is Extract<ConversionEvent, { kind: 'param-clamped' }> => e.kind === 'param-clamped' && e.blockKey === blockKey && e.nativeName === nativeName
  );
  if (clamp) {
    const range = clamp.targetMin != null && clamp.targetMax != null ? `${clamp.targetMin} – ${clamp.targetMax}` : undefined;
    return { status: 'clamped', from: clamp.sourceValue, to: clamp.targetValue, range };
  }

  const unver = events.find(
    (e): e is Extract<ConversionEvent, { kind: 'param-unverified' }> => e.kind === 'param-unverified' && e.blockKey === blockKey && e.nativeName === nativeName
  );
  if (unver) return { status: 'unverified' };

  return { status: 'ok' };
}

/** A ParamView per param of a block, in the block's own param order. */
export function blockParamViews(events: ConversionEvent[], block: { key: string; params: ConverterParam[] }): ParamView[] {
  return block.params.map((p) => {
    const st = paramStatusFor(events, block.key, p.nativeName);
    return { name: p.nativeName, status: st.status, value: fmtValue(p.value), from: st.from, to: st.to, range: st.range, reason: st.reason };
  });
}

/** kept ("kept N of M") counts — kept = every param that wasn't dropped. */
export function paramKeptCounts(views: ParamView[]): { kept: number; total: number } {
  return { kept: views.filter((v) => v.status !== 'dropped').length, total: views.length };
}

// ── global commit gate ─────────────────────────────────────────────────────────────────────────────

/**
 * The "N unresolved" count driving the commit-gate badge.
 *
 * It delegates to `convertScratch.remainingConflicts(state)`, so it is 0 EXACTLY when
 * `convertScratch.canCommit` is true — the badge and the gate can never disagree. This deliberately
 * differs from the mockup's literal `blocking-placed-blocks + all-tray-blocks` formula: the real
 * ScratchState represents resolution as `conflict.resolved` flags (not per-block typeUnresolved/verified
 * flags), and lets convertible candidates rest in the tray on slot targets (AM4/VP4) WITHOUT gating —
 * so counting every tray block (as the mockup does) would over-count. `remainingConflicts` counts
 * unresolved conflicts that actually gate: type/clamps on PLACED blocks, plus placement and routing.
 * `events` is accepted for signature symmetry but unused — conflicts are pre-derived into `state`.
 */
export function unresolvedCount(state: ScratchState, _events?: ConversionEvent[]): number {
  return remainingConflicts(state);
}

// ── report grouping ────────────────────────────────────────────────────────────────────────────────

export interface ReportRow {
  sev: Severity;
  title: string;
  detail: string;
  /** resolution state — true once the conflict is cleared (type picked, substitution verified, block placed). */
  done: boolean;
  /** where to jump on click: `t:<blockKey>` (target cell), `tray:<blockKey>`, `src:<blockKey>`, or '' (preset-wide). */
  loc: string;
}

export interface ReportGroup {
  sev: Severity;
  label: string;
  rows: ReportRow[];
}

function blockDropReason(reason: 'family-missing' | 'capacity-exceeded' | 'instance-limit'): string {
  return reason === 'family-missing'
    ? 'not available on the target device'
    : reason === 'capacity-exceeded'
      ? 'the target ran out of slots for this block'
      : 'exceeds the target’s instance limit';
}

/**
 * The conversion report grouped loss → warn → info (empty bands omitted). Param events collapse to one
 * row per block; every other event becomes one row. `done`/`loc` are computed from `state` so rows
 * reflect live resolution and can locate their block.
 */
export function reportGroups(events: ConversionEvent[], state: ScratchState): ReportGroup[] {
  const rows = buildReportRows(events, state);
  const groups: ReportGroup[] = [];
  for (const sev of SEVERITY_ORDER) {
    const rs = rows.filter((r) => r.sev === sev);
    if (rs.length) groups.push({ sev, label: sev.toUpperCase(), rows: rs });
  }
  return groups;
}

function buildReportRows(events: ConversionEvent[], state: ScratchState): ReportRow[] {
  const rows: ReportRow[] = [];
  const clampBlocks = new Map<string, string[]>();
  const dropBlocks = new Map<string, string[]>();
  const unverifiedBlocks = new Map<string, string[]>();

  const famOf = (key: string) => {
    const b = state.blocks.find((x) => x.key === key);
    return b ? familyLabel(b.family) : key;
  };
  const isPlaced = (key: string) => {
    const b = state.blocks.find((x) => x.key === key);
    return !!b && b.position !== null;
  };
  const resolved = (id: string) => {
    const c = state.conflicts.find((x) => x.id === id);
    return !c || c.resolved;
  };
  const loc = (key: string) => {
    const b = state.blocks.find((x) => x.key === key);
    if (!b) return `src:${key}`;
    return b.position ? `t:${key}` : `tray:${key}`;
  };

  for (const e of events) {
    switch (e.kind) {
      case 'param-clamped':
        push(clampBlocks, e.blockKey, e.nativeName);
        break;
      case 'param-dropped':
        push(dropBlocks, e.blockKey, e.nativeName);
        break;
      case 'param-unverified':
        push(unverifiedBlocks, e.blockKey, e.nativeName);
        break;
      case 'type-unresolved': {
        const done = resolved(`type:${e.blockKey}`);
        rows.push({ sev: eventSeverity(e), loc: loc(e.blockKey), title: `${famOf(e.blockKey)} type ‘${e.sourceTypeName}’ has no match`, detail: done ? 'Resolved' : 'Pick an available type', done });
        break;
      }
      case 'type-substituted': {
        const isConflict = e.confidence === 'fuzzy' || e.confidence === 'fallback';
        const done = isConflict ? resolved(`type:${e.blockKey}`) : false;
        const detail = done ? 'Verified' : isConflict ? `Was ‘${e.sourceTypeName}’ — verify substitution` : `Was ‘${e.sourceTypeName}’ — ${e.confidence} match`;
        rows.push({ sev: eventSeverity(e), loc: loc(e.blockKey), title: `${famOf(e.blockKey)} substituted → ‘${e.targetTypeName}’`, detail, done });
        break;
      }
      case 'block-dropped':
        rows.push({ sev: eventSeverity(e), loc: `src:${e.blockKey}`, title: `${familyLabel(e.family)} dropped`, detail: blockDropReason(e.reason), done: false });
        break;
      case 'block-unplaced': {
        const placed = isPlaced(e.blockKey);
        rows.push({ sev: eventSeverity(e), loc: placed ? `t:${e.blockKey}` : `tray:${e.blockKey}`, title: `${familyLabel(e.family)} unplaced`, detail: placed ? 'Placed on the grid' : 'Drag onto the grid or Place', done: placed });
        break;
      }
      case 'block-merged':
        rows.push({ sev: eventSeverity(e), loc: `t:${e.intoBlockKey ?? e.blockKey}`, title: `${familyLabel(e.family)} merged`, detail: `Folded into the ${familyLabel(e.intoFamily)} block`, done: false });
        break;
      case 'routing-simplified':
        rows.push({ sev: eventSeverity(e), loc: e.affectedBlockKeys[0] ? `t:${e.affectedBlockKeys[0]}` : '', title: 'Routing simplified', detail: e.detail, done: resolved('routing') });
        break;
      case 'scene-collapsed':
        rows.push({ sev: eventSeverity(e), loc: '', title: 'Scenes collapsed', detail: `${e.sourceScenes} → ${e.targetScenes} scenes`, done: false });
        break;
      case 'channel-collapsed':
        rows.push({ sev: eventSeverity(e), loc: loc(e.blockKey), title: 'Channels collapsed', detail: `${e.sourceChannels} → ${e.targetChannels} channels`, done: false });
        break;
      case 'source-partial':
        rows.push({ sev: eventSeverity(e), loc: '', title: 'Source decoded partially', detail: e.detail, done: false });
        break;
      default:
        break;
    }
  }

  for (const [key, names] of clampBlocks)
    rows.push({ sev: CLAMP_SEV, loc: loc(key), title: `${famOf(key)} — ${names.length} param${plural(names.length)} clamped`, detail: `${names.join(', ')} clamped to target range`, done: resolved(`clamps:${key}`) });
  for (const [key, names] of dropBlocks)
    rows.push({ sev: DROP_SEV, loc: loc(key), title: `${famOf(key)} — ${names.length} param${plural(names.length)} dropped`, detail: names.join(', '), done: false });
  for (const [key, names] of unverifiedBlocks)
    rows.push({ sev: UNVERIFIED_SEV, loc: loc(key), title: `${famOf(key)} — ${names.length} param${plural(names.length)} unverified`, detail: names.join(', '), done: false });

  return rows;
}

// ── tooltip ─────────────────────────────────────────────────────────────────────────────────────────

export interface TooltipLine {
  sev: Severity;
  text: string;
}
export interface TooltipInfo {
  title: string;
  sub: string;
  lines: TooltipLine[];
}

/** Pure data for a block hover tooltip: title, a `FAMILY · was <src>` sub-line, and one line per active
 *  conflict. Mirrors the mockup's `tipInfo`; no DOM. */
export function tooltipInfo(input: { title: string; familyName: string; wasType?: string; conflicts: BlockConflict[] }): TooltipInfo {
  const fam = input.familyName.toUpperCase();
  return {
    title: input.title,
    sub: input.wasType ? `${fam} · was ${input.wasType}` : fam,
    lines: input.conflicts.map((c) => ({ sev: c.sev, text: c.text }))
  };
}

// ── source-block outcome ──────────────────────────────────────────────────────────────────────────────

export type SourceOutcome = 'carried' | 'substituted' | 'clamped' | 'merged' | 'unverified' | 'unresolved' | 'unplaced' | 'dropped';

/** Resolution overrides that flip an outcome back to `carried` once the user has resolved it — mirrors
 *  the mockup's delayResolved / ampVerified / reverbPlaced overrides. */
export interface SourceResolution {
  resolved?: boolean;
  verified?: boolean;
  placed?: boolean;
}

export interface SourceOutcomeView {
  outcome: SourceOutcome;
  sev: Severity;
  icon: string;
  label: string;
  desc: string;
}

// icon/label/desc mirror the mockup's `OUT` map. Severities follow `eventSeverity` (the single authority)
// — this is where the mockup's hand-set values differ: mockup had unresolved=loss (eventSeverity: warn),
// unplaced=warn (loss), unverified=warn (info). A unit test asserts these equal eventSeverity so the map
// can't drift.
const OUTCOME_META: Record<SourceOutcome, { sev: Severity; icon: string; label: string; desc: string }> = {
  carried: { sev: 'info', icon: '✓', label: 'Carried', desc: 'Carried over unchanged' },
  substituted: { sev: 'warn', icon: '~', label: 'Substituted', desc: 'Mapped to the nearest target type — verify' },
  clamped: { sev: 'warn', icon: '±', label: 'Clamped', desc: 'Some parameters clamped to the target range' },
  merged: { sev: 'info', icon: '⤵', label: 'Merged', desc: 'Folded into the host block' },
  unverified: { sev: 'info', icon: '?', label: 'Unverified', desc: 'Carried but mapping not verified' },
  unresolved: { sev: 'warn', icon: '!', label: 'Unresolved', desc: 'Type not on the target — pick one' },
  unplaced: { sev: 'loss', icon: '⇱', label: 'Unplaced', desc: 'Converted — drag onto the grid' },
  dropped: { sev: 'loss', icon: '✕', label: 'Dropped', desc: 'No target equivalent' }
};

/**
 * The outcome badge for one SOURCE-grid block, from the events filed under its key (worst-first
 * precedence: dropped → unresolved → unplaced → substituted → clamped → merged → unverified → carried),
 * with the resolution overrides applied. The caller supplies the key under which the block's events are
 * filed (the target key for carried/substituted/clamped, the block's own key for dropped/unplaced/merged).
 */
export function sourceOutcome(events: ConversionEvent[], sourceBlockKey: string, resolution?: SourceResolution): SourceOutcomeView {
  let outcome: SourceOutcome = 'carried';
  if (events.some((e) => e.kind === 'block-dropped' && e.blockKey === sourceBlockKey)) outcome = 'dropped';
  else if (events.some((e) => e.kind === 'type-unresolved' && e.blockKey === sourceBlockKey)) outcome = 'unresolved';
  else if (events.some((e) => e.kind === 'block-unplaced' && e.blockKey === sourceBlockKey)) outcome = 'unplaced';
  else if (events.some((e) => e.kind === 'type-substituted' && e.blockKey === sourceBlockKey && (e.confidence === 'fuzzy' || e.confidence === 'fallback'))) outcome = 'substituted';
  else if (events.some((e) => e.kind === 'param-clamped' && e.blockKey === sourceBlockKey)) outcome = 'clamped';
  else if (events.some((e) => e.kind === 'block-merged' && (e.intoBlockKey === sourceBlockKey || e.blockKey === sourceBlockKey))) outcome = 'merged';
  else if (events.some((e) => e.kind === 'param-unverified' && e.blockKey === sourceBlockKey)) outcome = 'unverified';

  if (resolution) {
    if (resolution.resolved && outcome === 'unresolved') outcome = 'carried';
    if (resolution.verified && outcome === 'substituted') outcome = 'carried';
    if (resolution.placed && outcome === 'unplaced') outcome = 'carried';
  }

  return { outcome, ...OUTCOME_META[outcome] };
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────

function plural(n: number): string {
  return n > 1 ? 's' : '';
}
function fmtValue(v: number): string {
  return Number.isFinite(v) ? String(v) : '';
}
function push(m: Map<string, string[]>, key: string, value: string): void {
  const arr = m.get(key) ?? [];
  arr.push(value);
  m.set(key, arr);
}
