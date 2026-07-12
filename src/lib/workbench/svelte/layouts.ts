import {
  createWorkbenchId,
  panelIdsInPageDock,
  selectActiveLayout,
  selectActivePage,
  type PanelInstance,
  type WorkbenchLayout,
  type WorkbenchDocument,
  type WorkbenchPageLayout
} from '../core';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function uniqueLayoutId(base: string, doc: WorkbenchDocument): string {
  if (!doc.layouts[base]) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!doc.layouts[id]) return id;
  }
}

export function createLayoutSnapshot(
  doc: WorkbenchDocument,
  options: { id?: string; label?: string } = {}
): WorkbenchLayout | null {
  const active = selectActiveLayout(doc);
  if (!active) return null;
  const id = uniqueLayoutId(options.id ?? active.id, doc);
  return {
    ...clone(active),
    id,
    label: options.label ?? `${active.label} Copy`
  };
}

/**
 * Snapshot the ACTIVE page's dock (and the panel instances it references) into a
 * self-contained {@link WorkbenchPageLayout} for the shared page-layout store.
 * Returns null when there is no active page. Backs the Layouts drawer's "Save
 * this page" action; the stored template's interior ids are re-minted at apply.
 */
export function createPageLayoutSnapshot(
  doc: WorkbenchDocument,
  options: { id?: string; label?: string } = {}
): WorkbenchPageLayout | null {
  const page = selectActivePage(doc);
  const layout = selectActiveLayout(doc);
  if (!page || !layout) return null;
  const panels: Record<string, PanelInstance> = {};
  for (const panelId of panelIdsInPageDock(page)) {
    if (layout.panels[panelId]) panels[panelId] = clone(layout.panels[panelId]);
  }
  return {
    id: options.id ?? createWorkbenchId('pageLayout'),
    label: options.label ?? `${page.label} Layout`,
    page: clone(page),
    panels,
    createdAt: new Date().toISOString()
  };
}

export function isLayoutReferenced(doc: WorkbenchDocument, layoutId: string): boolean {
  return Object.values(doc.profiles).some((profile) => profile.layoutId === layoutId);
}

export function canDeleteLayout(doc: WorkbenchDocument, layoutId: string): boolean {
  return !!doc.layouts[layoutId] && !isLayoutReferenced(doc, layoutId);
}
