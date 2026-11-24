// Which controls of a device layout the default board puts into the FIXED AREA (the column that stays in
// view beside every page), and how they are packed there.
//
// The device editor repeats a mixer, and sometimes a control beside the pages, on every page. Over the pages
// of the served variant that show at least one control (the header's controls don't count):
//   a) two pages or more: a control that is on EVERY page moves, whatever its section — unless moving the
//      parameters-section ones would leave a page without any control: then those stay;
//   b) exactly one page: the controls of its mixer section move, unless nothing would be left on the page;
//   c) everything else stays on its page (no "most pages" rule).
// A page that held nothing but moved mixer / page-level controls goes away (they are in view anyway); when
// that would be every page, nothing moves at all. Never moved: the header's controls, the EQ graph, graph
// displays and the loop waveform (bigger than the area), and a control that a page shows under another block's
// name (a row filed under the wrong block: it stays where it is).
// Order: page-level controls, then the mixer rows in editor order, then the shared parameter controls. The
// first page decides a control's view and section.
// Packing: a clean grid without dividers — every control its usual size (a knob 2×2), a select whose label
// does not fit a knob's width two knob columns wide. Order: left to right, top to bottom; or, when that is
// lower, tall controls (a meter, a fader) in columns of their own at the right. Width: two cells when every
// control is that narrow and the area is no taller than the tallest page (at least four rows), else four; 6
// and then 8 only while it is taller than that, and only where that makes it lower. The pages beside it can
// depend on the width ("More"), so their height is asked per width.
// Pure (fixedSeed.test.ts).

import { bbox, BE_SPEC, FIXED_DEFAULT_COLS, FIXED_MIN_COLS, findFree, type BeControl, type BeFixedArea, type BeView } from './boardModel';
import type { LayoutEntry } from './layoutPlacement';

export interface FixedPick {
  key: string;
  view: BeView;
}

/** Views the area never takes by itself. */
const NEVER: ReadonlySet<BeView> = new Set<BeView>(['eq', 'graph', 'wave', 'action']);
export const isMixerSection = (section: string): boolean => /^mixer$/i.test(section.trim());

/** Order of a control in the area: page-level, mixer, shared parameters. */
const rank = (e: LayoutEntry): 0 | 1 | 2 => (e.pageLevel ? 0 : isMixerSection(e.section) ? 1 : 2);
const tilesOf = (entries: readonly LayoutEntry[]): LayoutEntry[] => entries.filter((e) => e.kind === 'tile');

/** The controls that move to the fixed area, in its order (empty = no fixed area). `pages`: the resolved
 *  entries of every page, the header's controls already left out. */
export function pickFixed(pages: readonly (readonly LayoutEntry[])[]): FixedPick[] {
  const shown = pages.map(tilesOf).filter((t) => t.length > 0);
  if (!shown.length) return [];
  const first = shown[0]!;
  const keysOf = shown.map((t) => new Set(t.map((e) => e.key!)));
  const misfiled = new Set(shown.flat().flatMap((e) => (e.other ? [e.key!] : [])));
  const movable = (e: LayoutEntry): boolean => !NEVER.has(e.view!) && !misfiled.has(e.key!);
  let moved: LayoutEntry[];
  if (shown.length === 1) moved = first.filter((e) => movable(e) && !e.pageLevel && isMixerSection(e.section));
  else {
    moved = first.filter((e) => movable(e) && keysOf.every((k) => k.has(e.key!)));
    const set = new Set(moved.map((e) => e.key!));
    if (keysOf.some((k) => [...k].every((key) => set.has(key)))) moved = moved.filter((e) => rank(e) !== 2);
  }
  const set = new Set(moved.map((e) => e.key!));
  if (keysOf.every((k) => [...k].every((key) => set.has(key)))) return []; // no page would be left
  return moved
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.index - b.index)
    .map((e) => ({ key: e.key!, view: e.view! }));
}

/** Longest select label that fits a knob's width (two cells). */
const SELECT_LABEL_CHARS = 12;
/** A control's size in the area: its usual one, no wider than the area; a select with a long label is as wide
 *  as two knobs. */
export function fixedSize(view: BeView, label: string, cols: number): { w: number; h: number } {
  const sp = BE_SPEC[view];
  const w = view === 'select' && label.trim().length > SELECT_LABEL_CHARS ? 2 * BE_SPEC.knob.w : sp.w;
  return { w: Math.min(w, cols), h: sp.h };
}

/** Rows the area may always take, however low the pages are. */
export const FIXED_FREE_ROWS = 4;
/** The widths the seed tries, in order. */
export const FIXED_SEED_COLS: readonly number[] = [FIXED_MIN_COLS, FIXED_DEFAULT_COLS, 6, 8];

interface Sized extends FixedPick {
  w: number;
  h: number;
}
const tile = (s: Sized, x: number, y: number): BeControl => ({ id: `wf.${s.key}`, key: s.key, view: s.view, x, y, w: s.w, h: s.h });

/** Left to right, top to bottom, every control at the first free spot. */
function inOrder(list: readonly Sized[], cols: number, taken: readonly BeControl[] = []): BeControl[] {
  const items: BeControl[] = [];
  for (const s of list) {
    const at = findFree([...taken, ...items], s.w, s.h, undefined, cols);
    items.push(tile(s, at.x, at.y));
  }
  return items;
}

/** Tall controls in columns of their own from the right edge, the others in order beside them; null when there
 *  is nothing tall, nothing else, or no room. */
function tallAtRight(list: readonly Sized[], cols: number): BeControl[] | null {
  const tall = list.filter((s) => s.h > BE_SPEC.knob.h);
  const rest = list.filter((s) => s.h <= BE_SPEC.knob.h);
  let x = cols - tall.reduce((n, s) => n + s.w, 0);
  if (!tall.length || !rest.length || x < Math.max(...rest.map((s) => s.w))) return null;
  const right = tall.map((s) => {
    const it = tile(s, x, 0);
    x += s.w;
    return it;
  });
  const placed = new Map([...right, ...inOrder(rest, cols, right)].map((it) => [it.key, it]));
  return list.map((s) => placed.get(s.key)!);
}

/** The picked controls in an area `cols` wide, as low as it gets. */
function packAt(picks: readonly FixedPick[], labelOf: (key: string) => string, cols: number): BeFixedArea {
  const sized = picks.map((p): Sized => ({ ...p, ...fixedSize(p.view, labelOf(p.key), cols) }));
  const items = inOrder(sized, cols);
  const other = tallAtRight(sized, cols);
  return { cols, items: other && bbox(other).R < bbox(items).R ? other : items };
}

/** Pack the picked controls (see above). `beside`: height of the tallest page next to an area of that many
 *  cells. Null without any control. */
export function packFixed(picks: readonly FixedPick[], labelOf: (key: string) => string, beside: (cols: number) => number): BeFixedArea | null {
  if (!picks.length) return null;
  const narrow = picks.every((p) => fixedSize(p.view, labelOf(p.key), FIXED_DEFAULT_COLS).w <= FIXED_MIN_COLS);
  let best: BeFixedArea | null = null;
  for (const cols of FIXED_SEED_COLS) {
    if (cols < FIXED_DEFAULT_COLS && !narrow) continue;
    const area = packAt(picks, labelOf, cols);
    const R = bbox(area.items).R;
    const fits = R <= Math.max(beside(cols), FIXED_FREE_ROWS);
    if (cols < FIXED_DEFAULT_COLS && !fits) continue;
    if (best && R >= bbox(best.items).R) continue;
    best = area;
    if (fits) break;
  }
  return best;
}
