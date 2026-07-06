import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { migrateWorkbenchDocument } from '../migrations';
import { WORKBENCH_SCHEMA_VERSION } from '../schema';
import { selectActiveLayout } from '../selectors';

const layout = (doc: ReturnType<typeof createEmptyWorkbenchDocument>) => selectActiveLayout(doc)!;

describe('migrateWorkbenchDocument', () => {
  it('creates a safe default for invalid input', () => {
    const migrated = migrateWorkbenchDocument(null);

    expect(migrated.schemaVersion).toBe(WORKBENCH_SCHEMA_VERSION);
    expect(selectActiveLayout(migrated)).toBeDefined();
  });

  it('round-trips a current v1 document', () => {
    const current = createEmptyWorkbenchDocument({
      profileId: 'profile.test',
      layoutId: 'layout.test',
      metadata: { marker: 'keep' }
    });

    expect(migrateWorkbenchDocument(current)).toEqual(current);
  });

  it('repairs missing sections', () => {
    const partial = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }) as unknown as {
      schemaVersion: number;
      panelLibrary?: unknown;
      widgetLibrary?: unknown;
      layouts: Record<string, Record<string, unknown>>;
    };
    delete partial.panelLibrary;
    delete partial.widgetLibrary;
    delete partial.layouts['layout.test'].widgetGroups;
    delete partial.layouts['layout.test'].zones;

    const migrated = migrateWorkbenchDocument(partial);

    expect(migrated.panelLibrary).toEqual({});
    expect(migrated.widgetLibrary).toEqual({});
    expect(layout(migrated).widgetGroups).toEqual({});
    expect(layout(migrated).zones.hidden).toBeDefined();
  });

  it('preserves valid persist stamps (rev + updatedAt)', () => {
    const current = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    current.rev = 42;
    current.updatedAt = '2026-07-06T10:00:00.000Z';

    const migrated = migrateWorkbenchDocument(current);

    expect(migrated.rev).toBe(42);
    expect(migrated.updatedAt).toBe('2026-07-06T10:00:00.000Z');
  });

  it('drops invalid persist stamps (docs without a rev are never treated as newer)', () => {
    const base = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });

    for (const rev of ['7', Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      const migrated = migrateWorkbenchDocument({ ...base, rev, updatedAt: 12345 });
      expect(migrated.rev, `rev ${String(rev)}`).toBeUndefined();
      expect(migrated.updatedAt).toBeUndefined();
      expect('rev' in migrated, `rev key for ${String(rev)}`).toBe(false);
    }
  });

  it('floors fractional revs', () => {
    const base = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    expect(migrateWorkbenchDocument({ ...base, rev: 7.9 }).rev).toBe(7);
  });

  it('preserves unknown state fields', () => {
    const current = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    layout(current).panels.panel = { id: 'panel', type: 'unknown.panel', state: { custom: 'panel-state' } };
    layout(current).widgets.widget = {
      id: 'widget',
      type: 'unknown.widget',
      zone: 'top.left',
      order: 0,
      size: 'default',
      state: { custom: 'widget-state' }
    };

    const migrated = migrateWorkbenchDocument(current);

    expect(layout(migrated).panels.panel.state).toEqual({ custom: 'panel-state' });
    expect(layout(migrated).widgets.widget.state).toEqual({ custom: 'widget-state' });
  });
});
