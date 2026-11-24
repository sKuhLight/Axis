// Block Editor header: the pure decisions behind BeHeader — when the header breaks into two rows, what
// fits at a given editor width, the type chip's texts and the block-state segments (Engaged | Bypass mode |
// Scene Ignore: labels, availability with its reason, the Bypass mode menu). Pure (headerModel.test.ts).

import type { WorkbenchMenuItem } from '../workbench';
import type { BlockState, BypassModeOption } from '../types';
import { formatBypassModeLabel } from '../blockState';
import type { BeNav } from './boardGeometry';

/** With the top navigation the header is never one row below this (the template's ~1240 px), even
 *  when the parts would just fit: the page tabs need room to show more than a tab or two. */
export const HEADER_ONE_ROW_MIN_W = 1240;
/** Below this the search is an icon button and its field moves into the popover. */
export const SEARCH_FIELD_MIN_W = 640;
/** Below this "Scene Ignore" reads "Ignore" and "Bypass: Thru" reads "Thru". */
export const HEADER_NARROW_W = 720;
/** Below this "Engaged" / "Bypassed" read "On" / "Byp", the chip drops its sub line and the Bypass mode
 *  control moves into ⋯ (a phone keeps chip · Engaged | Ignore · ⋯ on one row with 40 px targets). */
export const HEADER_TINY_W = 470;
/** Below this (a 360 px phone) the state segments and the chip tighten further, so chip · state · ⋯ keep
 *  sharing row one with their 40 px targets. */
export const HEADER_XS_W = 380;

/** Widths (px) of the header parts on one row, at their widest (BeHeader's CSS): the chip at its cap
 *  (a long cab summary), the search field, the state group reading "Bypassed | Bypass: Mute FX Out ▾ |
 *  Scene Ignore" (the Bypass mode label is capped, `.be-bm-txt`), the ⋯ and ✕ buttons, the smallest share
 *  of the tabs and of the spacer, the gaps and the padding. */
export const HEADER_PARTS = {
  pad: 24,
  gap: 8,
  chip: 392,
  search: 220,
  state: 350,
  more: 30,
  end: 30,
  tabsMin: 160,
  spacerMin: 8
} as const;
/** The ⋯ and ✕ buttons with touch targets (phone and tablet: 40 px). */
export const TOUCH_BUTTON_W = 40;
/** The chip's smallest width beside the state group on row one (BeHeader `.two .be-chip`). */
export const CHIP_ROW_MIN_W = 132;
/** The chip with a readable type name beside the glyph, the search mark and "CH A" (about eight characters):
 *  the Bypass mode control only stays in the header while the chip keeps this much (at 132 px the name is
 *  cut to one letter). */
export const CHIP_READABLE_W = 172;
/** The state group at its widest on a narrow editor: "Bypassed | Mute FX Out ▾ | Ignore" (measured 264 px;
 *  40 px touch segments are narrower than their labels). */
export const STATE_NARROW_W = 270;

const buttonW = (touch: boolean | undefined, w: number) => (touch ? TOUCH_BUTTON_W : w);

/** Narrowest editor that holds the header on one row without wrapping: every part at its widest. With
 *  the side navigation there are no tabs; a close button (monolith) adds itself; touch targets (phone,
 *  tablet) widen ⋯ and ✕. */
export function oneRowMinWidth(o: { nav: BeNav; hasEnd?: boolean; touch?: boolean }): number {
  const p = HEADER_PARTS;
  let w = p.pad + p.chip + p.gap + p.spacerMin + p.gap + p.search + p.gap + p.state + p.gap + buttonW(o.touch, p.more);
  if (o.hasEnd) w += p.gap + buttonW(o.touch, p.end);
  if (o.nav === 'top') return Math.max(HEADER_ONE_ROW_MIN_W, w + p.gap + p.tabsMin);
  return w;
}

/** Rows of the header for an editor width: one row from `oneRowMinWidth`, two below it. An unmeasured
 *  editor (width 0) gets two rows, which never overflow. */
export function headerRows(width: number, nav: BeNav, hasEnd = false, touch = false): 1 | 2 {
  if (!(width > 0)) return 2;
  return width >= oneRowMinWidth({ nav, hasEnd, touch }) ? 1 : 2;
}

/** The header's parts, in document (= visual and Tab) order. */
export type HeaderPart = 'chip' | 'tabs' | 'spA' | 'spB' | 'tools' | 'state' | 'more' | 'end' | 'break' | 'breakEnd';

