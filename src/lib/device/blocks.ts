// Block categorization → accent color for the Signal Grid tiles.
export type Category = 'amp' | 'cab' | 'drive' | 'eq' | 'dynamics' | 'mod' | 'time' | 'pitch' | 'util';

const MAP: Record<string, Category> = {
  Amp: 'amp',
  Cab: 'cab',
  Drive: 'drive',
  Peq: 'eq',
  PEQ: 'eq',
  Geq: 'eq',
  GEQ: 'eq',
  Filter: 'eq',
  Comp: 'dynamics',
  MultiComp: 'dynamics',
  Gate: 'dynamics',
  Volume: 'dynamics',
  'Vol/Pan': 'dynamics',
  Input: 'util',
  Output: 'util',
  Mixer: 'util',
  Send: 'util',
  Return: 'util',
  Multiplexer: 'util',
  Enhancer: 'util',
  Formant: 'mod',
  Chorus: 'mod',
  Flanger: 'mod',
  Phaser: 'mod',
  Rotary: 'mod',
  Tremolo: 'mod',
  Wah: 'mod',
  RingMod: 'mod',
  Synth: 'mod',
  Reverb: 'time',
  Delay: 'time',
  'Plex Delay': 'time',
  Multitap: 'time',
  MultiTap: 'time',
  'Ten-Tap': 'time',
  Megatap: 'time',
  Looper: 'time',
  Resonator: 'time',
  TenTap: 'time',
  Plex: 'time',
  Pitch: 'pitch'
};

export const CAT_COLOR: Record<Category, string> = {
  amp: '#f5a623',
  cab: '#e08a2b',
  drive: '#d6543f',
  eq: '#35c9d6',
  dynamics: '#4f6bed',
  mod: '#9b6ef5',
  time: '#35c9d6',
  pitch: '#33c46b',
  util: '#6e6e78'
};

export function categoryOf(block: string): Category {
  return MAP[block] ?? 'util';
}
export function colorOf(block: string): string {
  return CAT_COLOR[categoryOf(block)];
}

// ---- /status display name (e.g. "Compressor 1", "Fuzz 2") helpers ----

/** "Compressor 1" -> "Compressor" */
export function baseName(display: string): string {
  return display.replace(/\s*\d+$/, '').trim();
}

// map a status base name to the ForgeFX definition-pack key (for the editor + color)
// Maps a block's base name → editor pack key. Covers BOTH the /status display names
// (Compressor, Parametric EQ, Volume/Pan…) AND the grid-decoder base names
// (Comp, PEQ, Vol/Pan, MultiTap, RingMod…) so every placeable block resolves a pack.
const NAME2PACK: Record<string, string> = {
  // status-style names
  Input: 'Input', Output: 'Output', Compressor: 'Comp', 'Parametric EQ': 'Peq',
  'Graphic EQ': 'Geq', Amp: 'Amp', Cab: 'Cab', Reverb: 'Reverb', Delay: 'Delay',
  'Multitap Delay': 'Multitap', Pitch: 'Pitch', Fuzz: 'Drive', Drive: 'Drive',
  Chorus: 'Chorus', Flanger: 'Flanger', Phaser: 'Phaser', Rotary: 'Rotary',
  Tremolo: 'Tremolo', Wah: 'Wah', 'Volume/Pan': 'Volume', Volume: 'Volume',
  Mixer: 'Mixer', Formant: 'Formant', Enhancer: 'Enhancer', Filter: 'Filter',
  // grid-decoder base names (EFFECT_BASES)
  Comp: 'Comp', PEQ: 'Peq', GEQ: 'Geq', MultiTap: 'Multitap', 'Vol/Pan': 'Volume',
  Synth: 'Synth', Megatap: 'Megatap', Gate: 'Gate', RingMod: 'RingMod', MultiComp: 'MultiComp',
  'Ten-Tap': 'TenTap', Resonator: 'Resonator', Looper: 'Looper', 'Plex Delay': 'Plex',
  Send: 'Send', Return: 'Return', Multiplexer: 'Multiplexer'
};
/** pack key for the editor, or null if no pack exists (Gate, Ring Mod, …) */
export function packFor(display: string): string | null {
  return NAME2PACK[baseName(display)] ?? null;
}

// signal-chain ordering (status dump is in effect-id order, not chain order)
const ORDER: Record<string, number> = {
  Input: 0, Gate: 1, Compressor: 2, Filter: 3, Drive: 4, Fuzz: 4, Wah: 5,
  Amp: 6, Cab: 7, 'Parametric EQ': 8, 'Graphic EQ': 8, Formant: 9, Pitch: 10,
  'Ring Mod': 11, Chorus: 12, Flanger: 12, Phaser: 12, Rotary: 12, Tremolo: 12,
  'Multitap Delay': 14, Delay: 14, Reverb: 16, 'Volume/Pan': 17, Volume: 17,
  Enhancer: 18, Mixer: 19, Output: 20
};
export function chainOrder(display: string): number {
  return ORDER[baseName(display)] ?? 13;
}

// color for a status/grid block (via its pack, else the category of its base name)
export function statusColor(display: string): string {
  const pack = packFor(display);
  if (pack) return colorOf(pack);
  return colorOf(baseName(display)); // categoryOf → MAP, falls back to util
}
