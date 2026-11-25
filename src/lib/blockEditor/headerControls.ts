// The controls the Block Editor header already shows (Engaged / Bypassed, Bypass mode, Scene Ignore). They are
// in no default board — device pages, fixed area, "More", curated — but stay in the catalog, so the Arrange
// library and "Find a control…" still offer them, and a tile the user placed stays.
//
// Which catalog entries they are (no device tables):
//   - the block's own bypass action (`bypass`);
//   - the params the server tags as the block state (Scene Ignore, Bypass Mode), whatever they are called;
//   - entries whose label is exactly "Bypass", "Bypass Mode" or "Scene Ignore" (case and spaces don't count);
//   - the block's own controls of the device layout: its bypass button always, Scene Ignore and Bypass Mode
//     only where the server tags nothing (an older server, a device without it). "Own" = not a control of
//     another block, and named after the layout's own block (`<FAMILY>_BYPASS`; the older variant of a block is
//     marked OLD). A control named after another block (`<OTHER>_BYPASS`, also without a reference to it) and
//     the bypass of one of the block's parts (a cab slot's, an EQ's: `<FAMILY>_<PART>_BYPASS`) are ordinary
//     controls and stay in the layout. So does a `<FAMILY>_BYPASS` that is not the bypass button (a dropdown
//     with a label of its own). A control without a name counts by its widget.
// Pure (headerControls.test.ts).

import { isForeignControl, type LayoutOwner } from '../deviceLayoutBoard';
import type { DeviceLayout, LayoutControl, LayoutPage } from '../types';
import type { BeCtl } from './catalog';

/** The server's block-state tag, as far as this needs it (types.ts `BlockState`). */
export interface HeaderBlockState {
  sceneIgnore?: { paramId: number } | null;
  bypassMode?: { paramId: number } | null;
}

export interface HeaderKeysInput {
  layout?: DeviceLayout | null;
  /** The served block state; null / absent = the server tags none. */
  blockState?: HeaderBlockState | null;
  /** Effect id of the open block (the cross-block guard). */
  effectId?: number | null;
}

const LABELS: ReadonlySet<string> = new Set(['bypass', 'bypassmode', 'sceneignore']);
/** A label without case, spaces and line breaks. */
const bare = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

type HeaderRole = 'bypass' | 'mode' | 'scene';
const ROLE: Readonly<Record<string, HeaderRole>> = { BYPASS: 'bypass', BYPASSMODE: 'mode', SCENEIGNORE: 'scene' };
/** A param name that says what it is: who it belongs to + the role. */
const ROLE_NAME = /^(.+)_(BYPASS|BYPASSMODE|SCENEIGNORE)$/i;
/** A name (or the family) without the mark of a block's older variant. */
const plain = (s: string): string => s.trim().toUpperCase().replace(/^OLD_|_OLD$/g, '');

/** A layout control named after another block than the layout's own (`<OTHER>_…`): a row filed under the wrong
 *  block. It binds and is drawn like any other, but says nothing about this block. A name without a block's
 *  token counts as the block's own. */
export function namedAfterOther(paramName: unknown, family: string | null | undefined): boolean {
  const name = typeof paramName === 'string' ? plain(paramName) : '';
  const fam = plain(family ?? '');
  return !!fam && /^[A-Z0-9]+_/.test(name) && !name.startsWith(`${fam}_`);
}

/** Which of the header's controls a layout control of the `family` block is, or null. */
export function headerRole(c: Pick<LayoutControl, 'paramName' | 'rawWidget'>, family: string | null | undefined): HeaderRole | null {
  const name = typeof c.paramName === 'string' ? c.paramName.trim() : '';
  const raw = c.rawWidget ?? '';
  const button: HeaderRole | null = /^btnBypass/i.test(raw) ? 'bypass' : /^btnIgnoreScene/i.test(raw) ? 'scene' : null;
  if (!name) return button;
  const fam = plain(family ?? '');
  const m = ROLE_NAME.exec(name);
  if (m) {
    const role = ROLE[m[2]!.toUpperCase()]!;
    if (!fam || plain(m[1]!) !== fam) return null; // another block's, or a part's
    return role === 'bypass' && button !== 'bypass' ? null : role;
  }
  return namedAfterOther(name, family) ? null : button;
}

/** Every control of a page: its rows', and the page-level ones. */
export const pageLayoutControls = (pg: LayoutPage | null | undefined): LayoutControl[] =>
  !pg ? [] : [...(pg.rows ?? []).flatMap((r) => r?.controls ?? []), ...(pg.pageControls ?? [])].filter((c): c is LayoutControl => !!c && typeof c === 'object');

/** Catalog keys of the controls the header shows. */
export function headerKeys(catalog: readonly BeCtl[], input: HeaderKeysInput = {}): Set<string> {
  const known = new Set(catalog.map((c) => c.key));
  const out = new Set<string>(['bypass']);
  const add = (paramId: unknown): void => {
    if (typeof paramId !== 'number') return;
    for (const k of [`e${paramId}`, `k${paramId}`]) if (known.has(k)) out.add(k);
  };
  add(input.blockState?.sceneIgnore?.paramId);
  add(input.blockState?.bypassMode?.paramId);
  for (const c of catalog) if (c.id >= 0 && LABELS.has(bare(c.label))) out.add(c.key);
  const owner: LayoutOwner = { effectId: input.effectId, family: input.layout?.family };
  for (const pg of input.layout?.pages ?? []) {
    for (const c of pageLayoutControls(pg)) {
      const role = headerRole(c, owner.family);
      if (!role || (role !== 'bypass' && input.blockState) || isForeignControl(c, owner)) continue;
      add(c.paramId);
    }
  }
  return out;
}
