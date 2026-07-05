import { describe, expect, it } from 'vitest';
import {
  AXIS_WORKBENCH_CACHE_KEY,
  AXIS_WORKBENCH_CONFIG_DOC,
  axisWorkbenchApplyRemote,
  axisWorkbenchController,
  axisWorkbenchDoc,
  axisWorkbenchRev,
  normalizeAxisWorkbenchDocument
} from '../axisWorkbenchStore.svelte';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';

describe('Axis Workbench persistence helpers', () => {
  it('uses the dedicated config document and cache key', () => {
    expect(AXIS_WORKBENCH_CONFIG_DOC).toBe('workbench');
    expect(AXIS_WORKBENCH_CACHE_KEY).toBe('axs.workbench.doc');
  });

  it('falls back to the Axis default document for invalid persisted input', () => {
    const normalized = normalizeAxisWorkbenchDocument(null);
    expect(normalized.metadata?.app).toBe('axis');
    expect(normalized.profiles['axis.profile.desktop']).toBeDefined();
  });

  it('applies remote documents to the singleton controller without dispatching commands', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    doc.metadata = { ...doc.metadata, marker: 'remote' };
    const beforeRev = axisWorkbenchRev();

    axisWorkbenchApplyRemote(doc);

    expect(axisWorkbenchDoc().metadata?.marker).toBe('remote');
    expect(axisWorkbenchController.document.metadata?.marker).toBe('remote');
    expect(axisWorkbenchController.lastResult).toBeNull();
    expect(axisWorkbenchRev()).toBe(beforeRev + 1);
  });

  it('repairs malformed remote documents before applying them', () => {
    axisWorkbenchApplyRemote({ schemaVersion: 1, activeProfileId: 'missing', profiles: {}, layouts: {} });

    expect(axisWorkbenchDoc().metadata?.app).toBe('axis');
    expect(axisWorkbenchController.document.profiles['axis.profile.desktop']).toBeDefined();
  });
});
