// The contract between the Block Editor surface (BeSurface) and its tiles (BeControl, via BeBoard):
// live values the tiles read and the gestures / actions they hand back. BeSurface owns all of it and
// provides it through Svelte context, so the tiles stay free of persistence and pointer bookkeeping.

import { getContext, setContext } from 'svelte';
import type { EQBand } from '../EQGraph.svelte';
import type { EnumParam, LiveMonitor, NamedParam } from '../types';
import type { BeItem } from './boardModel';
import type { BeCtl } from './catalog';
import type { Axis } from './touchGesture';

/** Drop preview of an arrange drag: where the item would land, and whether it may. */
export interface BeGhost {
  page: string;
  x: number;
  y: number;
  w: number;
  h: number;
  valid: boolean;
}

export interface BeHost {
  // ── reads ──
  readonly editMode: boolean;
  /** Tile flashed after a "Find a control…" jump. */
  readonly flashId: string | null;
  readonly isPhone: boolean;
  /** Category accent for components that take a colour value (EQ graph). */
  readonly accent: string;
  /** Item whose value is being typed, and the text typed so far. */
  readonly editingId: string | null;
  editBuf: string;
  /** Item whose select popover is open, and the popover's id (the field's `aria-controls`). */
  readonly openSelectId: string | null;
  readonly selectMenuId: string;
  /** Item being moved in arrange mode. */
  readonly dragId: string | null;
  /** Arrange: the selected item (outline, w×h, corner handle) and the one being resized at its corner. */
  readonly selectedId: string | null;
  readonly resizingId: string | null;
  /** Arrange on a touch device class (tablet): the 40 px corner handle. */
  readonly touchArrange: boolean;
  /** Touch device classes (phone, tablet — every class but the desktop): ≥ 40 px touch targets on the tiles
   *  and in the select list. */
  readonly touchTargets: boolean;
  /** The axis the board scrolls along (top strip: x; side stack and the phone layout: y). Touch changes
   *  values along the other one (touchGesture.ts; a pen behaves like the mouse). */
  readonly scrollAxis: Axis;
  /** The same for the tiles of the fixed area: it scrolls vertically itself when its contents are taller than
   *  its room, else it follows the board. */
  readonly fixedScrollAxis: Axis;
  /** A workbench with the pin action is around. */
  readonly canPin: boolean;
  /** A host that has no modifier / pin affordance to offer (a Quick Controls tile: its block may not even be
   *  open): the tile draws neither hover action. */
  readonly hideHoverActions?: boolean;
  readonly eqBands: EQBand[];
  readonly eqGainRange: number;
  readonly bypassed: boolean;
  readonly mons: LiveMonitor[];
  readonly wave: number[];
  readonly wavePos: number;
  readonly waveLevel: number | null;
  knob(id: number): NamedParam | undefined;
  enm(id: number): EnumParam | undefined;
  loopOn(action: string): boolean;

  // ── graph tiles (read-only displays) ──
  /** Tempo for tempo-synced LFO / delay times, and whether the device reports one. */
  readonly bpm: number;
  readonly hasTempo: boolean;
  /** The block's type name (the filter type of a FILTER block's response graph). */
  readonly typeName: string | null;
  /** Shared animation clock in seconds for the LFO playheads: advances at most 30 times a second, and only
   *  while some playhead is registered (`playhead`) and `animate` holds. */
  readonly clock: number;
  /** Playheads may move: not arranging, the page visible, no reduced motion asked for. */
  readonly animate: boolean;
  /** A tile's playhead is moving and on screen (true) or not / gone (false). */
  playhead(id: string, on: boolean): void;
  /** Live block metering is on (`mons` is empty otherwise). */
  readonly meteringOn: boolean;
  isLiveMeter(ctl: BeCtl): boolean;
  /** Subscribe while a real tile intersects its scroll containers and the viewport. */
  observeTileTelemetry(el: HTMLElement, needs: { waveform: boolean; monitors: boolean }): (() => void) | undefined;

  // ── value gestures ──
  tileDown(e: PointerEvent, item: BeItem, ctl: BeCtl | undefined, page: string, tile: HTMLElement): void;
  trackDown(e: PointerEvent, ctl: BeCtl, vertical: boolean): void;
  valueKey(e: KeyboardEvent, ctl: BeCtl, itemId: string): void;
  startType(itemId: string, ctl: BeCtl): void;
  commitType(itemId: string, ctl: BeCtl): void;
  cancelType(): void;
  nudge(ctl: BeCtl, dir: number): void;
  toggle(ctl: BeCtl): void;
  openSelect(e: MouseEvent, itemId: string, ctl: BeCtl): void;
  bypass(): void;
  loop(action: string): void;
  eqSet(p: NamedParam, norm: number): void;
  hover(ctl: BeCtl): void;
  unhover(): void;

  // ── modifier + pin (hover actions ∿ / ⚡ and the 380 ms hold-to-drag on the tile body) ──
  openMod(ctl: BeCtl): void;
  pinArm(e: PointerEvent, ctl: BeCtl): void;
  /** Press on ⚡: a few px of movement start the pin drag right away. */
  pinPress(e: PointerEvent, ctl: BeCtl): void;
  /** Click (or Enter) on ⚡: pin to the default target. */
  pinClick(ctl: BeCtl): void;
  pinnable(ctl: BeCtl | undefined): boolean;

  // ── control menu (right-click, long-press, Shift+F10 / the ContextMenu key on a focused tile) ──
  ctxMenu(e: MouseEvent, item: BeItem, ctl: BeCtl, tile: HTMLElement): void;
  ctxLongPress(item: BeItem, ctl: BeCtl, at: { x: number; y: number }): void;
  ctxKey(e: KeyboardEvent, item: BeItem, ctl: BeCtl, tile: HTMLElement): void;

  // ── arrange (a press on a tile selects and moves it — tileDown —; the corner handle resizes it) ──
  resizeDown(e: PointerEvent, id: string, tile: HTMLElement): void;
}

const KEY = Symbol('axis.blockEditor.host');

export function setBeHost(host: BeHost): BeHost {
  setContext(KEY, host);
  return host;
}

export function getBeHost(): BeHost {
  return getContext<BeHost>(KEY);
}
