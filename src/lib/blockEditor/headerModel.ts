// Block Editor header: the pure decisions behind BeHeader — when the header breaks into two rows, what
// fits at a given editor width, the type chip's texts and the block-state segment labels.
// Pure (headerModel.test.ts).

import type { BeNav } from './boardGeometry';

/** With the top navigation the header is never one row below this (the template's ~1240 px), even
 *  when the parts would just fit: the page tabs need room to show more than a tab or two. */
export const HEADER_ONE_ROW_MIN_W = 1240;
/** Below this the search is an icon button and its field moves into the popover. */
export const SEARCH_FIELD_MIN_W = 640;
/** Below this "Scene Ignore" reads "Ignore". */
export const HEADER_NARROW_W = 720;
/** Below this "Engaged" / "Bypassed" read "On" / "Byp" and the chip drops its sub line. */
export const HEADER_TINY_W = 470;
/** Below this (a 360 px phone) the state segments and the chip tighten further, so chip · state · ⋯ keep
 *  sharing row one with their 40 px targets. */
export const HEADER_XS_W = 380;

/** Widths (px) of the header parts on one row, at their widest (BeHeader's CSS): the chip at its cap
 *  (a long cab summary), the search field, the state group reading "Bypassed | Mute | Scene Ignore",
 *  the ⋯ and ✕ buttons, the smallest share of the tabs and of the spacer, the gaps and the padding. */
export const HEADER_PARTS = {
  pad: 24,
  gap: 8,
  chip: 392,
  search: 220,
  state: 290,
  more: 30,
  end: 30,
  tabsMin: 160,
  spacerMin: 8
} as const;

/** Narrowest editor that holds the header on one row without wrapping: every part at its widest. With
 *  the side navigation there are no tabs; a close button (monolith) adds itself. */
export function oneRowMinWidth(o: { nav: BeNav; hasEnd?: boolean }): number {
  const p = HEADER_PARTS;
  let w = p.pad + p.chip + p.gap + p.spacerMin + p.gap + p.search + p.gap + p.state + p.gap + p.more;
  if (o.hasEnd) w += p.gap + p.end;
  if (o.nav === 'top') return Math.max(HEADER_ONE_ROW_MIN_W, w + p.gap + p.tabsMin);
  return w;
}

/** Rows of the header for an editor width: one row from `oneRowMinWidth`, two below it. An unmeasured
 *  editor (width 0) gets two rows, which never overflow. */
export function headerRows(width: number, nav: BeNav, hasEnd = false): 1 | 2 {
  if (!(width > 0)) return 2;
  return width >= oneRowMinWidth({ nav, hasEnd }) ? 1 : 2;
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

/** Labels of the Engaged | Mute | Scene Ignore segments at an editor width. */
export function stateLabels(width: number, bypassed: boolean): { engaged: string; mute: string; scene: string } {
  const fit = headerFit(width);
  return {
    engaged: bypassed ? (fit.tiny ? 'Byp' : 'Bypassed') : fit.tiny ? 'On' : 'Engaged',
    mute: 'Mute',
    scene: fit.narrow ? 'Ignore' : 'Scene Ignore'
  };
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
  /** The grid map strip is shown (⋯ "Grid map"). */
  gridMapShown: boolean;
  /** Open the model palette (retype) or the cab picker. */
  onType: () => void;
  onChannel: (ch: string) => void;
  onBypass: () => void;
  onMute: () => void;
  onScene: () => void;
  onRemove: () => void;
  onGridMap: (show: boolean) => void;
}
