// Block Editor control menu: what a right-click (long-press on touch, Shift+F10 / the ContextMenu key on a
// focused tile) offers for ONE control, as workbench menu items (rendered by the workbench ContextMenu:
// submenus, radio rows, headers). Pure (controlMenu.test.ts).
//
//   <label · page>
//   Pin to ▸            the workbench pin targets (custom panels, "New tab" beside the editor, "New custom panel")
//   Edit modifier…      continuous controls only
//   View ▸              the views of the control's kind (radio)
//   Size ▸              the S / M / L presets of the current view (radio), plus the current size when custom
//   Move to page ▸      the other pages; a page that already holds the control is disabled
//   Grid swipe control  toggle (continuous parameters, where the editor keeps swipe controls), its own icon —
//                       ⚡ means "pin" (F2)
//   Remove from page
//
// View / Size / Move / Remove change the layout, so they are left out where Arrange is not offered (phones,
// F12) and for a tile that is not on the board (the flat search results).

import type { WorkbenchMenuItem } from '../workbench';
import { BE_PRESETS, type BeSizeLabel, type BeView } from './boardModel';
import type { BeCtl } from './catalog';

export const VIEW_NAME: Readonly<Record<BeView, string>> = {
  knob: 'Knob',
  fader: 'Fader',
  slider: 'Slider',
  number: 'Number',
  button: 'Button',
  switch: 'Switch',
  select: 'Select',
  eq: 'EQ graph',
  action: 'Action',
  meter: 'Meter',
  wave: 'Waveform'
};

export const SIZE_NAME: Readonly<Record<BeSizeLabel, string>> = { S: 'Small', M: 'Medium', L: 'Large' };

export interface SizeChoice {
  /** S / M / L, or null for the current custom size. */
  label: BeSizeLabel | null;
  w: number;
  h: number;
  checked: boolean;
}

/** The size presets of a view, checked when the item has that size; a custom current size is listed last. */
export function sizeChoices(view: BeView, w: number, h: number): SizeChoice[] {
  const out: SizeChoice[] = (BE_PRESETS[view] ?? []).map((p) => ({ label: p.label, w: p.w, h: p.h, checked: p.w === w && p.h === h }));
  if (!out.some((c) => c.checked)) out.push({ label: null, w, h, checked: true });
  return out;
}

export interface ControlMenuState {
  ctl: Pick<BeCtl, 'key' | 'kind' | 'label' | 'views'>;
  /** The board item the menu is for; null for a tile that is not on the board (search results). */
  item: { id: string; view: BeView; w: number; h: number } | null;
  /** Page the item sits on, and the board's pages in order. */
  page: string;
  pageOrder: readonly string[];
  /** Pages that already hold the control's key (Move to page refuses them). */
  pagesWithKey: ReadonlySet<string>;
  /** Layout changes are offered (Arrange is allowed on this device class). */
  canLayout: boolean;
  /** The workbench pin targets (`buildAxisPinMenuItems`); null without a workbench or for a control that
   *  cannot be pinned. */
  pinTargets: readonly WorkbenchMenuItem[] | null;
  /** The editor sits in a workbench panel stack: "New tab" beside it is a pin target too. */
  newTab: boolean;
  /** Continuous parameter that can be the block's grid swipe control, and whether it is one now. */
  canSwipe: boolean;
  swipe: boolean;
  /** The editor keeps grid swipe controls (the live editor with a block family; not the offline convert
   *  buffer, where a toggle would do nothing). */
  swipeSupported: boolean;
}

export interface ControlMenuActions {
  pinNewTab(): void;
  modifier(): void;
  view(view: BeView): void;
  size(w: number, h: number): void;
  move(page: string): void;
  swipe(): void;
  remove(): void;
}

/** A menu's row classes: `<prefix> <prefix>-<id>` (+ extra) — the hooks of the row icons and the e2e. */
export type RowClass = (id: string, extra?: string) => string;
export const rowClass =
  (prefix: string): RowClass =>
  (id, extra = '') =>
    `${prefix} ${prefix}-${id}${extra ? ' ' + extra : ''}`;

const cls = rowClass('be-ci');
const noop = () => {};

// ── rows shared with the Arrange bar's "⋯" (arrangeBar.ts) ──

/** "View ▸": the views of a control's kind as radio rows (the current one does nothing). */
export function viewSubmenu(view: BeView, views: readonly BeView[], pick: (v: BeView) => void, c: RowClass): WorkbenchMenuItem {
  return {
    id: 'view',
    kind: 'submenu',
    label: 'View',
    hint: VIEW_NAME[view],
    className: c('view'),
    run: noop,
    items: views.map((v) => ({
      id: `view.${v}`,
      kind: 'radio' as const,
      label: VIEW_NAME[v],
      checked: v === view,
      className: c('view-opt'),
      run: () => {
        if (v !== view) pick(v);
      }
    }))
  };
}

/** "Size ▸": S / M / L of the current view as radio rows, plus "Custom" when the size is none of them. */
export function sizeSubmenu(view: BeView, w: number, h: number, pick: (w: number, h: number) => void, c: RowClass): WorkbenchMenuItem {
  return {
    id: 'size',
    kind: 'submenu',
    label: 'Size',
    hint: `${w}×${h}`,
    className: c('size'),
    run: noop,
    items: sizeChoices(view, w, h).map((z) => ({
      id: `size.${z.label ?? 'custom'}`,
      kind: 'radio' as const,
      label: z.label ? SIZE_NAME[z.label] : 'Custom',
      hint: `${z.w}×${z.h}`,
      checked: z.checked,
      className: c('size-opt'),
      run: () => {
        if (!z.checked) pick(z.w, z.h);
      }
    }))
  };
}

