// BeState is a rune module (`$state`), so it runs in the `runes` project (client-mode compile).
import { describe, expect, it } from 'vitest';
import { BeState, emptyBoard, type BeSource, type BeStorage } from './beState.svelte';
import { boardDiffersFromSeed, boardKey, legacyBoardKey, legacyMetaKey, legacySingleKey, metaKey, seedKey, type KeyValueStore } from './boardPersistence';
import { buildCatalog, type BeCtl } from './catalog';
import { addControl, FIXED_PAGE, moveItem, moveToPage, setFixedCols, type BeBoard } from './boardModel';
import { UNDO_CAP } from './arrangeHistory';

function memStore() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  const store: BeStorage = {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
    remove: (k) => {
      writes.push('-' + k);
      data.delete(k);
    }
  };
  return { data, writes, store };
}

const catalog = (n = 3, extra: Partial<Parameters<typeof buildCatalog>[0]> = {}): BeCtl[] =>
  buildCatalog({ params: Array.from({ length: n }, (_, i) => ({ id: i, name: `P${i}` })), enums: [], ...extra });

const seedFrom = (cat: readonly BeCtl[], sig = 'SIG'): BeBoard => ({
  v: 2,
  pageOrder: ['One', 'Two'],
  page: 'One',
  boards: {
    One: cat.filter((c) => c.kind === 'cont').map((c, i) => ({ id: `w0.${c.key}`, key: c.key, view: c.view, x: i * 2, y: 0, w: 2, h: 2, row: 0 })),
    Two: [{ id: 'w1.bypass', key: 'bypass', view: 'action', x: 0, y: 0, w: 2, h: 1 }]
  },
  variantSig: sig
});

const src = (over: Partial<BeSource> = {}): BeSource => {
  const cat = over.catalog ?? catalog();
  return { slug: 'Amp', deviceClass: 'desktop', catalog: cat, variantSig: 'SIG', deviceSeed: () => seedFrom(cat), rev: 0, ...over };
};

const find = (b: BeBoard | null, page: string, id: string) => b!.boards[page]!.find((i) => i.id === id);

describe('BeState loading', () => {
  it('loads the seed and writes nothing', () => {
    const m = memStore();
    const st = new BeState(m.store);
    expect(st.sync(src())).toBe(true);
    expect(st.board?.pageOrder).toEqual(['One', 'Two']);
    expect(st.source).toBe('seed');
    expect(m.writes).toEqual([]);
  });

  it('does nothing while the catalog only holds bypass, and nothing twice for the same inputs', () => {
    const m = memStore();
    const st = new BeState(m.store);
    expect(st.sync(src({ catalog: catalog(0) }))).toBe(false);
    expect(st.board).toBeNull();
    expect(st.sync(src())).toBe(true);
    expect(st.sync(src())).toBe(false);
    expect(m.writes).toEqual([]);
  });

  it('a user change saves under the own device-class key and marks the family migrated', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    const r = moveItem(st.board!, 'w0.k0', 'One', 0, 4);
    expect(r.ok).toBe(true);
    st.commit(r.board);
    expect(m.data.has(boardKey('Amp', 'Default', 'desktop'))).toBe(true);
    expect(JSON.parse(m.data.get(metaKey('Amp'))!).migrated).toBe(true);
    // a new editor reloads the position from storage
    const st2 = new BeState(m.store);
    st2.sync(src());
    expect(st2.source).toBe('desktop');
    expect(find(st2.board, 'One', 'w0.k0')).toMatchObject({ x: 0, y: 4 });
  });

  it('page switches are not saved; a reload of the same family keeps the current page', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    const loads = st.loads;
    st.setPage('Two');
    expect(st.board!.page).toBe('Two');
    expect(m.writes).toEqual([]);
    // the meter shows up → the catalog key set changes → reload, same page, no scroll request
    const cat = catalog(3, { monitors: [{ role: 'level' }] });
    st.sync(src({ catalog: cat, deviceSeed: () => seedFrom(cat) }));
    expect(st.board!.page).toBe('Two');
    expect(st.loads).toBe(loads);
    expect(m.writes).toEqual([]);
  });

  it('reloads from storage when a remote push bumps the revision', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    const other = new BeState(m.store);
    other.sync(src());
    other.commit(addControl(other.board!, 'Two', { key: 'k1', view: 'knob' }).board);
    expect(st.board!.boards.Two!.length).toBe(1);
    st.sync(src({ rev: 1 }));
    expect(st.board!.boards.Two!.length).toBe(2);
  });

  it('re-seeds the Default profile when the device-layout variant changes', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    const cat = catalog();
    st.sync(src({ variantSig: 'OTHER', deviceSeed: () => seedFrom(cat, 'OTHER') }));
    expect(st.source).toBe('seed');
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ x: 0, y: 0 });
  });

  it('a tablet inherits the desktop board until it saves its own', () => {
    const m = memStore();
    const desk = new BeState(m.store);
    desk.sync(src());
    desk.commit(moveItem(desk.board!, 'w0.k0', 'One', 0, 4).board);
    const tab = new BeState(m.store);
    tab.sync(src({ deviceClass: 'tablet' }));
    expect(tab.source).toBe('desktop');
    tab.commit(moveItem(tab.board!, 'w0.k0', 'One', 0, 6).board);
    expect(m.data.has(boardKey('Amp', 'Default', 'tablet'))).toBe(true);
    const desk2 = new BeState(m.store);
    desk2.sync(src());
    expect(find(desk2.board, 'One', 'w0.k0')).toMatchObject({ y: 4 });
  });

  it('preview shows without saving; flush saves what is shown', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.preview(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 4 });
    expect(m.writes).toEqual([]);
    st.flush();
    expect(m.data.has(boardKey('Amp', 'Default', 'desktop'))).toBe(true);
  });
});

