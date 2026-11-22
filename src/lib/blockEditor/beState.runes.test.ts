// BeState is a rune module (`$state`), so it runs in the `runes` project (client-mode compile).
import { describe, expect, it } from 'vitest';
import { BeState, emptyBoard, type BeSource, type BeStorage } from './beState.svelte';
import { boardKey, legacyBoardKey, legacyMetaKey, legacySingleKey, metaKey, type KeyValueStore } from './boardPersistence';
import { buildCatalog, type BeCtl } from './catalog';
import { addControl, moveItem, type BeBoard } from './boardModel';

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
    expect(st.prefs).toEqual({ nav: 'top', density: 'm' });
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
    st.setPrefs({ nav: 'side' });
    for (const p of ['Default', 'Live', 'Studio']) expect(m.data.has(boardKey('Amp', p, 'desktop'))).toBe(true);
    const again = open();
    expect(again.prefs.nav).toBe('side');
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
