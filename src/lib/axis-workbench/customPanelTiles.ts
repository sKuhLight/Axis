// Custom-panel tiles: what a widget contributes to the panel's board.
//
// A panel's body is a cell grid (workbench/core/customPanelBoard) whose tiles are Block Editor controls. This
// module only reads the generic widget record — the block a bound parameter belongs to (the group), the
// parameter's label and the panel's own options. Pure, so it is unit-tested in node.

import type { JsonObject, WidgetInstance } from '../workbench';

/** A widget placed on the panel board. */
export interface CustomPanelTileInfo {
  widgetId: string;
  /** Bound block + parameter (absent for widget types that are not parameter controls). */
  effectId?: number;
  paramId?: number;
  label: string;
  /** The block a quick control belongs to: the group's name and its stable key. */
  blockLabel: string;
  blockKey: string;
  /** The block's accent colour, when the parameter source carried one. */
  color?: string;
  /** Not a parameter control (a tuner widget, a user divider, …). */
  foreign: boolean;
}

function readString(source: JsonObject | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumber(source: JsonObject | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** The panel's grouping option: on unless it was switched off (the default for a fresh panel). */
export function customPanelGrouping(state: JsonObject | undefined): boolean {
  return state?.groupByBlock !== false;
}

/** The panel's auto-sort option (re-sort by block whenever grouping is on): on by default. */
export function customPanelAutoSort(state: JsonObject | undefined): boolean {
  return state?.autoSort !== false;
}

export const PANEL_FOREIGN_BLOCK_KEY = 'widgets';

/** Read one widget as a board tile. */
export function customPanelTileInfo(widget: WidgetInstance): CustomPanelTileInfo {
  const target = widget.binding?.target ?? {};
  const effectId = readNumber(target, 'effectId', 'eid');
  const paramId = readNumber(target, 'paramId', 'pid');
  const isParam = widget.type === 'axis.paramControl';
  const blockLabel = readString(target, 'block') ?? readString(target, 'blockLabel') ?? readString(target, 'family') ?? readString(widget.state, 'block') ?? '';
  const label = readString(target, 'param') ?? readString(target, 'label') ?? readString(target, 'paramLabel') ?? readString(widget.state, 'label') ?? '';
  if (!isParam) {
    return {
      widgetId: widget.id,
      label: label || widget.type,
      blockLabel: 'Widgets',
      blockKey: PANEL_FOREIGN_BLOCK_KEY,
      color: readString(widget.state, 'color'),
      foreign: true
    };
  }
  const block = blockLabel || 'Block';
  return {
    widgetId: widget.id,
    effectId,
    paramId,
    label: label || 'Parameter',
    blockLabel: block,
    blockKey: block.toLowerCase(),
    color: readString(widget.state, 'color') ?? readString(target, 'color'),
    foreign: false
  };
}

/** Every visible widget of a panel zone, in zone order. */
export function customPanelTiles(widgets: readonly WidgetInstance[]): CustomPanelTileInfo[] {
  return widgets.map(customPanelTileInfo);
}
