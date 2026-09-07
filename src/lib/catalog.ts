// Visual catalog for grid tiles + editor icons — accent color, glyph and short
// label per block family. Colors/glyphs are ported from the design prototype
// (design/Axis Editor.dc.html); keys are ForgeFX definition-pack names (see
// blocks.ts NAME2PACK) plus a few packless base names that still appear on the grid.

export interface CatEntry {
  accent: string;
  glyph: string;
  short: string;
}

// glyph is inline SVG (24x24 viewBox, 1em square) so it inherits size/color
// from the containing element like the old single-character glyph did.
const svg = (inner: string, attrs = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"') =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" ${attrs}>${inner}</svg>`;

const MULTITAP_GLYPH = svg(
  '<line x1="2" y1="12" x2="22" y2="12" stroke-width="1"/><line x1="3" y1="2" x2="3" y2="11.2" stroke-width="1.6"/><circle cx="3" cy="2" r="1.2" fill="currentColor" stroke="none"/><line x1="7.5" y1="12.8" x2="7.5" y2="19.5" stroke-width="1.6"/><circle cx="7.5" cy="19.5" r="1.1" fill="currentColor" stroke="none"/><line x1="11.5" y1="5.5" x2="11.5" y2="11.2" stroke-width="1.6"/><circle cx="11.5" cy="5.5" r="1.1" fill="currentColor" stroke="none"/><line x1="15" y1="12.8" x2="15" y2="18" stroke-width="1.6"/><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none"/><line x1="18.5" y1="8" x2="18.5" y2="11.2" stroke-width="1.6"/><circle cx="18.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><line x1="21" y1="12.8" x2="21" y2="15.5" stroke-width="1.6"/><circle cx="21" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>'
);

const MULTI_DELAY_GLYPH = svg(
  '<path d="M2 12h20" opacity=".5"/><path d="M3 3v8M7 19v-6M11 6v5M15 17v-5M19 9v2M22 15v-3"/><circle cx="3" cy="3" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="11" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="9" r="1" fill="currentColor" stroke="none"/>'
);

// Single-stroke treble clef (Material Design Icons) — thin, uniform line weight.
const PITCH_GLYPH = svg(
  '<path d="M13 11V7.5L15.2 5.29C16 4.5 16.15 3.24 15.59 2.26C15.14 1.47 14.32 1 13.45 1C13.24 1 13 1.03 12.81 1.09C11.73 1.38 11 2.38 11 3.5V6.74L7.86 9.91C6.2 11.6 5.7 14.13 6.61 16.34C7.38 18.24 9.06 19.55 11 19.89V20.5C11 20.76 10.77 21 10.5 21H9V23H10.5C11.85 23 13 21.89 13 20.5V20C15.03 20 17.16 18.08 17.16 15.25C17.16 12.95 15.24 11 13 11M13 3.5C13 3.27 13.11 3.09 13.32 3.03C13.54 2.97 13.77 3.06 13.88 3.26C14 3.46 13.96 3.71 13.8 3.87L13 4.73V3.5M11 11.5C10.03 12.14 9.3 13.24 9.04 14.26L11 14.78V17.83C9.87 17.53 8.9 16.71 8.43 15.57C7.84 14.11 8.16 12.45 9.26 11.33L11 9.5V11.5M13 18V12.94C14.17 12.94 15.18 14.04 15.18 15.25C15.18 17 13.91 18 13 18Z"/>',
  'fill="currentColor" stroke="none"'
);

// keyed by pack name (preferred) — falls back to base display name for packless blocks
const CATALOG: Record<string, CatEntry> = {
  Input: { accent: '#4f6bed', glyph: svg('<path d="M3 12h9M9.5 8.5 13 12l-3.5 3.5"/><circle cx="17" cy="12" r="1.6" fill="currentColor" stroke="none"/>'), short: 'In' },
  Output: { accent: '#2fa15f', glyph: svg('<circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M11 12h9M16.5 8.5 20 12l-3.5 3.5"/>'), short: 'Out' },
  Amp: { accent: '#d98a2b', glyph: svg('<rect x="1.5" y="6.5" width="21" height="11" rx="2"/><path d="M1.5 11.5h21"/><circle cx="6" cy="9" r="1"/><circle cx="10" cy="9" r="1"/><circle cx="14" cy="9" r="1"/>'), short: 'Amp' },
  Cab: { accent: '#5f6168', glyph: svg('<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'), short: 'Cab' },
  Drive: { accent: '#d6543f', glyph: svg('<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><circle cx="8.6" cy="7.2" r="1.05"/><circle cx="12" cy="6.2" r="1.05"/><circle cx="15.4" cy="7.2" r="1.05"/><circle cx="12" cy="16.2" r="2.7"/>'), short: 'Drive' },
  Comp: { accent: '#b3a52b', glyph: svg('<path d="M12 2.3v3.6"/><path d="M9.4 4.1 12 6.7l2.6-2.6"/><path d="M12 21.7v-3.6"/><path d="M9.4 19.9 12 17.3l2.6 2.6"/><path d="M4.3 12c1.9-3.4 3.9-3.4 5.9 0s3.8 3.4 5.7 0 3.9-3.4 5.9 0"/>'), short: 'Comp' },
  MultiComp: { accent: '#b3a52b', glyph: svg('<path d="M12 1.5v2.5M10.2 2.2 12 4l1.8-1.8M12 22.5V20M10.2 21.8 12 20l1.8 1.8"/><path d="M3 7c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 12c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 17c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/>'), short: 'Comp' },
  Delay: { accent: '#4a82e0', glyph: svg('<path d="M.6 12c1.4-8 2.8-8 4.2 0s2.8 8 4.2 0 2.8-8 4.2 0 2.8 8 4.2 0 2.8-8 4.2 0"/><path d="M3.2 12c1.4-8 2.8-8 4.2 0s2.8 8 4.2 0 2.8-8 4.2 0 2.8 8 4.2 0 2.8-8 4.2 0" opacity=".4"/>'), short: 'Delay' },
  Multitap: { accent: '#4a82e0', glyph: MULTI_DELAY_GLYPH, short: 'Multi' },
  Reverb: { accent: '#3fa890', glyph: svg('<circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="4" opacity=".78"/><circle cx="12" cy="12" r="7.2" opacity=".5"/><circle cx="12" cy="12" r="10.4" opacity=".25"/>', 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'), short: 'Reverb' },
  Chorus: { accent: '#2fb0c9', glyph: svg('<path d="M2 7c2 0 2 10 4 10S8 7 10 7s2 10 4 10 2-10 4-10 2 10 4 10"/><path d="M2 17c2 0 2-10 4-10s2 10 4 10 2-10 4-10 2 10 4 10 2-10 4-10" opacity=".45"/>'), short: 'Chorus' },
  Flanger: { accent: '#c95bc0', glyph: svg('<path d="M2 17c5 0 5-10 10-10s5 10 10 10"/><path d="M2 20c5 0 5-10 10-10s5 10 10 10" opacity=".45"/><path d="M2 14c5 0 5-10 10-10s5 10 10 10" opacity=".25"/>'), short: 'Flange' },
  Phaser: { accent: '#8a6fd6', glyph: svg('<path d="M3 12c2-9 6-9 8 0s6 9 10 0"/><path d="M3 12c2 9 6 9 8 0s6-9 10 0" opacity=".5"/>'), short: 'Phaser' },
  Rotary: { accent: '#c95b7a', glyph: svg('<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 10 12 3c4 1 5 4 2 7M13.7 13 20 16c-3 3-6 2-6.3-2M10.3 13 4 16c-1-4 1-6 6.3-3"/><circle cx="12" cy="12" r="9" opacity=".4"/>'), short: 'Rotary' },
  Tremolo: { accent: '#cf9242', glyph: svg('<path d="M5 2 2 5l6 3-6 3 6 3-6 3 6 3-3 2"/><path d="M12 2 9 5l6 3-6 3 6 3-6 3 6 3-3 2"/><path d="M19 2 16 5l6 3-6 3 6 3-6 3 6 3-3 2"/>'), short: 'Trem' },
  Pitch: { accent: '#5fb0d6', glyph: PITCH_GLYPH, short: 'Pitch' },
  Wah: { accent: '#d68a4f', glyph: svg('<rect x="5" y="2" width="14" height="20" rx="3.2" opacity=".55"/><path d="M9 5.5h6l-1 13H10Z"/><path d="M8.5 5h7" opacity=".55"/>'), short: 'Wah' },
  Formant: { accent: '#b5654d', glyph: svg('<path d="M12 2.5v2.2"/><circle cx="12" cy="2.5" r="1.8" fill="currentColor" stroke="none"/><rect x="4" y="5" width="16" height="14" rx="3.6"/><path d="M2.5 10v4M21.5 10v4"/><circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/><path d="M8.3 15.2h7.4" stroke-width="1.25"/>'), short: 'Formnt' },
  Enhancer: { accent: '#9b8cf0', glyph: svg('<circle cx="6" cy="12" r="5.3" stroke-dasharray=".7 1.6" stroke-width=".9" opacity=".55"/><circle cx="18" cy="12" r="5.3" stroke-dasharray=".7 1.6" stroke-width=".9" opacity=".55"/><circle cx="12" cy="12" r="5.3"/>'), short: 'Enhnce' },
  Filter: { accent: '#d65b9e', glyph: svg('<path d="M2 9h9c1 0 1.3-2 2.3-2s1.2 2 2.2 4.5S18 19 21 19"/>'), short: 'Filter' },
  Peq: { accent: '#7fae4a', glyph: svg('<path d="M2 16.2 5.5 14.6 8.4 9.4 11 13.4 13.8 8.2 16.8 13.6 21.8 15.4"/><rect x="1" y="15.1" width="2.2" height="2.2" fill="currentColor" stroke="none"/><rect x="7.3" y="8.3" width="2.2" height="2.2" fill="currentColor" stroke="none"/><rect x="9.9" y="12.3" width="2.2" height="2.2" fill="currentColor" stroke="none"/><rect x="12.7" y="7.1" width="2.2" height="2.2" fill="currentColor" stroke="none"/><rect x="15.7" y="12.5" width="2.2" height="2.2" fill="currentColor" stroke="none"/><rect x="20.7" y="14.3" width="2.2" height="2.2" fill="currentColor" stroke="none"/>'), short: 'PEQ' },
  Geq: { accent: '#7fae4a', glyph: svg('<path d="M5 3.5v17M12 3.5v17M19 3.5v17"/><rect x="3.2" y="7" width="3.6" height="3.4" rx="1.1"/><rect x="10.2" y="13" width="3.6" height="3.4" rx="1.1"/><rect x="17.2" y="9.4" width="3.6" height="3.4" rx="1.1"/>'), short: 'GEQ' },
  Volume: { accent: '#7a7a83', glyph: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="none"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14" fill="none"/>', 'fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'), short: 'Vol' },
  Mixer: { accent: '#4a90b8', glyph: svg('<path d="M3 5h5l6 7h7M3 12h11M3 19h5l6-7"/><circle cx="14" cy="12" r="1.4" fill="currentColor" stroke="none"/>'), short: 'Mixer' },
  Send: { accent: '#4a90b8', glyph: svg('<path d="M2 17h20"/><path d="M8 17c0-4.5 3-6.5 7-6.5"/><path d="m12.5 8 2.8 2.5-2.8 2.6"/>'), short: 'Send' },
  Return: { accent: '#c0694f', glyph: svg('<path d="M2 17h20"/><path d="M16 8c-5 0-8 3-8 9"/><path d="M5.5 14 8 17l2.5-3"/>'), short: 'Return' },
  Looper: { accent: '#5b9ed6', glyph: svg('<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="13.4" font-size="5.4" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif" stroke="none" fill="currentColor">REC</text>'), short: 'Looper' },
  Resonator: { accent: '#3fa890', glyph: svg('<path d="M4 19V6M10 19v-8M15 19v-8M20 19v-8"/>'), short: 'Reson' },
  Synth: { accent: '#7a5bd6', glyph: svg('<path d="M2 16 6 8l4 8 4-8 4 8 4-8"/><path d="M2 6h4v5h4V6h4v5h4V6h4" opacity=".55"/>'), short: 'Synth' },
  Gate: { accent: '#9aa15f', glyph: svg('<path d="M7.5 15V5c0-2 2.6-2 2.6 0v6M10.1 11V3c0-2 2.6-2 2.6 0v8M12.7 11V5c0-2 2.6-2 2.6 0v6M15.3 11V8.5c0-2 2.6-2 2.6 0v7c0 3.4-2.1 5.5-5.5 5.5h-2.1c-2.2 0-3.8-1-5-2.8l-2-2.7c-1-1.4.8-2.7 2-1.3l2.3 1.8L7.5 15"/>'), short: 'Gate' },
  RingMod: { accent: '#9b6fd6', glyph: svg('<path d="M12 3c-5 0-8 3-8 8 0 4 3 8 8 10 5-2 8-6 8-10 0-5-3-8-8-8Z"/><ellipse cx="8.8" cy="13" rx="2.1" ry="3.3" transform="rotate(-28 8.8 13)" fill="currentColor" stroke="none"/><ellipse cx="15.2" cy="13" rx="2.1" ry="3.3" transform="rotate(28 15.2 13)" fill="currentColor" stroke="none"/>', 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'), short: 'RngMod' },
  Megatap: { accent: '#8068d7', glyph: MULTITAP_GLYPH, short: 'Megtap' },
  TenTap: { accent: '#3fa890', glyph: MULTITAP_GLYPH, short: '10-Tap' },
  Plex: { accent: '#4a82e0', glyph: svg('<circle cx="5" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="18" r="1.5" fill="currentColor" stroke="none"/><path d="M5 16.5C6.5 10 10.5 10 12 16.5"/><path d="M12 16.5c1.5-6.5 5.5-6.5 7 0"/><path d="M5 16.2C8 4.5 16 4.5 19 16.2"/>'), short: 'Plex' },
  Multiplexer: { accent: '#4a90b8', glyph: svg('<path d="M3 12h5c3 0 3-7 6-7h7M8 12h13M8 12c3 0 3 7 6 7h7"/>'), short: 'Mux' }
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

const FALLBACK: CatEntry = { accent: '#6e6e78', glyph: svg('<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/>'), short: '—' };

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
