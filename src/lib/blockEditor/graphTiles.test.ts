// Graph tiles (AXIS-89) on the board: catalog entries, the `graph` view and its sizes, seeding from keyed
// layout graph slots (the EQ rule first, the cross-block guard first of all), no graph on "More" or on a
// curated board, the phone re-wrap (one full-width row), persistence keeping graph keys, Find.
import { describe, expect, it } from 'vitest';
import { resolveControl } from '../deviceLayoutBoard';
import type { BlockVisual, DeviceLayout, LayoutControl } from '../types';
import { BE_PRESETS, BE_SPEC, defaultViewForKey, isBlockLevelKey, normalizeBoard, phoneWrap, type BeItem } from './boardModel';
import { buildCatalog, GRAPH_ID_BASE } from './catalog';
import { VIEW_NAME } from './controlMenu';
import { buildCuratedBoardV2, buildDeviceLayoutBoardV2 } from './deviceLayoutBoardV2';
import { findGroups, flatMatches, KIND_NAME } from './findControls';

const visuals: BlockVisual[] = [
  { key: 'dynamics', kind: 'dynamics', title: 'Compressor curve', mode: 'compressor', roles: { threshold: 0, ratio: 1 } },
  { key: 'lfo', kind: 'lfo', title: 'LFO', mode: 'mod', roles: { rate: 2 } }
];
const cat = buildCatalog({ params: [0, 1, 2].map((id) => ({ id, name: `P${id}` })), enums: [], eqBandCount: 0, visuals });
const byKey = new Map(cat.map((c) => [c.key, c]));
const k = (id: number): LayoutControl => ({ label: `P${id}`, paramName: `P${id}`, paramId: id, widget: 'knob', rawWidget: 'knob' });
const slot = (graphKey?: string, extra: Partial<LayoutControl> = {}): LayoutControl => ({
  label: '',
  paramName: null,
  paramId: null,
  widget: 'graph',
  rawWidget: 'graph',
  ...(graphKey ? { graphKey } : {}),
  ...extra
});
const layout = (controls: LayoutControl[], extra: Partial<DeviceLayout> = {}): DeviceLayout => ({ family: 'COMP', pages: [{ name: 'Basic', rows: [{ controls }] }], ...extra });
const keysOf = (items: readonly BeItem[] | undefined) => (items ?? []).flatMap((i) => ('key' in i ? [i.key] : []));

describe('catalog', () => {
  it('one read-only entry per served visual: graph:<key>, kind/view graph, ids −10, −11, after the EQ', () => {
    const withEq = buildCatalog({ params: [{ id: 0, name: 'P0' }], enums: [], eqBandCount: 5, visuals });
    expect(withEq.map((c) => c.key).slice(0, 3)).toEqual(['eq', 'graph:dynamics', 'graph:lfo']);
    const g = byKey.get('graph:lfo')!;
    expect(g).toMatchObject({ kind: 'graph', view: 'graph', views: ['graph'], id: GRAPH_ID_BASE - 1, label: 'LFO', w: 8, h: 4 });
    expect(g.visual).toEqual(visuals[1]);
    expect(buildCatalog({ params: [], enums: [] }).some((c) => c.kind === 'graph')).toBe(false);
  });
});

describe('board model', () => {
  it('graph view: size 8×4 (min 4×3, max 24×8), presets S 6×3 / M 8×4 / L 12×6', () => {
    expect(BE_SPEC.graph).toEqual({ w: 8, h: 4, minW: 4, maxW: 24, minH: 3, maxH: 8 });
    expect(BE_PRESETS.graph.map((p) => `${p.label}${p.w}x${p.h}`)).toEqual(['S6x3', 'M8x4', 'L12x6']);
    expect(defaultViewForKey('graph:echo')).toBe('graph');
    expect(VIEW_NAME.graph).toBe('Graph');
  });
  it('graph keys are block-level: kept by persistence while a read has not brought them back', () => {
    expect(isBlockLevelKey('graph:lfo1')).toBe(true);
    expect(isBlockLevelKey('meter')).toBe(true);
    expect(isBlockLevelKey('graph:')).toBe(false);
    expect(isBlockLevelKey('k3')).toBe(false);
    const b = { v: 2 as const, pageOrder: ['P'], page: 'P', boards: { P: [{ id: 'g', key: 'graph:echo', view: 'graph' as const, x: 0, y: 0, w: 8, h: 4 }] } };
    expect(keysOf(normalizeBoard(b, ['k0'], { keepKeys: isBlockLevelKey }).boards.P)).toEqual(['graph:echo']);
    expect(keysOf(normalizeBoard(b, ['k0']).boards.P)).toEqual([]);
  });
  it('phone: a graph is one full-width row whatever its board width', () => {
    const items: BeItem[] = [
      { id: 'a', key: 'k0', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'g', key: 'graph:lfo', view: 'graph', x: 2, y: 0, w: 6, h: 3 }
    ];
    const r = phoneWrap(items, 8);
    expect(r.pos.g).toMatchObject({ w: 8, x: 0 });
    expect(r.pos.g!.y).toBeGreaterThanOrEqual(2); // not beside the knob
  });
});

describe('seeding from layout graph slots', () => {
  it('a keyed slot whose visual is served becomes that graph tile', () => {
    expect(resolveControl(slot('dynamics'), byKey)).toEqual({ key: 'graph:dynamics', view: 'graph' });
  });
  it('an unserved key, an unkeyed slot → gap; the EQ graph rule stays first', () => {
    expect(resolveControl(slot('decay'), byKey)).toBe('gap');
    expect(resolveControl(slot(), byKey)).toBe('gap');
    const eqCat = new Map(buildCatalog({ params: [], enums: [], eqBandCount: 5, visuals }).map((c) => [c.key, c]));
    expect(resolveControl(slot('dynamics'), eqCat)).toEqual({ key: 'eq', view: 'eq' });
  });
  it('a graph slot of another block never anchors (cross-block guard first)', () => {
    const foreign = slot('dynamics', { crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: null, paramId: null } });
    expect(resolveControl(foreign, byKey, { family: 'COMP' })).toBe('gap');
  });
  it('the device board places the graph at its slot; unanchored graphs go to no page (not "More")', () => {
    const b = buildDeviceLayoutBoardV2(layout([k(0), slot('dynamics'), k(1)]), cat)!;
    const basic = b.boards.Basic!;
    expect(keysOf(basic)).toEqual(['k0', 'graph:dynamics', 'k1']);
    expect(basic.find((i) => 'key' in i && i.key === 'graph:dynamics')).toMatchObject({ view: 'graph', w: 8, h: 4 });
    const all = b.pageOrder.flatMap((p) => keysOf(b.boards[p]));
    expect(all).not.toContain('graph:lfo');
    expect(all).toContain('k2'); // ordinary params still go to More
  });
  it('a curated board (no layout) places no graph: the Arrange library offers them', () => {
    const b = buildCuratedBoardV2(cat, new Set([0]));
    expect(b.pageOrder.flatMap((p) => keysOf(b.boards[p])).some((key) => key.startsWith('graph:'))).toBe(false);
  });
});

describe('find + library', () => {
  it('graphs are listed under "Graphs · meters · actions", never in the flat results', () => {
    const other = findGroups(cat, null, '').find((g) => g.id === 'other')!;
    expect(other.rows.map((r) => r.key)).toEqual(expect.arrayContaining(['graph:dynamics', 'graph:lfo']));
    expect(KIND_NAME.graph).toBe('Graph');
    expect(flatMatches(cat, '').some((c) => c.kind === 'graph')).toBe(false);
  });
});
