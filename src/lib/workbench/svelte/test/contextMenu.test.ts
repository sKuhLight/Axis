import { describe, expect, it } from 'vitest';
import {
  MENU_INTERACTION_IDLE,
  activateMenuRow,
  backMenuStep,
  cancelMenuRow,
  clampMenuPosition,
  confirmMenuRow,
  editMenuDraft,
  effectiveZoom,
  escapeMenuStep,
  menuInputKey,
  submitMenuInput,
  isMenuItemFocusable,
  menuItemKind,
  menuPositionBelowRect,
  nextMenuItemIndex,
  resolveAnchoredMenuPlacement,
  resolveMenuPath,
  resolveMenuPlacement,
  type WorkbenchMenuItem
} from '../contextMenu';

describe('context menu helpers', () => {
  it('keeps menus inside the viewport with a small margin', () => {
    expect(clampMenuPosition({ x: 390, y: 290 }, { width: 400, height: 300 }, { width: 120, height: 80 })).toEqual({
      x: 272,
      y: 212
    });
    expect(clampMenuPosition({ x: -20, y: -10 }, { width: 400, height: 300 }, { width: 120, height: 80 })).toEqual({
      x: 8,
      y: 8
    });
  });
});

describe('menuPositionBelowRect', () => {
  it('aligns x to the left edge and drops y a default gap below the bottom edge', () => {
    expect(menuPositionBelowRect({ left: 120, bottom: 240 })).toEqual({ x: 120, y: 246 });
  });

  it('honours a custom gap', () => {
    expect(menuPositionBelowRect({ left: 40, bottom: 80 }, 12)).toEqual({ x: 40, y: 92 });
  });

  it('composes with clampMenuPosition to stay on a short viewport (menu flips against the bottom margin)', () => {
    // A unit near the bottom of a phone viewport: the raw below-anchor would
    // overflow, so clamping pins it to the bottom margin (viewport - menu - 8).
    const viewport = { width: 390, height: 640 };
    const menu = { width: 200, height: 180 };
    const below = menuPositionBelowRect({ left: 24, bottom: 620 });
    expect(clampMenuPosition(below, viewport, menu)).toEqual({
      x: 24,
      y: viewport.height - menu.height - 8
    });
  });
});

describe('effectiveZoom', () => {
  it('is identity when visual and layout widths match (no CSS zoom)', () => {
    expect(effectiveZoom(1000, 1000)).toBe(1);
  });

  it('reports the ancestor CSS zoom factor from the visual/layout width ratio', () => {
    expect(effectiveZoom(900, 1000)).toBeCloseTo(0.9, 6); // scale 90%
    expect(effectiveZoom(1300, 1000)).toBeCloseTo(1.3, 6); // scale 130%
  });

  it('falls back to identity when a measurement is missing (SSR / detached)', () => {
    expect(effectiveZoom(0, 1000)).toBe(1);
    expect(effectiveZoom(900, 0)).toBe(1);
  });
});

describe('resolveMenuPlacement', () => {
  const viewport = { width: 1000, height: 800 };
  const menu = { width: 200, height: 120 };

  it('is a no-op division at 100% scale (matches clampMenuPosition)', () => {
    const clamped = clampMenuPosition({ x: 300, y: 200 }, viewport, menu);
    expect(resolveMenuPlacement({ x: 300, y: 200 }, viewport, menu, 1)).toEqual(clamped);
  });

  it('divides the clamped visual position by the effective zoom so a fixed menu in a zoomed subtree lands under the cursor', () => {
    // At scale 90% the pointer/viewport/menu-box are visual; the fixed menu
    // positions in layout space, so left/top must be pre-divided by 0.9.
    const zoom = 0.9;
    const clamped = clampMenuPosition({ x: 300, y: 200 }, viewport, menu);
    expect(resolveMenuPlacement({ x: 300, y: 200 }, viewport, menu, zoom)).toEqual({
      x: clamped.x / zoom,
      y: clamped.y / zoom
    });
  });

  it('clamps in visual space before de-zooming (visual viewport + visual menu box)', () => {
    // Position past the visual right/bottom edge is clamped to the visual margin,
    // then de-zoomed — the emitted layout coord is the clamped visual value / zoom.
    const zoom = 1.25;
    const result = resolveMenuPlacement({ x: 5000, y: 5000 }, viewport, menu, zoom);
    expect(result).toEqual({
      x: (viewport.width - menu.width - 8) / zoom,
      y: (viewport.height - menu.height - 8) / zoom
    });
  });

  it('guards a zero/negative zoom to identity', () => {
    const clamped = clampMenuPosition({ x: 300, y: 200 }, viewport, menu);
    expect(resolveMenuPlacement({ x: 300, y: 200 }, viewport, menu, 0)).toEqual(clamped);
  });
});

