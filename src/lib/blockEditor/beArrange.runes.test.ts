import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeArrange } from './beArrange.svelte';
import { BeState } from './beState.svelte';
import { FIXED_PAGE, locate, type BeBoard } from './boardModel';
import { buildCatalog } from './catalog';

function arrange() {
  const catalog = buildCatalog({ params: [{ id: 1, name: 'Mix' }], enums: [] });
  const seed: BeBoard = {
    v: 2,
    page: 'One',
    pageOrder: ['One', 'Two'],
    boards: { One: [{ id: 'mix', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }], Two: [] },
    fixed: { cols: 4, items: [] }
  };
  const be = new BeState({ get: () => null, set: vi.fn() });
  be.sync({ slug: 'Test', catalog, deviceClass: 'desktop', variantSig: '', deviceSeed: () => seed, rev: 0 });
  be.setEditMode(true);
  const wnd = new EventTarget();
  vi.stubGlobal('window', wnd);
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const arr = new BeArrange({
    be,
    root: () => null,
    layer: () => null,
    isDrawn: () => true,
    ctl: (key) => catalog.find((c) => c.key === key),
    autoScroll: vi.fn(),
    holdPage: vi.fn(),
    showPage: vi.fn(),
    setPage: (page) => be.setPage(page),
    focusBoard: vi.fn(),
    reveal: vi.fn(),
    toast: vi.fn(),
    leave: vi.fn()
  });
  return { arr, be, wnd };
}

const pointer = (type: string, x: number, buttons: number) =>
  Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: 'mouse', button: 0, buttons, clientX: x }) as PointerEvent;

const handle = () => ({ offsetWidth: 8, getBoundingClientRect: () => ({ width: 8 }), focus: vi.fn() }) as unknown as HTMLElement;

afterEach(() => vi.unstubAllGlobals());

describe('Arrange fixed area', () => {
  it('follows the moved selection into the fixed area and onto its destination page', () => {
    const { arr, be } = arrange();
    arr.moveTo('mix', FIXED_PAGE);
    expect(arr.sel).toBe('mix');
    expect(arr.target).toBe(FIXED_PAGE);
    expect(be.board?.page).toBe('One');
    arr.moveTo('mix', 'Two');
    expect(arr.sel).toBe('mix');
    expect(locate(be.board!, 'mix')?.page).toBe('Two');
    expect(be.board?.page).toBe('Two');
    expect(arr.target).toBe('Two');
  });

  it('ignores tile shortcuts while the width handle has focus', () => {
    const { arr, be } = arrange();
    arr.select('mix');
    const separator = { closest: (selector: string): object | null => (selector === '[data-be-fixed-handle]' ? separator : null) };
    vi.stubGlobal('document', { body: separator });
    const key = { key: 'Delete', target: separator, defaultPrevented: false, preventDefault: vi.fn() };
    arr.keydown(key as unknown as KeyboardEvent);
    expect(locate(be.board!, 'mix')?.page).toBe('One');
  });

  it.each(['a buttonless mouse move', 'blur'])('caps and saves the width when the drag ends with %s', (end) => {
    const { arr, be, wnd } = arrange();
    const detach = arr.attach();
    try {
      arr.colsDown(pointer('pointerdown', 100, 1), handle(), 20, 1, { min: 2, max: 5 });
      wnd.dispatchEvent(pointer('pointermove', 180, 1));
      expect(be.board?.fixed?.cols).toBe(5);
      expect(arr.sizingFixed).toBe(true);
      wnd.dispatchEvent(end === 'blur' ? new Event('blur') : pointer('pointermove', 60, 0));
      expect(arr.sizingFixed).toBe(false);
      expect(be.board?.fixed?.cols).toBe(5);
      expect(be.undoStack).toHaveLength(1);
      wnd.dispatchEvent(pointer('pointermove', 60, 1));
      expect(be.board?.fixed?.cols).toBe(5);
      arr.undo();
      expect(be.board?.fixed?.cols).toBe(4);
    } finally {
      detach();
    }
  });
});