/** Document order of the header parts for a layout, so Tab walks row 1 before row 2 and left to right:
 *  one row   chip · tabs · ⟷ · search · state · ⋯ · ✕
 *  two rows  chip · ⟷ · state · ⋯ · ✕ ⏎ tabs · ⟷ · search
 *  phone with a close button: chip · ⟷ · ✕ ⏎ state · ⋯ ⏎ tabs · ⟷ · search
 *  no block (virtual screens): tabs · ⟷ · search · ⋯ */
export function headerOrder(o: { rows: 1 | 2; block: boolean; tabs: boolean; end: boolean; tiny: boolean }): HeaderPart[] {
  const tabs: HeaderPart[] = o.tabs ? ['tabs'] : [];
  if (!o.block) return [...tabs, 'spB', 'tools', 'more'];
  const end: HeaderPart[] = o.end ? ['end'] : [];
  if (o.rows === 1) return ['chip', ...tabs, 'spB', 'tools', 'state', 'more', ...end];
  if (o.tiny && o.end) return ['chip', 'spA', 'end', 'breakEnd', 'state', 'more', 'break', ...tabs, 'spB', 'tools'];
  return ['chip', 'spA', 'state', 'more', ...end, 'break', ...tabs, 'spB', 'tools'];
}

/** Width of the ⋯ menu's anchor box: the workbench ContextMenu opens an anchored menu at its anchor's
 *  left edge with this fixed width (`.aw-context-menu.anchored`), so an anchor this wide whose right
 *  edge is the trigger's right edge right-aligns the menu to the trigger. Keep in step with it. */
export const MORE_MENU_W = 268;

export interface HeaderFit {
  /** The search is a field (else an icon button that opens the popover with its own field). */
  searchField: boolean;
  narrow: boolean;
  tiny: boolean;
  xs: boolean;
}

/** What fits at an editor width (an unmeasured editor gets the full look). */
export function headerFit(width: number): HeaderFit {
  const w = width > 0 ? width : Infinity;
  return { searchField: w >= SEARCH_FIELD_MIN_W, narrow: w < HEADER_NARROW_W, tiny: w < HEADER_TINY_W, xs: w < HEADER_XS_W };
}

/** Labels of the Engaged and Scene Ignore segments at an editor width (the Bypass mode control's label:
 *  `bypassModeText`). */
export function stateLabels(width: number, bypassed: boolean): { engaged: string; scene: string } {
  const fit = headerFit(width);
  return {
    engaged: bypassed ? (fit.tiny ? 'Byp' : 'Bypassed') : fit.tiny ? 'On' : 'Engaged',
    scene: fit.narrow ? 'Ignore' : 'Scene Ignore'
  };
}

// ── block state: Scene Ignore + Bypass Mode (per channel, from the device) ──

/** What the header knows to decide the Scene Ignore / Bypass mode controls. */
export interface BlockStateInput {
  /** The surface can write device block state (false: an offline surface, e.g. the preset converter). */
  live: boolean;
  /** caps.blockState: true / false, undefined when the server does not say (an older ForgeFX). */
  cap: boolean | undefined;
  /** Device name for "Not available on …". */
  device: string | null | undefined;
  /** Parameter read of the open block. */
  status: 'loading' | 'ready' | 'error' | 'nopack';
  /** The block's Scene Ignore + Bypass Mode, values live (blockState.ts `liveBlockState`). */
  state: BlockState | null | undefined;
  /** The state was read on another channel than the active one (a channel switch / scene change whose
   *  re-read is pending): shown, not writable. */
  stale?: boolean;
  /** Active channel letter (both params are per channel); absent when the block has no channels. */
  channel: string | null | undefined;
}

export interface SceneIgnoreView {
  /** The segment toggles (else it shows `reason` and does nothing). */
  enabled: boolean;
  /** Waiting for the block's re-read: the last state stays on show (no flicker), only disabled. */
  pending: boolean;
  /** Scene Ignore is ON on the active channel (`aria-pressed`). */
  on: boolean;
  paramId: number | null;
  title: string;
  reason: string | null;
}

export interface BypassModeView {
  enabled: boolean;
  /** Waiting for the block's re-read: the last mode, label and muted mark stay on show, only disabled. */
  pending: boolean;
  paramId: number | null;
  /** Current mode (ordinal), null when not available. */
  value: number | null;
  /** The block's own modes, labels as shown (`formatBypassModeLabel`). */
  options: BypassModeOption[];
  /** The current mode's label as shown ("Thru", "Mute FX Out"); '' when not available. */
  label: string;
  /** The current mode silences the block while it is bypassed (the muted indicator). */
  muting: boolean;
  title: string;
  reason: string | null;
}

