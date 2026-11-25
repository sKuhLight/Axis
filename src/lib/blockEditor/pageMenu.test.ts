import { describe, expect, it, vi } from 'vitest';
import { buildPageMenu, type PageMenuActions, type PageMenuState } from './pageMenu';

const acts = () => {
  const a = {
    rename: vi.fn<(name: string) => boolean>(() => true),
    duplicate: vi.fn<() => void>(),
    pin: vi.fn<() => void>(),
    move: vi.fn<(delta: -1 | 1) => void>(),
    remove: vi.fn<() => void>(),
    add: vi.fn<() => void>()
  };
  return a satisfies PageMenuActions;
};
const state = (over: Partial<PageMenuState> = {}): PageMenuState => ({ page: 'Preamp', pageOrder: ['Authentic', 'Preamp', 'EQ'], nav: 'top', canPin: true, pinCount: 5, ...over });
const ids = (rows: ReturnType<typeof buildPageMenu>) => rows.map((r) => r.id);

describe('buildPageMenu', () => {
  it('rows in order, headed by the page', () => {
    const rows = buildPageMenu(state(), acts());
    expect(ids(rows)).toEqual(['head', 'rename', 'duplicate', 'pin', 'earlier', 'later', 'delete', 'add']);
    expect(rows[0]).toMatchObject({ kind: 'header', label: 'Preamp' });
    for (const r of rows) expect(r.className).toMatch(/\bbe-pm-/);
  });

  it('rename is an inline field with the page name; its result keeps or closes the field', () => {
    const a = acts();
    const rename = buildPageMenu(state(), a).find((r) => r.id === 'rename')!;
    expect(rename).toMatchObject({ kind: 'input', value: 'Preamp' });
    expect(rename.onSubmit!('Pre')).toBe(true);
    expect(a.rename).toHaveBeenCalledWith('Pre');
    a.rename.mockReturnValueOnce(false);
    expect(rename.onSubmit!('EQ')).toBe(false);
  });

  it('move words follow the navigation and the ends are disabled', () => {
    const top = buildPageMenu(state({ page: 'Authentic' }), acts());
    expect(top.find((r) => r.id === 'earlier')).toMatchObject({ label: 'Move left', disabled: true });
    expect(top.find((r) => r.id === 'later')).toMatchObject({ label: 'Move right', disabled: false });
    const side = buildPageMenu(state({ page: 'EQ', nav: 'side' }), acts());
    expect(side.find((r) => r.id === 'earlier')).toMatchObject({ label: 'Move up', disabled: false });
    expect(side.find((r) => r.id === 'later')).toMatchObject({ label: 'Move down', disabled: true });
  });

  it('pin page as panel only with a workbench, disabled with nothing to pin', () => {
    expect(ids(buildPageMenu(state({ canPin: false }), acts()))).not.toContain('pin');
    expect(buildPageMenu(state({ pinCount: 0 }), acts()).find((r) => r.id === 'pin')).toMatchObject({ disabled: true, hint: 'nothing to pin' });
    expect(buildPageMenu(state({ pinCount: 1 }), acts()).find((r) => r.id === 'pin')).toMatchObject({ disabled: false, hint: '1 control' });
  });

  it('delete asks first and is never offered for the last page', () => {
    const del = buildPageMenu(state(), acts()).find((r) => r.id === 'delete')!;
    expect(del).toMatchObject({ danger: true, disabled: false });
    expect(del.confirm?.prompt).toContain('Preamp');
    expect(buildPageMenu(state({ pageOrder: ['Preamp'] }), acts()).find((r) => r.id === 'delete')).toMatchObject({ disabled: true, hint: 'last page' });
  });

  it('the rows run their actions', () => {
    const a = acts();
    const rows = buildPageMenu(state(), a);
    for (const id of ['duplicate', 'pin', 'earlier', 'later', 'delete', 'add']) rows.find((r) => r.id === id)!.run();
    expect(a.duplicate).toHaveBeenCalledTimes(1);
    expect(a.pin).toHaveBeenCalledTimes(1);
    expect(a.move.mock.calls).toEqual([[-1], [1]]);
    expect(a.remove).toHaveBeenCalledTimes(1);
    expect(a.add).toHaveBeenCalledTimes(1);
  });

  it('a page the board does not have: everything but Add page is disabled', () => {
    const rows = buildPageMenu(state({ page: 'Gone' }), acts());
    for (const r of rows.filter((x) => x.id !== 'head' && x.id !== 'add')) expect(r.disabled).toBe(true);
  });
});
