import { selectActiveProfile } from './selectors';
import type { WorkbenchDocument, WorkbenchProfile } from './schema';

function uniqueProfileId(base: string, doc: WorkbenchDocument): string {
  if (!doc.profiles[base]) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!doc.profiles[id]) return id;
  }
}

export function isProfileReferenced(doc: WorkbenchDocument, profileId: string): boolean {
  return doc.activeProfileId === profileId;
}

export function isLastProfile(doc: WorkbenchDocument): boolean {
  return Object.keys(doc.profiles).length <= 1;
}

export function canDeleteProfile(doc: WorkbenchDocument, profileId: string): boolean {
  return !!doc.profiles[profileId] && !isLastProfile(doc) && !isProfileReferenced(doc, profileId);
}

export function createProfileSnapshot(
  doc: WorkbenchDocument,
  options: {
    id?: string;
    label?: string;
    layoutId?: string;
    breakpoint?: WorkbenchProfile['breakpoint'];
    deviceClass?: string;
  } = {}
): WorkbenchProfile | null {
  const active = selectActiveProfile(doc);
  if (!active) return null;
  const id = uniqueProfileId(options.id ?? active.id, doc);
  return {
    ...active,
    id,
    label: options.label ?? `${active.label} Copy`,
    layoutId: options.layoutId ?? active.layoutId,
    breakpoint: options.breakpoint ?? active.breakpoint,
    deviceClass: options.deviceClass ?? active.deviceClass,
    state: active.state ? JSON.parse(JSON.stringify(active.state)) as WorkbenchProfile['state'] : undefined
  };
}
