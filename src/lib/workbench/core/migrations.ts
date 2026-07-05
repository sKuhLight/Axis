import { createEmptyWorkbenchDocument } from './defaults';
import { repairWorkbenchDocument } from './invariants';
import { WORKBENCH_SCHEMA_VERSION, type WorkbenchDocument } from './schema';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isRecordMap = (value: unknown): value is Record<string, never> => isRecord(value);

function migrateV1(input: Record<string, unknown>): WorkbenchDocument {
  const fallback = createEmptyWorkbenchDocument();
  const profiles = isRecordMap(input.profiles) ? input.profiles : fallback.profiles;
  const layouts = isRecordMap(input.layouts) ? input.layouts : fallback.layouts;

  const doc = {
    ...input,
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    activeProfileId: typeof input.activeProfileId === 'string' ? input.activeProfileId : fallback.activeProfileId,
    profiles,
    layouts,
    panelLibrary: isRecordMap(input.panelLibrary) ? input.panelLibrary : {},
    widgetLibrary: isRecordMap(input.widgetLibrary) ? input.widgetLibrary : {},
    metadata: isRecord(input.metadata) ? input.metadata : {}
  } as unknown as WorkbenchDocument;

  return repairWorkbenchDocument(doc);
}

export function migrateWorkbenchDocument(input: unknown): WorkbenchDocument {
  if (!isRecord(input)) return createEmptyWorkbenchDocument();
  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) {
    return createEmptyWorkbenchDocument();
  }
  return migrateV1(input);
}
