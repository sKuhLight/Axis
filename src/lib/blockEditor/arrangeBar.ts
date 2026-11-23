// Block Editor Arrange bar: ONE row of tools — the selection's tools (a control: View, Size S/M/L, Pin, the
// grid swipe control, Remove; a divider: its label, Rotate, Remove) · Undo · + Add · + Divider h / v ·
// Close gaps · Tidy up · Auto-pack · Page ▾ · ✓ Done. What does not fit the row moves into a "⋯" menu at
// its end instead of wrapping onto a second row (the board keeps its height). Pure (arrangeBar.test.ts):
// the selection model, the fit, and the overflow menu's rows.

import type { WorkbenchMenuItem } from '../workbench';
import { BE_PRESETS, isDivider, type BeDividerKind, type BeItem, type BeView } from './boardModel';
import type { BeCtl } from './catalog';
import { DIVIDER_NAME, UNDO_KEYS } from './arrangeModel';
import { rowClass, sizeChoices, sizeSubmenu, swipeRow, viewSubmenu, type SizeChoice } from './controlMenu';

// ── the selection ────────────────────────────────────────────────────────────────────────────────

export type ArrangeSel =
  | {
      kind: 'control';
      id: string;
      key: string;
      name: string;
      view: BeView;
      /** The views of the control's kind (more than one = the View choice is offered). */
      views: readonly BeView[];
      w: number;
      h: number;
      /** S / M / L of the current view (a custom current size listed last). */
      sizes: SizeChoice[];
      /** Pin to the workbench (⚡, same default target as the hover ⚡). */
      pinnable: boolean;
      /** The grid swipe control: null where it is not offered, else whether it is on. */
      swipe: boolean | null;
    }
  | { kind: 'divider'; id: string; name: string; dkind: BeDividerKind; label: string; w: number; h: number };

export interface SelectionInput {
  item: BeItem | null;
  ctl: Pick<BeCtl, 'key' | 'kind' | 'label' | 'views'> | undefined;
  canPin: boolean;
  /** The control can be the grid swipe control here (continuous, the editor keeps swipe controls). */
  canSwipe: boolean;
  swipe: boolean;
}

/** The arrange bar's view of the selected item; null when nothing (or something unknown) is selected. */
export function arrangeSelection(s: SelectionInput): ArrangeSel | null {
  const it = s.item;
  if (!it) return null;
  if (isDivider(it)) return { kind: 'divider', id: it.id, name: DIVIDER_NAME[it.kind], dkind: it.kind, label: it.label ?? '', w: it.w, h: it.h };
  const c = s.ctl;
  if (!c) return null;
  return {
    kind: 'control',
    id: it.id,
    key: it.key,
    name: c.label,
    view: it.view,
    views: c.views,
    w: it.w,
    h: it.h,
    sizes: (BE_PRESETS[it.view] ?? []).length ? sizeChoices(it.view, it.w, it.h) : [],
    pinnable: s.canPin,
    swipe: s.canSwipe ? s.swipe : null
  };
}

// ── fitting one row ──────────────────────────────────────────────────────────────────────────────

/** The bar's parts, in row order. */
export type BarPart =
  | 'tag'
  | 'hint'
  | 'sel-name'
  | 'sel-view'
  | 'sel-size'
  | 'sel-pin'
  | 'sel-swipe'
  | 'div-label'
  | 'div-rotate'
  | 'sel-remove'
  | 'undo'
  | 'add'
  | 'divider'
  | 'close-gaps'
  | 'tidy'
  | 'autopack'
  | 'page'
  | 'done';

/** Which parts go first when the row is too narrow (lower = earlier), and whether a part that goes is
 *  offered in the "⋯" menu (the tag, the hint and the selection's name just disappear). Done never goes. */
