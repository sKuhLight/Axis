import { describe, expect, it } from 'vitest';
import {
  buildPanelCatalog,
  buildWidgetCatalog,
  createEmptyDockLayout,
  createEmptyWorkbenchDocument,
  createEmptyWorkbenchPage,
  reduceWorkbenchDocument,
  selectActiveLayout,
  type CanonicalPanelSpec,
  type CanonicalWidgetSpec,
  type PanelCatalogEntry,
  type WidgetCatalogEntry,
  type WorkbenchCommand,
  type WorkbenchDocument
} from '../../core';
import {
  ADD_PALETTE_FILTERS,
  WIDGET_ZONE_ADD_BUTTON_PX,
  addCatalogCounts,
  addPaletteTargetChip,
  addResultCountLabel,
  blankPageCommands,
  buildAddCatalog,
  cardUsesFixedTarget,
  filterAddCatalog,
  navOrderIndexForGap,
  navOrderIndexForNeighbours,
  pageIndexForNavIndex,
  panelCardStatus,
  panelTitles,
  showNavigationEntryCommands,
  widgetCardStatus,
  type AddCatalogItem,
  type WorkbenchAddPageCards
} from '../addCatalog';

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
  { key: 'browser', panel: { id: 'browser', type: 't.browser', title: 'Browser', singletonKey: 'browser' } },
  { key: 'notes', panel: { id: 'notes', type: 't.notes', title: 'Notes', singletonKey: 'notes' } },
  { key: 'custom', panel: { id: 'custom', type: 't.customPanel', title: 'Custom Panel' }, label: 'New custom panel', multiple: true, ownsWidgetZone: true }
];
const WIDGETS: CanonicalWidgetSpec[] = [
  { type: 'w.preset', label: 'Preset', id: 'widget.preset' },
  { type: 'w.tuner', label: 'Tuner', id: 'widget.tuner' }
];

/** Page one (active): grid · page two: browser · parked: side · nav entries one, two, a hidden third. */
function fixture(): WorkbenchDocument {
  let d = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l', pageId: 'one', pageLabel: 'One' });
  d = run(d, [
    { type: 'panel.add', panel: PANELS[0].panel, region: 'main' },
    { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'two', label: 'Two' }) },
    { type: 'panel.create', panel: PANELS[1].panel },
    { type: 'panel.move', panelId: 'browser', to: { kind: 'region', region: 'main' }, pageId: 'two' },
    { type: 'panel.create', panel: { id: 'side', type: 't.side', title: 'Side' } },
    { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'three', label: 'Three' }) },
    { type: 'widget.add', widget: { id: 'widget.preset', type: 'w.preset', zone: 'top.right', order: 0, size: 'default' }, zone: 'top.right' }
  ]);
  const layout = selectActiveLayout(d)!;
  const third = Object.values(layout.navigation.entries).find((entry) => entry.pageId === 'three')!;
  d = run(d, [{ type: 'navigation.hide', entryId: third.id }]);
  return {
    ...d,
    panelLibrary: { 'tpl.p': { id: 'tpl.p', title: 'Saved pane', panels: { x: { id: 'x', type: 't.x', title: 'X' } } } },
    widgetLibrary: {
      'tpl.w': { id: 'tpl.w', title: 'Saved pair', widgets: { a: { id: 'a', type: 'w.preset', zone: 'top.left', order: 0, size: 'default' } } }
    }
  };
}

const HOST_PAGES: WorkbenchAddPageCards = {
  leading: [{ id: 'restore.fc', label: 'FC', hint: 'Missing default page', dock: createEmptyDockLayout(), run: () => {} }],
  trailing: [{ id: 'restoreAll', label: 'Restore default pages (1)', run: () => {} }],
  note: 'Already there: One'
};

function catalog(d = fixture(), unavailable: (type: string) => string | null = () => null): AddCatalogItem[] {
  const layout = selectActiveLayout(d);
  return buildAddCatalog({
    layout,
    panels: buildPanelCatalog(layout, { canonical: PANELS, templates: d.panelLibrary }),
    widgets: buildWidgetCatalog(layout, { canonical: WIDGETS, templates: d.widgetLibrary, unavailableReason: unavailable }),
    pageCards: HOST_PAGES,
    zoneLabel: (zone) => `Zone ${zone}`
  });
}

