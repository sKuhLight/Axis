import { describe, it, expect } from 'vitest';
import {
  boardDiffersFromSeed,
  boardKey,
  carryLegacyBoards,
  DEFAULT_PREFS,
  deviceClassFrom,
  isFamilyMigrated,
  legacyBoardKey,
  markFamilyMigrated,
  legacyMetaKey,
  legacySingleKey,
  loadBoard,
  loadMeta,
  metaKey,
  prefsFor,
  saveBoard,
  saveMeta,
  saveUserSeed,
  seedKey,
  withPrefs,
  type KeyValueStore
} from './boardPersistence';
import type { BeBoard } from './boardModel';

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
