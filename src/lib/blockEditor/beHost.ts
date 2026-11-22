// The contract between the Block Editor surface (BeSurface) and its tiles (BeControl, via BeBoard):
// live values the tiles read and the gestures / actions they hand back. BeSurface owns all of it and
// provides it through Svelte context, so the tiles stay free of persistence and pointer bookkeeping.

import { getContext, setContext } from 'svelte';
import type { EQBand } from '../EQGraph.svelte';
import type { EnumParam, LiveMonitor, NamedParam } from '../types';
import type { BeItem } from './boardModel';
import type { BeCtl } from './catalog';

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
  readonly isPhone: boolean;
  /** Category accent for components that take a colour value (EQ graph). */
  readonly accent: string;
  /** Item whose value is being typed, and the text typed so far. */
  readonly editingId: string | null;
  editBuf: string;
  /** Item whose select popover is open. */
  readonly openSelectId: string | null;
  /** Item being moved in arrange mode. */
  readonly dragId: string | null;
  /** A workbench with the pin action is around. */
  readonly canPin: boolean;
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
  isSwipe(id: number): boolean;

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
  tipShow(el: HTMLElement, ctl: BeCtl): void;
  tipHide(): void;
  hover(ctl: BeCtl): void;
  unhover(): void;

  // ── modifier + pin ──
  openMod(ctl: BeCtl): void;
  pinArm(e: PointerEvent, ctl: BeCtl): void;
  pinMenu(e: MouseEvent, ctl: BeCtl): void;
  pinLongPress(ctl: BeCtl, at: { x: number; y: number }): void;
  pinnable(ctl: BeCtl | undefined): boolean;

  // ── arrange (interim) ──
  remove(id: string): void;
  cycleView(id: string): void;
  resizeDown(e: PointerEvent, id: string, tile: HTMLElement): void;
  toggleSwipe(ctl: BeCtl): void;
  pinToWorkbench(ctl: BeCtl): void;
}

const KEY = Symbol('axis.blockEditor.host');

export function setBeHost(host: BeHost): BeHost {
  setContext(KEY, host);
  return host;
}

export function getBeHost(): BeHost {
  return getContext<BeHost>(KEY);
}