export const BAR_DROP: Readonly<Record<BarPart, { order: number; menu: boolean }>> = {
  hint: { order: 1, menu: false },
  tag: { order: 2, menu: false },
  autopack: { order: 3, menu: true },
  tidy: { order: 4, menu: true },
  'close-gaps': { order: 5, menu: true },
  divider: { order: 6, menu: true },
  'sel-name': { order: 7, menu: false },
  page: { order: 8, menu: true },
  'sel-swipe': { order: 9, menu: true },
  'sel-pin': { order: 10, menu: true },
  'sel-size': { order: 11, menu: true },
  'sel-view': { order: 12, menu: true },
  'div-label': { order: 13, menu: true },
  'div-rotate': { order: 14, menu: true },
  undo: { order: 15, menu: true },
  'sel-remove': { order: 16, menu: true },
  add: { order: 17, menu: true },
  done: { order: Infinity, menu: false }
};

/** The parts the bar has right now, in row order. */
export function barParts(sel: ArrangeSel | null): BarPart[] {
  const out: BarPart[] = ['tag'];
  if (!sel) out.push('hint');
  else if (sel.kind === 'control') {
    out.push('sel-name');
    if (sel.views.length > 1) out.push('sel-view');
    if (sel.sizes.length) out.push('sel-size');
    if (sel.pinnable) out.push('sel-pin');
    if (sel.swipe != null) out.push('sel-swipe');
    out.push('sel-remove');
  } else out.push('sel-name', 'div-label', 'div-rotate', 'sel-remove');
  out.push('undo', 'add', 'divider', 'close-gaps', 'tidy', 'autopack', 'page', 'done');
  return out;
}

export interface BarFit {
  /** Parts not in the row. */
  hidden: Set<BarPart>;
  /** Hidden parts the "⋯" menu offers, in row order. */
  overflow: BarPart[];
}

/** Fit the parts (measured widths, px) into `avail` px with `gap` px between them. When they do not fit,
 *  parts go in `BAR_DROP` order until the rest — plus the "⋯" button (`moreW`) when a hidden part is
 *  offered there — fits. A part without a measured width counts as 0 (it is measured on the next pass). */
export function fitBar(avail: number, parts: readonly BarPart[], widths: Readonly<Partial<Record<BarPart, number>>>, gap: number, moreW: number): BarFit {
  const w = (p: BarPart) => Math.max(0, widths[p] ?? 0);
  const need = (shown: readonly BarPart[], more: boolean) =>
    shown.reduce((n, p) => n + w(p), 0) + gap * Math.max(0, shown.length - 1) + (more ? gap + moreW : 0);
  const hidden = new Set<BarPart>();
  const shownNow = () => parts.filter((p) => !hidden.has(p));
  const menuNeeded = () => parts.some((p) => hidden.has(p) && BAR_DROP[p].menu);
  if (need(parts, false) > avail) {
    const order = parts
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => Number.isFinite(BAR_DROP[p].order))
      .sort((a, b) => BAR_DROP[a.p].order - BAR_DROP[b.p].order || b.i - a.i);
    for (const { p } of order) {
      hidden.add(p);
      if (need(shownNow(), menuNeeded()) <= avail) break;
    }
  }
  return { hidden, overflow: parts.filter((p) => hidden.has(p) && BAR_DROP[p].menu) };
}

// ── the "⋯" menu (the parts that did not fit) ────────────────────────────────────────────────────

export interface BarState {
  sel: ArrangeSel | null;
  canUndo: boolean;
  autoPack: boolean;
  /** The Page ▾ menu's rows (pageMenu.ts), offered as a submenu. */
  pageItems: WorkbenchMenuItem[];
  page: string;
}

export interface BarActions {
  view(v: BeView): void;
  size(w: number, h: number): void;
  pin(): void;
  swipe(): void;
  remove(): void;
  /** Set a divider's label — the divider the field was opened for (`id`), whatever is selected by the time
   *  the field commits (it commits when it loses the focus, e.g. to a press on another tile); false keeps
   *  the field open. */
  label(id: string, text: string): boolean | void;
  rotate(): void;
  undo(): void;
  add(): void;
  divider(kind: BeDividerKind): void;
  closeGaps(): void;
  tidy(): void;
  autoPack(on: boolean): void;
}

