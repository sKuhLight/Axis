import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createEmptyWorkbenchPage,
  reduceWorkbenchDocument,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type CanonicalPanelSpec,
  type CanonicalWidgetSpec,
  type WorkbenchCommand,
  type WorkbenchDocument
} from '../../core';
import type { AddCatalogItem, WorkbenchAddPaletteRequest, WorkbenchAddPageCards } from '../addCatalog';
import { createAddPaletteApi } from '../addPalette';
import { createWorkbenchController, type WorkbenchController } from '../controller.svelte';
import type { PlacementSessionOptions } from '../placementSession';
import { createWorkbenchRenderRegistry } from '../renderRegistry';

/**
 * `createAddPaletteApi().choose` routing: what a card does for each kind, with
 * and without a fixed target. The click-to-place session is injected (a stub
 * that records its options), so the commit callbacks it would run on a click
 * are exercised directly.
 */

function run(d: WorkbenchDocument, commands: WorkbenchCommand[]): WorkbenchDocument {
  let next = d;
  for (const command of commands) {
    const result = reduceWorkbenchDocument(next, command);
    expect(result.success, `${command.type}: ${result.error?.message}`).toBe(true);
    next = result.next;
  }
  return next;
}

const PANELS: CanonicalPanelSpec[] = [
  { key: 'grid', panel: { id: 'grid', type: 't.grid', title: 'Grid', singletonKey: 'grid' } },
  { key: 'notes', panel: { id: 'notes', type: 't.notes', title: 'Notes', singletonKey: 'notes' } }
];
const WIDGETS: CanonicalWidgetSpec[] = [
  { type: 'w.preset', label: 'Preset', id: 'widget.preset' },
  { type: 'w.tuner', label: 'Tuner', id: 'widget.tuner' }
];

/**
 * Page one (active, grid in main; no nav entry) · pages two and four in the
 * navigation · page three hidden from its front; preset + cpu in top.right;
 * one widget template.
 */
function fixture(): WorkbenchDocument {
  let d = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l', pageId: 'one', pageLabel: 'One' });
  d = run(d, [
    { type: 'panel.add', panel: PANELS[0].panel, region: 'main' },
    { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'two', label: 'Two' }) },
    { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'three', label: 'Three' }) },
    { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'four', label: 'Four' }) },
    { type: 'widget.add', widget: { id: 'widget.preset', type: 'w.preset', zone: 'top.right', order: 0, size: 'default' }, zone: 'top.right' },
    { type: 'widget.add', widget: { id: 'widget.cpu', type: 'w.cpu', zone: 'top.right', order: 1, size: 'default' }, zone: 'top.right' }
  ]);
  const layout = selectActiveLayout(d)!;
  const third = Object.values(layout.navigation.entries).find((entry) => entry.pageId === 'three')!;
  // Hide "three" from the FRONT of the order: re-showing it at "the end" must not restore that slot.
  d = run(d, [
    { type: 'navigation.move', entryId: third.id, index: 0 },
    { type: 'navigation.hide', entryId: third.id }
  ]);
  return {
    ...d,
    widgetLibrary: {
      'tpl.w': { id: 'tpl.w', title: 'Saved pair', widgets: { a: { id: 'a', type: 'w.tuner', zone: 'top.left', order: 0, size: 'default' } } }
    }
  };
}

interface Harness {
  controller: WorkbenchController;
  api: ReturnType<typeof createAddPaletteApi>;
  placements: PlacementSessionOptions[];
  hostRun: ReturnType<typeof vi.fn>;
  card: (key: string) => AddCatalogItem;
  layout: () => NonNullable<ReturnType<typeof selectActiveLayout>>;
  navId: (pageId: string) => string;
}

function harness(request: WorkbenchAddPaletteRequest = { filter: 'all' }, doc = fixture()): Harness {
  const controller = createWorkbenchController(doc);
  controller.setEditMode(true);
  const registry = createWorkbenchRenderRegistry();
  registry.registerPanelCatalogProvider({ canonical: () => PANELS });
  registry.registerWidgetCatalogProvider({ canonical: () => WIDGETS });
  const hostRun = vi.fn();
  const pages: WorkbenchAddPageCards = { leading: [{ id: 'restore.fc', label: 'FC', run: hostRun }] };
  const placements: PlacementSessionOptions[] = [];
  controller.openAddPalette(request);
  const api = createAddPaletteApi({
    controller,
    registry,
    request,
    pages: { addPageItems: () => [], addPageCards: () => pages } as never,
    manage: () => {},
    opener: null,
    beginPlacement: (options) => {
      placements.push(options);
      return () => {};
    }
  });
  const layout = () => selectActiveLayout(controller.document)!;
  return {
    controller,
    api,
    placements,
    hostRun,
    card: (key) => {
      const found = api.items().find((item) => item.key === key);
      if (!found) throw new Error(`no card ${key}`);
      return found;
    },
    layout,
    navId: (pageId) => Object.values(layout().navigation.entries).find((entry) => entry.pageId === pageId)!.id
  };
}