describe('BeState prefs', () => {
  it('stores navigation and control size per device class, tablet falling back to desktop', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    expect(st.prefs).toEqual({ nav: 'side', density: 'm' });
    st.setPrefs({ nav: 'side' });
    st.setPrefs({ density: 'l' });
    expect(st.prefs).toEqual({ nav: 'side', density: 'l' });
    expect(JSON.parse(m.data.get(metaKey('Amp'))!).prefs.desktop).toEqual({ nav: 'side', density: 'l' });
    const tab = new BeState(m.store);
    tab.sync(src({ deviceClass: 'tablet' }));
    expect(tab.prefs).toEqual({ nav: 'side', density: 'l' });
    tab.setPrefs({ nav: 'top' });
    expect(tab.prefs.nav).toBe('top');
    const desk = new BeState(m.store);
    desk.sync(src());
    expect(desk.prefs.nav).toBe('side');
  });

  it('keeps auto-pack in the family meta', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    expect(st.autoPack).toBe(false);
    st.setAutoPack(true);
    expect(st.autoPack).toBe(true);
    const again = new BeState(m.store);
    again.sync(src());
    expect(again.autoPack).toBe(true);
    again.setAutoPack(false);
    expect(JSON.parse(m.data.get(metaKey('Amp'))!).autoPack).toBeUndefined();
  });
});

describe('BeState profiles', () => {
  it('switches, copies and deletes profiles', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.setProfile('Blank');
    expect(st.profile).toBe('Blank');
    expect(st.board).toEqual(emptyBoard());
    st.setProfile('Default');
    const name = st.addProfile();
    expect(name).toBe('Layout 1');
    expect(st.profile).toBe('Layout 1');
    expect(m.data.has(boardKey('Amp', 'Layout 1', 'desktop'))).toBe(true);
    st.deleteProfile('Layout 1');
    expect(st.profile).toBe('Default');
    expect(st.profileNames).toEqual(['Default', 'Blank']);
    expect(m.data.has(boardKey('Amp', 'Layout 1', 'desktop'))).toBe(false);
    st.deleteProfile('Default'); // built-ins stay
    expect(st.profileNames).toEqual(['Default', 'Blank']);
  });

  it('resets the active profile to the device layout and saves it', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.setPage('Two');
    st.resetToDevice();
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 0 });
    expect(st.board!.page).toBe('Two');
    expect(st.board!.variantSig).toBe('SIG');
    const again = new BeState(m.store);
    again.sync(src());
    expect(find(again.board, 'One', 'w0.k0')).toMatchObject({ y: 0 });
  });

  it('a new family leaves arrange mode', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.setEditMode(true, 30);
    expect(st.frozenCell).toBe(30);
    st.sync(src({ slug: 'Drive' }));
    expect(st.editMode).toBe(false);
    expect(st.frozenCell).toBeNull();
  });
});

