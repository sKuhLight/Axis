import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { reduceWorkbenchDocument } from '../reducer';
import { selectActiveLayout, selectVisibleWidgetsByZone } from '../selectors';
import {
  buildWidgetCatalog,
  moveIndexExcludingSelf,
  widgetCatalogAddCommands,
  widgetTitle,
  widgetZoneLabel,
  type CanonicalWidgetSpec,
  type WidgetCatalogEntry
} from '../widgetCatalog';
import type { WidgetInstance, WidgetTemplate, WorkbenchDocument } from '../schema';
import type { WorkbenchCommand } from '../commands';

const widget = (id: string, type: string, zone: string, order: number, extra: Partial<WidgetInstance> = {}): WidgetInstance => ({
  id,
  type,
  zone,
  order,
  size: 'default',
  ...extra
});

const SPECS: CanonicalWidgetSpec[] = [
  { type: 'w.preset', label: 'Preset', id: 'widget.preset' },
  { type: 'w.tuner', label: 'Tuner', id: 'widget.tuner' },
  { type: 'w.grid', label: 'Grid mode', id: 'widget.grid', state: { mode: 'auto' } },
  { type: 'w.scenes', label: 'Scenes', id: 'widget.scenes', keywords: ['snapshot'] }
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

/** preset + cpu in top.right, tuner hidden, a hidden custom-typed param widget; grid/scenes absent; one template. */
function fixture(): WorkbenchDocument {
  let d = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l' });
  d = run(d, [
    { type: 'widget.add', widget: widget('widget.preset', 'w.preset', 'top.right', 0), zone: 'top.right' },
    { type: 'widget.add', widget: widget('widget.cpu', 'w.cpu', 'top.right', 1), zone: 'top.right' },
    { type: 'widget.add', widget: widget('widget.tuner', 'w.tuner', 'top.left', 0), zone: 'top.left' },
    { type: 'widget.hide', widgetIds: ['widget.tuner'] },
    { type: 'widget.add', widget: widget('param.1', 'w.param', 'top.left', 0, { state: { label: 'Gain' } }), zone: 'top.left' },
    { type: 'widget.hide', widgetIds: ['param.1'] }
  ]);
  const template: WidgetTemplate = {
    id: 'tpl.pair',
    title: 'Pair',
    widgets: {
      a: widget('a', 'w.preset', 'top.left', 0),
      b: widget('b', 'w.scenes', 'top.left', 1)
    }
  };
  return { ...d, widgetLibrary: { [template.id]: template } };
}

const entry = (entries: WidgetCatalogEntry[], key: string) => entries.find((candidate) => candidate.key === key)!;

describe('buildWidgetCatalog', () => {
  it('lists every built-in type once with where it lives, then other hidden widgets, then templates', () => {
    const d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS, templates: d.widgetLibrary });
    expect(entries.map((e) => e.key)).toEqual([
      'builtin:w.preset',
      'builtin:w.tuner',
      'builtin:w.grid',
      'builtin:w.scenes',
      'instance:param.1',
      'template:tpl.pair'
    ]);
    expect(entry(entries, 'builtin:w.preset')).toMatchObject({ placement: 'placed', zone: 'top.right', instanceId: 'widget.preset' });
    expect(entry(entries, 'builtin:w.tuner')).toMatchObject({ placement: 'hidden', instanceId: 'widget.tuner' });
    expect(entry(entries, 'builtin:w.tuner').zone).toBeUndefined();
    expect(entry(entries, 'builtin:w.grid')).toMatchObject({ placement: 'absent' });
    expect(entry(entries, 'instance:param.1')).toMatchObject({ source: 'instance', placement: 'hidden', title: 'Gain' });
    expect(entry(entries, 'template:tpl.pair')).toMatchObject({ source: 'template', widgetCount: 2, types: ['w.preset', 'w.scenes'], type: 'w.preset' });
    expect(entry(entries, 'builtin:w.scenes').keywords).toEqual(['snapshot']);
  });

  it('a placed instance wins over a hidden one of the same type', () => {
    let d = fixture();
    d = run(d, [{ type: 'widget.add', widget: widget('widget.tuner2', 'w.tuner', 'bottom', 0), zone: 'bottom' }]);
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS });
    expect(entry(entries, 'builtin:w.tuner')).toMatchObject({ placement: 'placed', instanceId: 'widget.tuner2', zone: 'bottom' });
    // The other (hidden) instance is still offered on its own.
    expect(entries.some((e) => e.key === 'instance:widget.tuner')).toBe(true);
  });

  it('keeps unavailable types with their reason and lists them last', () => {
    const d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), {
      canonical: SPECS,
      templates: d.widgetLibrary,
      unavailableReason: (type) => (type === 'w.tuner' || type === 'w.scenes' ? `No ${type}` : null)
    });
    expect(entries.map((e) => e.key)).toEqual([
      'builtin:w.preset',
      'builtin:w.grid',
      'instance:param.1',
      'template:tpl.pair',
      'builtin:w.tuner',
      'builtin:w.scenes'
    ]);
    expect(entry(entries, 'builtin:w.tuner').unavailable).toBe('No w.tuner');
    // A template is unavailable only when none of its widgets can render.
    expect(entry(entries, 'template:tpl.pair').unavailable).toBeUndefined();
  });

  it('a template whose every widget is unavailable carries the reason', () => {
    const d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { templates: d.widgetLibrary, unavailableReason: () => 'Offline' });
    expect(entry(entries, 'template:tpl.pair').unavailable).toBe('Offline');
  });

  it('returns [] without a layout', () => {
    expect(buildWidgetCatalog(undefined, { canonical: SPECS })).toEqual([]);
  });
});

