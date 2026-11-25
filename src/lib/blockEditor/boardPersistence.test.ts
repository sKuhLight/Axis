import { describe, it, expect } from 'vitest';
import {
  boardDiffersFromSeed,
  boardKey,
  carryLegacyBoards,
  clearUserSeed,
  DEFAULT_PREFS,
  DEVICE_CLASSES,
  deviceClassFrom,
  fixedDiffersFromSeed,
  hasUserSeed,
  isFamilyMigrated,
  legacyBoardKey,
  markFamilyMigrated,
  legacyMetaKey,
  legacySingleKey,
  loadBoard,
  loadMeta,
  loadSeed,
  metaKey,
  pageDiffersFromSeed,
  prefsFor,
  saveBoard,
  saveMeta,
  saveUserSeed,
  seedKey,
  withPrefs,
  type KeyValueStore
} from './boardPersistence';
import { FIXED_PAGE, moveToPage, normalizeBoard, type BeBoard, type BeFixedArea } from './boardModel';
import { builtInSeed, previousSeeds } from './boardSeeds';
import { buildCatalog } from './catalog';
import { buildCuratedBoardV2, buildDeviceLayoutBoardV2 } from './deviceLayoutBoardV2';
import { layoutVariantSig } from '../deviceLayoutBoard';
import type { DeviceLayout } from '../types';

const memory = (init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string>; writes: string[] } => {
  const data = { ...init };
  const writes: string[] = [];
  return {
    data,
    writes,
    get: (k) => data[k] ?? null,
    set: (k, v) => {
      data[k] = v;
      writes.push(k);
    }
  };
};

const keys = ['k1', 'k2', 'k3'];
const mk = (tag: string, sig?: string): BeBoard => ({
  v: 2,
  pageOrder: [tag],
  page: tag,
  boards: { [tag]: [{ id: `i${tag}`, key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }] },
  ...(sig != null ? { variantSig: sig } : {})
});
const seed = mk('Seed', 'v1sig');
const v1 = (tag: string, sig?: string): string =>
  JSON.stringify({ pageOrder: [tag], page: tag, boards: { [tag]: [{ id: 'w', key: 'k2', x: 1, y: 0, w: 1, h: 1, view: 'knob' }] }, ...(sig ? { variantSig: sig } : {}) });
const base = { slug: 'amp', catalogKeys: keys, seed };

describe('deviceClassFrom', () => {
  it('prefers the workbench breakpoint, else the viewport', () => {
    expect(deviceClassFrom({ workbenchBreakpoint: 'tablet', viewportWidth: 2000 })).toBe('tablet');
    expect(deviceClassFrom({ workbenchBreakpoint: 'phone', viewportWidth: 2000 })).toBe('phone');
    expect(deviceClassFrom({ viewportWidth: 759 })).toBe('phone');
    expect(deviceClassFrom({ viewportWidth: 760 })).toBe('desktop');
    expect(deviceClassFrom({ workbenchBreakpoint: 'weird', viewportWidth: 1024 })).toBe('desktop');
  });
  it('inside the workbench a profile without a breakpoint is desktop, whatever the viewport', () => {
    expect(deviceClassFrom({ inWorkbench: true, workbenchBreakpoint: null, viewportWidth: 390 })).toBe('desktop');
    expect(deviceClassFrom({ inWorkbench: true, viewportWidth: 390 })).toBe('desktop');
    // a phone profile at a desktop window size (e.g. a large UI scale, or a pinned preview) is a phone
    expect(deviceClassFrom({ inWorkbench: true, workbenchBreakpoint: 'phone', viewportWidth: 1366 })).toBe('phone');
  });
});

describe('keys', () => {
  it('follow the documented scheme', () => {
    expect(boardKey('amp', 'Default', 'tablet')).toBe('axs.be1.amp.Default.tablet');
    expect(metaKey('amp')).toBe('axs.be1meta.amp');
    expect(seedKey('amp')).toBe('axs.be1seed.amp');
    expect(legacyBoardKey('amp', 'Mine')).toBe('axs.surface3.amp.Mine');
    expect(legacySingleKey('amp')).toBe('axs.surface2.amp');
  });
});

describe('loadBoard fallback chain', () => {
  it('own class key first', () => {
    const st = memory({
      [boardKey('amp', 'Mine', 'tablet')]: JSON.stringify(mk('Own')),
      [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(mk('Desk'))
    });
    const r = loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'tablet' });
    expect(r.source).toBe('own');
    expect(r.board.pageOrder).toEqual(['Own']);
  });

  it('then the desktop key', () => {
    const st = memory({ [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(mk('Desk')), [legacyBoardKey('amp', 'Mine')]: v1('Legacy') });
    const r = loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'phone' });
    expect(r.source).toBe('desktop');
    expect(r.board.pageOrder).toEqual(['Desk']);
  });

  it('then the previous editor key, migrated to v2', () => {
    const st = memory({ [legacyBoardKey('amp', 'Mine')]: v1('Legacy') });
    const r = loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'tablet' });
    expect(r.source).toBe('legacy');
    expect(r.board.v).toBe(2);
    expect(r.board.boards.Legacy).toEqual([{ id: 'w', key: 'k2', view: 'knob', x: 2, y: 0, w: 2, h: 2 }]);
    expect(st.data[legacyBoardKey('amp', 'Mine')]).toBeDefined(); // never deleted
    expect(st.writes).toEqual([]); // loading never writes
  });

  it('then (Default only) the pre-profile key, from its own storage', () => {
    const st = memory();
    const legacy = memory({ [legacySingleKey('amp')]: v1('Old') });
    const r = loadBoard({ ...base, seed: mk('Seed'), storage: st, legacyStorage: legacy, profile: 'Default', deviceClass: 'desktop' });
    expect(r.source).toBe('legacy-single');
    const other = loadBoard({ ...base, seed: mk('Seed'), storage: st, legacyStorage: legacy, profile: 'Mine', deviceClass: 'desktop' });
    expect(other.source).toBe('seed');
  });

  it('then the user family seed, then the provided seed', () => {
    const st = memory({ [seedKey('amp')]: JSON.stringify(mk('UserSeed')) });
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'tablet' })).toMatchObject({ source: 'user-seed' });
    // the Blank profile ignores the user seed
    const blank = loadBoard({ ...base, seed: mk('Empty'), storage: st, profile: 'Blank', deviceClass: 'tablet' });
    expect(blank.source).toBe('seed');
    expect(blank.board.pageOrder).toEqual(['Empty']);
    expect(loadBoard({ ...base, storage: memory(), profile: 'Default', deviceClass: 'desktop' })).toMatchObject({ source: 'seed' });
  });

  it('a Default board from the user seed adopts the current variant (so it survives a save)', () => {
    const st = memory({ [seedKey('amp')]: JSON.stringify(mk('UserSeed')) });
    const r = loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'desktop' });
    expect(r.board.variantSig).toBe('v1sig');
    saveBoard({ storage: st, slug: 'amp', profile: 'Default', deviceClass: 'desktop', board: { ...r.board, page: 'UserSeed' } });
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'desktop' }).source).toBe('desktop');
  });

  it('skips unreadable entries and keeps walking', () => {
    const st = memory({ [boardKey('amp', 'Mine', 'tablet')]: '{broken', [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(mk('Desk')) });
    expect(loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'tablet' }).source).toBe('desktop');
    const throwing: KeyValueStore = {
      get: () => {
        throw new Error('quota');
      },
      set: () => {}
    };
    expect(loadBoard({ ...base, storage: throwing, profile: 'Mine', deviceClass: 'tablet' }).source).toBe('seed');
  });

  it('normalizes what it loads against the catalog', () => {
    const stored: BeBoard = { ...mk('Desk'), boards: { Desk: [{ id: 'g', key: 'gone', view: 'knob', x: 0, y: 0, w: 2, h: 2 }] } };
    const r = loadBoard({ ...base, storage: memory({ [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(stored) }), profile: 'Mine', deviceClass: 'desktop' });
    expect(r.board.boards.Desk).toEqual([]);
  });
});

