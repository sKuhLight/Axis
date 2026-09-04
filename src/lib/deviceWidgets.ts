// The device editor's widget metrics, in the device's own canvas pixels.
//
// PRIMARY SOURCE is now served metadata: ForgeFX resolves each control's `rawWidget` to its outer
// `bounds` from the editor's `__components.xml` and attaches it (`LayoutControl.bounds`) — the placer
// sizes every control off that. THIS table is the LEGACY FALLBACK for a control served without bounds
// (a device whose editor config has not been extracted — FM9 today), plus the rawWidget → Svelte-view
// dispatch (`widgetView`) and the graph-token vocabulary (`graphKind`), which stay in Axis.
//
// MEASURED, NOT INVENTED (legacy fallback only). Every width below is mined from the generated layout
// corpus itself: on the pixel-composed pages the editor places controls by absolute `positionExact`,
// so the horizontal distance from one control to the next on the same visual line is an upper bound on
// the left one's width. Taking the TIGHTEST packing (10th percentile across all three gen-3 devices)
// recovers the real widget width.
//
// Heights are less directly measurable (a control is rarely followed by another directly beneath it),
// so they come from the widget's own anatomy at the measured width: a full knob is a dial plus a
// caption plus a readout, a dropdown is one line of text plus its border. `graph_cab` is the exception
// with a real measurement — 205px to the line below it.

/** A control's box in DEVICE canvas pixels (pre-scale). */
export interface WidgetBox {
  w: number;
  h: number;
  /** True when the size was derived from the token's base type rather than measured directly. */
  derived?: boolean;
}

/** The width unit the editor's own type names count in (`dropdown1` = 1 unit, `dropdown1p5` = 1.5).
 *  Measured: 85px, the 10th-percentile pitch of `knob`, `dropdown1`, `dropdownNoLabel` and `toggle`. */
export const UNIT_W = 85;