describe('BeState legacy hand-over (previous editor keys)', () => {
  // two legacy profiles plus the pre-profile Default board, as the previous editor left them (v1: one
  // control per cell); no device layout, so the pre-profile board applies to Default
  const v1 = (page: string, key: string, x: number): string =>
    JSON.stringify({ pageOrder: [page], page, boards: { [page]: [{ id: 'w' + key, key, view: 'knob', x, y: 0, w: 1, h: 1 }] } });
  function legacyFamily() {
    const m = memStore();
    m.data.set(legacyMetaKey('Amp'), JSON.stringify({ active: 'Live', names: ['Default', 'Blank', 'Live', 'Studio'] }));
    m.data.set(legacyBoardKey('Amp', 'Live'), v1('Gig', 'k0', 1));
    m.data.set(legacyBoardKey('Amp', 'Studio'), v1('Desk', 'k1', 2));
    const local = new Map([[legacySingleKey('Amp'), v1('Old', 'k2', 0)]]);
    const legacy: KeyValueStore = { get: (k) => local.get(k) ?? null, set: () => {} };
    const open = () => {
      const st = new BeState(m.store, legacy);
      const cat = catalog();
      st.sync(src({ catalog: cat, variantSig: '', deviceSeed: () => ({ ...seedFrom(cat), variantSig: undefined }) }));
      return st;
    };
    return { m, open };
  }
  const pagesOf = (st: BeState, profile: string) => {
    st.setProfile(profile);
    return st.board!.pageOrder;
  };
  const expectEveryProfile = (st: BeState) => {
    expect(pagesOf(st, 'Studio')).toEqual(['Desk']);
    expect(pagesOf(st, 'Default')).toEqual(['Old']);
    expect(pagesOf(st, 'Live')).toEqual(['Gig']);
  };

  it('loads the active legacy profile without writing', () => {
    const { m, open } = legacyFamily();
    const st = open();
    expect(st.profile).toBe('Live');
    expect(st.source).toBe('legacy');
    expect(st.board!.pageOrder).toEqual(['Gig']);
    expect(m.writes).toEqual([]);
  });

  it('a profile switch keeps every other legacy profile reachable', () => {
    const { m, open } = legacyFamily();
    const st = open();
    expectEveryProfile(st);
    expect(m.writes.some((k) => k.startsWith('axs.surface'))).toBe(false);
    expect(JSON.parse(m.data.get(metaKey('Amp'))!).migrated).toBe(true);
    // and after a reload too
    expectEveryProfile(open());
  });

  it('a prefs click (Top / Side, S / M / L) carries every legacy profile over first', () => {
    const { m, open } = legacyFamily();
    const st = open();
    st.setPrefs({ nav: 'top' }); // the built-in default is the side list, so a change to Top triggers the carry-over
    for (const p of ['Default', 'Live', 'Studio']) expect(m.data.has(boardKey('Amp', p, 'desktop'))).toBe(true);
    const again = open();
    expect(again.prefs.nav).toBe('top');
    expect(again.source).toBe('desktop');
    expectEveryProfile(again);
  });

  it('moving one tile keeps the other profiles and the moved position', () => {
    const { open } = legacyFamily();
    const st = open();
    const it = st.board!.boards.Gig![0]!;
    st.commit(moveItem(st.board!, it.id, 'Gig', 10, 2).board);
    const again = open();
    expect(again.board!.boards.Gig![0]).toMatchObject({ key: 'k0', x: 10, y: 2 });
    expect(pagesOf(again, 'Studio')).toEqual(['Desk']);
    expect(pagesOf(again, 'Default')).toEqual(['Old']);
  });
});

