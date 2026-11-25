// Custom-panel board: the raster a custom panel lays its widgets out on.
//
// Same geometry as the Block Editor's cell grid (one knob = 2×2 cells, a divider is a LINE in the grid gap),
// but the panel owns the layout: the axes are fixed, the width grows one knob column at a time and the
// height follows the controls. Pure — no DOM, no Svelte, no app imports (the panel component converts the
// result into `BeItem`s and the Block Editor's tiles).

/** Cells a panel is wide by default: two knobs a row. */
export const PANEL_DEFAULT_COLS = 4;
/** A knob's footprint in cells (Block Editor `BE_SPEC.knob`). */
export const PANEL_CONTROL_COLS = 2;
export const PANEL_CONTROL_ROWS = 2;
/** Widest the panel grows on its own: four knobs a row. */
export const PANEL_MAX_COLS = 8;
/** Knob rows the default width holds before the panel grows a knob column instead of another row. */
export const PANEL_DEFAULT_ROWS = 2;

export interface PanelBoardItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'control' | 'divider';
  /** Divider label (the group's block name). */
  label?: string;
  /** The widget this tile belongs to (`kind: 'control'`). */
  widgetId?: string;
}

export interface PanelBoard {
  /** Width in cells. */
  cols: number;
  /** Height in cells (always a multiple of the control height). */
  rows: number;
  items: PanelBoardItem[];
}

/** What a widget contributes to the layout: its block (the group) and its order in it. */
export interface PanelWidgetRef {
  id: string;
  blockKey: string;
  blockLabel: string;
  order: number;
}

export interface PanelBoardInput {
  widgets: readonly PanelWidgetRef[];
  /** Group by block: one labelled divider per block, controls sorted by block then order. */
  groupByBlock: boolean;
}

/** Deterministic label comparison (locale-independent, so stored layouts and tests agree everywhere). */
function labelCmp(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The widgets in board order. Grouping on: by block label, then the control's order, then id. Grouping off:
 * plain order (the last manual order), then id. Never mutates the input.
 */
export function sortPanelWidgets<T extends PanelWidgetRef>(widgets: readonly T[], groupByBlock: boolean): T[] {
  const byOrder = (a: T, b: T): number => a.order - b.order || a.id.localeCompare(b.id);
  return widgets.slice().sort(groupByBlock ? (a, b) => labelCmp(a.blockLabel, b.blockLabel) || labelCmp(a.blockKey, b.blockKey) || byOrder(a, b) : byOrder);
}

/** The width the panel takes for `count` controls: 4 cells, one knob column wider per row beyond the two
 *  the default width holds, up to four knobs a row. */
export function panelColsFor(count: number): number {
  let cols = PANEL_DEFAULT_COLS;
  while (cols < PANEL_MAX_COLS && count > (cols / PANEL_CONTROL_COLS) * PANEL_DEFAULT_ROWS) cols += PANEL_CONTROL_COLS;
  return cols;
}

/**
 * Lay the widgets out on the panel raster.
 *
 * - A control is 2×2 cells; two per row at the default width.
 * - The width grows one knob column at a time instead of stacking a third knob row: five controls make a
 *   six-cell panel, seven an eight-cell one. Past four knobs a row the panel grows in height.
 * - Grouping on: blocks sorted by label, one labelled divider (`h = 0`, a line in the grid gap) heads each
 *   block, and every block starts on a fresh row. A block with a single control still gets its divider.
 * - Deterministic and idempotent: the same input always yields the same board.
 */
export function layoutPanelBoard(input: PanelBoardInput): PanelBoard {
  const widgets = sortPanelWidgets(input.widgets, input.groupByBlock);
  const cols = panelColsFor(widgets.length);
  const perRow = cols / PANEL_CONTROL_COLS;
  const items: PanelBoardItem[] = [];
  let row = 0;
  let col = 0;

  const newline = (): void => {
    row += PANEL_CONTROL_ROWS;
    col = 0;
  };
  const place = (widget: PanelWidgetRef): void => {
    items.push({
      id: `ctl:${widget.id}`,
      x: col * PANEL_CONTROL_COLS,
      y: row,
      w: PANEL_CONTROL_COLS,
      h: PANEL_CONTROL_ROWS,
      kind: 'control',
      widgetId: widget.id
    });
    col += 1;
    if (col >= perRow) newline();
  };

  if (input.groupByBlock) {
    let index = 0;
    while (index < widgets.length) {
      const blockKey = widgets[index]!.blockKey;
      const blockLabel = widgets[index]!.blockLabel;
      if (col > 0) newline();
      // The divider sits ON the line above the block's first row (a line takes no cell).
      items.push({ id: `div:${blockKey}`, x: 0, y: row, w: cols, h: 0, kind: 'divider', label: blockLabel });
      while (index < widgets.length && widgets[index]!.blockKey === blockKey) {
        place(widgets[index]!);
        index++;
      }
    }
  } else {
    for (const widget of widgets) place(widget);
  }

  const usedRows = items.reduce((n, item) => Math.max(n, item.y + item.h), 0);
  return { cols, rows: Math.max(PANEL_CONTROL_ROWS, usedRows), items };
}

/** The item a pointer at cell (x, y) would land on: the control covering it, else the nearest control in
 *  reading order (dividers are never drop targets). Null for an empty board. */
export function controlAtCell(board: PanelBoard, x: number, y: number): PanelBoardItem | null {
  const controls = board.items.filter((item) => item.kind === 'control');
  if (!controls.length) return null;
  for (const item of controls) {
    if (x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h) return item;
  }
  let best: PanelBoardItem | null = null;
  let bestD = Infinity;
  for (const item of controls) {
    const dx = item.x + item.w / 2 - x;
    const dy = item.y + item.h / 2 - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}
