import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, reduceWorkbenchDocument, selectActiveLayout } from '../../core';
import { canDeleteLayout, createLayoutSnapshot, createPageLayoutSnapshot, isLayoutReferenced } from '../layouts';

describe('layout library helpers', () => {
  it('creates collision-safe snapshots from the active layout', () => {
    const doc = createEmptyWorkbenchDocument({
      profileId: 'profile.test',
      layoutId: 'layout.test',
      layoutLabel: 'Default'
    });
    doc.layouts['layout.test.copy'] = { ...doc.layouts['layout.test'], id: 'layout.test.copy', label: 'Default Copy' };

    const snapshot = createLayoutSnapshot(doc);

    expect(snapshot?.id).toBe('layout.test.copy1');
    expect(snapshot?.label).toBe('Default Copy');
    expect(snapshot?.pages).toEqual(doc.layouts['layout.test'].pages);
  });

  it('saves and applies layout snapshots through reducer commands', () => {
    let doc = createEmptyWorkbenchDocument({
      profileId: 'profile.test',
      layoutId: 'layout.test',
      layoutLabel: 'Default'
    });
    const snapshot = createLayoutSnapshot(doc, { id: 'layout.stage', label: 'Stage' })!;
    snapshot.navigation.mode = 'bottom';

    const saved = reduceWorkbenchDocument(doc, { type: 'layout.save', layout: snapshot });
    doc = reduceWorkbenchDocument(saved.next, { type: 'layout.apply', layoutId: 'layout.stage' }).next;

    expect(saved.success).toBe(true);
    expect(selectActiveLayout(doc)?.id).toBe('layout.stage');
    expect(selectActiveLayout(doc)?.navigation.mode).toBe('bottom');
  });

  it('snapshots the active page (dock + referenced panels) as a page layout', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'panel.add',
      panel: { id: 'panel.a', type: 'test.panel', title: 'A' },
      region: 'main'
    }).next;

    const snapshot = createPageLayoutSnapshot(doc, { id: 'pl.1', label: 'My Page' })!;
    expect(snapshot.id).toBe('pl.1');
    expect(snapshot.label).toBe('My Page');
    expect(Object.keys(snapshot.panels)).toEqual(['panel.a']);
    expect(snapshot.createdAt).toBeTypeOf('string');

    // Round-trips through the store: save then apply back onto the active page.
    let saved = reduceWorkbenchDocument(doc, { type: 'pageLayout.save', pageLayout: snapshot });
    expect(saved.success).toBe(true);
    const applied = reduceWorkbenchDocument(saved.next, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' });
    expect(applied.success).toBe(true);
  });

  it('reports which layouts can be deleted', () => {
    const doc = createEmptyWorkbenchDocument({
      profileId: 'profile.test',
      layoutId: 'layout.test',
      layoutLabel: 'Default'
    });
    doc.layouts['layout.saved'] = { ...doc.layouts['layout.test'], id: 'layout.saved', label: 'Saved' };

    expect(isLayoutReferenced(doc, 'layout.test')).toBe(true);
    expect(canDeleteLayout(doc, 'layout.test')).toBe(false);
    expect(canDeleteLayout(doc, 'layout.saved')).toBe(true);
    expect(canDeleteLayout(doc, 'missing')).toBe(false);
  });
});