describe('menu rows (kinds, focus order, drill-in)', () => {
  const noop = () => {};
  const row = (id: string, extra: Partial<WorkbenchMenuItem> = {}): WorkbenchMenuItem => ({ id, label: id, run: noop, ...extra });

  it('treats an omitted kind as a plain item and headers / disabled rows as unfocusable', () => {
    expect(menuItemKind(row('a'))).toBe('item');
    expect(menuItemKind(row('r', { kind: 'radio' }))).toBe('radio');
    expect(isMenuItemFocusable(row('a'))).toBe(true);
    expect(isMenuItemFocusable(row('h', { kind: 'header' }))).toBe(false);
    expect(isMenuItemFocusable(row('d', { disabled: true }))).toBe(false);
    expect(isMenuItemFocusable(row('s', { kind: 'submenu' }))).toBe(true);
  });

  it('steps to the next focusable row, skipping headers and disabled rows, wrapping at the ends', () => {
    const rows = [row('h', { kind: 'header' }), row('a'), row('x', { disabled: true }), row('b'), row('h2', { kind: 'header' })];
    expect(nextMenuItemIndex(rows, -1, 1)).toBe(1); // first focusable
    expect(nextMenuItemIndex(rows, -1, -1)).toBe(3); // last focusable
    expect(nextMenuItemIndex(rows, 1, 1)).toBe(3); // skips the disabled row
    expect(nextMenuItemIndex(rows, 3, 1)).toBe(1); // wraps past the trailing header
    expect(nextMenuItemIndex(rows, 1, -1)).toBe(3); // wraps backwards past the leading header
  });

  it('returns -1 when nothing is focusable', () => {
    expect(nextMenuItemIndex([], -1, 1)).toBe(-1);
    expect(nextMenuItemIndex([row('h', { kind: 'header' }), row('d', { disabled: true })], -1, 1)).toBe(-1);
  });

  it('resolves a drill-in path to its level and trail', () => {
    const leaf = row('leaf');
    const inner = row('inner', { kind: 'submenu', items: [leaf] });
    const outer = row('outer', { kind: 'submenu', items: [row('x'), inner] });
    const items = [row('top'), outer];
    expect(resolveMenuPath(items, [])).toEqual({ items, path: [], trail: [] });
    const level = resolveMenuPath(items, ['outer', 'inner']);
    expect(level.items).toEqual([leaf]);
    expect(level.path).toEqual(['outer', 'inner']);
    expect(level.trail.map((item) => item.id)).toEqual(['outer', 'inner']);
  });

  it('truncates a stale path at the first segment that is no longer a submenu', () => {
    const outer = row('outer', { kind: 'submenu', items: [row('plain')] });
    const items = [outer];
    expect(resolveMenuPath(items, ['outer', 'gone']).path).toEqual(['outer']);
    expect(resolveMenuPath(items, ['outer', 'plain']).path).toEqual(['outer']); // not a submenu
    expect(resolveMenuPath(items, ['missing', 'outer'])).toEqual({ items, path: [], trail: [] });
  });
});

describe('resolveAnchoredMenuPlacement', () => {
  const viewport = { width: 1440, height: 900 };
  const menu = { width: 268, height: 300 };

  it('opens below the anchor, aligned to its left edge', () => {
    expect(resolveAnchoredMenuPlacement({ left: 200, bottom: 32 }, viewport, menu, 1)).toEqual({
      x: 200,
      y: 36,
      maxHeight: 900 - 36 - 8
    });
  });

  it('shifts left to stay inside the viewport for a right-edge trigger', () => {
    const placed = resolveAnchoredMenuPlacement({ left: 1400, bottom: 32 }, viewport, menu, 1);
    expect(placed.x).toBe(1440 - 268 - 8);
  });

  it('never flips up over its trigger: a tall menu is capped and scrolls instead', () => {
    const placed = resolveAnchoredMenuPlacement({ left: 10, bottom: 52 }, { width: 390, height: 500 }, { width: 268, height: 900 }, 1);
    expect(placed.y).toBe(56);
    expect(placed.maxHeight).toBe(500 - 56 - 8);
  });

  it('de-zooms the visual placement like the pointer path', () => {
    const placed = resolveAnchoredMenuPlacement({ left: 200, bottom: 32 }, viewport, menu, 1.25);
    expect(placed.x).toBeCloseTo(200 / 1.25, 6);
    expect(placed.y).toBeCloseTo(36 / 1.25, 6);
  });
});

