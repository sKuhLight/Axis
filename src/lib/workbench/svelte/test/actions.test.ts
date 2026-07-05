import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, reduceWorkbenchDocument } from '../../core';
import { createMissingActionPanelCommand } from '../actions';

describe('workbench action helpers', () => {
  it('creates collision-safe fallback panel commands for missing actions', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const first = createMissingActionPanelCommand(doc, 'test.openThing', { title: 'Open Thing' });
    doc = reduceWorkbenchDocument(doc, first).next;
    const second = createMissingActionPanelCommand(doc, 'test.openThing', { title: 'Open Thing' });

    expect(first).toMatchObject({
      type: 'panel.add',
      panel: {
        id: 'workbench.missingAction.test.openThing',
        type: 'workbench.missingAction',
        title: 'Open Thing',
        state: { command: 'test.openThing' }
      },
      region: 'main'
    });
    expect(second).toMatchObject({
      type: 'panel.add',
      panel: { id: 'workbench.missingAction.test.openThing.copy1' }
    });
  });

  it('sanitizes missing action ids while preserving the command binding', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const command = createMissingActionPanelCommand(doc, 'open strange/action');

    expect(command).toMatchObject({
      type: 'panel.add',
      panel: {
        id: 'workbench.missingAction.open-strange-action',
        state: { command: 'open strange/action' }
      }
    });
  });
});
