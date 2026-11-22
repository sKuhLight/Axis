import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, createEmptyWorkbenchPage } from '../defaults';
import { reduceWorkbenchDocument } from '../reducer';
import {
  buildPanelCatalog,
  catalogAddCommands,
  selectEmptyParkedCustomPanels,
  type CanonicalPanelSpec,
  type PanelCatalogEntry
} from '../panelCatalog';
import type { PanelInstance, PanelTemplate, WorkbenchDocument } from '../schema';
import type { WorkbenchCommand } from '../commands';
import { panelIdsInPageDock, selectActiveLayout, selectPanelPlacement } from '../selectors';

const panel = (id: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({ id, type: `t.${id}`, title: id, ...extra });

const SPECS: CanonicalPanelSpec[] = [
  { key: 'grid', panel: panel('grid', { singletonKey: 'grid', locked: true, title: 'Grid Panel' }) },
  { key: 'browser', panel: panel('browser', { singletonKey: 'browser', title: 'Browser' }) },
  { key: 'notes', panel: panel('notes', { title: 'Notes' }) },
  { key: 'custom', panel: panel('custom', { type: 't.customPanel', title: 'Custom Panel' }), label: 'New custom panel', multiple: true, ownsWidgetZone: true }
];

function run(d: WorkbenchDocument, commands: WorkbenchCommand[]): WorkbenchDocument {
  let next = d;
  for (const command of commands) {
    const result = reduceWorkbenchDocument(next, command);
    expect(result.success, `${command.type}: ${result.error?.message}`).toBe(true);
    next = result.next;
  }
  return next;
}

const layout = (d: WorkbenchDocument) => selectActiveLayout(d)!;

/**
 * Pages one (active) + two. one: [grid]; two: [browser]; parked: `side`;
 * `notes` absent. One saved template per kind.
 */
function fixture(): WorkbenchDocument {
  let d = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l', pageId: 'page.one', pageLabel: 'One' });
  d = run(d, [
    { type: 'panel.add', panel: SPECS[0].panel, region: 'main' },
    { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'page.two', label: 'Two' }) },
    { type: 'panel.create', panel: SPECS[1].panel },
    { type: 'panel.move', panelId: 'browser', to: { kind: 'region', region: 'main' }, pageId: 'page.two' },
    { type: 'panel.create', panel: panel('side', { title: 'Side' }) }
  ]);
  const templates: Record<string, PanelTemplate> = {
    'tpl.browser': { id: 'tpl.browser', title: 'Browser copy', panels: { browser: { ...SPECS[1].panel } } },
    'tpl.free': {
      id: 'tpl.free',
      title: 'Free',
      panels: { free: panel('free', { type: 't.customPanel' }) },
      widgets: { 'w.free': { id: 'w.free', type: 'w', zone: 'panel:free', order: 0, size: 'default' } }
    }
  };
  return { ...d, panelLibrary: templates };
}

const catalog = (d: WorkbenchDocument, hiddenTypes?: string[]) =>
  buildPanelCatalog(layout(d), { canonical: SPECS, templates: d.panelLibrary, hiddenTypes });
const entry = (entries: PanelCatalogEntry[], key: string) => entries.find((e) => e.key === key)!;