const cls = rowClass('be-ab');
const noop = () => {};

/** Rows of the bar's "⋯" menu for the parts that did not fit, in row order (every row a `be-ab-<id>` class). */
export function buildBarOverflow(parts: readonly BarPart[], s: BarState, a: BarActions): WorkbenchMenuItem[] {
  const rows: WorkbenchMenuItem[] = [];
  const sel = s.sel;
  // the selection's rows come first; the board's rows start a new section
  let boardRows = false;
  const boardRow = (item: WorkbenchMenuItem): WorkbenchMenuItem => {
    const first = !boardRows && rows.length > 0;
    boardRows = true;
    return first ? { ...item, separatorBefore: true } : item;
  };
  for (const p of parts) {
    switch (p) {
      case 'sel-view':
        if (sel?.kind === 'control') rows.push(viewSubmenu(sel.view, sel.views, (v) => a.view(v), cls));
        break;
      case 'sel-size':
        if (sel?.kind === 'control') rows.push(sizeSubmenu(sel.view, sel.w, sel.h, (w, h) => a.size(w, h), cls));
        break;
      case 'sel-pin':
        rows.push({ id: 'pin', label: 'Pin as quick control', className: cls('pin'), run: () => a.pin() });
        break;
      case 'sel-swipe':
        if (sel?.kind === 'control' && sel.swipe != null) rows.push(swipeRow(sel.swipe, () => a.swipe(), cls));
        break;
      case 'div-label':
        if (sel?.kind === 'divider') {
          const id = sel.id; // the field belongs to this divider, whatever is selected when it commits
          rows.push({ id: 'label', kind: 'input', label: 'Label…', hint: sel.label || 'none', value: sel.label, placeholder: 'Label (optional)', className: cls('label'), run: noop, onSubmit: (v) => a.label(id, v) });
        }
        break;
      case 'div-rotate':
        rows.push({ id: 'rotate', label: 'Rotate', className: cls('rotate'), run: () => a.rotate() });
        break;
      case 'sel-remove':
        rows.push({ id: 'remove', label: sel?.kind === 'divider' ? 'Remove divider' : 'Remove from page', hint: 'Del', danger: true, className: cls('remove'), run: () => a.remove() });
        break;
      case 'undo':
        rows.push(boardRow({ id: 'undo', label: 'Undo', hint: UNDO_KEYS, disabled: !s.canUndo, className: cls('undo'), run: () => a.undo() }));
        break;
      case 'add':
        rows.push(boardRow({ id: 'add', label: 'Add a control…', className: cls('add'), run: () => a.add() }));
        break;
      case 'divider':
        rows.push(
          boardRow({ id: 'hdiv', label: 'Add horizontal divider', className: cls('hdiv'), run: () => a.divider('hdiv') }),
          { id: 'vdiv', label: 'Add vertical divider', className: cls('vdiv'), run: () => a.divider('vdiv') }
        );
        break;
      case 'close-gaps':
        rows.push(boardRow({ id: 'close-gaps', label: 'Close gaps', hint: s.page, className: cls('close-gaps'), run: () => a.closeGaps() }));
        break;
      case 'tidy':
        rows.push(boardRow({ id: 'tidy', label: 'Tidy up', hint: s.page, className: cls('tidy'), run: () => a.tidy() }));
        break;
      case 'autopack':
        rows.push(boardRow({ id: 'autopack', label: 'Auto-pack', hint: s.autoPack ? 'on' : 'off', className: cls('autopack', s.autoPack ? 'on' : ''), run: () => a.autoPack(!s.autoPack) }));
        break;
      case 'page':
        rows.push({ id: 'page', kind: 'submenu', label: 'Page', hint: s.page, separatorBefore: rows.length > 0, className: cls('page'), run: noop, items: s.pageItems });
        boardRows = true;
        break;
      default:
        break;
    }
  }
  return rows;
}
