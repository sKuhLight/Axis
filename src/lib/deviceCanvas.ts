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
//     occupies the next authored flow slot (spacers consume a slot); `offsetX`/`offsetY` nudge it.
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
}

export interface PlacedPage {
  name: string;
  controls: PlacedControl[];
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
  const entries: { control: LayoutControl; rect: { x: number; y: number; w: number; h: number }; layer: 'absolute' | 'flow'; row: number }[] = [];

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
    for (const c of row.controls) {
      const box = boxOf(c, spacingX);
      const abs = absoluteAnchor(c, geo);
      if (abs) {
        entries.push({ control: c, rect: { x: abs.x + (c.placement?.offsetX ?? 0), y: abs.y + (c.placement?.offsetY ?? 0), w: box.w, h: box.h }, layer: 'absolute', row: rowIndex });
        continue; // absolute controls do not consume a flow slot
      }
      const col = c.placement?.col;
      const idx = col ?? slot;
      const x = baselineX + idx * spacingX + (c.placement?.offsetX ?? 0);
      const y = baselineY! + (c.placement?.offsetY ?? 0);
      slot = idx + 1;
      entries.push({ control: c, rect: { x, y, w: box.w, h: box.h }, layer: 'flow', row: rowIndex });
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
  // parametersX = 305) that the block editor now draws as its own tab rail beside the canvas. Collapse
  // that empty column: shift the page so its leftmost control sits at the surface origin, and size the
  // canvas to the content rather than the full 1280px slot. The device's relative spacing — columns,
  // offsets and absolute anchors — is untouched.
  const left = ordered.reduce((m, e) => Math.min(m, e.rect.x), Infinity);
  const right = ordered.reduce((m, e) => Math.max(m, e.rect.x + e.rect.w), -Infinity);
  const originX = Number.isFinite(left) ? left : 0;
  const contentW = Number.isFinite(right) ? right - originX : 0;

  return {
    name: page.name,
    width: contentW * DEVICE_SCALE,
    height: bottom * DEVICE_SCALE,
    controls: ordered.map((e, i) => ({
      control: e.control,
      layer: e.layer,
      row: e.row,
      alternateKey: alts[i].key,
      alternateIndex: alts[i].index,
      x: (e.rect.x - originX) * DEVICE_SCALE,
      y: e.rect.y * DEVICE_SCALE,
      w: e.rect.w * DEVICE_SCALE,
      h: e.rect.h * DEVICE_SCALE
    }))
  };
}

/** Place every page of a served layout. Pages render as tabs, in the editor's own display order. */
export function placeLayout(layout: DeviceLayout | null | undefined): PlacedPage[] {
  if (!layout?.pages?.length) return [];
  return layout.pages.map(placePage);
}