describe('BeState layout status, resets and the default for the type', () => {
  const differs = (st: BeState) => boardDiffersFromSeed(st.board!, st.seed!);

  it('the seed is the device layout until a default is saved; a change makes the layout custom', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    expect(st.userSeed).toBe(false);
    expect(st.seed?.pageOrder).toEqual(['One', 'Two']);
    expect(differs(st)).toBe(false);
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    expect(differs(st)).toBe(true);
    // a page switch is navigation, not a change
    st.setPage('Two');
    expect(differs(st)).toBe(true);
    st.resetAll();
    expect(differs(st)).toBe(false);
    expect(st.board!.page).toBe('Two');
    expect(new BeState(m.store).sync(src())).toBe(true);
  });

  it('reset this page puts only the current page back and saves', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    let b = moveItem(st.board!, 'w0.k0', 'One', 0, 4).board;
    b = addControl(b, 'Two', { key: 'k1', view: 'knob' }).board;
    st.commit(b);
    st.setPage('Two');
    st.resetPage();
    expect(st.board!.boards.Two!.map((i) => (i as { key: string }).key)).toEqual(['bypass']);
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 4 }); // the other page keeps its change
    expect(differs(st)).toBe(true);
    st.setPage('One');
    st.resetPage();
    expect(differs(st)).toBe(false);
    const again = new BeState(m.store);
    again.sync(src());
    expect(find(again.board, 'One', 'w0.k0')).toMatchObject({ y: 0 });
  });

  it('save as default: stored per family, the seed of every profile, used before the device layout', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.saveAsDefault();
    expect(st.userSeed).toBe(true);
    expect(m.data.has(seedKey('Amp'))).toBe(true);
    expect(differs(st)).toBe(false); // the layout now equals its seed
    // a new copy and the Blank profile
    st.addProfile();
    expect(differs(st)).toBe(false);
    st.setProfile('Blank');
    expect(st.seed!.pageOrder).toEqual(['Page 1']);
    // a type change re-seeds Default from the saved default, not from the device layout
    st.setProfile('Default');
    const cat = catalog();
    st.sync(src({ variantSig: 'OTHER', deviceSeed: () => seedFrom(cat, 'OTHER') }));
    expect(st.source).toBe('user-seed');
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 4 });
    // reset all goes back to the saved default; reset to device to the device layout
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 8).board);
    st.resetAll();
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 4 });
    st.resetToDevice();
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 0 });
    expect(differs(st)).toBe(true);
    // forgetting the default makes the device layout the seed again
    st.forgetDefault();
    expect(st.userSeed).toBe(false);
    expect(m.data.has(seedKey('Amp'))).toBe(false);
    expect(differs(st)).toBe(false);
  });

  it('reset this page leaves an unchanged page alone (no write)', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.setPage('Two'); // unchanged page
    const writes = m.writes.length;
    expect(st.resetPage()).toBeNull();
    expect(m.writes.length).toBe(writes);
    st.setPage('One');
    expect(st.resetPage()).not.toBeNull();
  });

  it('a board loaded from the saved default: loading writes nothing; forgetting the default shows the device layout without writing', () => {
    const m = memStore();
    const first = new BeState(m.store);
    first.sync(src());
    first.commit(moveItem(first.board!, 'w0.k0', 'One', 0, 4).board);
    first.saveAsDefault();
    // a fresh family state (other storage keys gone): Default loads from the saved default
    const m2 = memStore();
    m2.data.set(seedKey('Amp'), m.data.get(seedKey('Amp'))!);
    const st = new BeState(m2.store);
    st.sync(src());
    expect(st.source).toBe('user-seed');
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 4 });
    expect(m2.writes).toEqual([]);
    st.setPage('Two');
    st.forgetDefault();
    expect(m2.writes).toEqual(['-' + seedKey('Amp')]); // only the default itself goes
    expect(st.source).toBe('seed');
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 0 }); // the device layout, as a remount would show
    expect(st.board!.page).toBe('Two');
    expect(differs(st)).toBe(false);
  });

  it('forgetting the default keeps a board the profile already saved', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.saveAsDefault();
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 6).board);
    expect(st.source).toBe('desktop');
    st.forgetDefault();
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ y: 6 });
  });

  it('saving the default of a family that still reads the previous editor keys carries them over first', () => {
    const m = memStore();
    m.data.set(legacyMetaKey('Amp'), JSON.stringify({ active: 'Live', names: ['Default', 'Blank', 'Live'] }));
    m.data.set(legacyBoardKey('Amp', 'Live'), JSON.stringify({ pageOrder: ['Gig'], page: 'Gig', boards: { Gig: [{ id: 'w', key: 'k0', view: 'knob', x: 1, y: 0, w: 1, h: 1 }] } }));
    const st = new BeState(m.store);
    st.sync(src());
    expect(st.source).toBe('legacy');
    expect(m.writes).toEqual([]);
    st.saveAsDefault();
    expect(m.data.has(boardKey('Amp', 'Live', 'desktop'))).toBe(true);
    const again = new BeState(m.store);
    again.sync(src());
    expect(again.profile).toBe('Live');
    expect(again.board!.pageOrder).toEqual(['Gig']);
  });
});

