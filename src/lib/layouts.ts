// Per-family parameter tab layouts for the Block Editor.
//
// The device exposes a flat numbered list of params per block; "pages/tabs" are a
// presentation layer the editor owns. We always offer two built-in tabs —
//   Ideal    : a heuristic pick of the most musician-facing knobs
//   Advanced : everything else
// — plus any number of user-created custom tabs, persisted client-side and keyed by
// block-family slug + device-true paramId (so a custom Amp view applies to all amps).
import type { NamedParam, EnumParam, TabDef, ResolvedTab } from './types';
import { forgefx } from './forgefx';

const STORE_KEY = 'axis.layouts.v1';
const IDEAL_MAX = 8;

// Keyword priority for the Ideal pick — earlier = more important. Matched against the
// display label (case-insensitive, substring). Anything unmatched sorts after these,
// keeping device order as the tiebreak.
const IDEAL_PRIORITY = [
  'drive', 'gain', 'level', 'output level', 'mix', 'master', 'volume',
  'bass', 'mid', 'treble', 'tone', 'presence',
  'time', 'feedback', 'rate', 'depth', 'decay', 'speed', 'intensity',
  'threshold', 'ratio', 'amount', 'blend', 'balance', 'frequency'
];

function priority(label: string): number {
  const l = label.toLowerCase();
  for (let i = 0; i < IDEAL_PRIORITY.length; i++) if (l.includes(IDEAL_PRIORITY[i])) return i;
  return IDEAL_PRIORITY.length;
}

/** Heuristic "Ideal" set: highest-priority knobs, but at most one per keyword bucket on the first
 * pass so we get variety (one Gain, one Drive, then Bass/Mid/Treble…) instead of four Gains. */
export function idealIds(params: NamedParam[]): number[] {
  const scored = params
    .filter((p) => p.id != null)
    .map((p, idx) => ({ id: p.id as number, k: priority(p.name), idx }))
    .sort((a, b) => a.k - b.k || a.idx - b.idx);
  const first: typeof scored = [];
  const rest: typeof scored = [];
  const seen = new Map<number, number>();
  for (const s of scored) {
    const n = seen.get(s.k) ?? 0;
    seen.set(s.k, n + 1);
    if (n === 0 && s.k < IDEAL_PRIORITY.length) first.push(s);
    else rest.push(s);
  }
  return [...first, ...rest].slice(0, IDEAL_MAX).map((s) => s.id);
}

/** Build the editor's tab list for an open block: [Ideal, Advanced, ...custom].
 * Ideal = heuristic knobs only; Advanced = remaining knobs + all enums; custom = whatever the
 * user assigned (knob or enum id). */
export function resolveTabs(params: NamedParam[], enums: EnumParam[], custom: TabDef[], eqIds: number[] = []): ResolvedTab[] {
  const knobIds = params.filter((p) => p.id != null).map((p) => p.id as number);
  const enumIds = enums.map((e) => e.id);
  const present = [...knobIds, ...enumIds];
  const ideal = idealIds(params);
  const idealSet = new Set(ideal);
  const advanced = present.filter((id) => !idealSet.has(id));
  const order = new Map(present.map((id, i) => [id, i]));

  const tabs: ResolvedTab[] = [
    { id: '__ideal', name: 'Ideal', ids: ideal, builtin: true },
    { id: '__advanced', name: 'Advanced', ids: advanced, builtin: true }
  ];
  if (eqIds.length) tabs.push({ id: '__ampeq', name: 'EQ', ids: eqIds, builtin: true });
  for (const t of custom) {
    const ids = t.paramIds.filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
    tabs.push({ id: t.id, name: t.name, ids, builtin: false });
  }
  return tabs;
}

// ── persistence ──
export function loadLayouts(): Record<string, TabDef[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TabDef[]>) : {};
  } catch {
    return {};
  }
}

export function saveLayouts(layouts: Record<string, TabDef[]>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(layouts));
  } catch {
    /* quota / private mode — keep in-memory only */
  }
  forgefx.putDoc('config', 'layouts', layouts).catch(() => {}); // mirror to the unified store (sync-ready)
}

let counter = 0;
/** Unique id for a new tab. */
export function newTabId(): string {
  return `t${Date.now().toString(36)}${(counter = (counter + 1) % 1e6)}`;
}

// ── swipe controls (knobs assigned to direct grid adjustment), per family slug ──
const SWIPE_KEY = 'axis.swipe.v1';
export type SwipeCtrl = { id: number; name: string };
export function loadSwipe(): Record<string, SwipeCtrl[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SWIPE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SwipeCtrl[]>) : {};
  } catch {
    return {};
  }
}
export function saveSwipe(m: Record<string, SwipeCtrl[]>): void {
  if (typeof localStorage === 'undefined') return;
  forgefx.putDoc('config', 'swipe', m).catch(() => {}); // mirror to the unified store (sync-ready)
  try {
    localStorage.setItem(SWIPE_KEY, JSON.stringify(m));
  } catch {
    /* */
  }
}
