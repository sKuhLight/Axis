import type { WidgetInstance } from '../../workbench/core';

/**
 * Axis-specific estimated widths (design `estW`, `docs/workbench-dc-parity/
 * 02-widgets.md` §2) keyed by Axis widget *type*. This is app data — it feeds
 * the generic `fitZone` / `fitWidgetInWidth` algorithm in
 * `workbench/core/widgetFit.ts`, which holds no widget-type knowledge itself.
 *
 * Design kind → Axis type mapping:
 *   preset→axis.preset, scenes→axis.scenes, view→axis.view, add→axis.addBlock,
 *   tuner→axis.tuner, tempo→axis.tempo, cpu→axis.cpu, save→axis.save,
 *   search→axis.search, history→axis.history, map→axis.gridMap,
 *   undo→axis.undoRedo, account→axis.account, conn→axis.connection,
 *   param→axis.paramControl, gridmode→axis.gridMode, blocksize→axis.blockSize,
 *   fcdevice→axis.fcDevice, fclayouts→axis.fcLayouts, fcswitch→axis.fcSwitchView.
 */
export const AXIS_WIDGET_EST_WIDTHS: Record<string, number> = {
  'axis.preset': 250,
  'axis.scenes': 240,
  'axis.view': 170,
  'axis.addBlock': 132,
  'axis.tuner': 78,
  'axis.tempo': 82,
  'axis.cpu': 124,
  'axis.save': 98,
  'axis.search': 168,
  'axis.history': 44,
  'axis.gridMap': 98,
  'axis.undoRedo': 80,
  'axis.account': 44,
  'axis.connection': 124,
  'axis.paramControl': 128,
  'axis.gridMode': 184,
  'axis.blockSize': 132,
  'axis.fcDevice': 150,
  'axis.fcLayouts': 210,
  'axis.fcSwitchView': 220,
  // Axis-only widgets not present in the design estW table.
  'axis.logo': 44,
  'axis.meterToggle': 60,
  // `hint` is `flex:1` in the bottom bar — it flexes down, so keep its estW
  // small so it never forces the bottom zone to compact/mini on its own.
  'axis.hint': 40,
  'axis.legal': 98
};

/** Design fallback estW for unknown widget kinds. */
export const AXIS_WIDGET_EST_WIDTH_FALLBACK = 120;

/**
 * Keep-set: units that never shed into the `⋯` overflow chip (design:
 * `{preset:1, save:1}`).
 */
export const AXIS_WIDGET_KEEP_TYPES: ReadonlySet<string> = new Set(['axis.preset', 'axis.save']);

export function axisWidgetEstWidth(type: string): number {
  // `param:*` design key collapses to a single `param` estW; Axis uses one
  // `axis.paramControl` type for every pinned parameter, so the map covers it.
  return AXIS_WIDGET_EST_WIDTHS[type] ?? AXIS_WIDGET_EST_WIDTH_FALLBACK;
}

export function axisWidgetIsKeep(type: string): boolean {
  return AXIS_WIDGET_KEEP_TYPES.has(type);
}

/** Sum of member estW for a widget/group unit. */
export function axisUnitEstWidth(widgets: readonly Pick<WidgetInstance, 'type'>[]): number {
  return widgets.reduce((total, widget) => total + axisWidgetEstWidth(widget.type), 0);
}

/** A unit is keep-protected if any member is in the keep-set. */
export function axisUnitIsKeep(widgets: readonly Pick<WidgetInstance, 'type'>[]): boolean {
  return widgets.some((widget) => axisWidgetIsKeep(widget.type));
}
