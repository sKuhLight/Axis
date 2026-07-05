import { selectActiveLayout, type WorkbenchLayout, type WorkbenchDocument } from '../core';

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

export function isLayoutReferenced(doc: WorkbenchDocument, layoutId: string): boolean {
  return Object.values(doc.profiles).some((profile) => profile.layoutId === layoutId);
}

export function canDeleteLayout(doc: WorkbenchDocument, layoutId: string): boolean {
  return !!doc.layouts[layoutId] && !isLayoutReferenced(doc, layoutId);
}