describe('variantSig re-seed rule', () => {
  it('Default ignores stored boards seeded from another variant', () => {
    const st = memory({
      [boardKey('amp', 'Default', 'tablet')]: JSON.stringify(mk('OwnStale', 'old')),
      [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(mk('DeskStale', 'old')),
      [legacyBoardKey('amp', 'Default')]: v1('LegacyStale', 'old'),
      [legacySingleKey('amp')]: v1('Older')
    });
    const r = loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'tablet' });
    expect(r.source).toBe('seed');
    expect(r.board.pageOrder).toEqual(['Seed']);
  });

  it('Default keeps a board seeded from the same variant', () => {
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(mk('Desk', 'v1sig')) });
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'desktop' }).source).toBe('desktop');
  });

  it('other profiles and an empty current variant keep any stored board', () => {
    const st = memory({
      [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(mk('Mine', 'old')),
      [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(mk('Desk', 'old'))
    });
    expect(loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'desktop' }).source).toBe('desktop');
    expect(loadBoard({ ...base, seed: mk('Seed'), storage: st, profile: 'Default', deviceClass: 'desktop' }).source).toBe('desktop');
    expect(loadBoard({ ...base, variantSig: '', storage: st, profile: 'Default', deviceClass: 'desktop' }).source).toBe('desktop');
  });
});

describe('device positions: the previous (rows-only) default', () => {
  // the device default as built now (positions, a section divider) and as earlier versions built it
  const cat = buildCatalog({ params: [0, 1, 2, 3].map((id) => ({ id, name: `P${id}` })), enums: [] });
  const ckeys = cat.map((c) => c.key);
  const at = (x: number, y: number) => ({ positionExact: `${x},${y}` });
  const k = (id: number, placement?: object) => ({ label: `P${id}`, paramName: `P${id}`, paramId: id, widget: 'knob' as const, rawWidget: 'knob', ...(placement ? { placement } : {}) });
  const layout: DeviceLayout = {
    family: 'AMP',
    variantName: 'Plexi',
    pages: [
      {
        name: 'Amp',
        rows: [
          // one knob line on a 92 px slot with an empty slot before the last knob
          { section: 'parameters', controls: [k(0, at(305, 50)), k(1, at(397, 50)), k(2, at(489, 50)), k(3, at(673, 50))] },
          { section: 'mixer', controls: [] }
        ]
      }
    ]
  };
  const now = buildDeviceLayoutBoardV2(layout, cat)!;
  const before = buildDeviceLayoutBoardV2(layout, cat, { rowFlowOnly: true })!;
  const input = (st: KeyValueStore, extra: object = {}) => ({ storage: st, slug: 'amp', profile: 'Default', deviceClass: 'desktop' as const, catalogKeys: ckeys, seed: now, previousSeed: before, ...extra });

  it('the two defaults differ (positions keep the empty slot, rows close it)', () => {
    expect(boardDiffersFromSeed(before, now)).toBe(true);
    expect(now.boards.Amp!.find((i) => 'key' in i && i.key === 'k3')).toMatchObject({ x: 8, y: 0 });
    expect(before.boards.Amp!.find((i) => 'key' in i && i.key === 'k3')).toMatchObject({ x: 6, y: 0 });
  });

  it('no stored board: the positioned default, unchanged (no dot)', () => {
    const st = memory();
    const r = loadBoard(input(st));
    expect(r.source).toBe('seed');
    expect(boardDiffersFromSeed(r.board, loadSeed(input(st)).board, new Set(ckeys))).toBe(false);
    expect(st.writes).toEqual([]);
  });

  it('a stored board that is still exactly the previous default follows the new one (page kept, nothing written)', () => {
    const stored = { ...before, page: 'Amp' };
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(stored) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('seed');
    expect(boardDiffersFromSeed(r.board, now)).toBe(false);
    expect(r.board.page).toBe('Amp');
    expect(st.writes).toEqual([]);
  });

  it('a stored board the user changed keeps its content', () => {
    const edited: BeBoard = { ...before, boards: { Amp: before.boards.Amp!.map((i) => ('key' in i && i.key === 'k3' ? { ...i, x: 20 } : i)) } };
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(edited) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('desktop');
    expect(r.board.boards.Amp!.find((i) => 'key' in i && i.key === 'k3')).toMatchObject({ x: 20 });
    expect(boardDiffersFromSeed(r.board, now)).toBe(true); // custom, as before
  });

  it('only for Default (never a copy), and only when the previous default really differs from the new one', () => {
    const st = memory({ [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(before) });
    expect(loadBoard(input(st, { profile: 'Mine' })).source).toBe('desktop');
    const same = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(now) });
    expect(loadBoard(input(same, { previousSeed: now })).source).toBe('desktop');
    expect(loadBoard(input(same, { previousSeed: null })).source).toBe('desktop');
  });

  it('not while the family has a saved "default for this type" (that one is the reference)', () => {
    const { variantSig: _sig, ...userSeed } = before;
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(before), [seedKey('amp')]: JSON.stringify(userSeed) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('desktop');
    expect(boardDiffersFromSeed(r.board, before)).toBe(false); // still the stored board
    expect(boardDiffersFromSeed(r.board, loadSeed(input(st)).board, new Set(ckeys))).toBe(false); // no dot either
  });

  it('not when the stored board holds a control the catalog does not list right now (a meter added by the user)', () => {
    const withMeter: BeBoard = { ...before, boards: { Amp: [...before.boards.Amp!, { id: 'm', key: 'meter', view: 'meter', x: 20, y: 0, w: 2, h: 4 }] } };
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(withMeter) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('desktop');
    expect(r.board.boards.Amp!.some((i) => 'key' in i && i.key === 'meter')).toBe(true);
  });

  it('the previous default is built only when a stored Default board has to be compared with it', () => {
    let built = 0;
    const lazy = () => (built++, before);
    loadBoard(input(memory(), { previousSeed: lazy }));
    expect(built).toBe(0); // nothing stored: the seed, nothing to compare
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(before) });
    expect(loadBoard(input(st, { previousSeed: lazy })).source).toBe('seed');
    expect(built).toBe(1);
  });
});

