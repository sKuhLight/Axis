// Pure logic for the Quick Build sidecar (q → right sidecar of placeable blocks, dragged onto the grid).
import type { Cell } from './grid';

/** A Quick Build drop is valid onto an empty cell or a shunt (which `editor.place` replaces in place);
 *  dropping onto an occupied BLOCK is rejected (no silent overwrite). */
export function quickBuildDropValid(cells: Cell[], shunts: Cell[], row: number, col: number): boolean {
  const occupied = [...cells, ...shunts].find((c) => c.row === row && c.col === col);
  return !occupied || occupied.kind === 'shunt';
}

// Codec block slug (lowercase, authoritative — forgefx-midi roster) → catalog pack key (capitalized,
// matches `catalog.ts` CATALOG). Lets the sidecar resolve a proper glyph/accent/category for every
// placeable block without depending on the pretty display name (which doesn't round-trip through
// `packFor` for a few families — Megatap Delay, Multiband Comp, etc.).
const SLUG_TO_PACK: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  comp: 'Comp',
  geq: 'Geq',
  peq: 'Peq',
  amp: 'Amp',
  cab: 'Cab',
  reverb: 'Reverb',
  delay: 'Delay',
  multitap: 'Multitap',
  chorus: 'Chorus',
  flanger: 'Flanger',
  rotary: 'Rotary',
  phaser: 'Phaser',
  wah: 'Wah',
  formant: 'Formant',
  volume: 'Volume',
  tremolo: 'Tremolo',
  pitch: 'Pitch',
  filter: 'Filter',
  drive: 'Drive',
  enhancer: 'Enhancer',
  mixer: 'Mixer',
  synth: 'Synth',
  megatap: 'Megatap',
  gate: 'Gate',
  ringmod: 'RingMod',
  multicomp: 'MultiComp',
  tentap: 'TenTap',
  resonator: 'Resonator',
  looper: 'Looper',
  plex: 'Plex',
  send: 'Send',
  return: 'Return',
  multiplexer: 'Multiplexer'
};

/** Catalog pack key for a codec slug, or null for an unknown slug (caller falls back to `catFor(null)`). */
export function packForSlug(slug: string): string | null {
  return SLUG_TO_PACK[slug] ?? null;
}