describe('widgetCatalogAddCommands', () => {
  const ids = (d: WorkbenchDocument, zone: string) => selectVisibleWidgetsByZone(d, zone).map((w) => w.id);

  it('moves a placed built-in instead of duplicating it', () => {
    const d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS });
    const commands = widgetCatalogAddCommands(d, entry(entries, 'builtin:w.preset'), { zone: 'bottom', index: 0 });
    expect(commands).toEqual([{ type: 'widget.move', widgetIds: ['widget.preset'], zone: 'bottom', index: 0 }]);
    const next = run(d, commands);
    expect(ids(next, 'bottom')).toEqual(['widget.preset']);
    expect(Object.values(selectActiveLayout(next)!.widgets).filter((w) => w.type === 'w.preset')).toHaveLength(1);
  });

  it('brings a hidden built-in back', () => {
    const d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS });
    const next = run(d, widgetCatalogAddCommands(d, entry(entries, 'builtin:w.tuner'), { zone: 'top.right', index: 1 }));
    expect(ids(next, 'top.right')).toEqual(['widget.preset', 'widget.tuner', 'widget.cpu']);
  });

  it('creates an absent built-in from its spec (id, state), unique id on collision', () => {
    let d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS });
    const commands = widgetCatalogAddCommands(d, entry(entries, 'builtin:w.grid'), { zone: 'top.right', index: 2 });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: 'widget.add', zone: 'top.right', index: 2, widget: { id: 'widget.grid', type: 'w.grid', state: { mode: 'auto' } } });
    d = run(d, commands);
    expect(ids(d, 'top.right')).toEqual(['widget.preset', 'widget.cpu', 'widget.grid']);
    // The spec id is taken by a foreign widget: a suffixed id.
    let e = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l' });
    e = run(e, [{ type: 'widget.add', widget: widget('widget.grid', 'w.other', 'bottom', 0), zone: 'bottom' }]);
    const fresh = buildWidgetCatalog(selectActiveLayout(e), { canonical: SPECS });
    const add = widgetCatalogAddCommands(e, entry(fresh, 'builtin:w.grid'), { zone: 'bottom' })[0];
    expect(add).toMatchObject({ type: 'widget.add', widget: { id: 'widget.grid.copy1' } });
  });

  it('a stale absent entry moves the instance that appeared meanwhile', () => {
    let d = fixture();
    const stale = entry(buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS }), 'builtin:w.grid');
    d = run(d, [{ type: 'widget.add', widget: widget('grid.live', 'w.grid', 'bottom', 0), zone: 'bottom' }]);
    expect(widgetCatalogAddCommands(d, stale, { zone: 'top.left' })).toEqual([{ type: 'widget.move', widgetIds: ['grid.live'], zone: 'top.left' }]);
  });

  it('templates always create copies', () => {
    let d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS, templates: d.widgetLibrary });
    d = run(d, widgetCatalogAddCommands(d, entry(entries, 'template:tpl.pair'), { zone: 'bottom', index: 0 }));
    d = run(d, widgetCatalogAddCommands(d, entry(entries, 'template:tpl.pair'), { zone: 'bottom', index: 0 }));
    expect(selectVisibleWidgetsByZone(d, 'bottom')).toHaveLength(4);
  });

  it('a template from a zone "+" (no index) lands at the END of the zone, in template order', () => {
    let d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), { canonical: SPECS, templates: d.widgetLibrary });
    d = run(d, widgetCatalogAddCommands(d, entry(entries, 'template:tpl.pair'), { zone: 'top.right' }));
    // top.right was [preset, cpu]: the copies (a = w.preset, b = w.scenes) follow them.
    expect(selectVisibleWidgetsByZone(d, 'top.right').map((w) => w.type)).toEqual(['w.preset', 'w.cpu', 'w.preset', 'w.scenes']);
    // An explicit index still inserts there.
    let e = fixture();
    e = run(e, widgetCatalogAddCommands(e, entry(entries, 'template:tpl.pair'), { zone: 'top.right', index: 1 }));
    expect(selectVisibleWidgetsByZone(e, 'top.right').map((w) => w.id)).toEqual(['widget.preset', 'a', 'b', 'widget.cpu']);
  });

  it('a grouped template from a zone "+" lands at the end as one block (the group does not split from a leading widget)', () => {
    let d = fixture();
    const template: WidgetTemplate = {
      id: 'tpl.grouped',
      title: 'Grouped',
      widgets: {
        lead: widget('lead', 'w.lead', 'top.left', 0),
        g1: widget('g1', 'w.g1', 'top.left', 1, { groupId: 'grp' }),
        g2: widget('g2', 'w.g2', 'top.left', 2, { groupId: 'grp' })
      },
      widgetGroups: { grp: { id: 'grp', widgetIds: ['g1', 'g2'] } }
    };
    d = { ...d, widgetLibrary: { ...d.widgetLibrary, [template.id]: template } };
    const entries = buildWidgetCatalog(selectActiveLayout(d), { templates: d.widgetLibrary });
    d = run(d, widgetCatalogAddCommands(d, entry(entries, 'template:tpl.grouped'), { zone: 'top.right' }));
    expect(selectVisibleWidgetsByZone(d, 'top.right').map((w) => w.id)).toEqual(['widget.preset', 'widget.cpu', 'lead', 'g1', 'g2']);
    expect(selectActiveLayout(d)!.widgetGroups.grp.widgetIds).toEqual(['g1', 'g2']);
    // At an explicit index the group stays right after its leading widget.
    let e = fixture();
    e = { ...e, widgetLibrary: { ...e.widgetLibrary, [template.id]: template } };
    e = run(e, widgetCatalogAddCommands(e, entry(entries, 'template:tpl.grouped'), { zone: 'top.right', index: 1 }));
    expect(selectVisibleWidgetsByZone(e, 'top.right').map((w) => w.id)).toEqual(['widget.preset', 'lead', 'g1', 'g2', 'widget.cpu']);
  });

  it('moves a hidden instance entry back; unavailable / stale entries do nothing', () => {
    const d = fixture();
    const entries = buildWidgetCatalog(selectActiveLayout(d), {
      canonical: SPECS,
      unavailableReason: (type) => (type === 'w.scenes' ? 'No scenes' : null)
    });
    expect(widgetCatalogAddCommands(d, entry(entries, 'instance:param.1'), { zone: 'bottom' })).toEqual([
      { type: 'widget.move', widgetIds: ['param.1'], zone: 'bottom' }
    ]);
    expect(widgetCatalogAddCommands(d, entry(entries, 'builtin:w.scenes'), { zone: 'bottom' })).toEqual([]);
    expect(widgetCatalogAddCommands(d, { ...entry(entries, 'instance:param.1'), instanceId: 'gone' }, { zone: 'bottom' })).toEqual([]);
    expect(widgetCatalogAddCommands(d, entry(entries, 'builtin:w.preset'), { zone: 'hidden' })).toEqual([]);
  });

  it('a move within the same zone accounts for the widget itself in the drop index', () => {
    const d = fixture();
    const layout = selectActiveLayout(d)!;
    // top.right = [preset, cpu]; dropping preset "after cpu" (index 2 counting itself) → index 1 without it.
    expect(moveIndexExcludingSelf(layout, 'widget.preset', { zone: 'top.right', index: 2 })).toBe(1);
    expect(moveIndexExcludingSelf(layout, 'widget.preset', { zone: 'top.right', index: 0 })).toBe(0);
    expect(moveIndexExcludingSelf(layout, 'widget.preset', { zone: 'bottom', index: 0 })).toBe(0);
    const entries = buildWidgetCatalog(layout, { canonical: SPECS });
    const next = run(d, widgetCatalogAddCommands(d, entry(entries, 'builtin:w.preset'), { zone: 'top.right', index: 2 }));
    expect(ids(next, 'top.right')).toEqual(['widget.cpu', 'widget.preset']);
  });
});

describe('labels', () => {
  it('widgetTitle prefers state.label', () => {
    expect(widgetTitle({ type: 'axis.gridMode', state: { label: 'Mode' } })).toBe('Mode');
    expect(widgetTitle({ type: 'axis.gridMode' })).toBe('Axis GridMode');
  });

  it('widgetZoneLabel names panel zones after their panel, else the stored label, else humanized', () => {
    let d = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l' });
    d = run(d, [{ type: 'panel.add', panel: { id: 'cp', type: 't.customPanel', title: 'My Controls' }, region: 'main' }]);
    const layout = selectActiveLayout(d)!;
    layout.zones.gridbar = { id: 'gridbar', label: 'Grid Bar' };
    expect(widgetZoneLabel(layout, 'panel:cp')).toBe('My Controls');
    expect(widgetZoneLabel(layout, 'gridbar')).toBe('Grid Bar');
    expect(widgetZoneLabel(layout, 'top.right')).toBe('Top right');
    expect(widgetZoneLabel(undefined, 'rail')).toBe('Rail');
  });
});