describe('graph displays: an untouched legacy Default picks up its anchored graph, a removed one stays gone (AXIS-89)', () => {
  const visuals = [{ key: 'dynamics', kind: 'dynamics' as const, title: 'Compressor curve', roles: { threshold: 0, ratio: 1 } }];
  const cat = buildCatalog({ params: [0, 1, 2].map((id) => ({ id, name: `P${id}` })), enums: [], visuals });
  const noGraphs = cat.filter((c) => c.kind !== 'graph');
  const ckeys = cat.map((c) => c.key);
  const k = (id: number) => ({ label: `P${id}`, paramName: `P${id}`, paramId: id, widget: 'knob' as const, rawWidget: 'knob' });
  const slot = { label: '', paramName: null, paramId: null, widget: 'graph' as const, rawWidget: 'graph', graphKey: 'dynamics' };
  const layout: DeviceLayout = { family: 'COMP', variantName: 'Studio', pages: [{ name: 'Basic', rows: [{ section: 'parameters', controls: [k(0), k(1), slot, k(2)] }] }] };
  const now = buildDeviceLayoutBoardV2(layout, cat)!;
  // the one previous default the surface passes: the legacy rows-only seed, built as before graphs existed
  const prevRows = buildDeviceLayoutBoardV2(layout, noGraphs, { rowFlowOnly: true, legacyUnguarded: true })!;
  const input = (st: KeyValueStore) => ({ storage: st, slug: 'comp', profile: 'Default', deviceClass: 'desktop' as const, catalogKeys: ckeys, seed: now, previousSeed: () => prevRows });
  const hasGraph = (b: BeBoard) => b.boards.Basic!.some((i) => 'key' in i && i.key === 'graph:dynamics');

  it('the seed has the graph at its slot; the legacy rows-only default does not', () => {
    expect(hasGraph(now)).toBe(true);
    expect(hasGraph(prevRows)).toBe(false);
  });

  it('a stored board still equal to the legacy rows-only default loads the current default (graph included, nothing written)', () => {
    const st = memory({ [boardKey('comp', 'Default', 'desktop')]: JSON.stringify(prevRows) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('seed');
    expect(hasGraph(r.board)).toBe(true);
    expect(st.writes).toEqual([]);
  });

  it('a graph the user removed stays removed: saved without it, it loads without it', () => {
    const st = memory();
    const removed: BeBoard = { ...now, boards: { ...now.boards, Basic: now.boards.Basic!.filter((i) => !('key' in i && i.key === 'graph:dynamics')) } };
    saveBoard({ storage: st, slug: 'comp', profile: 'Default', deviceClass: 'desktop', board: removed });
    const r = loadBoard(input(st));
    expect(r.source).toBe('desktop');
    expect(hasGraph(r.board)).toBe(false);
  });

  it('a removal that leaves exactly the legacy default (graph slot last) is kept too — the user wins', () => {
    const tail: DeviceLayout = { ...layout, pages: [{ name: 'Basic', rows: [{ section: 'parameters', controls: [k(0), k(1), k(2), slot] }] }] };
    const seedT = buildDeviceLayoutBoardV2(tail, cat)!;
    const legacyT = buildDeviceLayoutBoardV2(tail, noGraphs, { rowFlowOnly: true, legacyUnguarded: true })!;
    const without = (b: BeBoard): BeBoard => ({ ...b, boards: { ...b.boards, Basic: b.boards.Basic!.filter((i) => !('key' in i && i.key === 'graph:dynamics')) } });
    // the default before the fixed area, its graph removed: the same shape as the rows-only one, so the stored
    // board cannot tell "untouched legacy" from "graph removed"
    const beforeFixed = buildDeviceLayoutBoardV2(tail, cat, { withoutFixed: true })!;
    const removed = without(beforeFixed);
    expect(boardDiffersFromSeed(removed, legacyT)).toBe(false);
    const st = memory();
    saveBoard({ storage: st, slug: 'comp', profile: 'Default', deviceClass: 'desktop', board: removed });
    const r = loadBoard({ ...input(st), seed: seedT, previousSeed: () => [legacyT, beforeFixed] });
    expect(r.source).toBe('desktop');
    expect(hasGraph(r.board)).toBe(false);
    // the current default without its graph is the user's as well
    const now2 = memory();
    saveBoard({ storage: now2, slug: 'comp', profile: 'Default', deviceClass: 'desktop', board: without(seedT) });
    expect(loadBoard({ ...input(now2), seed: seedT, previousSeed: () => [legacyT, beforeFixed] }).source).toBe('desktop');
    // and the untouched default before the fixed area (graph in place) follows the current one
    const untouched = memory({ [boardKey('comp', 'Default', 'desktop')]: JSON.stringify(beforeFixed) });
    expect(loadBoard({ ...input(untouched), seed: seedT, previousSeed: () => [legacyT, beforeFixed] }).source).toBe('seed');
    expect(untouched.writes).toEqual([]);
  });

  it('a stored board the user changed is never rewritten (no graph added)', () => {
    const edited: BeBoard = { ...prevRows, boards: { Basic: prevRows.boards.Basic!.map((i) => ('key' in i && i.key === 'k2' ? { ...i, x: 20 } : i)) } };
    const st = memory({ [boardKey('comp', 'Default', 'desktop')]: JSON.stringify(edited) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('desktop');
    expect(hasGraph(r.board)).toBe(false);
  });

  it('a stored graph tile survives a read that has not brought its visual back yet (block-level key)', () => {
    const st = memory({ [boardKey('comp', 'Default', 'desktop')]: JSON.stringify({ ...now, boards: { Basic: [...now.boards.Basic!].map((i) => ('key' in i && i.key === 'k2' ? { ...i, x: 20 } : i)) } }) });
    const r = loadBoard({ ...input(st), catalogKeys: noGraphs.map((c) => c.key) });
    expect(hasGraph(r.board)).toBe(true);
  });
});

describe('cross-block refs: stored Default boards (AXIS-93 fix round)', () => {
  const cat = buildCatalog({ params: [0, 1, 2].map((id) => ({ id, name: `P${id}` })), enums: [] });
  const ckeys = cat.map((c) => c.key);
  const k = (id: number) => ({ label: `P${id}`, paramName: `P${id}`, paramId: id, widget: 'knob' as const, rawWidget: 'knob' });
  // pid 2 is also a param of the open block; the ref belongs to the global block
  const ref = { ...k(2), label: 'Metronome', paramName: 'GLOBAL_METRONOME', crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'GLOBAL_METRONOME', paramId: 2 } };
  const layout: DeviceLayout = { family: 'CONTROLLERS', variantName: 'Controllers', pages: [{ name: 'Tempo', rows: [{ controls: [k(0), ref, k(1)] }] }] };
  const now = buildDeviceLayoutBoardV2(layout, cat)!;
  const legacyRows = buildDeviceLayoutBoardV2(layout, cat, { rowFlowOnly: true, legacyUnguarded: true })!;
  const input = (st: KeyValueStore) => ({ storage: st, slug: 'controllers', profile: 'Default', deviceClass: 'desktop' as const, catalogKeys: ckeys, seed: now, previousSeed: () => legacyRows });

  it('the old (unguarded) rows-only seed bound the ref; the current seed does not', () => {
    expect(legacyRows.boards.Tempo!.some((i) => 'key' in i && i.key === 'k2')).toBe(true);
    expect(now.boards.Tempo!.some((i) => 'key' in i && i.key === 'k2')).toBe(false);
  });

  it('a stored Default equal to the old seed loads the guarded seed (source seed, no storage write)', () => {
    const st = memory({ [boardKey('controllers', 'Default', 'desktop')]: JSON.stringify(legacyRows) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('seed');
    expect(r.board.boards.Tempo!.some((i) => 'key' in i && i.key === 'k2')).toBe(false);
    expect(st.writes).toEqual([]);
  });

  it('an edited board with a ref-bound tile is kept as the user left it', () => {
    const edited: BeBoard = { ...legacyRows, boards: { Tempo: legacyRows.boards.Tempo!.map((i) => ('key' in i && i.key === 'k1' ? { ...i, x: 20 } : i)) } };
    const st = memory({ [boardKey('controllers', 'Default', 'desktop')]: JSON.stringify(edited) });
    const r = loadBoard(input(st));
    expect(r.source).toBe('desktop');
    expect(r.board.boards.Tempo!.some((i) => 'key' in i && i.key === 'k2')).toBe(true);
  });
});

describe('saveBoard / saveUserSeed', () => {
  it('writes only the current device-class key (plus the meta on the first save)', () => {
    const st = memory();
    saveBoard({ storage: st, slug: 'amp', profile: 'Mine', deviceClass: 'tablet', board: mk('T') });
    expect(st.writes).toEqual(['axs.be1.amp.Mine.tablet', metaKey('amp')]);
    expect(JSON.parse(st.data['axs.be1.amp.Mine.tablet']!)).toEqual(mk('T'));
    expect(isFamilyMigrated(st, 'amp')).toBe(true);
    saveBoard({ storage: st, slug: 'amp', profile: 'Mine', deviceClass: 'tablet', board: mk('T2') });
    expect(st.writes).toEqual(['axs.be1.amp.Mine.tablet', metaKey('amp'), 'axs.be1.amp.Mine.tablet']);
    expect(Object.keys(st.data).filter((k) => k.startsWith('axs.be1.'))).toEqual(['axs.be1.amp.Mine.tablet']);
  });
  it('carries the previous editor profiles into the meta it writes', () => {
    const st = memory({ [legacyMetaKey('amp')]: JSON.stringify({ active: 'Layout 1', names: ['Default', 'Blank', 'Layout 1'] }) });
    saveBoard({ storage: st, slug: 'amp', profile: 'Layout 1', deviceClass: 'desktop', board: mk('L') });
    expect(loadMeta(st, 'amp')).toMatchObject({ active: 'Layout 1', names: ['Default', 'Blank', 'Layout 1'], migrated: true });
  });
  it('stores the family seed without a variant fingerprint', () => {
    const st = memory();
    saveUserSeed(st, 'amp', mk('S', 'sig'));
    expect(st.writes).toEqual([seedKey('amp'), metaKey('amp')]);
    expect(JSON.parse(st.data[seedKey('amp')]!).variantSig).toBeUndefined();
  });
});

describe('carryLegacyBoards', () => {
  const family = () => ({
    storage: memory({
      [legacyMetaKey('amp')]: JSON.stringify({ active: 'Live', names: ['Default', 'Blank', 'Live', 'Studio'] }),
      [legacyBoardKey('amp', 'Live')]: v1('Gig'),
      [legacyBoardKey('amp', 'Studio')]: v1('Desk')
    }),
    legacy: memory({ [legacySingleKey('amp')]: v1('Old') })
  });
  // no device layout: the pre-profile Default board applies (it carries no variant fingerprint)
  const input = (f: ReturnType<typeof family>) => ({
    storage: f.storage,
    legacyStorage: f.legacy,
    slug: 'amp',
    names: loadMeta(f.storage, 'amp').names,
    catalogKeys: keys,
    seedFor: () => mk('Seed'),
    variantSig: ''
  });

  it('writes every legacy profile board (Default from the pre-profile key) to its desktop key', () => {
    const f = family();
    expect(carryLegacyBoards(input(f))).toEqual(['Default', 'Live', 'Studio']);
    for (const [profile, page] of [['Default', 'Old'], ['Live', 'Gig'], ['Studio', 'Desk']] as const) {
      expect(JSON.parse(f.storage.data[boardKey('amp', profile, 'desktop')]!).pageOrder).toEqual([page]);
    }
    expect(f.storage.data[boardKey('amp', 'Blank', 'desktop')]).toBeUndefined();
    // legacy keys are neither written nor deleted
    expect(f.storage.writes.some((k) => k.startsWith('axs.surface'))).toBe(false);
    expect(f.storage.data[legacyBoardKey('amp', 'Live')]).toBeDefined();
    // once migrated, every profile still loads its board, now from the new keys
    markFamilyMigrated(f.storage, 'amp');
    const r = loadBoard({ ...base, storage: f.storage, profile: 'Studio', deviceClass: 'desktop' });
    expect(r.source).toBe('desktop');
    expect(r.board.pageOrder).toEqual(['Desk']);
  });

  it('is a no-op for a migrated family and leaves boards already under the new keys alone', () => {
    const f = family();
    f.storage.set(boardKey('amp', 'Live', 'desktop'), JSON.stringify(mk('NewLive')));
    expect(carryLegacyBoards(input(f))).toEqual(['Default', 'Studio']);
    expect(JSON.parse(f.storage.data[boardKey('amp', 'Live', 'desktop')]!).pageOrder).toEqual(['NewLive']);
    markFamilyMigrated(f.storage, 'amp');
    const writes = f.storage.writes.length;
    expect(carryLegacyBoards(input(f))).toEqual([]);
    expect(f.storage.writes.length).toBe(writes);
  });
});

describe('legacy keys are a one-time migration source', () => {
  it('(a) Default: a later variant switch never brings back the pre-upgrade board', () => {
    const st = memory({ [legacyBoardKey('amp', 'Default')]: v1('Legacy', 'A') });
    const atA = { ...base, storage: st, profile: 'Default', deviceClass: 'desktop' as const, seed: mk('SeedA', 'A') };
    const first = loadBoard(atA);
    expect(first.source).toBe('legacy');
    saveBoard({ storage: st, slug: 'amp', profile: 'Default', deviceClass: 'desktop', board: first.board });
    // switch to type B: the stored board is stale → seed for B, edited and saved
    const atB = loadBoard({ ...atA, seed: mk('SeedB', 'B') });
    expect(atB.source).toBe('seed');
    saveBoard({ storage: st, slug: 'amp', profile: 'Default', deviceClass: 'desktop', board: atB.board });
    // back to A: the B board is stale, and the legacy board must NOT come back
    const back = loadBoard(atA);
    expect(back.source).toBe('seed');
    expect(back.board.pageOrder).toEqual(['SeedA']);
  });

  it('(b) a profile saved only on another device class does not pull its legacy board', () => {
    const st = memory({ [legacyBoardKey('amp', 'Layout 1')]: v1('OldLayout') });
    saveBoard({ storage: st, slug: 'amp', profile: 'Layout 1', deviceClass: 'phone', board: mk('PhoneOnly') });
    const r = loadBoard({ ...base, storage: st, profile: 'Layout 1', deviceClass: 'desktop' });
    expect(r.source).toBe('seed');
    expect(r.board.pageOrder).not.toContain('OldLayout');
  });

  it('(b) a deleted profile whose name is reused starts fresh', () => {
    const st = memory({ [legacyBoardKey('amp', 'Layout 1')]: v1('OldLayout') });
    saveMeta(st, 'amp', loadMeta(st, 'amp')); // any meta write (e.g. deleting the profile) marks migration
    expect(loadBoard({ ...base, storage: st, profile: 'Layout 1', deviceClass: 'desktop' }).source).toBe('seed');
  });

  it('legacy keys are still read while the family is not migrated, and never deleted', () => {
    const st = memory({
      [legacyMetaKey('amp')]: JSON.stringify({ active: 'Default', names: ['Default', 'Blank'] }),
      [legacyBoardKey('amp', 'Mine')]: v1('Legacy')
    });
    expect(isFamilyMigrated(st, 'amp')).toBe(false);
    expect(loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'desktop' }).source).toBe('legacy');
    markFamilyMigrated(st, 'amp');
    expect(loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'desktop' }).source).toBe('seed');
    expect(st.data[legacyBoardKey('amp', 'Mine')]).toBeDefined();
  });
});

describe('seed stamping and kept block-level keys', () => {
  it('a Default board from an unfingerprinted seed keeps edits across save + reload', () => {
    const st = memory();
    const curated = mk('Main'); // no variantSig
    const input = { ...base, storage: st, profile: 'Default', deviceClass: 'desktop' as const, seed: curated, variantSig: 'cur' };
    const first = loadBoard(input);
    expect(first.board.variantSig).toBe('cur');
    const edited: BeBoard = { ...first.board, boards: { Main: [{ ...first.board.boards.Main![0]!, x: 6 }] } };
    saveBoard({ storage: st, slug: 'amp', profile: 'Default', deviceClass: 'desktop', board: edited });
    const again = loadBoard(input);
    expect(again.source).toBe('desktop');
    expect(again.board.boards.Main![0]).toMatchObject({ x: 6 });
  });

  it('keeps meter / wave / eq / bypass while the catalog does not list them yet', () => {
    const stored: BeBoard = {
      v: 2,
      pageOrder: ['P'],
      page: 'P',
      boards: {
        P: [
          { id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
          { id: 'm', key: 'meter', view: 'meter', x: 2, y: 0, w: 2, h: 4 },
          { id: 'w', key: 'wave', view: 'wave', x: 4, y: 0, w: 8, h: 4 },
          { id: 'e', key: 'eq', view: 'eq', x: 12, y: 0, w: 8, h: 4 },
          { id: 'g', key: 'k77', view: 'knob', x: 20, y: 0, w: 2, h: 2 }
        ]
      }
    };
    const st = memory({ [boardKey('amp', 'Mine', 'desktop')]: JSON.stringify(stored) });
    const r = loadBoard({ ...base, storage: st, profile: 'Mine', deviceClass: 'desktop' });
    expect(r.board.boards.P!.map((i) => i.id)).toEqual(['a', 'm', 'w', 'e']);
  });
});

describe('load → save → load round trips', () => {
  const roundTrip = (st: ReturnType<typeof memory>, extra: Partial<Parameters<typeof loadBoard>[0]> = {}) => {
    const input = { ...base, storage: st, profile: 'Default', deviceClass: 'desktop' as const, ...extra };
    const first = loadBoard(input);
    saveBoard({ storage: st, slug: 'amp', profile: input.profile, deviceClass: input.deviceClass, board: first.board });
    const second = loadBoard(input);
    expect(second.source).toBe(input.deviceClass === 'desktop' ? 'desktop' : 'own');
    expect(second.board).toEqual(first.board);
    return first;
  };

  it('legacy source (a wide v1 page)', () => {
    const wide = JSON.stringify({
      pageOrder: ['Wide'],
      page: 'Wide',
      boards: { Wide: Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, key: `k${100 + i}`, x: i, y: 0, w: 1, h: 1, view: 'knob' })) },
      variantSig: 'v1sig'
    });
    const keys20 = Array.from({ length: 20 }, (_, i) => `k${100 + i}`);
    const first = roundTrip(memory({ [legacyBoardKey('amp', 'Default')]: wide }), { catalogKeys: keys20 });
    expect(first.source).toBe('legacy');
    expect(first.board.boards.Wide).toHaveLength(20);
  });

  it('user-seed source', () => {
    expect(roundTrip(memory({ [seedKey('amp')]: JSON.stringify(mk('UserSeed')) })).source).toBe('user-seed');
  });

  it('seed source (with duplicate ids repaired deterministically)', () => {
    const seedDup: BeBoard = {
      v: 2,
      pageOrder: ['A', 'B'],
      page: 'A',
      boards: {
        A: [{ id: 'same', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }],
        B: [{ id: 'same', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }]
      },
      variantSig: 'v1sig'
    };
    const first = roundTrip(memory(), { seed: seedDup });
    expect(first.source).toBe('seed');
    expect(first.board.boards.B![0]!.id).toBe('n1.k1');
    expect(loadBoard({ ...base, storage: memory(), profile: 'Default', deviceClass: 'desktop', seed: seedDup }).board).toEqual(first.board);
  });

  it('tablet own key', () => {
    roundTrip(memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify(mk('Desk', 'v1sig')) }), { deviceClass: 'tablet' });
  });
});