describe('BeState Arrange undo', () => {
  const arranging = (m = memStore()) => {
    const st = new BeState(m.store);
    st.sync(src());
    st.setEditMode(true, 40);
    return { st, m };
  };
  const writesOfBoard = (m: ReturnType<typeof memStore>) => m.writes.filter((k) => k === boardKey('Amp', 'Default', 'desktop')).length;

  it('every committed change while arranging is one undo step; undo puts it back and saves once', () => {
    const { st, m } = arranging();
    const start = st.board!;
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.commit(moveItem(st.board!, 'w0.k1', 'One', 4, 4).board);
    expect(st.undoStack).toHaveLength(2);
    expect(st.canUndo).toBe(true);
    const saves = writesOfBoard(m);
    expect(st.undo()).toBe(true);
    expect(writesOfBoard(m)).toBe(saves + 1);
    expect(find(st.board, 'One', 'w0.k1')).toMatchObject({ x: 2, y: 0 });
    expect(find(st.board, 'One', 'w0.k0')).toMatchObject({ x: 0, y: 4 });
    st.undo();
    expect(st.board).toEqual(start);
    expect(st.canUndo).toBe(false);
    expect(st.undo()).toBe(false);
    // the undone board is what a new editor loads
    const again = new BeState(m.store);
    again.sync(src());
    expect(find(again.board, 'One', 'w0.k0')).toMatchObject({ x: 0, y: 0 });
  });

  it('undo keeps the page the user is on when the restored board has it', () => {
    const { st } = arranging();
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.setPage('Two');
    st.undo();
    expect(st.board!.page).toBe('Two');
  });

  it('changes outside Arrange are not undoable; the stack is capped', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src());
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    expect(st.canUndo).toBe(false);
    st.setEditMode(true, 40);
    for (let i = 0; i < UNDO_CAP + 5; i++) st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4 + ((i + 1) % 2) * 2).board);
    expect(st.undoStack).toHaveLength(UNDO_CAP);
  });

  it('a previewed gesture (corner resize) is one step: flush(before)', () => {
    const { st } = arranging();
    const before = st.board!;
    const mid = moveItem(before, 'w0.k0', 'One', 0, 3).board;
    st.preview(mid);
    st.preview(moveItem(mid, 'w0.k0', 'One', 0, 5).board);
    st.flush(before);
    expect(st.undoStack).toEqual([before]);
    st.flush(); // a flush without a start board adds no step
    expect(st.undoStack).toHaveLength(1);
  });

  it('is cleared when Arrange ends or starts, on a profile switch and on a reload', () => {
    const { st } = arranging();
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 4).board);
    st.setEditMode(false);
    expect(st.canUndo).toBe(false);
    st.setEditMode(true, 40);
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 6).board);
    st.setProfile('Blank');
    expect(st.canUndo).toBe(false);
    st.setProfile('Default');
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 8).board);
    expect(st.canUndo).toBe(true);
    st.sync(src({ rev: 1 }));
    expect(st.canUndo).toBe(false);
    expect(st.editMode).toBe(true); // same family: arranging goes on
  });
});

