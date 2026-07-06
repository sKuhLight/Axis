import { describe, expect, it } from 'vitest';
import type { WidgetInstance } from '../../workbench';
import {
  AXIS_BLOCK_TILE_PX,
  axisGridViewFromWidgets,
  cycleAxisBlockSize,
  readAxisBlockSize,
  readAxisGridMode,
  stepAxisBlockSize
} from '../gridView';

const widget = (type: string, zone = 'gridbar', state?: Record<string, string>): WidgetInstance => ({
  id: `widget.${type}`,
  type,
  zone,
  order: 0,
  size: 'default',
  state
});

describe('gridView helpers', () => {
  it('reads modes and sizes defensively', () => {
    expect(readAxisGridMode('full')).toBe('full');
    expect(readAxisGridMode('map')).toBe('auto');
    expect(readAxisGridMode(undefined)).toBe('auto');
    expect(readAxisBlockSize('S')).toBe('S');
    expect(readAxisBlockSize('XL')).toBe('M');
    expect(readAxisBlockSize(undefined)).toBe('M');
  });

  it('steps sizes with clamping and cycles with wrap', () => {
    expect(stepAxisBlockSize('M', 1)).toBe('L');
    expect(stepAxisBlockSize('L', 1)).toBe('L');
    expect(stepAxisBlockSize('S', -1)).toBe('S');
    expect(cycleAxisBlockSize('S')).toBe('M');
    expect(cycleAxisBlockSize('L')).toBe('S');
  });

  it('derives the view from placed widgets', () => {
    const view = axisGridViewFromWidgets([
      widget('axis.gridMode', 'gridbar', { mode: 'full' }),
      widget('axis.blockSize', 'gridbar', { size: 'S' })
    ]);
    expect(view).toEqual({ mode: 'full', tilePx: AXIS_BLOCK_TILE_PX.S });
  });

  it('defaults missing state and ignores hidden widgets', () => {
    expect(axisGridViewFromWidgets([widget('axis.gridMode')])).toEqual({ mode: 'auto', tilePx: AXIS_BLOCK_TILE_PX.M });
    expect(axisGridViewFromWidgets([widget('axis.gridMode', 'hidden'), widget('axis.blockSize', 'hidden')])).toBeNull();
    expect(axisGridViewFromWidgets([])).toBeNull();
  });
});
