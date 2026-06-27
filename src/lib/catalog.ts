// Visual catalog for grid tiles + editor icons — accent color, glyph and short
// label per block family. Colors/glyphs are ported from the design prototype
// (design/Axis Editor.dc.html); keys are ForgeFX definition-pack names (see
// blocks.ts NAME2PACK) plus a few packless base names that still appear on the grid.

export interface CatEntry {
  accent: string;
  glyph: string;
  short: string;
}

// keyed by pack name (preferred) — falls back to base display name for packless blocks
const CATALOG: Record<string, CatEntry> = {
  Input: { accent: '#4f6bed', glyph: '→', short: 'In' },
  Output: { accent: '#2fa15f', glyph: '⇥', short: 'Out' },
  Amp: { accent: '#d98a2b', glyph: '◣', short: 'Amp' },
  Cab: { accent: '#5f6168', glyph: '▦', short: 'Cab' },
  Drive: { accent: '#d6543f', glyph: '◈', short: 'Drive' },
  Comp: { accent: '#b3a52b', glyph: '▮', short: 'Comp' },
  MultiComp: { accent: '#b3a52b', glyph: '▮', short: 'Comp' },
  Delay: { accent: '#4a82e0', glyph: '⟫', short: 'Delay' },
  Multitap: { accent: '#4a82e0', glyph: '⟫', short: 'Multi' },
  Reverb: { accent: '#3fa890', glyph: '◜', short: 'Reverb' },
  Chorus: { accent: '#2fb0c9', glyph: '∿', short: 'Chorus' },
  Flanger: { accent: '#c95bc0', glyph: '≋', short: 'Flange' },
  Phaser: { accent: '#8a6fd6', glyph: '◠', short: 'Phaser' },
  Rotary: { accent: '#c95b7a', glyph: '◉', short: 'Rotary' },
  Tremolo: { accent: '#cf9242', glyph: '◢', short: 'Trem' },
  Pitch: { accent: '#5fb0d6', glyph: '♯', short: 'Pitch' },
  Wah: { accent: '#d68a4f', glyph: '◞', short: 'Wah' },
  Formant: { accent: '#b5654d', glyph: '◐', short: 'Formnt' },
  Enhancer: { accent: '#9b8cf0', glyph: '◎', short: 'Enhnce' },
  Filter: { accent: '#d65b9e', glyph: '⌇', short: 'Filter' },
  Peq: { accent: '#7fae4a', glyph: '▤', short: 'PEQ' },
  Geq: { accent: '#7fae4a', glyph: '▤', short: 'GEQ' },
  Volume: { accent: '#7a7a83', glyph: '◧', short: 'Vol' },
  Mixer: { accent: '#4a90b8', glyph: '⋈', short: 'Mixer' },
  Send: { accent: '#4a90b8', glyph: '←', short: 'Send' },
  Return: { accent: '#c0694f', glyph: '↪', short: 'Return' },
  Looper: { accent: '#5b9ed6', glyph: '⟳', short: 'Looper' },
  Resonator: { accent: '#3fa890', glyph: '≣', short: 'Reson' },
  Synth: { accent: '#7a5bd6', glyph: '◇', short: 'Synth' },
  Gate: { accent: '#9aa15f', glyph: '⊓', short: 'Gate' },
  RingMod: { accent: '#9b6fd6', glyph: '≈', short: 'RngMod' }
};

// base-name aliases for packless grid blocks (display has trailing index stripped)
const ALIAS: Record<string, string> = {
  'Ring Mod': 'RingMod',
  'Vol/Pan': 'Volume',
  'Volume/Pan': 'Volume',
  'Graphic EQ': 'Geq',
  'Parametric EQ': 'Peq',
  Fuzz: 'Drive',
  'Multitap Delay': 'Multitap',
  'Plex Delay': 'Delay'
};

const FALLBACK: CatEntry = { accent: '#6e6e78', glyph: '◻', short: '—' };

/** Visual entry for a block by its pack name and/or display base name. */
export function catFor(pack: string | null, baseName?: string): CatEntry {
  if (pack && CATALOG[pack]) return CATALOG[pack];
  if (baseName) {
    if (CATALOG[baseName]) return CATALOG[baseName];
    const a = ALIAS[baseName];
    if (a && CATALOG[a]) return CATALOG[a];
  }
  return FALLBACK;
}

/** Darken (p<0) / lighten (p>0) a #rrggbb hex by fraction |p|. Ported from the prototype's shade(). */
export function shade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const t = Math.abs(p),
    to = p < 0 ? 0 : 255;
  r = Math.round((to - r) * t + r);
  g = Math.round((to - g) * t + g);
  b = Math.round((to - b) * t + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