describe('buildAddCatalog', () => {
  it('orders panels (templates last), pages (missing defaults, blank, hidden nav, restore all), widgets', () => {
    const items = catalog();
    expect(items.map((item) => item.key)).toEqual([
      'panel:instance:grid',
      'panel:instance:browser',
      'panel:canonical:notes',
      'panel:canonical:custom',
      'panel:instance:side',
      'panel:template:tpl.p',
      'page:host:restore.fc',
      'page:blank',
      expect.stringMatching(/^page:nav:/),
      'page:host:restoreAll',
      'widget:builtin:w.preset',
      'widget:builtin:w.tuner',
      'widget:template:tpl.w'
    ]);
  });

  it('marks templates and carries mini-map data for pages', () => {
    const items = catalog();
    const byKey = (key: string) => items.find((item) => item.key === key)!;
    expect(byKey('panel:template:tpl.p').template).toBe(true);
    expect(byKey('widget:template:tpl.w').template).toBe(true);
    expect(byKey('panel:instance:grid').template).toBe(false);
    const hidden = items.find((item) => item.key.startsWith('page:nav:'))!;
    expect(hidden).toMatchObject({ kind: 'page', title: 'Three', status: 'Hidden in navigation', page: { action: 'showNav', pageId: 'three' } });
    expect(hidden.kind === 'page' && hidden.dock).toBeTruthy();
    expect(byKey('page:host:restore.fc')).toMatchObject({ status: 'Missing default page', page: { action: 'host' } });
  });

  it('greys out unavailable widgets with the reason, at the end', () => {
    const items = catalog(fixture(), (type) => (type === 'w.tuner' ? 'Needs a tuner' : null));
    const widgets = items.filter((item) => item.kind === 'widget');
    expect(widgets.map((item) => item.key)).toEqual(['widget:builtin:w.preset', 'widget:template:tpl.w', 'widget:builtin:w.tuner']);
    expect(widgets[2]).toMatchObject({ disabled: 'Needs a tuner', status: 'Needs a tuner', tone: 'off' });
  });
});

describe('statuses', () => {
  const base: PanelCatalogEntry = { key: 'k', title: 'T', type: 't', source: 'instance', placement: 'docked' };
  it('panel cards say where the panel is', () => {
    expect(panelCardStatus({ ...base, onActivePage: true })).toEqual({ status: 'On this page', tone: 'here' });
    expect(panelCardStatus({ ...base, onActivePage: false, pageLabel: 'Grid' })).toEqual({ status: 'On Grid', tone: 'elsewhere' });
    expect(panelCardStatus({ ...base, placement: 'parked' })).toEqual({ status: 'Not placed', tone: 'none' });
    expect(panelCardStatus({ ...base, source: 'canonical', placement: 'absent' })).toEqual({ status: 'Nowhere yet', tone: 'none' });
    expect(panelCardStatus({ ...base, source: 'canonical', placement: 'absent', multiple: true }).tone).toBe('new');
    expect(panelCardStatus({ ...base, source: 'template', placement: 'absent', panelCount: 2 }).status).toBe('Template · 2 panels');
  });

  it('widget cards say where the widget is', () => {
    const w: WidgetCatalogEntry = { key: 'k', title: 'T', type: 't', source: 'builtin', placement: 'placed', zone: 'top.left' };
    const zone = (id: string) => (id === 'top.left' ? 'Top left' : id);
    expect(widgetCardStatus(w, zone)).toEqual({ status: 'In Top left', tone: 'elsewhere' });
    expect(widgetCardStatus({ ...w, placement: 'hidden', zone: undefined }, zone)).toEqual({ status: 'Hidden', tone: 'none' });
    expect(widgetCardStatus({ ...w, placement: 'absent', zone: undefined }, zone)).toEqual({ status: 'Not placed', tone: 'none' });
    expect(widgetCardStatus({ ...w, unavailable: 'Offline' }, zone)).toEqual({ status: 'Offline', tone: 'off' });
    expect(widgetCardStatus({ ...w, source: 'template', widgetCount: 1 }, zone).status).toBe('Template · 1 widget');
  });
});

describe('filterAddCatalog', () => {
  it('filters by chip', () => {
    const items = catalog();
    expect(new Set(filterAddCatalog(items, 'panels', '').map((item) => item.kind))).toEqual(new Set(['panel']));
    expect(new Set(filterAddCatalog(items, 'pages', '').map((item) => item.kind))).toEqual(new Set(['page']));
    expect(new Set(filterAddCatalog(items, 'widgets', '').map((item) => item.kind))).toEqual(new Set(['widget']));
    expect(filterAddCatalog(items, 'all', '')).toHaveLength(items.length);
  });

  it('searches title, status and type, every term, case-insensitive', () => {
    const items = catalog();
    expect(filterAddCatalog(items, 'all', 'BROWSER').map((item) => item.key)).toEqual(['panel:instance:browser']);
    expect(filterAddCatalog(items, 'all', 'on two').map((item) => item.key)).toEqual(['panel:instance:browser']);
    expect(filterAddCatalog(items, 'widgets', 'template').map((item) => item.key)).toEqual(['widget:template:tpl.w']);
    expect(filterAddCatalog(items, 'pages', 'blank').map((item) => item.key)).toEqual(['page:blank']);
    expect(filterAddCatalog(items, 'panels', 'zzz')).toEqual([]);
  });

  it('counts per chip and the result line', () => {
    const counts = addCatalogCounts(catalog());
    expect(counts).toEqual({ all: 13, panels: 6, pages: 4, widgets: 3 });
    expect(addResultCountLabel(1)).toBe('1 result');
    expect(addResultCountLabel(0)).toBe('0 results');
    expect(ADD_PALETTE_FILTERS.map((f) => f.label)).toEqual(['All', 'Panels', 'Pages', 'Widgets']);
  });
});

