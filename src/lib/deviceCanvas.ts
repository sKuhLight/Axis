// Places a device-authentic layout page onto the block editor's canvas, at the device's own pixel
// coordinates. This is a RENDERER, not an arranger: it reads the geometry ForgeFX resolved from the
// editor's `__components.xml` PageLayout and places every control exactly where the device authored
// it. Nothing here snaps, packs, reflows, clamps, repacks, centers, or infers group membership.
//
// THE PLACEMENT MODEL (all geometry is served, never reproduced here):
//   • a page carries `geometry` (its PageLayout): `parametersX/Y` + `parametersSpacingX/Y` and
//     `mixerX/Y` + `mixerSpacingX/Y`, plus explicit Bypass / Scene Ignore / Kill Dry button anchors.
//   • a Parameters row's baseline is (parametersX, parametersY + paramsRowIndex * parametersSpacingY);
//     a Mixer row's baseline is (mixerX, mixerY + mixerRowIndex * mixerSpacingY).
//   • a control with `placement.col` sits at baselineX + col * sectionSpacingX; a control without one
//     occupies the next authored flow slot. Spacers AND absolutely-positioned controls both consume a
//     slot — the device reserves the column even when it draws a control at `positionExact`.
//     `offsetX`/`offsetY` nudge a control off its slot.
//   • `placement.positionExact` overrides x/y outright; Bypass / Scene Ignore / Kill Dry use the
//     PageLayout's own button anchors when supplied.
//   • widget outer size comes from the control's served `bounds` (the editor's component metadata);
//     a `sectionLabel`'s width is `render.sectionSpan.pixels` or `cols * sectionSpacingX`.

import type { DeviceLayout, LayoutControl, LayoutPage, LayoutPageLayout, LayoutRow } from './types';
import { widgetBox } from './deviceWidgets';

/** Width of the device editor's control canvas, in its own pixels. The editors' `slotDivider` is 1280
 *  wide and the widest device-authored control (the CHORUS mixer's `Balance` at 1184 + 83) reaches
 *  1267, so 1280 accommodates the mixer rail + Bypass/Scene-Ignore anchors without clipping. */
export const CANVAS_W = 1280;
/** Rendered at 0.95:1 with the device's own canvas — the block editor is a fixed 1240px-wide surface. */
export const DEVICE_SCALE = 0.95;
/** Left inset (rendered px) for identity-column controls, matching the tab rail's title padding so they
 *  sit flush under the page tabs instead of at the rail's outer edge. */
export const RAIL_INSET = 22;

/** One control, placed. `x`/`y`/`w`/`h` are in RENDERED px (device px x {@link DEVICE_SCALE}). */
export interface PlacedControl {
  control: LayoutControl;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which layer placed it — absolute coordinates from the device, or a section flow slot. */
  layer: 'absolute' | 'flow';
  /** Source row index, for grouping and for diagnostics. */
  row: number;
  /** Controls the device anchors at the SAME coordinate are ALTERNATES — it draws one at a time and
   *  swaps them on some other control's value (see `deviceAlternates.ts`). Same anchor = same key. */
  alternateKey: string;
  alternateIndex: number;
  /** Which authored section the control came from — the block's `parameters` grid vs its right-hand
   *  `mixer` strip. The canvas uses this to nudge the mixer and draw its divider. */
  section: 'parameters' | 'mixer';
}

export interface PlacedPage {
  name: string;
  controls: PlacedControl[];
  /** Controls the device authors in its own identity column (x < `parametersX`) — the block's
   *  page-level identity controls (e.g. the cab's Input Mode / Zoom). Drawn in the tab rail, not on
   *  the control surface; their `x`/`y` are relative to the identity column's top-left origin. */
  rail: PlacedControl[];
  /** Rendered width of the page's content — the device's empty identity rail (~305px) is collapsed so
   *  the leftmost control sits at the surface origin and the canvas never pads an empty column. */
  width: number;
  height: number;
}

