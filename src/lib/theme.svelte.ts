// Global theme engine (ported 1:1 from the design prototype). A theme = a base palette (dark/light) + an
// accent (which drives the derived accent tokens) + optional per-token overrides (`custom`) + a UI scale +
// fonts. Applying it writes CSS custom properties onto <html>, so every `var(--token)` in the app follows.
// Persisted to localStorage under 'axis.theme'.

export type ThemeBase = 'dark' | 'light';
export interface ThemeCfg {
  base: ThemeBase;
  accent: string;
  custom: Record<string, string>;
  scale: number; // UI zoom %, 80–130
  fontUi: string;
  fontMono: string;
  preset: string; // preset id, or 'custom' once individually tweaked
}

const KEY = 'axis.theme';

// Base surface/text/border scales. `input`/`track` are Axis additions (form-field + fader backgrounds) so
// those theme too instead of staying hardcoded dark.
const PALETTES: Record<ThemeBase, Record<string, string>> = {
  dark: { bg: '#0c0c0e', bg2: '#0e0e10', surface: '#141417', surface2: '#1c1c21', border: '#26262c', border2: '#2a2a31', border3: '#3a3a44', text: '#e9e9ee', text2: '#cfcfd6', textdim: '#9a9aa3', textfaint: '#6e6e78', textmuted: '#56565e', input: '#0a0a0c', track: '#16161b' },
  light: { bg: '#e9ebf0', bg2: '#dfe1e8', surface: '#ffffff', surface2: '#f1f2f6', border: '#e0e2ea', border2: '#cfd2dc', border3: '#b4b8c6', text: '#181a20', text2: '#3d4048', textdim: '#5e626e', textfaint: '#8a8e9c', textmuted: '#a7abb8', input: '#f7f8fb', track: '#e3e5ec' }
};

export const ACCENT_SWATCHES = ['#35c9d6', '#4f6bed', '#9b8cf0', '#f5a623', '#33c46b', '#e5588f'];

export const THEME_PRESETS: { id: string; name: string; base: ThemeBase; accent: string; pal: Record<string, string> }[] = [
  { id: 'midnight', name: 'Midnight', base: 'dark', accent: '#35c9d6', pal: {} },
  { id: 'stage', name: 'Stage', base: 'dark', accent: '#f5a623', pal: { bg: '#080809', bg2: '#050506', surface: '#151210', surface2: '#221c15', border: '#241f18', border2: '#34291d', border3: '#473b28', text: '#ffffff', text2: '#e8e4dc', textdim: '#b3ac9e', textfaint: '#7f776a', textmuted: '#60594e' } },
  { id: 'nebula', name: 'Nebula', base: 'dark', accent: '#9b8cf0', pal: { bg: '#0b0a10', bg2: '#08070d', surface: '#141320', surface2: '#1e1c2e', border: '#201e30', border2: '#2c2942', border3: '#3b3654', text: '#eceaf5', text2: '#cac6dc', textdim: '#9b96b4', textfaint: '#6e6986', textmuted: '#54506a' } },
  { id: 'daylight', name: 'Daylight', base: 'light', accent: '#1f9fae', pal: {} },
  { id: 'paper', name: 'Paper', base: 'light', accent: '#b5642a', pal: { bg: '#efe9dd', bg2: '#e5decd', surface: '#fbf7ef', surface2: '#f2ebdd', border: '#e4dccb', border2: '#d6ccb5', border3: '#bcb094', text: '#231f17', text2: '#453f32', textdim: '#6d6553', textfaint: '#9a9179', textmuted: '#b4ab93' } }
];

export const FONT_UI: [string, string][] = [
  ['Hanken Grotesk', "'Hanken Grotesk',system-ui,sans-serif"],
  ['Manrope', "'Manrope',system-ui,sans-serif"],
  ['Space Grotesk', "'Space Grotesk',system-ui,sans-serif"]
];
export const FONT_MONO: [string, string][] = [
  ['JetBrains Mono', "'JetBrains Mono',ui-monospace,monospace"],
  ['IBM Plex Mono', "'IBM Plex Mono',ui-monospace,monospace"],
  ['Space Mono', "'Space Mono',ui-monospace,monospace"]
];

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function shade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = Math.abs(p), to = p < 0 ? 0 : 255;
  r = Math.round((to - r) * t + r); g = Math.round((to - g) * t + g); b = Math.round((to - b) * t + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function readable(hex: string): string { return lum(hex) > 0.5 ? '#0a1416' : '#ffffff'; }

function resolveTokens(cfg: ThemeCfg): Record<string, string> {
  const base = { ...PALETTES[cfg.base === 'light' ? 'light' : 'dark'] };
  const acc = cfg.accent || '#35c9d6';
  base.accent = acc;
  base.accentdim = shade(acc, cfg.base === 'light' ? 0.12 : -0.16);
  base.accentbright = shade(acc, 0.28);
  base.accentink = readable(acc);
  base['font-ui'] = (FONT_UI.find((x) => x[0] === cfg.fontUi) || FONT_UI[0])[1];
  base['font-mono'] = (FONT_MONO.find((x) => x[0] === cfg.fontMono) || FONT_MONO[0])[1];
  if (cfg.custom) Object.assign(base, cfg.custom);
  return base;
}

function defaultCfg(): ThemeCfg {
  return { base: 'dark', accent: '#35c9d6', custom: {}, scale: 100, fontUi: 'Hanken Grotesk', fontMono: 'JetBrains Mono', preset: 'midnight' };
}

class ThemeStore {
  cfg = $state<ThemeCfg>(defaultCfg());

  /** Load the saved theme and apply it. Call once on app start (client only). */
  init(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || '{}');
        if (s && typeof s === 'object') this.cfg = { ...defaultCfg(), ...s };
      } catch { /* keep default */ }
    }
    this.#apply();
  }

  #apply(): void {
    if (typeof document === 'undefined') return;
    const tk = resolveTokens(this.cfg);
    const el = document.documentElement;
    for (const k in tk) el.style.setProperty('--' + k, tk[k]);
    el.style.setProperty('color-scheme', this.cfg.base); // native controls / default scrollbars follow the base
    el.style.zoom = String((this.cfg.scale || 100) / 100); // UI scale
  }
  #persist(): void { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch { /* */ } }
  #set(patch: Partial<ThemeCfg>): void { this.cfg = { ...this.cfg, ...patch }; this.#apply(); this.#persist(); }

  setPreset(id: string): void {
    const p = THEME_PRESETS.find((x) => x.id === id);
    if (!p) return;
    this.#set({ preset: id, base: p.base, accent: p.accent, custom: { ...p.pal } });
  }
  setAccent(hex: string): void { this.#set({ accent: hex, preset: 'custom' }); }
  setBase(base: ThemeBase): void { this.#set({ base, custom: {}, preset: 'custom' }); }
  setScale(scale: number): void { this.#set({ scale: Math.min(130, Math.max(80, Math.round(scale / 5) * 5)) }); }
  setFontUi(f: string): void { this.#set({ fontUi: f }); }
  setFontMono(f: string): void { this.#set({ fontMono: f }); }
}

export const theme = new ThemeStore();