const zoneIds = (controller: WorkbenchController, zone: string) => selectVisibleWidgetsByZone(controller.document, zone).map((widget) => widget.id);

describe('createAddPaletteApi().choose — widgets', () => {
  it('a fixed widget target inserts at once (no placement); a placed built-in MOVES there', () => {
    const h = harness({ filter: 'widgets', target: { kind: 'widget', zone: 'top.left', label: 'Into Top left' } });
    h.api.choose(h.card('widget:builtin:w.preset'));
    expect(h.controller.addPalette).toBeNull();
    expect(h.placements).toHaveLength(0);
    expect(zoneIds(h.controller, 'top.left')).toEqual(['widget.preset']);
    expect(zoneIds(h.controller, 'top.right')).toEqual(['widget.cpu']);
  });

  it('a template on a zone "+" (no index) lands at the end of that zone', () => {
    const h = harness({ filter: 'widgets', target: { kind: 'widget', zone: 'top.right', label: 'End of Top right' } });
    h.api.choose(h.card('widget:template:tpl.w'));
    expect(zoneIds(h.controller, 'top.right')).toEqual(['widget.preset', 'widget.cpu', 'a']);
  });

  it('without a target the palette closes and click-to-place starts; its commit inserts at the widget index', () => {
    const h = harness();
    h.api.choose(h.card('widget:builtin:w.tuner'), { x: 10, y: 20 });
    expect(h.controller.addPalette).toBeNull();
    expect(h.placements).toHaveLength(1);
    const session = h.placements[0];
    expect(session).toMatchObject({ kind: 'widget', label: 'Tuner', pointer: { x: 10, y: 20 } });
    expect(typeof session.onEnd).toBe('function');
    expect(session.commitWidget!({ zone: 'top.right', index: 1 })).toBe(true);
    expect(zoneIds(h.controller, 'top.right')).toEqual(['widget.preset', 'widget.tuner', 'widget.cpu']);
    // One commit = one undo step.
    h.controller.undoLayout();
    expect(zoneIds(h.controller, 'top.right')).toEqual(['widget.preset', 'widget.cpu']);
  });

  it('a card of another kind than the fixed target still goes through placement', () => {
    const h = harness({ filter: 'all', target: { kind: 'widget', zone: 'top.left', label: 'Into Top left' } });
    h.api.choose(h.card('panel:canonical:notes'), null);
    expect(h.placements).toHaveLength(1);
    expect(h.placements[0]).toMatchObject({ kind: 'panel', label: 'Notes', pointer: null });
  });

  it('live(): a card that went stale meanwhile (template deleted) does nothing; disabled cards are inert', () => {
    const h = harness({ filter: 'widgets', target: { kind: 'widget', zone: 'top.left', label: 'Into Top left' } });
    const stale = h.card('widget:template:tpl.w');
    h.controller.dispatch({ type: 'library.widget.delete', templateId: 'tpl.w' });
    const before = h.controller.document;
    h.api.choose(stale);
    expect(selectActiveLayout(h.controller.document)!.widgets).toEqual(selectActiveLayout(before)!.widgets);

    const h2 = harness({ filter: 'widgets', target: { kind: 'widget', zone: 'top.left', label: 'Into Top left' } });
    h2.api.choose({ ...h2.card('widget:builtin:w.tuner'), disabled: 'Needs a device with a tuner' });
    expect(h2.controller.addPalette).not.toBeNull();
    expect(zoneIds(h2.controller, 'top.left')).toEqual([]);
  });

  it('live(): a built-in captured while absent moves the instance that appeared meanwhile (no duplicate)', () => {
    const h = harness({ filter: 'widgets', target: { kind: 'widget', zone: 'top.left', label: 'Into Top left' } });
    const absent = h.card('widget:builtin:w.tuner');
    h.controller.dispatch({ type: 'widget.add', widget: { id: 'tuner.live', type: 'w.tuner', zone: 'bottom', order: 0, size: 'default' }, zone: 'bottom' });
    h.api.choose(absent);
    expect(zoneIds(h.controller, 'top.left')).toEqual(['tuner.live']);
    expect(Object.values(h.layout().widgets).filter((widget) => widget.type === 'w.tuner')).toHaveLength(1);
  });
});