/** Parse a `positionExact` / button-anchor string (`"465,370"`) into canvas px, or null when absent. */
export function parsePositionExact(s: string | null | undefined): { x: number; y: number } | null {
  if (!s) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

const num = (v: number | undefined, fallback: number): number => (Number.isFinite(v) ? (v as number) : fallback);

// Neutral fallbacks for a page served WITHOUT resolved geometry (legacy devices whose editor config
// has not been extracted — FM9 today). The standard device pitch (85 / 180) reproduces the common
// grid; this is a documented degradation, NOT a per-block/per-page heuristic.
const FALLBACK_SPACING_X = 85;
const FALLBACK_SPACING_Y = 180;

/** A text label the component metadata left auto-sized (bounds width 0) sizes to its own caption. The
 *  editor's `__components.xml` records `labelBold` / `labelModifier` / a span-less `sectionLabel` with a
 *  zero width because JUCE sizes them to the text — a 0px cell would clip the caption entirely. */
function textLabelWidth(label: string): number {
  return Math.max(28, Math.ceil((label ?? '').length * 8) + 8);
}

const isTextLabel = (rawWidget: string) => rawWidget === 'sectionLabel' || rawWidget.startsWith('label');

/** Outer box of one control in DEVICE px. Served `bounds` win; `render` resolves the two widgets whose
 *  size the component metadata leaves dynamic (a `sectionLabel`'s span, a `labelSeperator`'s height). */
function boxOf(c: LayoutControl, sectionSpacingX: number): { w: number; h: number } {
  const b = c.bounds ?? widgetBox(c.rawWidget);
  let w = b.w;
  let h = b.h;
  if (c.rawWidget === 'sectionLabel') {
    const span = c.render?.sectionSpan;
    if (span?.pixels != null) w = span.pixels;
    else if (span?.cols != null) w = span.cols * sectionSpacingX;
  } else if (c.rawWidget === 'labelSeperator' && c.render?.separatorHeight != null) {
    h = c.render.separatorHeight;
  }
  if (w <= 0 && isTextLabel(c.rawWidget)) w = textLabelWidth(c.label);
  return { w, h };
}

/** The absolute anchor a control is drawn at, when the device authored one. Bypass / Scene Ignore /
 *  Kill Dry use the PageLayout's own button positions (rule 8); everything else its `positionExact`. */
function absoluteAnchor(c: LayoutControl, geo: LayoutPageLayout | undefined): { x: number; y: number } | null {
  const fromGeo = (s: string | undefined) => (s ? parsePositionExact(s) : null);
  if (c.rawWidget === 'btnBypass' && geo?.btnBypassPosition) return fromGeo(geo.btnBypassPosition);
  if (c.rawWidget === 'btnIgnoreScene' && geo?.btnIgnoreScenePosition) return fromGeo(geo.btnIgnoreScenePosition);
  if (c.rawWidget === 'btnKillDry' && geo?.btnKillDryPosition) return fromGeo(geo.btnKillDryPosition);
  return parsePositionExact(c.placement?.positionExact);
}

/** Place one page's controls at the device's own coordinates. Pure — no Svelte, no DOM, no measurement. */
export function placePage(page: LayoutPage): PlacedPage {
  const geo = page.geometry;
  const entries: { control: LayoutControl; rect: { x: number; y: number; w: number; h: number }; layer: 'absolute' | 'flow'; row: number; section: 'parameters' | 'mixer' }[] = [];

  let paramsRow = 0;
  let mixerRow = 0;
  page.rows.forEach((row, rowIndex) => {
    const isMixer = row.section === 'mixer';
    const baselineX = isMixer ? num(geo?.mixerX, 0) : num(geo?.parametersX, 0);
    const baselineY0 = isMixer ? num(geo?.mixerY, 0) : num(geo?.parametersY, 0);
    const spacingX = isMixer ? num(geo?.mixerSpacingX, FALLBACK_SPACING_X) : num(geo?.parametersSpacingX, FALLBACK_SPACING_X);
    const spacingY = isMixer ? num(geo?.mixerSpacingY, FALLBACK_SPACING_Y) : num(geo?.parametersSpacingY, FALLBACK_SPACING_Y);

    // A row whose controls are ALL absolutely anchored (positionExact, or a PageLayout button anchor)
    // is a decoration row — the device's section headings, the cab's identity cluster, a graph overlay —
    // not a flow row. It has no grid baseline, so it must NOT advance the section's row cursor, or it
    // pushes every following flow row down a full pitch (the Cab/Preamp "total mess").
    let baselineY: number | null = null;
    if (row.controls.some((c) => !absoluteAnchor(c, geo))) {
      baselineY = baselineY0 + (isMixer ? mixerRow++ : paramsRow++) * spacingY;
    }

    let slot = 0;
    // The device nudges a WHOLE run of flow controls by putting `offsetX` on the run's first control
    // only (the amp's Output-EQ and the wah's Graphic-EQ shift their whole fader bank with one nudge on
    // the first slider; the pitch block shifts an entire voice group). Carrying the nudge forward keeps
    // the run evenly spaced instead of collapsing the first gap; an explicit `col` re-anchors the run.
    let carryX = 0;
    for (const c of row.controls) {
      const box = boxOf(c, spacingX);
      const abs = absoluteAnchor(c, geo);
      if (abs) {
        entries.push({ control: c, rect: { x: abs.x + (c.placement?.offsetX ?? 0), y: abs.y + (c.placement?.offsetY ?? 0), w: box.w, h: box.h }, layer: 'absolute', row: rowIndex, section: row.section });
        // An absolutely-positioned control still occupies its authored column: the device reserves the
        // grid cell even when it draws the control at `positionExact`. Without this, every flow control
        // after it shifts one column LEFT — the cab Preamp's VU meter lands on top of High Cut Slope
        // instead of in the column the device left open for it.
        slot += 1;
        continue;
      }
      const col = c.placement?.col;
      const idx = col ?? slot;
      if (col != null) {
        carryX = 0;
      } else if (c.placement?.offsetX != null) {
        carryX = c.placement.offsetX;
      }
      const x = baselineX + idx * spacingX + (col != null ? (c.placement?.offsetX ?? 0) : carryX);
      const y = baselineY! + (c.placement?.offsetY ?? 0);
      slot = idx + 1;
      entries.push({ control: c, rect: { x, y, w: box.w, h: box.h }, layer: 'flow', row: rowIndex, section: row.section });
    }
  });

  // Preserve authored order (rows top→bottom, controls left→right within a row) — no sorting by
  // computed coordinates, which is the old "reorder by position" behavior this renderer removes.
  const ordered = entries;
  const anchorSeen = new Map<string, number>();
  const alts = ordered.map((e) => {
    const key = `${e.rect.x},${e.rect.y}`;
    const index = anchorSeen.get(key) ?? 0;
    anchorSeen.set(key, index + 1);
    return { key, index };
  });
  const bottom = ordered.reduce((m, e) => Math.max(m, e.rect.y + e.rect.h), 0);

  // The device's canvas reserves a wide left rail (its own block-identity column — e.g. Amp's
  // parametersX = 305) that the block editor draws as its own tab rail beside the canvas. Controls the
  // device authors INSIDE that column (x < parametersX, on pages that declare a mixer rail) are the
  // block's page-level identity controls and stay in the rail; everything else is content. Collapse the
  // now-empty column for the content: shift it so its leftmost control sits at the surface origin, and
  // size the canvas to the content rather than the full 1280px slot. The device's relative spacing —
  // columns, offsets and absolute anchors — is untouched.
  const hasRail = geo?.mixerX != null; // dialog layouts (no mixer) use the full canvas and reserve no identity column
  const railX = hasRail ? num(geo?.parametersX, 0) : 0;

  // Split into rail (identity-column controls) vs surface (content) in ONE pass, keeping each entry's
  // alternate key/index so both halves resolve against the same authored order.
  const surface: { entry: (typeof entries)[number]; altKey: string; altIndex: number }[] = [];
  const rail: PlacedControl[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    if (hasRail && e.rect.x < railX) {
      rail.push({
        control: e.control,
        layer: e.layer,
        row: e.row,
        section: e.section,
        alternateKey: alts[i].key,
        alternateIndex: alts[i].index,
        // Left-align rail controls at a small inset, matching the tab rail's title padding — the device's
        // own x (e.g. 196 of 305) would shove them toward the rail's right edge.
        x: RAIL_INSET,
        y: e.rect.y * DEVICE_SCALE,
        w: e.rect.w * DEVICE_SCALE,
        h: e.rect.h * DEVICE_SCALE
      });
    } else {
      surface.push({ entry: e, altKey: alts[i].key, altIndex: alts[i].index });
    }
  }

  const left = surface.reduce((m, s) => Math.min(m, s.entry.rect.x), Infinity);
  const right = surface.reduce((m, s) => Math.max(m, s.entry.rect.x + s.entry.rect.w), -Infinity);
  const originX = Number.isFinite(left) ? left : 0;
  const contentW = Number.isFinite(right) ? right - originX : 0;

  const controls: PlacedControl[] = surface.map(({ entry: e, altKey, altIndex }) => ({
    control: e.control,
    layer: e.layer,
    row: e.row,
    section: e.section,
    alternateKey: altKey,
    alternateIndex: altIndex,
    x: (e.rect.x - originX) * DEVICE_SCALE,
    y: e.rect.y * DEVICE_SCALE,
    w: e.rect.w * DEVICE_SCALE,
    h: e.rect.h * DEVICE_SCALE
  }));

  return {
    name: page.name,
    width: contentW * DEVICE_SCALE,
    height: bottom * DEVICE_SCALE,
    controls,
    rail
  };
}

/** Place every page of a served layout. Pages render as tabs, in the editor's own display order. */
export function placeLayout(layout: DeviceLayout | null | undefined): PlacedPage[] {
  if (!layout?.pages?.length) return [];
  return layout.pages.map(placePage);
}