// Explicitly measured tokens. `n` in the comment is the sample count behind the width.
const MEASURED: Record<string, WidgetBox> = {
  // ── knobs ── dial + caption + value readout
  knob:                  { w: 85,  h: 112 },  // n=19479, p10 pitch 85
  knobCompact:           { w: 85,  h: 88  },  // n=2332,  p10 85 — same width, no readout line
  knobSmall:             { w: 77,  h: 92  },  // n=90,    p10 77
  knobMini:              { w: 45,  h: 62  },  // n=197,   min 45
  knobMiniReadout:       { w: 82,  h: 78  },  // n=313,   p10 83
  knobMiniReadout2:      { w: 85,  h: 78  },  // n=104,   p10 85
  knobMiniWide:          { w: 120, h: 62, derived: true },

  // ── dropdowns ── one text line + border; width is the name's unit count
  dropdown1:                 { w: 85,  h: 42 },  // n=2605, p10 85
  dropdown1Tight:            { w: 94,  h: 36 },  // n=3549, p10 94
  dropdown1TightXtra:        { w: 94,  h: 34, derived: true },
  dropdown1Tight1Line:       { w: 85,  h: 30 },  // n=32,  p10 85
  dropdown1p5:               { w: 126, h: 42 },  // n=130, p10 126
  dropdown1p5Tight:          { w: 127, h: 36 },  // n=73,  p10 127
  dropdown1p5Tight1Line:     { w: 178, h: 30 },  // n=8,   p10 178
  dropdown1p5ThinTight1Line: { w: 137, h: 28 },  // n=16,  p10 137
  dropdown1p5Mini:           { w: 51,  h: 34 },  // n=22,  min 51
  dropdown1LFO:              { w: 92,  h: 42 },  // n=77,  p10 92
  'dropdown1LFO-Off':        { w: 92,  h: 42, derived: true },
  dropdown1mhz:              { w: 85,  h: 42, derived: true },
  dropdownMini:              { w: 45,  h: 34 },  // n=191, min 45
  dropdownMiniReadout:       { w: 82,  h: 42 },  // n=41,  p10 82
  dropdownNoLabel:           { w: 85,  h: 30 },  // n=303, p10 85
  dropdownThin1Line:         { w: 126, h: 28 },  // n=72,  p10 126
  dropdownThin2Line:         { w: 128, h: 44 },  // n=21,  p10 128
  dropdownCompact:           { w: 92,  h: 34, derived: true },
  dropdownCompact3:          { w: 92,  h: 34 },  // n=12,  p10 92
  dropdownCabBank:           { w: 119, h: 30 },  // n=66,  p10 119
  dropdownCabDyna:           { w: 157, h: 30 },  // n=40,  p10 157
  dropdownLeftLabel:         { w: 180, h: 30 },  // n=3,   p10 180
  dropdownLeftLabelShort:    { w: 362, h: 30 },  // n=4,   p10 362
  dropdownLeftLabelLong:     { w: 380, h: 30, derived: true },

  // ── sliders ──
  slider:           { w: 75, h: 112 },  // n=1914, p10 75
  sliderMiniA:      { w: 40, h: 60  },  // n=120,  p10 40 (dy 60)
  sliderMiniB:      { w: 40, h: 60  },  // n=120,  p10 40 (dy 60)

  // ── toggles ──
  toggle:              { w: 85, h: 44 },  // n=522, p10 85
  toggleHorz:          { w: 85, h: 30 },  // n=529, col-authored only
  'toggle-halfwidth':  { w: 64, h: 44 },  // n=32,  p10 64

  // ── buttons ──
  btnBypass:        { w: 85,  h: 34, derived: true },
  btnIgnoreScene:   { w: 84,  h: 34 },  // n=2065, p10 84
  btnKillDry:       { w: 85,  h: 34, derived: true },
  btnSquare:        { w: 36,  h: 36 },  // n=160,  p10 36
  btnSquareReverse: { w: 36,  h: 36, derived: true },
  btnRectangle:     { w: 79,  h: 34 },  // n=117,  p10 79
  btnRectangleLong: { w: 160, h: 34, derived: true },

  // ── labels / headings ──
  sectionLabel:     { w: 83,  h: 22 },  // n=713, p10 83 — a control-GROUP heading
  labelBold:        { w: 85,  h: 22 },  // n=286, p10 85 (min 17: labels pack tightly)
  labelSeperator:   { w: 4,   h: 116 }, // n=137, p10 4 wide — a vertical rule between groups
  labelSliderTicks: { w: 40,  h: 112 }, // n=138, p10 40 — the tick gutter beside a slider bank
  labelModifier:    { w: 30,  h: 22, derived: true },
  labelCabName:     { w: 215, h: 26 },  // n=66,  p10 215
  labelMenuArrow:   { w: 30,  h: 22 },  // n=3,   p10 30

  // ── readouts ──
  readoutCabNumber:   { w: 88,  h: 30 },  // n=66, p10 88
  readoutMidiBlock:   { w: 85,  h: 34 },  // n=48, p10 85
  readoutLeftLabel:   { w: 380, h: 28 },  // n=36, p10 380
  readoutValueFloat:  { w: 85,  h: 28, derived: true },
  readoutValueInt:    { w: 85,  h: 28, derived: true },
  readoutNameShortRO: { w: 120, h: 34, derived: true },
  readoutNameLong:    { w: 300, h: 34, derived: true },
  readoutCtrl8:       { w: 85,  h: 28, derived: true },

  // ── meters ──
  meterGainHeadroom:      { w: 120, h: 34,  derived: true },
  meterGainVert:          { w: 40,  h: 112, derived: true },
  meterGainVertShort:     { w: 40,  h: 70,  derived: true },
  meterGainVertNoReadout: { w: 30,  h: 112, derived: true },
  meterVuVert:            { w: 75,  h: 112 },  // n=38, p10 75
  meterRelHorzNoReadout:  { w: 120, h: 20,  derived: true },
  meterRelVertNoReadout:  { w: 30,  h: 112, derived: true },

  // ── graphs ── the device says which graph and how much room; the curve is ours to draw
  graph_eq:          { w: 420, h: 205 },  // height measured off graph_cab (dy 205)
  graph_peq:         { w: 420, h: 205, derived: true },
  graph_reverb:      { w: 420, h: 205, derived: true },
  graph_filter:      { w: 420, h: 205, derived: true },
  graph_rta:         { w: 420, h: 205, derived: true },
  graph_eqMatch:     { w: 330, h: 205 },  // n=2, p10 330
  graph_eqMatch2:    { w: 330, h: 205, derived: true },
  graph_eqMatch3:    { w: 330, h: 205, derived: true },
  graph_cab:         { w: 420, h: 205 },  // n=16, dy 205 — the one directly-measured graph height
  graph_cabZoom:     { w: 420, h: 205, derived: true },
  graph_cab_mm:      { w: 420, h: 205, derived: true },
  graph_cabZoom_mm:  { w: 420, h: 205, derived: true },
  graph_comp_studio: { w: 300, h: 205, derived: true },
  graph_lfo:         { w: 300, h: 160, derived: true },
  graph_trem:        { w: 300, h: 160, derived: true },
  graph_phaser:      { w: 300, h: 160, derived: true },
  graph_adsr:        { w: 300, h: 160, derived: true },
  graph_adsr_marker: { w: 300, h: 160, derived: true },
  graph_megatap:     { w: 420, h: 205, derived: true },
  graph_modifier:    { w: 250, h: 205 },  // n=5, p10 250
  graph3:            { w: 300, h: 160, derived: true },
  graph4:            { w: 300, h: 160, derived: true },

  // ── structural ──
  spacer:         { w: 85, h: 0 },   // occupies a slot, draws nothing

  // The DynaCab speaker-cone graphic. Directly measured, and unanimous: all 8 occurrences across the
  // three devices sit at 310,96 or 740,96 with the same 254px gap to the slot's Pan knob and 199px drop
  // to its Level knob. Like `graph_cab`, the device says where and how big; the cone is ours to draw.
  dynaCabControl: { w: 254, h: 199 }, // n=8, dx 254 / dy 199
};

