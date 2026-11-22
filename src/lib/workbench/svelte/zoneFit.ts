/**
 * Bar-zone fitting with the edit-mode chrome (slice 4b, closes the AXIS-66
 * top-bar part). Outside edit mode this is the design's joint fit + shedding
 * (`core/widgetFit.ts`). While editing a bar zone shows more than its units:
 *
 *  - the units move apart ({@link WIDGET_ZONE_EDIT_GAP_PX}) so the insert line
 *    sits clearly between them;
 *  - a zone with units ends in the compact "+" (`WIDGET_ZONE_ADD_BUTTON_PX` plus
 *    one gap);
 *  - an empty zone is a "+ Widget" button ({@link WIDGET_ZONE_EMPTY_ADD_PX}), or
 *    the bare placeholder without an Add palette.
 *
 * All of that is reserved before the units are sized, so a narrow window (the
 * 834 px tablet width) steps the units down to compact / mini instead of letting
 * the bar spill. When even that is too tight the empty zones collapse their
 * "+ Widget" to the compact "+". Edit mode still never sheds a unit into the ⋯
 * overflow (units stay visible to be rearranged).
 */
import { fitZone, fitZoneSize, widgetSizeRank, type WidgetFitDescriptor, type WidgetSize } from '../core';
import { WIDGET_ZONE_ADD_BUTTON_PX } from './addCatalog';

/** Unit gap while editing: the units move apart for the insert line. */
export const WIDGET_ZONE_EDIT_GAP_PX = 16;
/** Width estimate of an empty bar zone's "+ Widget" button. */
export const WIDGET_ZONE_EMPTY_ADD_PX = 84;
/** Width of an empty bar zone's placeholder when the host has no Add palette. */
export const WIDGET_ZONE_EMPTY_PLACEHOLDER_PX = 72;
/**
 * Inline padding of a jointly fitted zone (the top bar) while editing: keeps
 * the units' dashed outlines inside the zone, which clips and scrolls as a
 * last resort instead of spilling over its neighbour.
 */
export const WIDGET_ZONE_FIT_GROUP_EDIT_PAD_PX = 5;

/** How an empty zone offers Add while editing. */
export type EmptyZoneAdd = 'label' | 'compact';

export interface FitZoneInput {
  zone: string;
  units: WidgetFitDescriptor[];
}

export interface WidgetZonesFitInput {
  /** The zones fitted jointly (one entry for a lone zone). */
  zones: readonly FitZoneInput[];
  /** Shared width (px). */
  avail: number;
  /** The design gap between units outside edit mode. */
  gap: number;
  editing: boolean;
  /** Editing with a host Add palette: zones show "+" / "+ Widget". */
  canAdd: boolean;
  /** Extra fixed px per zone while editing (e.g. its inline padding). */
  zoneChromePx?: number;
}

export interface WidgetZonesFit {
  size: WidgetSize;
  /** Units shed into ⋯ (never while editing). */
  overflow: Set<string>;
  /** Empty zones: the full "+ Widget" button, or the compact "+". */
  emptyAdd: EmptyZoneAdd;
  /** The px reserved for the edit chrome (0 outside edit mode). */
  reserve: number;
  /** The unit gap the fit assumed. */
  gap: number;
}

/** The fixed px a zone needs besides its units while editing. */
export function zoneEditChromePx(units: number, options: { canAdd: boolean; emptyAdd: EmptyZoneAdd; gap: number; zoneChromePx?: number }): number {
  const chrome = options.zoneChromePx ?? 0;
  if (units > 0) return chrome + (options.canAdd ? WIDGET_ZONE_ADD_BUTTON_PX + options.gap : 0);
  if (!options.canAdd) return chrome + WIDGET_ZONE_EMPTY_PLACEHOLDER_PX;
  return chrome + (options.emptyAdd === 'label' ? WIDGET_ZONE_EMPTY_ADD_PX : WIDGET_ZONE_ADD_BUTTON_PX);
}

/** Joint fit of one or more bar zones, edit chrome included. */
export function fitWidgetZones(input: WidgetZonesFitInput): WidgetZonesFit {
  const descriptors = input.zones.flatMap((zone) => zone.units);
  if (!input.editing) {
    const result = fitZone(descriptors, input.avail, input.gap);
    return { ...result, emptyAdd: 'label', reserve: 0, gap: input.gap };
  }
  const gap = Math.max(input.gap, WIDGET_ZONE_EDIT_GAP_PX);
  const reserveFor = (emptyAdd: EmptyZoneAdd) =>
    input.zones.reduce(
      (total, zone) => total + zoneEditChromePx(zone.units.length, { canAdd: input.canAdd, emptyAdd, gap, zoneChromePx: input.zoneChromePx }),
      0
    );
  // Editing never sheds, so the size is the plain tier over EVERY unit (not
  // the survivors' re-fit `fitZone` would return after shedding) …
  const sized = (reserve: number) => ({
    size: fitZoneSize(descriptors, input.avail, gap, reserve),
    // … and "fits" means shedding would not have had to drop anything.
    fits: fitZone(descriptors, input.avail, gap, reserve).overflow.size === 0
  });
  const labelled = { reserve: reserveFor('label'), emptyAdd: 'label' as const };
  const compact = { reserve: reserveFor('compact'), emptyAdd: 'compact' as const };
  const withLabel = sized(labelled.reserve);
  const withCompact = sized(compact.reserve);
  // "+ Widget" keeps its label unless the label would cost the units a size
  // tier, or the units do not fit at all with it (then every px counts).
  const labelFits = widgetSizeRank(withLabel.size) >= widgetSizeRank(withCompact.size) && withLabel.fits;
  const chosen = labelFits ? labelled : compact;
  const result = labelFits ? withLabel : withCompact;
  return { size: result.size, overflow: new Set<string>(), emptyAdd: chosen.emptyAdd, reserve: chosen.reserve, gap };
}