describe('targets', () => {
  it('the chip names the fixed target, else how placing works', () => {
    expect(addPaletteTargetChip({ kind: 'panel', to: { kind: 'region', region: 'left' }, label: 'Into the left region' })).toBe('✛ Into the left region');
    expect(addPaletteTargetChip(undefined)).toBe('✛ Pick a card, then click a highlight');
  });

  it('only a card of the target kind uses the fixed target', () => {
    const target = { kind: 'widget' as const, zone: 'top.left', label: 'x' };
    expect(cardUsesFixedTarget({ kind: 'widget' }, target)).toBe(true);
    expect(cardUsesFixedTarget({ kind: 'panel' }, target)).toBe(false);
    expect(cardUsesFixedTarget({ kind: 'widget' }, undefined)).toBe(false);
  });

  it('exposes a compact widget-zone "+" width for the bar fit', () => {
    expect(WIDGET_ZONE_ADD_BUTTON_PX).toBeGreaterThan(0);
    expect(WIDGET_ZONE_ADD_BUTTON_PX).toBeLessThanOrEqual(32);
  });
});

describe('navigation insertion', () => {
  it('maps a visible gap to an index in the full order (hidden entries counted)', () => {
    const order = ['a', 'h', 'b', 'c'];
    const visible = ['a', 'b', 'c'];
    expect(navOrderIndexForGap(order, visible, 0)).toBe(0);
    expect(navOrderIndexForGap(order, visible, 1)).toBe(2);
    expect(navOrderIndexForGap(order, visible, 3)).toBe(4);
    // Re-showing `h` before `c`: the order without `h` is [a, b, c] → index 2.
    expect(navOrderIndexForGap(order, visible, 2, 'h')).toBe(2);
  });

  it('a nav gap maps onto navigation.order by its neighbours’ ids (whatever is scrolled away / not rendered)', () => {
    // Order a · h(hidden) · b · c · d; only b and c are on screen.
    const order = ['a', 'h', 'b', 'c', 'd'];
    expect(navOrderIndexForNeighbours(order, { before: 'b' })).toBe(2);
    expect(navOrderIndexForNeighbours(order, { after: 'b', before: 'c' })).toBe(3);
    // Past the last ON-SCREEN entry: right after it (not the end of the order).
    expect(navOrderIndexForNeighbours(order, { after: 'c' })).toBe(4);
    // Nothing known: the end.
    expect(navOrderIndexForNeighbours(order, {})).toBe(5);
    expect(navOrderIndexForNeighbours(order, { before: 'gone', after: 'gone2' })).toBe(5);
    // Re-showing `h`: left out first, then mapped (before c → 2 in [a, b, c, d]); no gap = the end.
    expect(navOrderIndexForNeighbours(order, { after: 'b', before: 'c' }, 'h')).toBe(2);
    expect(navOrderIndexForNeighbours(order, {}, 'h')).toBe(4);
  });

  it('a placed blank page lands in pageOrder after the pages whose entries precede it', () => {
    let d = fixture();
    const layout = selectActiveLayout(d)!;
    const order = layout.navigation.order;
    const twoIndex = order.findIndex((id) => layout.navigation.entries[id]?.pageId === 'two');
    expect(pageIndexForNavIndex(layout, 0)).toBe(0);
    expect(pageIndexForNavIndex(layout, twoIndex + 1)).toBe(layout.pageOrder.indexOf('two') + 1);
    // Nav order here: [two, three(hidden)] — page one has no entry. Gap after "two":
    d = run(d, blankPageCommands(layout, 'fresh', twoIndex + 1));
    const next = selectActiveLayout(d)!;
    expect(next.activePageId).toBe('fresh');
    expect(next.pageOrder.indexOf('fresh')).toBe(next.pageOrder.indexOf('two') + 1);
    expect(next.navigation.entries[next.navigation.order[twoIndex + 1]].pageId).toBe('fresh');
    expect(next.pages.fresh.label).toBe(`Page ${layout.pageOrder.length + 1}`);
  });

  it('a blank page without a position goes to the end; a hidden entry shows again', () => {
    let d = fixture();
    const layout = selectActiveLayout(d)!;
    expect(blankPageCommands(layout, 'end')[0]).toEqual({ type: 'page.add', page: expect.objectContaining({ id: 'end' }) });
    const hiddenId = Object.values(layout.navigation.entries).find((entry) => entry.hidden)!.id;
    d = run(d, showNavigationEntryCommands(hiddenId, 0));
    const next = selectActiveLayout(d)!;
    expect(next.navigation.entries[hiddenId].hidden).toBe(false);
    expect(next.navigation.order[0]).toBe(hiddenId);
    expect(showNavigationEntryCommands('x')).toEqual([{ type: 'navigation.show', entryId: 'x' }]);
  });

  it('panelTitles maps ids to titles', () => {
    expect(panelTitles(selectActiveLayout(fixture())).grid).toBe('Grid');
    expect(panelTitles(undefined)).toEqual({});
  });
});