export interface BlockStateView {
  scene: SceneIgnoreView;
  bypassMode: BypassModeView;
}

export { formatBypassModeLabel };

const READING = 'Reading the block…';
const READ_ERROR = "Couldn't read this block";

/** Why neither control can be used at all, whatever the block holds, or null. */
function hardReason(i: BlockStateInput): string | null {
  if (!i.live) return 'Not available offline';
  if (i.cap === undefined) return 'Needs a newer ForgeFX server';
  if (i.cap === false) return `Not available on ${i.device?.trim() || 'this device'}`;
  if (i.status === 'error' || i.state?.readError) return READ_ERROR;
  if (i.status === 'nopack') return 'This block has no parameters';
  return null;
}

/** The Scene Ignore segment and the Bypass mode control: availability (a reason when not), state, texts.
 *  While the open block is re-read (`status: 'loading'`) or its state belongs to another channel (`stale`)
 *  the last state stays on show, disabled with "Reading the block…" — no flicker, no width jump. */
export function blockStateView(i: BlockStateInput): BlockStateView {
  const hard = hardReason(i);
  const pending = !hard && (i.status === 'loading' || !!i.stale);
  const ch = i.channel ? ` · channel ${i.channel}` : '';
  const st = hard ? null : (i.state ?? null);
  // before the first read of a block there is nothing to show yet: reading, not "has none"
  const none = (what: string) => (pending && !i.state ? READING : `This block has no ${what}`);

  const si = st?.sceneIgnore ?? null;
  let scene: SceneIgnoreView;
  if (hard || !si) {
    const reason = hard ?? none('Scene Ignore');
    scene = { enabled: false, pending: !hard && reason === READING, on: false, paramId: si?.paramId ?? null, title: `Scene Ignore — ${reason}`, reason };
  } else if (pending) {
    scene = { enabled: false, pending: true, on: si.value === 1, paramId: si.paramId, title: `Scene Ignore — ${READING}`, reason: READING };
  } else if (!si.supported) {
    const reason = si.reason || 'Not supported by this firmware';
    scene = { enabled: false, pending: false, on: false, paramId: si.paramId, title: `Scene Ignore — ${reason}`, reason };
  } else {
    scene = {
      enabled: true,
      pending: false,
      on: si.value === 1,
      paramId: si.paramId,
      title: `Scene Ignore${ch} — this block keeps its state on scene changes`,
      reason: null
    };
  }

  const bm = st?.bypassMode ?? null;
  let bypassMode: BypassModeView;
  if (hard || !bm) {
    const reason = hard ?? none('bypass mode');
    bypassMode = {
      enabled: false,
      pending: !hard && reason === READING,
      paramId: bm?.paramId ?? null,
      value: null,
      options: [],
      label: '',
      muting: false,
      title: `Bypass mode — ${reason}`,
      reason
    };
  } else {
    const options = bm.options.map((o) => ({ ...o, label: formatBypassModeLabel(o.label, o.value) }));
    const cur = options.find((o) => o.value === bm.value) ?? null;
    const label = cur?.label ?? formatBypassModeLabel('', bm.value);
    const muting = !!cur?.muting;
    bypassMode = {
      enabled: !pending,
      pending,
      paramId: bm.paramId,
      value: bm.value,
      options,
      label,
      muting,
      title: pending ? `Bypass mode: ${label} — ${READING}` : `Bypass mode${ch}: ${label} — what this block does while bypassed${muting ? ' (it mutes)' : ''}`,
      reason: pending ? READING : null
    };
  }
  return { scene, bypassMode };
}

/** Text of the Bypass mode control at an editor width: "Bypass: Thru", "Thru" on a narrow editor (also
 *  while a re-read is pending), and "Bypass mode" when there is no mode to show. */
export function bypassModeText(view: BypassModeView, width: number): string {
  if (!view.label) return 'Bypass mode';
  return headerFit(width).narrow ? view.label : `Bypass: ${view.label}`;
}

/** The Bypass mode control lives in ⋯ instead of the header: on a phone-width editor (below
 *  `HEADER_TINY_W`), and wherever a readable chip · the widest narrow state group · ⋯ (· ✕) would no
 *  longer share row one (528 px; touch 538, with ✕ 566, touch + ✕ 586) — the same width BeHeader and
 *  BeSurface both read (the header's own). */