describe('save as default for the type (family seed)', () => {
  it('loadSeed: the user seed first (not for Blank), else the built-in seed; normalized and stamped', () => {
    const st = memory();
    expect(loadSeed({ ...base, storage: st, profile: 'Default' })).toMatchObject({ source: 'seed' });
    saveUserSeed(st, 'amp', mk('Mine', 'old'));
    const r = loadSeed({ ...base, storage: st, profile: 'Default' });
    expect(r.source).toBe('user-seed');
    expect(r.board.pageOrder).toEqual(['Mine']);
    expect(r.board.variantSig).toBe('v1sig'); // a Default seed adopts the current variant
    expect(loadSeed({ ...base, storage: st, profile: 'Layout 1' }).board.variantSig).toBeUndefined();
    expect(loadSeed({ ...base, storage: st, profile: 'Blank', seed: mk('Empty') }).source).toBe('seed');
    // only keys the catalog lists (and block-level ones) survive normalization
    const odd: BeBoard = { v: 2, pageOrder: ['X'], page: 'X', boards: { X: [{ id: 'g', key: 'gone', view: 'knob', x: 0, y: 0, w: 2, h: 2 }] } };
    saveUserSeed(st, 'amp', odd);
    expect(loadSeed({ ...base, storage: st, profile: 'Default' }).board.boards.X).toEqual([]);
  });

  it('fallback order on load: own class → desktop → user seed → device seed', () => {
    const st = memory();
    saveUserSeed(st, 'amp', mk('UserSeed'));
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'tablet' }).source).toBe('user-seed');
    st.set(boardKey('amp', 'Default', 'desktop'), JSON.stringify(mk('Desk', 'v1sig')));
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'tablet' }).source).toBe('desktop');
    st.set(boardKey('amp', 'Default', 'tablet'), JSON.stringify(mk('Tab', 'v1sig')));
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'tablet' }).source).toBe('own');
    // a type change (other variant) skips the stored Default boards and lands on the user seed
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'tablet', variantSig: 'v2sig' }).source).toBe('user-seed');
  });

  it('hasUserSeed / clearUserSeed', () => {
    const st = memory();
    expect(hasUserSeed(st, 'amp')).toBe(false);
    saveUserSeed(st, 'amp', mk('S'));
    expect(hasUserSeed(st, 'amp')).toBe(true);
    const removed: string[] = [];
    clearUserSeed({ ...st, remove: (k: string) => { removed.push(k); delete st.data[k]; } }, 'amp');
    expect(removed).toEqual([seedKey('amp')]);
    expect(hasUserSeed(st, 'amp')).toBe(false);
    // a store without remove blanks the key instead
    saveUserSeed(st, 'amp', mk('S'));
    clearUserSeed(st, 'amp');
    expect(st.data[seedKey('amp')]).toBe('');
    expect(hasUserSeed(st, 'amp')).toBe(false);
    expect(loadSeed({ ...base, storage: st, profile: 'Default' }).source).toBe('seed');
  });
});