describe('menu interaction state machine', () => {
  const noop = () => {};
  const idle = MENU_INTERACTION_IDLE;
  const row = (id: string, extra: Partial<WorkbenchMenuItem> = {}): WorkbenchMenuItem => ({ id, label: id, run: noop, ...extra });

  it('a plain item runs and closes on activation', () => {
    expect(activateMenuRow(idle, row('a'))).toMatchObject({ run: true, close: true });
  });

  it('headers and disabled rows do nothing', () => {
    for (const item of [row('h', { kind: 'header' }), row('d', { disabled: true }), row('dc', { disabled: true, confirm: { prompt: 'x' } })]) {
      expect(activateMenuRow(idle, item)).toEqual({ state: idle, run: false, close: false, focus: null });
    }
  });

  it('an item with confirm NEVER runs on activation — only on Confirm of its own prompt', () => {
    const del = row('del', { confirm: { prompt: 'Delete?' } });
    const first = activateMenuRow(idle, del);
    expect(first).toMatchObject({ run: false, close: false, focus: { kind: 'cancel' } });
    expect(first.state.confirmingId).toBe('del');
    // Activating it again while its prompt shows still does not run it.
    expect(activateMenuRow(first.state, del).run).toBe(false);
    // Confirm of a different row's prompt does not run it either.
    expect(confirmMenuRow(idle, del).run).toBe(false);
    expect(confirmMenuRow(first.state, row('other', { confirm: { prompt: 'x' } })).run).toBe(false);
    // Only Confirm on its own open prompt runs (and closes).
    const confirmed = confirmMenuRow(first.state, del);
    expect(confirmed).toMatchObject({ run: true, close: true });
    expect(confirmed.state.confirmingId).toBeNull();
  });

  it('Cancel returns focus to the row', () => {
    const open = activateMenuRow(idle, row('del', { confirm: { prompt: 'x' } })).state;
    expect(cancelMenuRow(open)).toMatchObject({ run: false, close: false, focus: { kind: 'row', id: 'del' } });
    expect(cancelMenuRow(open).state.confirmingId).toBeNull();
  });

  it('a submenu drills in; Back returns to the submenu row', () => {
    const sub = row('sub', { kind: 'submenu', items: [row('child')] });
    const inside = activateMenuRow(idle, sub);
    expect(inside.state.path).toEqual(['sub']);
    expect(inside.focus).toEqual({ kind: 'first-child' });
    const back = backMenuStep(inside.state);
    expect(back.state.path).toEqual([]);
    expect(back.focus).toEqual({ kind: 'row', id: 'sub' });
    expect(backMenuStep(idle)).toMatchObject({ close: false, focus: null });
  });

  it('Escape unwinds: open input / confirm first, then one submenu level, then close', () => {
    const rename = row('rename', { kind: 'input', value: 'Grid' });
    const del = row('del', { confirm: { prompt: 'x' } });
    const inSub = activateMenuRow(idle, row('sub', { kind: 'submenu', items: [rename, del] })).state;

    // An open field inside a submenu: Escape closes the field only.
    const editing = activateMenuRow(inSub, rename).state;
    expect(editing).toMatchObject({ editingId: 'rename', draft: 'Grid', path: ['sub'] });
    const e1 = escapeMenuStep(editing);
    expect(e1.state).toMatchObject({ editingId: null, path: ['sub'] });
    expect(e1).toMatchObject({ close: false, focus: { kind: 'row', id: 'rename' } });

    // An open confirm: Escape cancels the prompt only.
    const confirming = activateMenuRow(inSub, del).state;
    const e2 = escapeMenuStep(confirming);
    expect(e2.state).toMatchObject({ confirmingId: null, path: ['sub'] });
    expect(e2.close).toBe(false);

    // Then one level back …
    const e3 = escapeMenuStep(e2.state);
    expect(e3.state.path).toEqual([]);
    expect(e3.close).toBe(false);
    // … and only at the root does Escape close.
    expect(escapeMenuStep(e3.state)).toMatchObject({ close: true, run: false });
  });

  it('Enter in an input row submits the draft; a false return keeps the field open', () => {
    const seen: string[] = [];
    let accept = false;
    const rename = row('rename', {
      kind: 'input',
      value: 'Grid',
      onSubmit: (value) => {
        seen.push(value);
        return accept;
      }
    });
    const editing = editMenuDraft(activateMenuRow(idle, rename).state, '');
    const rejected = menuInputKey(editing, rename, 'Enter')!;
    expect(seen).toEqual(['']);
    expect(rejected).toMatchObject({ close: false, focus: { kind: 'input' } });
    expect(rejected.state.editingId).toBe('rename');

    accept = true;
    const accepted = menuInputKey(editMenuDraft(rejected.state, 'Pedalboard'), rename, 'Enter')!;
    expect(seen).toEqual(['', 'Pedalboard']);
    expect(accepted.close).toBe(true);
    expect(accepted.state.editingId).toBeNull();

    // A void return counts as accepted.
    const voidRow = row('v', { kind: 'input', onSubmit: () => {} });
    expect(submitMenuInput(activateMenuRow(idle, voidRow).state, voidRow).close).toBe(true);
    // Escape in the field cancels it; other keys are not handled.
    expect(menuInputKey(editing, rename, 'Escape')?.state.editingId).toBeNull();
    expect(menuInputKey(editing, rename, 'a')).toBeNull();
    // Submitting a row whose field is not open does nothing.
    expect(submitMenuInput(idle, rename)).toMatchObject({ close: false, run: false });
  });
});