describe('BeState: the device default with positions (slice 6)', () => {
  // the device default as earlier versions built it (rows only) and as it is built now (positions: the
  // knobs one slot apart, a section divider)
  const cat = catalog();
  const before = seedFrom(cat);
  const now = (): BeBoard => {
    const b = seedFrom(cat);
    return { ...b, boards: { ...b.boards, One: [...b.boards.One!.map((i) => ({ ...i, x: i.x * 2, y: 1 })), { id: 'w0.div0', kind: 'hdiv', x: 0, y: 0, w: 10, h: 1, label: 'Tone' }] } };
  };
  const withPositions = (over: Partial<BeSource> = {}) => src({ catalog: cat, deviceSeed: now, previousSeed: () => before, ...over });

  it('no stored board: the positioned default, no dot, nothing written', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(withPositions());
    expect(st.source).toBe('seed');
    expect(find(st.board, 'One', 'w0.div0')).toMatchObject({ label: 'Tone' });
    expect(boardDiffersFromSeed(st.board!, st.seed!)).toBe(false);
    expect(m.writes).toEqual([]);
  });

  it('a stored board that is still the previous default shows the positions (no dot, no write); an edited one keeps its content', () => {
    const m = memStore();
    m.data.set(boardKey('Amp', 'Default', 'desktop'), JSON.stringify({ ...before, page: 'Two' }));
    const st = new BeState(m.store);
    st.sync(withPositions());
    expect(st.source).toBe('seed');
    expect(st.board!.page).toBe('Two');
    expect(find(st.board, 'One', 'w0.k1')).toMatchObject({ x: 4, y: 1 });
    expect(boardDiffersFromSeed(st.board!, st.seed!)).toBe(false);
    expect(m.writes).toEqual([]);

    const edited = { ...before, boards: { ...before.boards, One: before.boards.One!.map((i) => (i.id === 'w0.k2' ? { ...i, y: 6 } : i)) } };
    const m2 = memStore();
    m2.data.set(boardKey('Amp', 'Default', 'desktop'), JSON.stringify(edited));
    const st2 = new BeState(m2.store);
    st2.sync(withPositions());
    expect(st2.source).toBe('desktop');
    expect(find(st2.board, 'One', 'w0.k2')).toMatchObject({ x: 4, y: 6 });
    expect(boardDiffersFromSeed(st2.board!, st2.seed!)).toBe(true);
    // "Reset to device layout" (the whole-layout reset of the Default profile) brings the positions back
    st2.resetAll();
    expect(find(st2.board, 'One', 'w0.k2')).toMatchObject({ x: 8, y: 1 });
    expect(boardDiffersFromSeed(st2.board!, st2.seed!)).toBe(false);
  });

  it('the previous default is built only when a stored Default board is compared with it (never on a save)', () => {
    let built = 0;
    const m = memStore();
    const st = new BeState(m.store);
    const source = withPositions({ previousSeed: () => (built++, before) });
    st.sync(source);
    expect(built).toBe(0); // nothing stored
    const r = moveItem(st.board!, 'w0.k0', 'One', 0, 6);
    st.commit(r.board); // the first save carries legacy boards over: none stored, nothing built
    st.commit(moveItem(st.board!, 'w0.k0', 'One', 0, 8).board); // migrated: no carry-over at all
    expect(built).toBe(0);
    const st2 = new BeState(m.store);
    st2.sync(source); // a stored (edited) Default board: compared once
    expect(built).toBe(1);
    expect(st2.source).toBe('desktop');
  });
});

