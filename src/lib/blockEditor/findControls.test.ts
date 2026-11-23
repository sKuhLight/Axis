import { describe, expect, it } from 'vitest';
import type { BeBoard } from './boardModel';
import { buildCatalog } from './catalog';
import { findGroups, firstRow, flatMatches, itemIdOn, jumpPage, matchesQuery, pagesOf } from './findControls';

const catalog = buildCatalog({
  params: [
    { id: 0, name: 'Drive' },
    { id: 1, name: 'Bass' },
    { id: 2, name: 'Master Volume' }
  ],
  enums: [
    { id: 10, name: 'Bright', options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] },
    { id: 11, name: 'Input Select', options: [{ value: 0, label: 'L' }, { value: 1, label: 'R' }, { value: 2, label: 'Sum' }] }
  ],
  eqBandCount: 3,
  eqTitle: 'Parametric EQ',
  monitors: [{ role: 'level' }]
});

const board: BeBoard = {
  v: 2,
  pageOrder: ['Main', 'Tone', 'Empty'],
  page: 'Tone',
  boards: {
    Main: [
      { id: 'a', key: 'k0', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'b', key: 'k1', view: 'knob', x: 2, y: 0, w: 2, h: 2 },
      { id: 'd', kind: 'hdiv', x: 0, y: 2, w: 6, h: 1 }
    ],
    Tone: [
      { id: 'c', key: 'k1', view: 'fader', x: 0, y: 0, w: 1, h: 4 },
      { id: 'e', key: 'e10', view: 'switch', x: 2, y: 0, w: 2, h: 2 }
    ],
    Empty: []
  }
};

describe('pagesOf / jumpPage / itemIdOn', () => {
  it('lists the pages a key is on, in page order', () => {
    expect(pagesOf(board, 'k1')).toEqual(['Main', 'Tone']);
    expect(pagesOf(board, 'k2')).toEqual([]);
    expect(pagesOf(null, 'k1')).toEqual([]);
  });
  it('jumps to the current page when the control is there, else its first page', () => {
    expect(jumpPage(board, 'k1')).toBe('Tone');
    expect(jumpPage(board, 'k0')).toBe('Main');
    expect(jumpPage(board, 'k1', 'Main')).toBe('Main');
    expect(jumpPage(board, 'k0', 'Tone')).toBe('Main');
    expect(jumpPage(board, 'k2')).toBeNull();
  });
  it('finds the tile id of a key on a page', () => {
    expect(itemIdOn(board, 'Tone', 'k1')).toBe('c');
    expect(itemIdOn(board, 'Empty', 'k1')).toBeNull();
  });
});

describe('findGroups', () => {
  it('groups every control by kind, in catalog order, with its pages', () => {
    const g = findGroups(catalog, board, '');
    expect(g.map((x) => x.id)).toEqual(['cont', 'toggle', 'select', 'other']);
    expect(g[0]!.rows.map((r) => r.label)).toEqual(['Drive', 'Bass', 'Master Volume']);
    expect(g[0]!.rows[1]).toEqual({ key: 'k1', label: 'Bass', kind: 'cont', pages: ['Main', 'Tone'], onCurrent: true, pinnable: true });
    expect(g[3]!.rows.map((r) => r.key)).toEqual(['eq', 'bypass', 'meter']);
    expect(g[3]!.rows.every((r) => !r.pinnable)).toBe(true);
    expect(firstRow(g)?.key).toBe('k0');
  });
  it('filters by a case-insensitive query and by "unused"', () => {
    expect(findGroups(catalog, board, 'VOL').flatMap((x) => x.rows.map((r) => r.key))).toEqual(['k2']);
    expect(findGroups(catalog, board, '', 'unused').flatMap((x) => x.rows.map((r) => r.key))).toEqual(['k2', 'e11', 'eq', 'bypass', 'meter']);
    expect(findGroups(catalog, board, 'zzz')).toEqual([]);
    expect(firstRow([])).toBeNull();
    expect(matchesQuery('Master Volume', '  master ')).toBe(true);
  });
});

describe('flatMatches', () => {
  it('lists every matching control except the EQ graph; an empty query lists all', () => {
    expect(flatMatches(catalog, 'b').map((c) => c.key)).toEqual(['k1', 'e10', 'bypass']);
    expect(flatMatches(catalog, '').some((c) => c.key === 'eq')).toBe(false);
    expect(flatMatches(catalog, '').length).toBe(catalog.length - 1);
  });
  it('carries the Unused filter of the popover', () => {
    expect(flatMatches(catalog, '', 'unused', board).map((c) => c.key)).toEqual(['k2', 'e11', 'bypass', 'meter']);
    expect(flatMatches(catalog, 'b', 'unused', board).map((c) => c.key)).toEqual(['bypass']);
    expect(flatMatches(catalog, 'b', 'all', board).map((c) => c.key)).toEqual(['k1', 'e10', 'bypass']);
  });
});