describe('boardDiffersFromSeed', () => {
  const s: BeBoard = {
    v: 2,
    pageOrder: ['A', 'B'],
    page: 'A',
    boards: {
      A: [
        { id: 'x', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2, row: 0 },
        { id: 'y', key: 'k2', view: 'knob', x: 2, y: 0, w: 2, h: 2 }
      ],
      B: [{ id: 'd', kind: 'hdiv', x: 0, y: 0, w: 6, h: 1 }]
    },
    variantSig: 'sig'
  };
  it('ignores ids, item order, current page, variant and rows', () => {
    const same: BeBoard = {
      ...s,
      page: 'B',
      variantSig: 'other',
      boards: {
        A: [
          { id: 'q', key: 'k2', view: 'knob', x: 2, y: 0, w: 2, h: 2 },
          { id: 'p', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }
        ],
        B: [{ id: 'z', kind: 'hdiv', x: 0, y: 0, w: 6, h: 1 }]
      }
    };
    expect(boardDiffersFromSeed(same, s)).toBe(false);
  });
  it('detects moves, view changes, labels and page changes', () => {
    const moved = { ...s, boards: { ...s.boards, A: [s.boards.A![0]!, { ...s.boards.A![1]!, x: 4 }] } };
    expect(boardDiffersFromSeed(moved, s)).toBe(true);
    const relabel = { ...s, boards: { ...s.boards, B: [{ id: 'd', kind: 'hdiv' as const, x: 0, y: 0, w: 6, h: 1, label: 'X' }] } };
    expect(boardDiffersFromSeed(relabel, s)).toBe(true);
    expect(boardDiffersFromSeed({ ...s, pageOrder: ['B', 'A'] }, s)).toBe(true);
  });
  it('per page: only the named page counts; a page the seed lacks counts as empty there', () => {
    const moved = { ...s, boards: { ...s.boards, A: [s.boards.A![0]!, { ...s.boards.A![1]!, x: 4 }] } };
    expect(pageDiffersFromSeed(moved, s, 'A')).toBe(true);
    expect(pageDiffersFromSeed(moved, s, 'B')).toBe(false);
    const extra: BeBoard = { ...s, pageOrder: [...s.pageOrder, 'Mine'], boards: { ...s.boards, Mine: [] } };
    expect(pageDiffersFromSeed(extra, s, 'Mine')).toBe(false); // empty, as in the seed (absent)
    const filled: BeBoard = { ...extra, boards: { ...extra.boards, Mine: [{ id: 'm', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }] } };
    expect(pageDiffersFromSeed(filled, s, 'Mine')).toBe(true);
    expect(pageDiffersFromSeed(filled, s, 'Mine', new Set(['k2']))).toBe(false);
  });
  it('with the catalog keys, controls the catalog does not list are ignored on both sides', () => {
    const withMeter: BeBoard = { ...s, boards: { ...s.boards, B: [...s.boards.B!, { id: 'm', key: 'meter', view: 'meter', x: 6, y: 0, w: 1, h: 4 }] } };
    expect(boardDiffersFromSeed(withMeter, s)).toBe(true);
    expect(boardDiffersFromSeed(withMeter, s, new Set(['k1', 'k2']))).toBe(false);
    expect(boardDiffersFromSeed(withMeter, s, new Set(['k1', 'k2', 'meter']))).toBe(true);
    // dividers always count
    const noDiv: BeBoard = { ...s, boards: { ...s.boards, B: [] } };
    expect(boardDiffersFromSeed(noDiv, s, new Set(['k1', 'k2']))).toBe(true);
  });
});