describe('buildPanelCatalog', () => {
  it('lists every instance once, absent canonical specs, the multiple spec and the templates', () => {
    const entries = catalog(fixture());
    expect(entries.map((e) => e.key)).toEqual([
      'instance:grid',
      'instance:browser',
      'canonical:notes',
      'canonical:custom',
      'instance:side',
      'template:tpl.browser',
      'template:tpl.free'
    ]);
    expect(entry(entries, 'instance:grid')).toMatchObject({ placement: 'docked', pageId: 'page.one', pageLabel: 'One', onActivePage: true, locked: true });
    expect(entry(entries, 'instance:browser')).toMatchObject({ placement: 'docked', pageId: 'page.two', pageLabel: 'Two', onActivePage: false, singletonKey: 'browser' });
    expect(entry(entries, 'instance:side')).toMatchObject({ placement: 'parked', title: 'Side' });
    expect(entry(entries, 'canonical:notes')).toMatchObject({ placement: 'absent', source: 'canonical', title: 'Notes' });
    expect(entry(entries, 'canonical:custom')).toMatchObject({ placement: 'absent', multiple: true });
    expect(entry(entries, 'template:tpl.free')).toMatchObject({ source: 'template', panelCount: 1 });
  });

  it('a canonical spec is absent only while no instance with its singleton key / id exists', () => {
    const d = run(fixture(), [{ type: 'panel.create', panel: panel('notes', { title: 'My notes' }) }]);
    const entries = catalog(d);
    expect(entries.some((e) => e.key === 'canonical:notes')).toBe(false);
    expect(entry(entries, 'instance:notes')).toMatchObject({ placement: 'parked', title: 'My notes' });
  });

  it('marks unlocked custom-panel instances deletable, never locked or singleton panels', () => {
    let d = fixture();
    d = run(d, catalogAddCommands(d, entry(catalog(d), 'canonical:custom'), { kind: 'region', region: 'main' }));
    const custom = catalog(d).find((e) => e.source === 'instance' && e.type === 't.customPanel')!;
    expect(custom.deletable).toBe(true);
    expect(entry(catalog(d), 'instance:grid').deletable).toBeUndefined();
    expect(entry(catalog(d), 'instance:browser').deletable).toBeUndefined();
  });

  it('hiddenTypes are never listed (docked or parked)', () => {
    const d = fixture();
    const keys = catalog(d, ['t.browser', 't.side']).map((e) => e.key);
    expect(keys).not.toContain('instance:browser');
    expect(keys).not.toContain('instance:side');
  });

  it('labels the multiple spec row ("New custom panel"); created panels keep the panel title', () => {
    let d = fixture();
    const spec = entry(catalog(d), 'canonical:custom');
    expect(spec.title).toBe('New custom panel');
    d = run(d, catalogAddCommands(d, spec, { kind: 'region', region: 'main' }));
    expect(Object.values(layout(d).panels).find((p) => p.type === 't.customPanel')?.title).toBe('Custom Panel');
  });

  it('hides a PARKED custom panel whose widget zone is empty; one carrying widgets stays listed', () => {
    let d = run(fixture(), [{ type: 'panel.create', panel: panel('seed.custom', { type: 't.customPanel', title: 'Custom Panel' }) }]);
    expect(catalog(d).map((e) => e.key)).not.toContain('instance:seed.custom');
    d = run(d, [
      { type: 'zone.ensure', zone: { id: 'panel:seed.custom', orientation: 'free' } },
      { type: 'widget.add', widget: { id: 'w.s', type: 'w', zone: 'panel:seed.custom', order: 0, size: 'default' }, zone: 'panel:seed.custom' }
    ]);
    expect(entry(catalog(d), 'instance:seed.custom')).toMatchObject({ placement: 'parked', deletable: true });
  });

  it('classifies parked custom panels: empty + default ones are offered for bulk delete, the rest are listed', () => {
    let d = run(fixture(), [
      { type: 'panel.create', panel: panel('c.empty', { type: 't.customPanel', title: 'Custom Panel' }) },
      { type: 'panel.create', panel: panel('c.emptyState', { type: 't.customPanel', title: 'Custom Panel', state: {} }) },
      { type: 'panel.create', panel: panel('c.renamed', { type: 't.customPanel', title: 'Pedals' }) },
      { type: 'panel.create', panel: panel('c.state', { type: 't.customPanel', title: 'Custom Panel', state: { grid: { columns: 6 } } }) },
      { type: 'panel.create', panel: panel('c.locked', { type: 't.customPanel', title: 'Custom Panel', locked: true }) }
    ]);
    // A default-grid state is still "default".
    const spec = entry(catalog(d), 'canonical:custom');
    d = run(d, catalogAddCommands(d, spec, { kind: 'region', region: 'main' }));
    const fresh = Object.values(layout(d).panels).find((p) => p.type === 't.customPanel' && p.id.startsWith('panel'))!;
    d = run(d, [{ type: 'panel.remove', panelId: fresh.id }]);

    const empties = selectEmptyParkedCustomPanels(layout(d), SPECS).map((p) => p.id);
    expect(empties.sort()).toEqual(['c.empty', 'c.emptyState', fresh.id].sort());
    const keys = catalog(d).map((e) => e.key);
    for (const id of empties) expect(keys).not.toContain(`instance:${id}`);
    for (const id of ['c.renamed', 'c.state', 'c.locked']) expect(keys).toContain(`instance:${id}`);
    // Bulk delete in one batch.
    d = run(d, empties.map((panelId) => ({ type: 'panel.close' as const, panelId })));
    expect(selectEmptyParkedCustomPanels(layout(d), SPECS)).toEqual([]);
  });

  it('a LOCKED keyless copy is deletable only while its keyed original exists', () => {
    let d = run(fixture(), [{ type: 'panel.create', panel: panel('grid.oldCopy', { type: 't.grid', title: 'Grid', locked: true }) }]);
    expect(entry(catalog(d), 'instance:grid.oldCopy').deletable).toBe(true);
    d = run(d, [{ type: 'panel.close', panelId: 'grid.oldCopy' }]);
    expect(layout(d).panels['grid.oldCopy']).toBeUndefined();

    // Without a keyed original it is the only one of its type: protected.
    const lone = structuredClone(run(fixture(), [{ type: 'panel.create', panel: panel('grid.oldCopy', { type: 't.grid', title: 'Grid', locked: true }) }]));
    delete layout(lone).panels.grid;
    expect(entry(catalog(lone), 'instance:grid.oldCopy').deletable).toBeUndefined();
  });

  it('a keyless instance carrying the canonical id IS the canonical instance (no second "absent" offer)', () => {
    // Old documents / the add-or-focus nav action created the id without its singleton key.
    const lost = run(fixture(), [{ type: 'panel.close', panelId: 'browser' }]);
    const keyless = run(lost, [{ type: 'panel.create', panel: panel('browser', { title: 'Browser' }) }]);
    const keys = catalog(keyless).map((e) => e.key);
    expect(keys).toContain('instance:browser');
    expect(keys).not.toContain('canonical:browser');
    // It is the original: never hard-deletable.
    expect(entry(catalog(keyless), 'instance:browser').deletable).toBeUndefined();
    expect(catalogAddCommands(keyless, entry(catalog(keyless), 'instance:browser'), { kind: 'region', region: 'main' })).toEqual([
      { type: 'panel.move', panelId: 'browser', to: { kind: 'region', region: 'main' }, pageId: 'page.one' }
    ]);
  });

  it('a duplicated page leaves removable copies: keyless copies of single-instance panels are deletable, the original never', () => {
    let d = run(fixture(), [{ type: 'page.duplicate', pageId: 'page.one', newPageId: 'page.copy' }]);
    const copyId = panelIdsInPageDock(layout(d).pages['page.copy'])[0];
    const copy = layout(d).panels[copyId];
    expect(copy).toMatchObject({ type: 't.grid' });
    expect(copy.singletonKey).toBeUndefined();
    expect(copy.locked).toBeUndefined(); // remint clears the lock
    expect(entry(catalog(d), `instance:${copyId}`).deletable).toBe(true);
    expect(entry(catalog(d), 'instance:grid').deletable).toBeUndefined();
    // Delete the copy's page, then delete the copy everywhere: the original is untouched.
    d = run(d, [{ type: 'page.remove', pageId: 'page.copy' }]);
    expect(entry(catalog(d), `instance:${copyId}`)).toMatchObject({ placement: 'parked', deletable: true });
    d = run(d, [{ type: 'panel.close', panelId: copyId }]);
    expect(layout(d).panels[copyId]).toBeUndefined();
    expect(layout(d).panels.grid).toMatchObject({ singletonKey: 'grid', locked: true });
  });
});

