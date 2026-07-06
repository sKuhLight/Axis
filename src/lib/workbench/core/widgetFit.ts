import type { WidgetSize } from './schema';

/**
 * Generic widget auto-fit — a verbatim port of the design's shell `_fit`
 * algorithm (see `docs/workbench-dc-parity/01-shell.md` §8 and
 * `02-widgets.md` §3). The generic layer holds NO app-specific widget data:
 * per-widget estimated widths and the keep-set are supplied by the caller as
 * `WidgetFitDescriptor[]` (Axis provides them from its widget layer).
 *
 * Constants (all from the design, do not re-derive):
 * - per-widget floor for the joint fit: `max(40, estW * factor)`
 * - compact joint-fit factor: `0.62`
 * - mini overflow-shed width estimate: `max(36, estW * 0.42)`, plus `10px`
 *   inter-item spacing
 * - chip reserve for the `⋯` overflow chip: `44px`
 */

export const WIDGET_FIT_COMPACT_FACTOR = 0.62;
export const WIDGET_FIT_FLOOR = 40;
export const WIDGET_FIT_MINI_FACTOR = 0.42;
export const WIDGET_FIT_MINI_FLOOR = 36;
export const WIDGET_FIT_MINI_SPACING = 10;
export const WIDGET_FIT_OVERFLOW_CHIP_RESERVE = 44;

export interface WidgetFitDescriptor {
  /** Stable key for the unit (widget id or group id). */
  key: string;
  /** Design `estW` for the unit — Σ of member estW for a group. */
  estW: number;
  /** Keep-set members never shed into overflow (design: preset + save). */
  keep?: boolean;
}

/**
 * `_fit(ids, avail, gapPx)` — verbatim. Returns the largest of
 * `default | compact | mini` whose summed estimate fits `avail`.
 *
 *   need(f) = Σ max(40, round(estW * f)) + gap * max(0, n - 1)
 *   default when need(1)   <= avail
 *   compact when need(0.62) <= avail
 *   else mini
 */
export function fitZoneSize(
  descriptors: readonly WidgetFitDescriptor[],
  avail: number,
  gapPx: number
): WidgetSize {
  if (!descriptors.length) return 'default';
  const need = (factor: number): number =>
    descriptors.reduce(
      (total, d) => total + Math.max(WIDGET_FIT_FLOOR, Math.round(d.estW * factor)),
      0
    ) + gapPx * Math.max(0, descriptors.length - 1);
  if (need(1) <= avail) return 'default';
  if (need(WIDGET_FIT_COMPACT_FACTOR) <= avail) return 'compact';
  return 'mini';
}

export interface ZoneFitResult {
  /** The resolved zone-level size tier applied to every rendered unit. */
  size: WidgetSize;
  /** Keys shed into the `⋯` overflow because even mini could not fit. */
  overflow: Set<string>;
}

/**
 * Full zone fit with the design's overflow shedding path.
 *
 * When `fitZoneSize` lands on `mini` the zone still overflows, so the design
 * sheds the lowest-priority units into the `⋯` chip. Keep-set units always
 * stay. Shedding walks the units in order, accumulating the mini width
 * estimate `max(36, round(estW * 0.42)) + 10` against `avail - 44` (the 44px
 * reserves room for the chip); once the running total passes the budget every
 * further non-keep unit is shed. The final size is re-fit over the survivors.
 */
export function fitZone(
  descriptors: readonly WidgetFitDescriptor[],
  avail: number,
  gapPx: number
): ZoneFitResult {
  const overflow = new Set<string>();
  let size = fitZoneSize(descriptors, avail, gapPx);
  if (size !== 'mini' || descriptors.length === 0) return { size, overflow };

  const miniW = (d: WidgetFitDescriptor): number =>
    Math.max(WIDGET_FIT_MINI_FLOOR, Math.round(d.estW * WIDGET_FIT_MINI_FACTOR));
  const budget = avail - WIDGET_FIT_OVERFLOW_CHIP_RESERVE;

  let used = 0;
  // Keep-set units are laid out first and are never shed.
  for (const d of descriptors) {
    if (d.keep) used += miniW(d) + WIDGET_FIT_MINI_SPACING;
  }
  for (const d of descriptors) {
    if (d.keep) continue;
    used += miniW(d) + WIDGET_FIT_MINI_SPACING;
    if (used > budget) overflow.add(d.key);
  }

  const survivors = descriptors.filter((d) => !overflow.has(d.key));
  size = fitZoneSize(survivors, budget, gapPx);
  return { size, overflow };
}

/**
 * Per-widget fit inside a width-constrained panel (design `mkW`): fits
 * `default` when `estW <= availMinus24`, else `compact` when
 * `estW * 0.62 <= availMinus24`, else `mini`. Pass `availableWidth - 24`.
 */
export function fitWidgetInWidth(estW: number, availMinus24: number): WidgetSize {
  if (estW <= availMinus24) return 'default';
  if (estW * WIDGET_FIT_COMPACT_FACTOR <= availMinus24) return 'compact';
  return 'mini';
}

const SIZE_RANK: Record<WidgetSize, number> = { default: 2, compact: 1, mini: 0 };

export function widgetSizeRank(size: WidgetSize): number {
  return SIZE_RANK[size];
}

/**
 * Manual density acts as a ceiling only (design `mkW`:
 * `if(rank[man] < rank[size]) size = man`). Never grows a widget above its
 * manual cap; auto-fit may shrink it further.
 */
export function capWidgetSize(size: WidgetSize, manualCeiling: WidgetSize): WidgetSize {
  return SIZE_RANK[manualCeiling] < SIZE_RANK[size] ? manualCeiling : size;
}