// Looper transport buttons: one measured family, six near-identical tokens.
for (const t of ['play', 'once', 'reverse', 'undo', 'record', 'overdub']) {
  MEASURED[`toggle-looper-${t}`] = { w: 64, h: 44, derived: true };
}

/** Prefix rules for a token the table doesn't name outright — same base widget, unmeasured modifier.
 *  Ordered longest-prefix-first at lookup. */
const PREFIX_FALLBACK: [string, WidgetBox][] = [
  ['knobMini',   { w: 45,  h: 62,  derived: true }],
  ['knob',       { w: 85,  h: 112, derived: true }],
  ['dropdown1p5',{ w: 126, h: 42,  derived: true }],
  ['dropdown',   { w: 85,  h: 42,  derived: true }],
  ['sliderMini', { w: 40,  h: 60,  derived: true }],
  ['slider',     { w: 75,  h: 112, derived: true }],
  ['toggle',     { w: 85,  h: 44,  derived: true }],
  ['btn',        { w: 85,  h: 34,  derived: true }],
  ['meter',      { w: 40,  h: 112, derived: true }],
  ['graph',      { w: 300, h: 205, derived: true }],
  ['label',      { w: 85,  h: 22,  derived: true }],
  ['readout',    { w: 85,  h: 28,  derived: true }],
  ['seperator',  { w: 4,   h: 116, derived: true }],
  ['separator',  { w: 4,   h: 116, derived: true }],
  ['spacer',     { w: 85,  h: 0,   derived: true }],
];

const UNKNOWN: WidgetBox = { w: 85, h: 42, derived: true };

/** Every token the table names outright — the sweep test asserts the layout corpus stays inside it. */
export const MEASURED_WIDGETS: ReadonlySet<string> = new Set(Object.keys(MEASURED));

/** Box for an editor `rawWidget`, in device canvas pixels. Never throws: an unrecognised token falls
 *  back by prefix, then to a plain dropdown-sized box, and is reported by the sweep test rather than
 *  silently guessed at render time. */
export function widgetBox(rawWidget: string | null | undefined): WidgetBox {
  const t = (rawWidget ?? '').trim();
  if (!t) return UNKNOWN;
  const exact = MEASURED[t];
  if (exact) return exact;
  const lower = t.toLowerCase();
  let best: WidgetBox | null = null;
  let bestLen = -1;
  for (const [prefix, box] of PREFIX_FALLBACK) {
    if (lower.startsWith(prefix.toLowerCase()) && prefix.length > bestLen) {
      best = box;
      bestLen = prefix.length;
    }
  }
  return best ?? UNKNOWN;
}

// ── what to DRAW in the box ──
//
// The editor's token names are prefix-coded by widget family (`knobMiniReadout` is a knob,
// `dropdownCabBank` a dropdown, `btnSquareReverse` a button), so the view falls out of the same
// prefixes the size table already keys on — there is no second 90-row table to keep in sync. Only the
// two `label*` tokens that are NOT text (`labelSeperator` is a vertical rule, `labelSliderTicks` a
// tick gutter) need naming outright, which is why they come first.