describe('meta', () => {
  it('defaults, reads the previous meta, and round-trips', () => {
    const st = memory();
    expect(loadMeta(st, 'amp')).toEqual({ active: 'Default', names: ['Default', 'Blank'], prefs: {}, migrated: false });
    st.set(legacyMetaKey('amp'), JSON.stringify({ active: 'Layout 1', names: ['Default', 'Blank', 'Layout 1'] }));
    expect(loadMeta(st, 'amp')).toMatchObject({ active: 'Layout 1', names: ['Default', 'Blank', 'Layout 1'], migrated: false });
    const next = withPrefs(loadMeta(st, 'amp'), 'tablet', { nav: 'side', density: 'l' });
    saveMeta(st, 'amp', next);
    expect(loadMeta(st, 'amp')).toEqual({ ...next, migrated: true });
  });
  it('repairs an active profile that is not in the list', () => {
    const st = memory({ [metaKey('amp')]: JSON.stringify({ active: 'Ghost', names: ['Mine'] }) });
    expect(loadMeta(st, 'amp')).toMatchObject({ active: 'Default', names: ['Default', 'Blank', 'Mine'] });
  });
  it('prefs fall back own class → desktop → defaults', () => {
    const m = withPrefs(loadMeta(memory(), 'amp'), 'desktop', { nav: 'side', density: 's' });
    expect(prefsFor(m, 'desktop')).toEqual({ nav: 'side', density: 's' });
    expect(prefsFor(m, 'tablet')).toEqual({ nav: 'side', density: 's' });
    expect(prefsFor(withPrefs(m, 'phone', { nav: 'top', density: 'l' }), 'phone')).toEqual({ nav: 'top', density: 'l' });
    expect(prefsFor(loadMeta(memory(), 'amp'), 'phone')).toEqual(DEFAULT_PREFS);
  });
});