/** "Grid swipe control": its own icon ⇆ (F2: ⚡ means "pin"), on / off, amber while assigned. */
export function swipeRow(on: boolean, toggle: () => void, c: RowClass): WorkbenchMenuItem {
  return { id: 'swipe', label: 'Grid swipe control', hint: on ? 'on' : 'off', className: c('swipe', on ? 'on' : ''), run: () => toggle() };
}

/** Build the control menu. Every row carries a stable `be-ci-<id>` class (icons, e2e hooks). Empty when the
 *  menu would offer nothing to do (e.g. a meter on a phone): the caller does not open it then. */
export function buildControlMenu(s: ControlMenuState, a: ControlMenuActions): WorkbenchMenuItem[] {
  const rows: WorkbenchMenuItem[] = [];
  let sep = false;
  const push = (item: WorkbenchMenuItem) => {
    rows.push(sep && rows.length ? { ...item, separatorBefore: true } : item);
    sep = false;
  };
  const section = () => (sep = true);
  const it = s.item;
  const layout = s.canLayout && !!it;

  // ── pin + modifier ──
  if (s.pinTargets && s.pinTargets.length) {
    const panels = s.pinTargets.filter((t) => t.id !== 'pin.new');
    const fresh = s.pinTargets.filter((t) => t.id === 'pin.new');
    const targets: WorkbenchMenuItem[] = panels.map((t) => ({ ...t, separatorBefore: false, className: cls('pin-panel') }));
    if (s.newTab) {
      targets.push({ id: 'pin.tab', label: 'New tab beside the editor', hint: '+', separatorBefore: targets.length > 0, className: cls('pin-tab'), run: () => a.pinNewTab() });
    }
    for (const t of fresh) targets.push({ ...t, separatorBefore: targets.length > 0 && !s.newTab, className: cls('pin-new') });
    push({ id: 'pin', kind: 'submenu', label: 'Pin to', items: targets, className: cls('pin'), run: noop });
  }
  if (s.ctl.kind === 'cont') push({ id: 'modifier', label: 'Edit modifier…', className: cls('modifier'), run: () => a.modifier() });
  section();

  // ── layout ──
  if (layout && it) {
    if (s.ctl.views.length > 1) push(viewSubmenu(it.view, s.ctl.views, (v) => a.view(v), cls));
    push(sizeSubmenu(it.view, it.w, it.h, (w, h) => a.size(w, h), cls));
    const others = s.pageOrder.filter((pg) => pg !== s.page);
    push({
      id: 'move',
      kind: 'submenu',
      label: 'Move to page',
      disabled: others.length === 0,
      className: cls('move'),
      run: noop,
      items: others.map((pg) => {
        const taken = s.pagesWithKey.has(pg);
        return { id: `move.${pg}`, label: pg, hint: taken ? 'already there' : undefined, disabled: taken, className: cls('move-opt'), run: () => a.move(pg) };
      })
    });
  }
  section();

  // ── grid swipe control (F2: its own icon, not ⚡) ──
  if (s.ctl.kind === 'cont' && s.canSwipe && s.swipeSupported) push(swipeRow(s.swipe, () => a.swipe(), cls));
  section();

  if (layout && it) push({ id: 'remove', label: 'Remove from page', danger: true, className: cls('remove'), run: () => a.remove() });

  if (!rows.length) return [];
  const head = `${s.ctl.label}${it && s.page ? ` · ${s.page}` : ''}`;
  return [{ id: 'head', kind: 'header', label: head, className: cls('head'), run: noop }, ...rows];
}

/** Where a custom panel is, seen from the current workbench page. */
export type PinPanelPlace = { kind: 'here'; region?: string } | { kind: 'page'; page: string } | { kind: 'parked' };

const PANEL_ROW = 'pin.panel.';

/** Tell the custom panels of "Pin to ▸" apart (rows from `buildAxisPinMenuItems`, whose hint is the
 *  panel's widget count): a panel that is not on the current workbench page says where it is — its page, or
 *  "not on a page" — and panels sharing a name on this page say their dock region. A panel on this page
 *  with a name of its own keeps the plain count. */
export function placePinTargets(items: readonly WorkbenchMenuItem[], placeOf: (panelId: string) => PinPanelPlace): WorkbenchMenuItem[] {
  const named = new Map<string, number>();
  for (const it of items) if (it.id.startsWith(PANEL_ROW)) named.set(it.label, (named.get(it.label) ?? 0) + 1);
  return items.map((it) => {
    if (!it.id.startsWith(PANEL_ROW)) return it;
    const place = placeOf(it.id.slice(PANEL_ROW.length));
    const shared = (named.get(it.label) ?? 0) > 1;
    const where = place.kind === 'page' ? place.page : place.kind === 'parked' ? 'not on a page' : shared ? (place.region ?? 'this page') : '';
    return where ? { ...it, hint: it.hint ? `${it.hint} · ${where}` : where } : it;
  });
}
