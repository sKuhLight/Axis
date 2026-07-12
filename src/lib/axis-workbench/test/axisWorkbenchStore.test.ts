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
import { workbenchToasts } from '../../workbench/svelte/toasts';

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

// NOTE: these describe blocks share the singleton store — they run in file
// order and each block states the revision it leaves behind.
describe('Axis Workbench revision stamping (item 3)', () => {
  it('stamps a monotonic rev + ISO updatedAt on every persisted change', () => {
    const before = axisWorkbenchDoc().rev ?? 0;

    // setDocument with default notify runs the persist path (same as a dispatch).
    axisWorkbenchController.setDocument(createAxisWorkbenchDefaultDocument());
    const first = axisWorkbenchDoc();
    expect(first.rev).toBe(before + 1);
    expect(typeof first.updatedAt).toBe('string');
    expect(Number.isNaN(new Date(first.updatedAt!).getTime())).toBe(false);

    axisWorkbenchController.setDocument(createAxisWorkbenchDefaultDocument());
    expect(axisWorkbenchDoc().rev).toBe(before + 2);
  });

  it('adopts a remote doc whose rev is equal or newer and keeps its rev', () => {
    const currentRev = axisWorkbenchDoc().rev ?? 0;
    const incoming = createAxisWorkbenchDefaultDocument();
    incoming.metadata = { ...incoming.metadata, marker: 'newer-remote' };
    incoming.rev = currentRev + 5;

    const uiBefore = axisWorkbenchRev();
    axisWorkbenchApplyRemote(incoming);

    expect(axisWorkbenchDoc().metadata?.marker).toBe('newer-remote');
    expect(axisWorkbenchDoc().rev).toBe(currentRev + 5);
    expect(axisWorkbenchRev()).toBe(uiBefore + 1);
  });

  it('rejects a stale remote doc (lower rev), keeps the newer one, and toasts', () => {
    const currentRev = axisWorkbenchDoc().rev ?? 0;
    expect(currentRev).toBeGreaterThan(0);
    const keptMarker = axisWorkbenchDoc().metadata?.marker;

    const stale = createAxisWorkbenchDefaultDocument();
    stale.metadata = { ...stale.metadata, marker: 'stale-remote' };
    stale.rev = currentRev - 1;

    let toasts: readonly { text: string; tone: string }[] = [];
    const unsubscribe = workbenchToasts.subscribe((list) => (toasts = list));
    const uiBefore = axisWorkbenchRev();

    axisWorkbenchApplyRemote(stale);

    expect(axisWorkbenchDoc().metadata?.marker).toBe(keptMarker);
    expect(axisWorkbenchDoc().rev).toBe(currentRev);
    expect(axisWorkbenchRev()).toBe(uiBefore);
    expect(toasts.some((toast) => toast.text.includes('Backups') && toast.tone === 'warn')).toBe(true);
    unsubscribe();
  });

  it('treats a remote doc without a rev as revision 0 (never newer)', () => {
    const keptMarker = axisWorkbenchDoc().metadata?.marker;
    const legacy = createAxisWorkbenchDefaultDocument();
    legacy.metadata = { ...legacy.metadata, marker: 'legacy-no-rev' };

    axisWorkbenchApplyRemote(legacy);

    expect(axisWorkbenchDoc().metadata?.marker).toBe(keptMarker);
  });
});