// ── the fixed area (AXIS-94) ──
describe('fixed area: stored, compared, reset', () => {
  const fixed: BeFixedArea = { cols: 6, items: [{ id: 'f', key: 'k2', view: 'knob', x: 0, y: 0, w: 2, h: 2 }] };
  const mine: BeBoard = { ...mk('Mine', 'v1sig'), fixed };

  it('round-trips per profile and device class', () => {
    const st = memory();
    saveBoard({ storage: st, slug: 'amp', profile: 'Default', deviceClass: 'tablet', board: mine });
    saveBoard({ storage: st, slug: 'amp', profile: 'Copy', deviceClass: 'desktop', board: { ...mine, fixed: { ...fixed, cols: 2 } } });
    const at = (profile: string, deviceClass: 'desktop' | 'tablet') => loadBoard({ ...base, storage: st, profile, deviceClass }).board.fixed;
    expect(at('Default', 'tablet')).toEqual(fixed);
    expect(at('Default', 'desktop')).toBeUndefined(); // its own class only; the seed has none
    expect(at('Copy', 'tablet')!.cols).toBe(2); // inherited from the desktop board
  });

  it('the family seed ("Save as default") carries it', () => {
    const st = memory();
    saveUserSeed(st, 'amp', mine);
    expect(loadSeed({ ...base, storage: st, profile: 'Default' }).board.fixed).toEqual(fixed);
    expect(loadSeed({ ...base, storage: st, profile: 'Blank' }).board.fixed).toBeUndefined();
  });

  it('a board with a broken area loads without it; a key that is gone is dropped from it', () => {
    const st = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify({ ...mine, fixed: { cols: 'x' } }) });
    expect(loadBoard({ ...base, storage: st, profile: 'Default', deviceClass: 'desktop' })).toMatchObject({ source: 'desktop', board: { pageOrder: ['Mine'] } });
    const gone = memory({ [boardKey('amp', 'Default', 'desktop')]: JSON.stringify({ ...mine, fixed: { cols: 4, items: [...fixed.items, { id: 'x', key: 'k99', view: 'knob', x: 2, y: 0, w: 2, h: 2 }] } }) });
    expect(loadBoard({ ...base, storage: gone, profile: 'Default', deviceClass: 'desktop' }).board.fixed!.items.map((i) => i.id)).toEqual(['f']);
  });

  it('a board differs from its seed when its area does: other items, another width, one of them without', () => {
    const plain = mk('Mine');
    expect(boardDiffersFromSeed(mine, { ...mk('Mine'), fixed })).toBe(false);
    expect(fixedDiffersFromSeed(mine, { ...plain, fixed: { ...fixed, items: [{ ...fixed.items[0]!, id: 'other' }] } })).toBe(false); // ids don't count
    for (const other of [plain, { ...plain, fixed: { ...fixed, cols: 4 } }, { ...plain, fixed: { ...fixed, items: [] } }]) {
      expect(fixedDiffersFromSeed(mine, other)).toBe(true);
      expect(boardDiffersFromSeed(mine, other)).toBe(true);
      expect(pageDiffersFromSeed(mine, other, 'Mine')).toBe(false); // the page itself is the same
      expect(pageDiffersFromSeed(mine, other, FIXED_PAGE)).toBe(true);
    }
    expect(fixedDiffersFromSeed(plain, plain)).toBe(false);
    // what the catalog does not list right now is left out
    expect(fixedDiffersFromSeed(mine, { ...plain, fixed: { cols: 6, items: [] } }, new Set(['k1']))).toBe(false);
  });
});

