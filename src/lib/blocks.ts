// Block categorization → accent color for the Signal Grid tiles.
export type Category = 'amp' | 'cab' | 'drive' | 'eq' | 'dynamics' | 'mod' | 'time' | 'pitch' | 'util';

const MAP: Record<string, Category> = {
  Amp: 'amp',
  Cab: 'cab',
  Drive: 'drive',
  Peq: 'eq',
  Geq: 'eq',
  Filter: 'eq',
  Comp: 'dynamics',
  Volume: 'dynamics',
  Input: 'util',
  Output: 'util',
  Mixer: 'util',
  Enhancer: 'util',
  Formant: 'mod',
  Chorus: 'mod',
  Flanger: 'mod',
  Phaser: 'mod',
  Rotary: 'mod',
  Tremolo: 'mod',
  Wah: 'mod',
  Reverb: 'time',
  Delay: 'time',
  Multitap: 'time',
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