export function bypassModeInMenu(width: number, o: { hasEnd?: boolean; touch?: boolean } = {}): boolean {
  if (!(width > 0)) return false; // unmeasured: the full look
  if (headerFit(width).tiny) return true;
  const p = HEADER_PARTS;
  const row =
    p.pad + CHIP_READABLE_W + p.gap + p.spacerMin + p.gap + STATE_NARROW_W + p.gap + buttonW(o.touch, p.more) + (o.hasEnd ? p.gap + buttonW(o.touch, p.end) : 0);
  return width < row;
}

/** Rows of the Bypass mode menu: a header naming the channel, then one radio row per mode (the muting ones
 *  hinted "mutes"). Every row carries a `be-bm` class (`be-bm-head`, `be-bm-opt`), the option rows also
 *  `be-bm-<value>`. */
export function bypassModeMenu(view: BypassModeView, channel: string | null | undefined, pick: (value: number) => void): WorkbenchMenuItem[] {
  if (!view.enabled) return [];
  const out: WorkbenchMenuItem[] = [
    { id: 'bm-head', kind: 'header', label: channel ? `Bypass mode · channel ${channel}` : 'Bypass mode', className: 'be-bm be-bm-head', run: () => {} }
  ];
  for (const o of view.options) {
    out.push({
      id: `bm:${o.value}`,
      kind: 'radio',
      label: o.label,
      hint: o.muting ? 'mutes' : undefined,
      checked: o.value === view.value,
      className: `be-bm be-bm-opt be-bm-${o.value}${o.muting ? ' muting' : ''}`,
      run: () => pick(o.value)
    });
  }
  return out;
}

export const CHANNELS = ['A', 'B', 'C', 'D'] as const;

export interface TypeChipInput {
  /** Short family name of the block (e.g. "Amp"). */
  family: string;
  /** Current model name (blocks with a type). */
  typeName: string | null | undefined;
  /** The block's parameter pack; without one the type cannot be changed. */
  pack: string | null | undefined;
  isCab: boolean;
  /** What the cab slots hold (cab blocks). */
  cabSummary: string | null | undefined;
  /** Active channel letter; absent when the block has no channels. */
  channel: string | null | undefined;
}

export interface TypeChip {
  /** Small line above the name. */
  sub: string;
  /** The type name, or the cab slot summary. */
  name: string;
  /** Tooltip of the name button. */
  title: string;
  /** What a click on the name opens: the model palette, the cab picker, or nothing. */
  action: 'retype' | 'cab' | null;
  /** Channel letter shown in the chip; null when the block has no channels. */
  channel: string | null;
}

/** Texts and behaviour of the type chip (glyph + type name or cab summary + channel letter). */
export function typeChip(i: TypeChipInput): TypeChip {
  const channel = i.pack && i.channel ? i.channel : null;
  if (i.isCab) {
    const summary = i.cabSummary || 'Browse cabinet library';
    return { sub: 'Cab IR · DynaCab', name: summary, title: i.cabSummary ? `${i.cabSummary} — open the cab picker` : 'Browse cabinet library', action: i.pack ? 'cab' : null, channel };
  }
  return {
    sub: `${i.family} · type`,
    name: i.typeName || i.pack || '—',
    title: i.pack ? 'Change type — search models' : 'This block has no models to pick from',
    action: i.pack ? 'retype' : null,
    channel
  };
}

/** What the Block Editor shell hands the surface for a grid block's header: the type chip's data and the
 *  block actions (the virtual-effect screens pass none and get the compact row instead). */
export interface BeBlockChrome {
  glyph: string;
  /** CSS background / border colour of the glyph tile (category tint). */
  glyphBg: string;
  glyphBorder: string;
  /** Short family name ("Amp"); also the name in "Save as default for …". */
  family: string;
  typeName: string | null | undefined;
  pack: string | null | undefined;
  isCab: boolean;
  cabSummary: string | null | undefined;
  /** Active channel letter; absent when the block has no channels. */
  channel: string | null | undefined;
  bypassed: boolean;
  /** Scene Ignore + Bypass mode of the active channel (`blockStateView`). */
  blockState: BlockStateView;
  /** Open the model palette (retype) or the cab picker. */
  onType: () => void;
  onChannel: (ch: string) => void;
  onBypass: () => void;
  /** Set Scene Ignore of the active channel. */
  onSceneIgnore: (on: boolean) => void;
  /** Set the bypass mode (an option value of `blockState.bypassMode`). */
  onBypassMode: (value: number) => void;
  onRemove: () => void;
}