describe('migration to the fixed area: an untouched earlier default follows the new one, an edited board never changes', () => {
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `o${i}` }));
  const visuals = [{ key: 'lfo', kind: 'lfo' as const, title: 'LFO', roles: { rate: 0 } }];
  const cat = buildCatalog({
    params: [0, 1, 2, 10, 11].map((id) => ({ id, name: `P${id}` })),
    enums: [{ id: 20, name: 'Bypass Mode', options: opts(3) }, { id: 21, name: 'Scene Ignore', options: opts(2) }],
    visuals
  });
  const noGraphs = cat.filter((c) => c.kind !== 'graph');
  const ckeys = cat.map((c) => c.key);
  const k = (id: number, xy?: string) => ({ label: `P${id}`, paramName: `P${id}`, paramId: id, widget: 'knob' as const, rawWidget: 'knob', ...(xy ? { placement: { positionExact: xy } } : {}) });
  const en = (id: number, name: string, rawWidget: string) => ({ label: name, paramName: `X_${name.replace(/ /g, '').toUpperCase()}`, paramId: id, widget: 'dropdown' as const, rawWidget });
  const mixer = { section: 'mixer', controls: [k(10), k(11), en(20, 'Bypass Mode', 'dropdown1'), { label: 'Bypass', paramName: 'X_BYPASS', paramId: 15, widget: 'button' as const, rawWidget: 'btnBypass' }, en(21, 'Scene Ignore', 'btnIgnoreScene')] };
  const ref = { ...k(2), crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'GLOBAL_X', paramId: 2 } };
  const slot = { label: '', paramName: null, paramId: null, widget: 'graph' as const, rawWidget: 'graph', graphKey: 'lfo' };
  const layout: DeviceLayout = {
    family: 'CHORUS',
    variantName: 'Chorus',
    pages: [
      { name: 'Basic', rows: [{ section: 'parameters', controls: [k(0, '300,50'), k(1, '392,50'), { ...slot, placement: { positionExact: '500,50' } }, ref] }, mixer], pageControls: [k(2)] },
      { name: 'Expert', rows: [{ section: 'parameters', controls: [k(1)] }, mixer] }
    ]
  };
  const seedInput = { layout, catalog: cat, mainParamIds: new Set([0, 1]) };
  const now = builtInSeed(seedInput);
  const olderLayout = { ...layout, pages: layout.pages.map(({ pageControls: _pageControls, ...page }) => page) };
  const flavours = {
    'rows only (released: unguarded refs, no graphs)': buildDeviceLayoutBoardV2(layout, noGraphs, { rowFlowOnly: true, legacyUnguarded: true })!,
    'positions and graphs, before the fixed area': buildDeviceLayoutBoardV2(layout, cat, { withoutFixed: true })!,
    'first Fixed layout': buildDeviceLayoutBoardV2(layout, cat, { legacyFixedLayout: true })!,
    'stacked Fixed layout': buildDeviceLayoutBoardV2(layout, cat, { legacyStackedLayout: true })!,
    'current default on an older server': buildDeviceLayoutBoardV2(olderLayout, cat)!,
    'first Fixed layout on an older server': buildDeviceLayoutBoardV2(olderLayout, cat, { legacyFixedLayout: true })!,
    'stacked Fixed layout on an older server': buildDeviceLayoutBoardV2(olderLayout, cat, { legacyStackedLayout: true })!
  };
  const previous = () => previousSeeds(seedInput);
  const input = (st: KeyValueStore, deviceClass: 'desktop' | 'tablet' | 'phone' = 'desktop') => ({ storage: st, slug: 'chorus', profile: 'Default', deviceClass, catalogKeys: ckeys, seed: now, variantSig: layoutVariantSig(layout), previousSeed: previous });
  const stored = (b: BeBoard, cls: 'desktop' | 'tablet' | 'phone' = 'desktop') => memory({ [boardKey('chorus', 'Default', cls)]: JSON.stringify(b) });

  it('distinguishes each previous default from the current seed', () => {
    expect(now.fixed!.items.map((i) => ('key' in i ? i.key : ''))).toEqual(['k10', 'k11']);
    for (const b of [flavours['rows only (released: unguarded refs, no graphs)'], flavours['positions and graphs, before the fixed area']]) {
      expect(b.fixed).toBeUndefined();
      expect(b.pageOrder.some((p) => b.boards[p]!.some((i) => 'key' in i && i.key === 'e20'))).toBe(true);
    }
    expect(flavours['current default on an older server'].fixed).toBeDefined();
    const before = Object.values(flavours);
    expect(before.some((b) => boardDiffersFromSeed(b, now))).toBe(true);
    expect(previous()).toEqual(before);
  });

  for (const [name, old] of Object.entries(flavours)) {
    for (const cls of DEVICE_CLASSES) {
      it(`untouched — ${name}, ${cls}: loads the new default, writes nothing`, () => {
        const st = stored(normalizeBoard(old, ckeys), cls);
        const r = loadBoard(input(st, cls));
        const changed = boardDiffersFromSeed(old, now);
        expect(r.source).toBe(changed ? 'seed' : cls === 'desktop' ? 'desktop' : 'own');
        expect(r.board.fixed).toEqual(now.fixed);
        expect(boardDiffersFromSeed(r.board, now)).toBe(false);
        expect(st.writes).toEqual([]);
      });
    }

    it(`edited - ${name}: keeps its placement and fixed area`, () => {
      const edited: BeBoard = { ...old, boards: { ...old.boards, Basic: old.boards.Basic!.map((i) => ('key' in i && i.key === 'k0' ? { ...i, x: 20, y: 20 } : i)) } };
      const st = stored(edited);
      const before = { ...st.data };
      const r = loadBoard(input(st));
      expect(r.source).toBe('desktop');
      expect(r.board).toEqual(normalizeBoard(edited, ckeys));
      expect(r.board.fixed).toEqual(edited.fixed);
      expect(st.data).toEqual(before); // byte for byte, nothing written
    });

    it(`one control removed, one page renamed, one added — ${name}: all of those are the user’s`, () => {
      const removed: BeBoard = { ...old, boards: { ...old.boards, Expert: old.boards.Expert!.filter((i) => !('key' in i && i.key === 'k1')) } };
      const renamed: BeBoard = { ...old, pageOrder: ['Basic', 'Mine', ...old.pageOrder.slice(2)], boards: { ...old.boards, Mine: old.boards.Expert! } };
      delete renamed.boards.Expert;
      const added: BeBoard = { ...old, boards: { ...old.boards, Expert: [...old.boards.Expert!, { id: 'n', key: 'k0', view: 'knob', x: 20, y: 20, w: 2, h: 2 }] } };
      for (const b of [removed, renamed, added]) expect(loadBoard(input(stored(b))).source).toBe('desktop');
    });
  }

  it('treats a width or control edit in the fixed area as a user edit during migration', () => {
    const old = flavours['current default on an older server'];
    const fixed = old.fixed!;
    for (const area of [{ ...fixed, cols: fixed.cols + 2 }, { ...fixed, items: fixed.items.slice(1) }]) {
      const edited = { ...old, fixed: area };
      const r = loadBoard(input(stored(edited)));
      expect(r.source).toBe('desktop');
      expect(r.board.fixed).toEqual(area);
    }
  });

  it('preserves an earlier board with a fixed-area control awaiting catalog data', () => {
    const old = flavours['current default on an older server'];
    const fixed = old.fixed!;
    const edited = { ...old, fixed: { ...fixed, items: [...fixed.items, { id: 'pending', key: 'meter', view: 'meter' as const, x: 0, y: 16, w: 2, h: 4 }] } };
    const r = loadBoard(input(stored(edited)));
    expect(r.source).toBe('desktop');
    expect(r.board.fixed).toEqual(edited.fixed);
  });

  it('a graph the user removed from the earlier default stays removed (kept as it is)', () => {
    const old = flavours['positions and graphs, before the fixed area'];
    const removed: BeBoard = { ...old, boards: { ...old.boards, Basic: old.boards.Basic!.filter((i) => !('key' in i && i.key === 'graph:lfo')) } };
    expect(loadBoard(input(stored(removed)))).toMatchObject({ source: 'desktop' });
  });

  it('a copy and a board under a saved "default for this type" are never upgraded', () => {
    const old = flavours['positions and graphs, before the fixed area'];
    const copy = memory({ [boardKey('chorus', 'Layout 1', 'desktop')]: JSON.stringify(old) });
    expect(loadBoard({ ...input(copy), profile: 'Layout 1' })).toMatchObject({ source: 'desktop' });
    const st = stored(old);
    saveUserSeed(st, 'chorus', old);
    expect(loadBoard(input(st)).source).toBe('desktop');
  });

  it('the tablet inherits an untouched desktop board as the new default, and its own edited one as it is', () => {
    const old = flavours['positions and graphs, before the fixed area'];
    const st = stored(old);
    expect(loadBoard(input(st, 'tablet'))).toMatchObject({ source: 'seed' });
    const own = moveToPage(now, 'w0.k0', FIXED_PAGE).board;
    st.data[boardKey('chorus', 'Default', 'tablet')] = JSON.stringify(own);
    const r = loadBoard(input(st, 'tablet'));
    expect(r.source).toBe('own');
    expect(r.board.fixed!.items.map((i) => ('key' in i ? i.key : ''))).toEqual(['k10', 'k11', 'k0']);
  });

  it('the new default itself, saved ("Reset to device layout"), loads as what it is', () => {
    const r = loadBoard(input(stored(now)));
    expect(r.source).toBe('desktop');
    expect(r.board).toEqual(normalizeBoard(now, ckeys));
  });

  it('without a device layout: the untouched curated board with the header’s controls follows the new curated one', () => {
    const main = new Set([0, 1]);
    const old = buildCuratedBoardV2(cat, main, { withHeader: true });
    const seedC = buildCuratedBoardV2(cat, main);
    const inC = (st: KeyValueStore) => ({ storage: st, slug: 'chorus', profile: 'Default', deviceClass: 'desktop' as const, catalogKeys: ckeys, seed: seedC, previousSeed: () => previousSeeds({ layout: null, catalog: cat, mainParamIds: main }) });
    const st = stored(old);
    const r = loadBoard(inC(st));
    expect(r.source).toBe('seed');
    expect(r.board.pageOrder.flatMap((p) => r.board.boards[p]!.flatMap((i) => ('key' in i ? [i.key] : [])))).not.toContain('bypass');
    expect(r.board.fixed).toBeUndefined();
    expect(st.writes).toEqual([]);
    const edited: BeBoard = { ...old, boards: { ...old.boards, Main: old.boards.Main!.slice(1) } };
    expect(loadBoard(inC(stored(edited))).source).toBe('desktop');
  });
});