describe('catalogAddCommands', () => {
  const main = { kind: 'region', region: 'main' } as const;

  it('parked instance → panel.move onto this page (same instance, state kept)', () => {
    const d = fixture();
    const commands = catalogAddCommands(d, entry(catalog(d), 'instance:side'), main);
    expect(commands).toEqual([{ type: 'panel.move', panelId: 'side', to: main, pageId: 'page.one' }]);
    const next = run(d, commands);
    expect(selectPanelPlacement(layout(next), 'side')).toEqual({ kind: 'docked', pageId: 'page.one' });
  });

  it('instance docked on another page → moved here, still one instance', () => {
    const d = fixture();
    const next = run(d, catalogAddCommands(d, entry(catalog(d), 'instance:browser'), main));
    expect(selectPanelPlacement(layout(next), 'browser')).toEqual({ kind: 'docked', pageId: 'page.one' });
    expect(panelIdsInPageDock(layout(next).pages['page.two'])).toEqual([]);
    expect(Object.values(layout(next).panels).filter((p) => p.singletonKey === 'browser')).toHaveLength(1);
  });

  it('instance already on this page → activate; a LOCKED instance on another page moves here (locked = cannot leave the layout)', () => {
    const d = fixture();
    expect(catalogAddCommands(d, entry(catalog(d), 'instance:grid'), main)).toEqual([{ type: 'panel.activate', panelId: 'grid' }]);
    // From page two's point of view, Grid (locked) lives on another page.
    const onTwo = run(d, [{ type: 'page.activate', pageId: 'page.two' }]);
    const commands = catalogAddCommands(onTwo, entry(catalog(onTwo), 'instance:grid'), main);
    expect(commands).toEqual([{ type: 'panel.move', panelId: 'grid', to: main, pageId: 'page.two' }]);
    const moved = run(onTwo, commands);
    expect(selectPanelPlacement(layout(moved), 'grid')).toEqual({ kind: 'docked', pageId: 'page.two' });
    expect(layout(moved).panels.grid.locked).toBe(true);
  });

  it('an exact drop moves an instance already on this page; a tap only activates it', () => {
    let d = run(fixture(), [{ type: 'panel.move', panelId: 'side', to: main }]);
    const split = { kind: 'split', targetPanelId: 'grid', axis: 'horizontal', position: 'after' } as const;
    expect(catalogAddCommands(d, entry(catalog(d), 'instance:side'), split)).toEqual([{ type: 'panel.activate', panelId: 'side' }]);
    const exact = catalogAddCommands(d, entry(catalog(d), 'instance:side'), split, { exact: true });
    expect(exact).toEqual([{ type: 'panel.move', panelId: 'side', to: split, pageId: 'page.one' }]);
    d = run(d, exact);
    expect(selectPanelPlacement(layout(d), 'side')).toEqual({ kind: 'docked', pageId: 'page.one' });
    // A drop onto the panel's own stack (by panel or by its single-panel stack id), or a locked panel, still only activates.
    expect(catalogAddCommands(d, entry(catalog(d), 'instance:side'), { kind: 'tab', targetPanelId: 'side' }, { exact: true })).toEqual([
      { type: 'panel.activate', panelId: 'side' }
    ]);
    const ownStack = Object.values(layout(d).pages['page.one'].dock.root)
      .flatMap((node) => (node && node.kind === 'split' ? node.children : node ? [node] : []))
      .find((node) => node.kind === 'tabs' && node.panelIds.length === 1 && node.panelIds[0] === 'side')!;
    expect(catalogAddCommands(d, entry(catalog(d), 'instance:side'), { kind: 'tab', tabStackId: ownStack.id, index: 0 }, { exact: true })).toEqual([
      { type: 'panel.activate', panelId: 'side' }
    ]);
    // A locked panel moves on an exact drop too.
    expect(catalogAddCommands(d, entry(catalog(d), 'instance:grid'), { kind: 'region', region: 'left' }, { exact: true })).toEqual([
      { type: 'panel.move', panelId: 'grid', to: { kind: 'region', region: 'left' }, pageId: 'page.one' }
    ]);
  });

  it('a PARKED locked instance can be docked again', () => {
    const d = run(fixture(), [
      { type: 'page.activate', pageId: 'page.two' },
      { type: 'page.remove', pageId: 'page.one' }
    ]);
    expect(selectPanelPlacement(layout(d), 'grid')).toEqual({ kind: 'parked' });
    const next = run(d, catalogAddCommands(d, entry(catalog(d), 'instance:grid'), main));
    expect(selectPanelPlacement(layout(next), 'grid')).toEqual({ kind: 'docked', pageId: 'page.two' });
  });

  it('absent canonical → a fresh instance from the spec with its singleton key', () => {
    const lost = run(fixture(), [{ type: 'panel.close', panelId: 'browser' }]);
    const commands = catalogAddCommands(lost, entry(catalog(lost), 'canonical:browser'), main);
    expect(commands).toEqual([{ type: 'panel.add', panel: SPECS[1].panel, region: 'main', target: main }]);
    const next = run(lost, commands);
    expect(layout(next).panels.browser).toMatchObject({ singletonKey: 'browser', title: 'Browser' });
  });

  it('the multiple spec mints a NEW custom panel (own widget zone, no singleton) on every add', () => {
    let d = fixture();
    const spec = entry(catalog(d), 'canonical:custom');
    d = run(d, catalogAddCommands(d, spec, main));
    d = run(d, catalogAddCommands(d, spec, main));
    const customs = Object.values(layout(d).panels).filter((p) => p.type === 't.customPanel');
    expect(customs).toHaveLength(2);
    expect(customs.every((p) => !p.singletonKey)).toBe(true);
    for (const p of customs) expect(layout(d).zones[`panel:${p.id}`]).toBeDefined();
  });

  it('template → instantiated; a template whose singleton exists moves that instance instead of a duplicate', () => {
    const d = fixture();
    const free = catalogAddCommands(d, entry(catalog(d), 'template:tpl.free'), main);
    expect(free.some((c) => c.type === 'panel.add')).toBe(true);
    run(d, free);

    const dup = catalogAddCommands(d, entry(catalog(d), 'template:tpl.browser'), main);
    expect(dup.some((c) => c.type === 'panel.add')).toBe(false);
    const next = run(d, dup);
    expect(selectPanelPlacement(layout(next), 'browser')).toEqual({ kind: 'docked', pageId: 'page.one' });
  });

  it('a template whose singleton exists does not pile its widgets into the existing instance (tap twice = no new widgets)', () => {
    let d = fixture();
    d = {
      ...d,
      panelLibrary: {
        'tpl.widgets': {
          id: 'tpl.widgets',
          title: 'Browser + widget',
          panels: { browser: { ...SPECS[1].panel } },
          widgets: { 'w.b': { id: 'w.b', type: 'w', zone: 'panel:browser', order: 0, size: 'default' } }
        }
      }
    };
    const commands = catalogAddCommands(d, entry(catalog(d), 'template:tpl.widgets'), main);
    expect(commands.some((c) => c.type === 'widget.add' || c.type === 'zone.ensure')).toBe(false);
    d = run(d, commands);
    d = run(d, catalogAddCommands(d, entry(catalog(d), 'template:tpl.widgets'), main));
    expect(Object.keys(layout(d).widgets)).toEqual([]);
  });

  it('a template whose singleton is locked on another page moves that instance here; later panels tab onto it', () => {
    let d = run(fixture(), [{ type: 'page.activate', pageId: 'page.two' }]); // grid (locked) lives on page one
    d = {
      ...d,
      panelLibrary: {
        'tpl.pair': {
          id: 'tpl.pair',
          title: 'Grid + notes',
          panels: { grid: { ...SPECS[0].panel }, extra: panel('extra', { title: 'Extra' }) }
        }
      }
    };
    const commands = catalogAddCommands(d, entry(catalog(d), 'template:tpl.pair'), main);
    expect(commands[0]).toEqual({ type: 'panel.move', panelId: 'grid', to: main, pageId: 'page.two' });
    const add = commands.find((c) => c.type === 'panel.add');
    expect(add && add.type === 'panel.add' ? add.target : null).toEqual({ kind: 'tab', targetPanelId: 'grid' });
    const next = run(d, commands);
    expect(panelIdsInPageDock(layout(next).pages['page.two'])).toEqual(expect.arrayContaining(['grid', 'extra']));
    expect(panelIdsInPageDock(layout(next).pages['page.one'])).not.toContain('grid');
  });

  it('stale entries (instance / template gone) produce nothing', () => {
    const d = fixture();
    const sideEntry = entry(catalog(d), 'instance:side');
    const tplEntry = entry(catalog(d), 'template:tpl.free');
    const gone = run(d, [{ type: 'panel.close', panelId: 'side' }, { type: 'library.panel.delete', templateId: 'tpl.free' }]);
    expect(catalogAddCommands(gone, sideEntry, main)).toEqual([]);
    expect(catalogAddCommands(gone, tplEntry, main)).toEqual([]);
  });

  it('no catalog entry can be refused as duplicate-singleton', () => {
    for (const activePage of ['page.one', 'page.two']) {
      const d = run(fixture(), [{ type: 'page.activate', pageId: activePage }]);
      for (const e of catalog(d)) {
        let next = d;
        for (const command of catalogAddCommands(d, e, main)) {
          const result = reduceWorkbenchDocument(next, command);
          expect(result.error?.code, `${e.key} on ${activePage}`).not.toBe('duplicate-singleton');
          expect(result.success, `${e.key} on ${activePage}: ${result.error?.message}`).toBe(true);
          next = result.next;
        }
      }
    }
  });
});
