import { describe, expect, it } from 'vitest';
import {
  panelIdsInPageDock,
  reduceWorkbenchDocument,
  validateWorkbenchDocument,
  type WorkbenchCommand,
  type WorkbenchDocument
} from '../../workbench/core';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { createWorkbenchController } from '../../workbench';
import {
  AXIS_CONVERT_TRAY_PANEL,
  AXIS_PAGE_CONVERT,
  AXIS_PAGE_GRID,
  ensureAxisConvertPage,
  ensureAxisConvertPageCommands,
  openAxisConvertPage
} from '../axisWorkbenchPages';
import { normalizeAxisWorkbenchDocument } from '../axisWorkbenchStore.svelte';

function apply(doc: WorkbenchDocument, commands: WorkbenchCommand[]): WorkbenchDocument {
  let next = doc;
  for (const command of commands) {
    const result = reduceWorkbenchDocument(next, command);
    expect(result.success, result.error?.message).toBe(true);
    next = result.next;
  }
  return next;
}

const layoutOf = (doc: WorkbenchDocument) => doc.layouts[doc.profiles[doc.activeProfileId].layoutId];

/** The Convert page deleted (its panels parked) and its tray then docked on Grid. */
function convertDeletedTrayOnGrid(): WorkbenchDocument {
  return apply(createAxisWorkbenchDefaultDocument(), [
    { type: 'page.remove', pageId: AXIS_PAGE_CONVERT },
    { type: 'panel.move', panelId: AXIS_CONVERT_TRAY_PANEL, to: { kind: 'region', region: 'right' }, pageId: AXIS_PAGE_GRID }
  ]);
}

describe('openAxisConvertPage (in-session hardening before "Convert…")', () => {
  it('recreates a missing Convert page in one batch (nav-less, tray stays on Grid) and activates it', () => {
    const controller = createWorkbenchController(convertDeletedTrayOnGrid());
    const navBefore = Object.keys(controller.activeLayout!.navigation.entries).sort();
    openAxisConvertPage(controller);
    const layout = controller.activeLayout!;
    expect(layout.activePageId).toBe(AXIS_PAGE_CONVERT);
    expect(panelIdsInPageDock(layout.pages[AXIS_PAGE_CONVERT])).not.toContain(AXIS_CONVERT_TRAY_PANEL);
    expect(panelIdsInPageDock(layout.pages[AXIS_PAGE_GRID])).toContain(AXIS_CONVERT_TRAY_PANEL);
    expect(Object.keys(layout.navigation.entries).sort()).toEqual(navBefore);
    expect(ensureAxisConvertPageCommands(layout)).toEqual([]);
  });

  it('only activates when the page exists', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    const before = controller.document;
    openAxisConvertPage(controller);
    expect(controller.activeLayout!.activePageId).toBe(AXIS_PAGE_CONVERT);
    expect(Object.keys(controller.activeLayout!.pages)).toEqual(Object.keys(layoutOf(before).pages));
  });
});

describe('ensureAxisConvertPage (marker-free self-heal)', () => {
  it('recreates a deleted Convert page without taking a panel that lives on another page', () => {
    const healed = ensureAxisConvertPage(structuredClone(convertDeletedTrayOnGrid()));
    const layout = layoutOf(healed);
    expect(layout.pages[AXIS_PAGE_CONVERT]).toBeDefined();
    expect(panelIdsInPageDock(layout.pages[AXIS_PAGE_CONVERT])).not.toContain(AXIS_CONVERT_TRAY_PANEL);
    expect(panelIdsInPageDock(layout.pages[AXIS_PAGE_GRID])).toContain(AXIS_CONVERT_TRAY_PANEL);
    expect(layout.pageOrder).toContain(AXIS_PAGE_CONVERT);
    // No duplicate panel reference, no unlisted page.
    expect(validateWorkbenchDocument(healed).issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('is idempotent: running it twice equals running it once', () => {
    const once = ensureAxisConvertPage(structuredClone(convertDeletedTrayOnGrid()));
    const twice = ensureAxisConvertPage(structuredClone(once));
    expect(twice).toEqual(once);
  });

  it('the normalization chain stays idempotent over that document', () => {
    const once = normalizeAxisWorkbenchDocument(structuredClone(convertDeletedTrayOnGrid()));
    const twice = normalizeAxisWorkbenchDocument(structuredClone(once));
    expect(twice).toEqual(once);
    expect(validateWorkbenchDocument(once).issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('leaves a layout that has the Convert page untouched', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    expect(ensureAxisConvertPage(structuredClone(doc))).toEqual(doc);
  });
});