describe('BeState: the fixed area', () => {
  const withArea = (cat: readonly BeCtl[]): BeBoard => ({ ...seedFrom(cat), fixed: { cols: 4, items: [{ id: 'wf.k9', key: 'k9', view: 'knob', x: 0, y: 0, w: 2, h: 2 }] } });
  const cat = catalog(10);
  const start = () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src({ catalog: cat, deviceSeed: () => withArea(cat) }));
    return { m, st };
  };

  it('moves between page and area are saved with the board and undone in one step', () => {
    const { m, st } = start();
    st.setEditMode(true);
    st.commit(moveToPage(st.board!, 'w0.k0', FIXED_PAGE).board);
    const saved = JSON.parse(m.data.get(boardKey('Amp', 'Default', 'desktop'))!) as BeBoard;
    expect(saved.fixed!.items.map((i) => i.id)).toEqual(['wf.k9', 'w0.k0']);
    expect(saved.boards.One!.map((i) => i.id)).not.toContain('w0.k0');
    expect(st.undo()).toBe(true);
    expect(st.board!.fixed!.items.map((i) => i.id)).toEqual(['wf.k9']);
    expect(find(st.board, 'One', 'w0.k0')).toBeTruthy();
    // the width too
    st.commit(setFixedCols(st.board!, 6).board);
    expect(st.board!.fixed!.cols).toBe(6);
    st.undo();
    expect(st.board!.fixed!.cols).toBe(4);
  });

  it('Reset fixed area: back to the seed’s (the pages stay); no write when it already is', () => {
    const { m, st } = start();
    expect(st.resetFixed()).toBe(false);
    expect(m.writes).toEqual([]);
    st.commit(moveToPage(setFixedCols(st.board!, 8).board, 'w0.k0', FIXED_PAGE).board);
    const pages = st.board!.boards;
    expect(st.resetFixed()).toBe(true);
    expect(st.board!.fixed).toEqual(withArea(cat).fixed);
    expect(st.board!.boards).toEqual(pages);
    // and the whole-layout resets bring it back as well
    st.commit({ ...st.board!, fixed: { cols: 2, items: [] } });
    st.resetAll();
    expect(st.board!.fixed).toEqual(withArea(cat).fixed);
    st.commit({ ...st.board!, fixed: { cols: 2, items: [] } });
    st.resetToDevice();
    expect(st.board!.fixed).toEqual(withArea(cat).fixed);
  });

  it('a seed without an area: the reset takes it away', () => {
    const m = memStore();
    const st = new BeState(m.store);
    st.sync(src({ catalog: cat }));
    st.commit({ ...st.board!, fixed: { cols: 4, items: [] } });
    expect(st.resetFixed()).toBe(true);
    expect('fixed' in st.board!).toBe(false);
    expect('fixed' in (JSON.parse(m.data.get(boardKey('Amp', 'Default', 'desktop'))!) as object)).toBe(false);
  });

  it('New copy, "Save as default" and the Blank profile', () => {
    const { m, st } = start();
    st.commit(setFixedCols(st.board!, 6).board);
    const name = st.addProfile()!;
    expect(st.board!.fixed!.cols).toBe(6);
    st.commit(setFixedCols(st.board!, 8).board);
    expect(JSON.parse(m.data.get(boardKey('Amp', name, 'desktop'))!).fixed.cols).toBe(8);
    st.setProfile('Default');
    expect(st.board!.fixed!.cols).toBe(6);
    st.setProfile('Blank');
    expect(st.board!.fixed).toBeUndefined();
    st.setProfile(name);
    st.saveAsDefault();
    expect(JSON.parse(m.data.get(seedKey('Amp'))!).fixed.cols).toBe(8);
    expect(st.seed!.fixed!.cols).toBe(8);
    st.deleteProfile(name);
    expect(m.data.has(boardKey('Amp', name, 'desktop'))).toBe(false);
    expect(st.board!.fixed!.cols).toBe(6); // Default has its own board
  });

  it('what the header shows is part of the source: a change re-seeds, without a write', () => {
    const { m, st } = start();
    const over = { catalog: cat, deviceSeed: () => seedFrom(cat), header: 'true:7:8' };
    expect(st.sync(src(over))).toBe(true);
    expect(st.board!.fixed).toBeUndefined();
    expect(st.sync(src(over))).toBe(false);
    expect(m.writes).toEqual([]);
  });
});
