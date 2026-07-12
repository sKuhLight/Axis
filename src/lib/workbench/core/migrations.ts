import { createEmptyWorkbenchDocument } from './defaults';
import { repairWorkbenchDocument } from './invariants';
import { WORKBENCH_SCHEMA_VERSION, type WorkbenchDocument } from './schema';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isRecordMap = (value: unknown): value is Record<string, never> => isRecord(value);

/**
 * Sanitize the optional persist stamps: `rev` must be a finite number ≥ 1
 * (0 ≡ "no revision" and is dropped, so a doc without a rev is never newer
 * than anything); `updatedAt` must be a string. Invalid values are removed —
 * `undefined` keys vanish in the repair clone (JSON round-trip).
 */
function sanitizeRev(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const floored = Math.floor(value);
  return floored >= 1 ? floored : undefined;
}

/**
 * Structural migration for any known schema version (1 or 2). The heavy lifting
 * lives in `repairWorkbenchDocument`, which — since schema v2 (Pages) — wraps a
 * v1 layout's single `dock` into one default page (`main`/`Main`), sets it
 * active, and deletes the deprecated `dock` field. Navigation entries are left
 * unbound (`pageId` stays absent); the app layer decides page bindings later.
 * A migrated v1 document therefore loads cleanly and renders exactly as before:
 * its whole dock IS the one page.
 */
function migrateLegacy(input: Record<string, unknown>): WorkbenchDocument {
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
    pageLayouts: isRecordMap(input.pageLayouts) ? input.pageLayouts : {},
    metadata: isRecord(input.metadata) ? input.metadata : {},
    rev: sanitizeRev(input.rev),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : undefined
  } as unknown as WorkbenchDocument;

  return repairWorkbenchDocument(doc);
}

export function migrateWorkbenchDocument(input: unknown): WorkbenchDocument {
  if (!isRecord(input)) return createEmptyWorkbenchDocument();
  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) {
    return createEmptyWorkbenchDocument();
  }
  return migrateLegacy(input);
}