/** How the renderer draws a control. One per widget family, not per token. */
export type WidgetView =
  | 'knob'
  | 'fader'
  | 'dropdown'
  | 'toggle'
  | 'button'
  | 'label'
  | 'separator'
  | 'ticks'
  | 'readout'
  | 'meter'
  | 'graph'
  /** The DynaCab speaker cone — a device-authored control with its own renderer, not a `graph_*`. */
  | 'dynacab'
  | 'spacer';

const VIEW_EXACT: Record<string, WidgetView> = {
  labelSeperator: 'separator',
  labelSliderTicks: 'ticks',
  // Not a dropdown despite the `Cab`/`Control` spelling, and not a `graph_*` token either: this is the
  // DynaCab speaker cone (see `cabMicGraphs.ts`). Its `widget` is `unknown`, so without this entry it
  // would fall through to a label.
  dynaCabControl: 'dynacab',
};

const VIEW_PREFIX: [string, WidgetView][] = [
  ['knob', 'knob'],
  ['slider', 'fader'],
  ['dropdown', 'dropdown'],
  ['toggle', 'toggle'],
  ['btn', 'button'],
  ['label', 'label'],
  ['readout', 'readout'],
  ['meter', 'meter'],
  ['graph', 'graph'],
  ['spacer', 'spacer'],
];

/** The view for an editor `rawWidget`. Falls back to the layout's own `widget` kind, then to a label —
 *  a control we cannot classify is shown as its name rather than as a fake, writable knob. */
export function widgetView(rawWidget: string | null | undefined, widget?: string): WidgetView {
  const t = (rawWidget ?? '').trim();
  const exact = VIEW_EXACT[t];
  if (exact) return exact;
  for (const [prefix, view] of VIEW_PREFIX) if (t.startsWith(prefix)) return view;
  switch (widget) {
    case 'knob': return 'knob';
    case 'slider': return 'fader';
    case 'dropdown': return 'dropdown';
    case 'toggle': return 'toggle';
    case 'button': return 'button';
    case 'graph': return 'graph';
    case 'meter': return 'meter';
    case 'readout': return 'readout';
    case 'spacer': return 'spacer';
    default: return 'label';
  }
}

// ── which graph ──
//
// THE dispatch table for graph tokens, replacing the six private `new Set([...])` token lists that used
// to live one per graph module (`eqGraphs.FREQ_GRAPHS`, `modulationGraphs.MODULATION_GRAPHS`,
// `cabAlignmentGraphs.CAB_GRAPHS`, `adsrGraphs.ADSR_GRAPHS`, and the inline checks in
// `compressorGraphs`/`megaTapGraphs`). Six lists over one vocabulary is five chances to disagree about
// a token; this is the vocabulary.

/** Which of our graph renderers a `graph_*` token asks for. `null` = a graph kind we do not draw. */
export type GraphKind = 'freq' | 'mod' | 'comp' | 'cabAlign' | 'adsr' | 'megatap' | 'rta' | 'eqMatch' | 'modifier';

const GRAPH_KIND: Record<string, GraphKind> = {
  graph_eq: 'freq', graph_peq: 'freq', graph_reverb: 'freq', graph_filter: 'freq',
  graph3: 'freq', graph4: 'freq',
  graph_lfo: 'mod', graph_trem: 'mod', graph_phaser: 'mod',
  graph_comp_studio: 'comp',
  graph_cab: 'cabAlign', graph_cabZoom: 'cabAlign', graph_cab_mm: 'cabAlign', graph_cabZoom_mm: 'cabAlign',
  graph_adsr: 'adsr', graph_adsr_marker: 'adsr',
  graph_megatap: 'megatap',
  graph_rta: 'rta',
  graph_eqMatch: 'eqMatch', graph_eqMatch2: 'eqMatch', graph_eqMatch3: 'eqMatch',
  graph_modifier: 'modifier',
};

/** The graph kind a `rawWidget` names, or null when the token is not a graph (or is one we do not draw:
 *  `rta`, `eqMatch` and `modifier` resolve to a kind but have no renderer of ours behind them). */
export function graphKind(rawWidget: string | null | undefined): GraphKind | null {
  return GRAPH_KIND[(rawWidget ?? '').trim()] ?? null;
}