describe('createAddPaletteApi().choose — panels', () => {
  it('a fixed panel target inserts right there', () => {
    const h = harness({ filter: 'panels', target: { kind: 'panel', to: { kind: 'region', region: 'left' }, label: 'Into the left region' } });
    h.api.choose(h.card('panel:canonical:notes'));
    expect(h.placements).toHaveLength(0);
    expect(h.controller.addPalette).toBeNull();
    expect(h.layout().panels.notes).toBeDefined();
    expect(JSON.stringify(h.layout().pages.one.dock.root.left)).toContain('notes');
  });

  it('without a target: placement; its commit docks the panel at the clicked target', () => {
    const h = harness();
    h.api.choose(h.card('panel:canonical:notes'), { x: 1, y: 2 });
    const session = h.placements[0];
    expect(session.kind).toBe('panel');
    expect(session.commitPanel!({ kind: 'edge', region: 'right', empty: true })).toBe(true);
    expect(JSON.stringify(h.layout().pages.one.dock.root.right)).toContain('notes');
  });
});

describe('createAddPaletteApi().choose — pages', () => {
  it('a host page card runs directly (no placement)', () => {
    const h = harness({ filter: 'pages' });
    h.api.choose(h.card('page:host:restore.fc'));
    expect(h.hostRun).toHaveBeenCalledTimes(1);
    expect(h.placements).toHaveLength(0);
    expect(h.controller.addPalette).toBeNull();
  });

  it('a page target with a navIndex puts a blank page there', () => {
    const h = harness({ filter: 'pages', target: { kind: 'page', navIndex: 0, label: 'First' } });
    h.api.choose(h.card('page:blank'));
    const order = h.layout().navigation.order;
    const fresh = h.layout().navigation.entries[order[0]];
    expect(fresh.pageId).not.toMatch(/^(one|two|three|four)$/);
    expect(h.layout().pages[fresh.pageId!]).toBeDefined();
  });

  it('a page target WITHOUT navIndex ("End of the navigation") re-shows a hidden entry at the end, not its old slot', () => {
    const h = harness({ filter: 'pages', target: { kind: 'page', label: 'End of the navigation' } });
    const third = h.navId('three');
    expect(h.layout().navigation.order[0]).toBe(third);
    h.api.choose(h.card(`page:nav:${third}`));
    const order = h.layout().navigation.order;
    expect(order[order.length - 1]).toBe(third);
    expect(h.layout().navigation.entries[third].hidden).toBe(false);
  });

  it('placement maps the clicked gap by its neighbours’ ids; no gap = the end', () => {
    const h = harness({ filter: 'pages' });
    const third = h.navId('three');
    h.api.choose(h.card(`page:nav:${third}`), { x: 5, y: 5 });
    const session = h.placements[0];
    expect(session.kind).toBe('page');
    // Between two and four.
    expect(session.commitPage!({ after: h.navId('two'), before: h.navId('four') })).toBe(true);
    const visible = h.layout().navigation.order.filter((id) => !h.layout().navigation.entries[id].hidden);
    expect(visible).toEqual([h.navId('two'), third, h.navId('four')]);

    const h2 = harness({ filter: 'pages' });
    h2.api.choose(h2.card(`page:nav:${third}`), { x: 5, y: 5 });
    h2.placements[0].commitPage!(null);
    const order = h2.layout().navigation.order;
    expect(order[order.length - 1]).toBe(third);
  });

  it('a blank page placed at a gap lands there', () => {
    const h = harness({ filter: 'pages' });
    h.api.choose(h.card('page:blank'), { x: 5, y: 5 });
    h.placements[0].commitPage!({ after: h.navId('two'), before: h.navId('four') });
    const visible = h.layout().navigation.order.filter((id) => !h.layout().navigation.entries[id].hidden);
    expect(visible[0]).toBe(h.navId('two'));
    expect(visible[2]).toBe(h.navId('four'));
    expect(h.layout().navigation.entries[visible[1]].pageId).not.toMatch(/^(one|two|three|four)$/);
    // The page order follows the navigation (between two and four).
    const fresh = h.layout().navigation.entries[visible[1]].pageId!;
    const pageOrder = h.layout().pageOrder;
    expect(pageOrder.indexOf(fresh)).toBeGreaterThan(pageOrder.indexOf('two'));
    expect(pageOrder.indexOf(fresh)).toBeLessThan(pageOrder.indexOf('four'));
  });
});

describe('createAddPaletteApi — drag and close', () => {
  it('close() closes the palette', () => {
    const h = harness();
    h.api.close();
    expect(h.controller.addPalette).toBeNull();
  });
});
