import { describe, expect, it, vi } from 'vitest';
import type { PanelInstance } from '../../core';
import {
  MAXIMIZE_ESCAPE_OVERLAYS,
  buildPanelMenuItems,
  collapsedStripLabel,
  shouldReleaseMaximize,
  shouldRestoreMaximizedOnEscape,
  type PanelMenuActions
} from '../panelChrome';

const actions = (): PanelMenuActions => ({
  moveToRegion: vi.fn(),
  moveToPage: vi.fn(),
  toggleMaximize: vi.fn(),
  toggleCollapse: vi.fn(),
  save: vi.fn(),
  close: vi.fn()
});

const panel = (extra: Partial<PanelInstance> = {}): PanelInstance => ({ id: 'p', type: 't.panel', title: 'Block Editor', ...extra });
const pages = [
  { id: 'page.grid', label: 'Grid' },
  { id: 'page.scenes', label: 'Scenes' },
  { id: 'page.live', label: 'Live' }
];

describe('buildPanelMenuItems', () => {
  it('orders Move to ▸ · Maximize · Collapse · Save · Close and keeps every existing action', () => {
    const items = buildPanelMenuItems({ panel: panel(), editMode: true, maximized: false, pages, activePageId: 'page.grid', actions: actions() });
    expect(items.map((item) => item.label)).toEqual(['Move to', 'Maximize Panel', 'Collapse Panel', 'Save To Library', 'Close Panel']);
    expect(items[0].kind).toBe('submenu');
    expect(items.find((item) => item.id === 'close')?.danger).toBe(true);
  });

  it('lists the docks, main, then every OTHER page in the Move to submenu', () => {
    const a = actions();
    const items = buildPanelMenuItems({ panel: panel(), editMode: true, maximized: false, pages, activePageId: 'page.grid', actions: a });
    const move = items[0].items!;
    expect(move.map((item) => item.label)).toEqual(['Left dock', 'Right dock', 'Top dock', 'Bottom dock', 'Main', 'Page: Scenes', 'Page: Live']);
    expect(move[5].separatorBefore).toBe(true);
    move[1].run();
    expect(a.moveToRegion).toHaveBeenCalledWith('right');
    move[6].run();
    expect(a.moveToPage).toHaveBeenCalledWith('page.live');
  });

  it('flips the Maximize and Collapse labels with their state', () => {
    const items = buildPanelMenuItems({ panel: panel({ collapsed: true }), editMode: false, maximized: true, pages, actions: actions() });
    expect(items.map((item) => item.label)).toContain('Restore Panel');
    expect(items.map((item) => item.label)).toContain('Expand Panel');
  });

  it('keeps maximize and collapse available outside edit mode; edit-only actions are disabled', () => {
    const items = buildPanelMenuItems({ panel: panel(), editMode: false, maximized: false, pages, actions: actions() });
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    expect(byId.move.disabled).toBe(true);
    expect(byId.save.disabled).toBe(true);
    expect(byId.close.disabled).toBe(true);
    expect(byId.maximize.disabled).toBeFalsy();
    expect(byId.collapse.disabled).toBeFalsy();
  });

  it('disables Maximize where it cannot apply (mobile dock drawer)', () => {
    const items = buildPanelMenuItems({ panel: panel(), editMode: true, maximized: false, canMaximize: false, pages, actions: actions() });
    expect(items.find((item) => item.id === 'maximize')?.disabled).toBe(true);
  });

  it('keeps maximize and collapse exclusive', () => {
    const collapsed = buildPanelMenuItems({ panel: panel({ collapsed: true }), editMode: true, maximized: false, pages, actions: actions() });
    expect(collapsed.find((item) => item.id === 'maximize')?.disabled).toBe(true);
    expect(collapsed.find((item) => item.id === 'collapse')?.disabled).toBeFalsy();
    const maximized = buildPanelMenuItems({ panel: panel(), editMode: true, maximized: true, pages, actions: actions() });
    expect(maximized.find((item) => item.id === 'collapse')?.disabled).toBe(true);
    expect(maximized.find((item) => item.id === 'maximize')).toMatchObject({ label: 'Restore Panel', disabled: false });
  });

  it('respects locked / not closable / not collapsible panels', () => {
    const locked = buildPanelMenuItems({ panel: panel({ locked: true }), editMode: true, maximized: false, pages, actions: actions() });
    expect(locked.find((item) => item.id === 'move')?.disabled).toBe(true);
    expect(locked.find((item) => item.id === 'close')?.disabled).toBe(true);
    const fixed = buildPanelMenuItems({ panel: panel({ closable: false, collapsible: false }), editMode: true, maximized: false, pages, actions: actions() });
    expect(fixed.find((item) => item.id === 'close')?.disabled).toBe(true);
    expect(fixed.find((item) => item.id === 'collapse')?.disabled).toBe(true);
  });

  it('routes the actions', () => {
    const a = actions();
    const items = buildPanelMenuItems({ panel: panel(), editMode: true, maximized: false, pages, actions: a });
    for (const item of items.slice(1)) item.run();
    expect(a.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(a.toggleCollapse).toHaveBeenCalledTimes(1);
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(a.close).toHaveBeenCalledTimes(1);
  });
});

describe('collapsedStripLabel', () => {
  it('joins the tab titles', () => {
    expect(collapsedStripLabel(['Block Editor', 'History'])).toBe('Block Editor · History');
    expect(collapsedStripLabel(['Solo', ''])).toBe('Solo');
  });
});

describe('shouldRestoreMaximizedOnEscape', () => {
  const base = { key: 'Escape', maximized: true, defaultPrevented: false, dragging: false, overlayOpenAtCapture: false, editableTarget: false };
  it('restores on a free Escape only', () => {
    expect(shouldRestoreMaximizedOnEscape(base)).toBe(true);
    // The app (or any element handler) already consumed this Escape.
    expect(shouldRestoreMaximizedOnEscape({ ...base, defaultPrevented: true })).toBe(false);
    expect(shouldRestoreMaximizedOnEscape({ ...base, key: 'Enter' })).toBe(false);
    expect(shouldRestoreMaximizedOnEscape({ ...base, maximized: false })).toBe(false);
    expect(shouldRestoreMaximizedOnEscape({ ...base, dragging: true })).toBe(false);
    // A dialog open at capture time owns this press — even one that closed
    // itself without preventDefault (gone by the deferred check).
    expect(shouldRestoreMaximizedOnEscape({ ...base, overlayOpenAtCapture: true })).toBe(false);
    expect(shouldRestoreMaximizedOnEscape({ ...base, editableTarget: true })).toBe(false);
  });
});

describe('shouldReleaseMaximize', () => {
  const base = { maximizedPanelId: 'grid', stackPanelIds: ['grid', 'history'], overlay: false, rendered: true };
  it('releases when the inline owner is gone or not laid out', () => {
    expect(shouldReleaseMaximize(base)).toBe(false);
    expect(shouldReleaseMaximize({ ...base, rendered: false })).toBe(true);
  });
  it('ignores other stacks, drawer copies and no maximize', () => {
    expect(shouldReleaseMaximize({ ...base, rendered: false, stackPanelIds: ['editor'] })).toBe(false);
    expect(shouldReleaseMaximize({ ...base, rendered: false, overlay: true })).toBe(false);
    expect(shouldReleaseMaximize({ ...base, rendered: false, maximizedPanelId: null })).toBe(false);
  });
});

describe('MAXIMIZE_ESCAPE_OVERLAYS', () => {
  it('covers menus, drawers and every dialog', () => {
    for (const part of ['.aw-context-menu', '[role="dialog"]', '[aria-modal="true"]', '.aw-layout-drawer', '.aw-lib-drawer']) {
      expect(MAXIMIZE_ESCAPE_OVERLAYS).toContain(part);
    }
  });
});
