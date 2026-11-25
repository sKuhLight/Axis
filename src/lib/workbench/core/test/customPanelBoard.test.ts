import { describe, expect, it } from 'vitest';
import {
  PANEL_DEFAULT_COLS,
  PANEL_MAX_COLS,
  controlAtCell,
  layoutPanelBoard,
  panelColsFor,
  sortPanelWidgets,
  type PanelWidgetRef
} from '../customPanelBoard';

const w = (id: string, blockKey: string, blockLabel: string, order: number): PanelWidgetRef => ({ id, blockKey, blockLabel, order });

/** One block holding `n` controls, so width / height rules can be checked without dividers in between. */
const oneBlock = (n: number): PanelWidgetRef[] => Array.from({ length: n }, (_, i) => w(`w${i}`, 'amp', 'Amp 1', i));

describe('custom panel board', () => {
  it('lays one control out 4 cells wide and 2 rows high', () => {
    const board = layoutPanelBoard({ widgets: oneBlock(1), groupByBlock: false });
    expect(board.cols).toBe(PANEL_DEFAULT_COLS);
    expect(board.rows).toBe(2);
    expect(board.items).toEqual([{ id: 'ctl:w0', x: 0, y: 0, w: 2, h: 2, kind: 'control', widgetId: 'w0' }]);
  });

  it('puts a second control beside the first', () => {
    const board = layoutPanelBoard({ widgets: oneBlock(2), groupByBlock: false });
    expect([board.cols, board.rows]).toEqual([4, 2]);
    expect(board.items.map((item) => [item.x, item.y])).toEqual([[0, 0], [2, 0]]);
  });

  it('starts a new row for the third control at the default width', () => {
    const board = layoutPanelBoard({ widgets: oneBlock(3), groupByBlock: false });
    expect([board.cols, board.rows]).toEqual([4, 4]);
    expect(board.items.map((item) => [item.x, item.y])).toEqual([[0, 0], [2, 0], [0, 2]]);
  });

  it('grows one knob column for the fifth control instead of a third row', () => {
    const board = layoutPanelBoard({ widgets: oneBlock(5), groupByBlock: false });
    expect([board.cols, board.rows]).toEqual([6, 4]);
    expect(board.items.map((item) => [item.x, item.y])).toEqual([[0, 0], [2, 0], [4, 0], [0, 2], [2, 2]]);
  });

  it('widens again at seven controls and stops at four knobs a row', () => {
    expect([panelColsFor(7), panelColsFor(8), panelColsFor(9), panelColsFor(40)]).toEqual([8, 8, 8, PANEL_MAX_COLS]);
    const board = layoutPanelBoard({ widgets: oneBlock(9), groupByBlock: false });
    expect([board.cols, board.rows]).toEqual([8, 6]);
  });

  it('heads every block with a labelled divider that takes no cell', () => {
    const board = layoutPanelBoard({
      widgets: [w('a1', 'drive', 'Drive 1', 0), w('b1', 'amp', 'Amp 1', 0), w('a2', 'drive', 'Drive 1', 1)],
      groupByBlock: true
    });
    const dividers = board.items.filter((item) => item.kind === 'divider');
    expect(dividers).toEqual([
      { id: 'div:amp', x: 0, y: 0, w: board.cols, h: 0, kind: 'divider', label: 'Amp 1' },
      { id: 'div:drive', x: 0, y: 2, w: board.cols, h: 0, kind: 'divider', label: 'Drive 1' }
    ]);
    // Blocks sorted by label: Amp 1 first, then Drive 1; each block starts on a fresh row.
    expect(board.items.filter((item) => item.kind === 'control').map((item) => item.widgetId)).toEqual(['b1', 'a1', 'a2']);
  });

  it('gives a block with one control its divider too', () => {
    const board = layoutPanelBoard({ widgets: [w('only', 'cab', 'Cabinet', 0)], groupByBlock: true });
    expect(board.items[0]).toMatchObject({ kind: 'divider', label: 'Cabinet', h: 0 });
    expect(board.items[1]).toMatchObject({ kind: 'control', widgetId: 'only', y: 0 });
  });

  it('drops the dividers when grouping is off, keeping the widget order', () => {
    const widgets = [w('a1', 'drive', 'Drive 1', 1), w('b1', 'amp', 'Amp 1', 0)];
    const board = layoutPanelBoard({ widgets, groupByBlock: false });
    expect(board.items.every((item) => item.kind === 'control')).toBe(true);
    expect(board.items.map((item) => item.widgetId)).toEqual(['b1', 'a1']);
  });

  it('is deterministic and idempotent', () => {
    const input = { widgets: [w('a', 'drive', 'Drive 1', 1), w('b', 'amp', 'Amp 1', 0), w('c', 'amp', 'Amp 1', 1)], groupByBlock: true };
    const first = layoutPanelBoard(input);
    expect(layoutPanelBoard(input)).toEqual(first);
    expect(layoutPanelBoard({ ...input, widgets: input.widgets.slice().reverse() })).toEqual(first);
  });

  it('sorts by block label, then order, and by order alone when grouping is off', () => {
    const widgets = [w('d', 'z', 'Zebra', 2), w('a', 'm', 'Amp', 3), w('b', 'm', 'Amp', 1)];
    expect(sortPanelWidgets(widgets, true).map((item) => item.id)).toEqual(['b', 'a', 'd']);
    expect(sortPanelWidgets(widgets, false).map((item) => item.id)).toEqual(['b', 'd', 'a']);
    expect(widgets.map((item) => item.id)).toEqual(['d', 'a', 'b']);
  });

  it('maps a pointer to the control under it, else the nearest one', () => {
    const board = layoutPanelBoard({ widgets: oneBlock(3), groupByBlock: false });
    expect(controlAtCell(board, 2, 0)?.widgetId).toBe('w1');
    expect(controlAtCell(board, 1, 3)?.widgetId).toBe('w2');
    expect(controlAtCell({ cols: 4, rows: 2, items: [] }, 0, 0)).toBeNull();
  });

  it('keeps an empty board at the default width', () => {
    const board = layoutPanelBoard({ widgets: [], groupByBlock: true });
    expect(board).toEqual({ cols: 4, rows: 2, items: [] });
  });
});
