import { forgefx, isRemote } from '../forgefx';
import { isRemoteBuild } from '../cloudBrowser';
import { notifyMutation } from '../syncBus';
import { createWorkbenchController, migrateWorkbenchDocument, type WorkbenchDocument } from '../workbench';
import { enqueueToast } from '../workbench/svelte/toasts';
import {
  AXIS_WORKBENCH_CACHE_KEY,
  listAxisWorkbenchBackups,
  readAxisWorkbenchBackup,
  readWorkbenchDocRev,
  rotateAxisWorkbenchBackups,
  shouldAdoptIncomingWorkbenchDoc,
  stashAxisWorkbenchBackup,
  type AxisWorkbenchBackupEntry
} from './axisWorkbenchBackups';
import { registerAxisWorkbenchBindings } from './axisWorkbenchBindings';
import { createAxisWorkbenchDefaultDocument, ensureAxisGridControlWidgets, pruneAxisRetiredRailWidgets } from './axisWorkbenchDefaults';
import { ensureAxisSeedPages } from './axisWorkbenchPages';
import { AXIS_MOBILE_PROFILE_ID } from './axisWorkbenchLayoutActions';

export const AXIS_WORKBENCH_CONFIG_DOC = 'workbench';
export { AXIS_WORKBENCH_CACHE_KEY };

/**
 * Persist debounces (storage hardening item 2). Measured cost per dispatch on a
 * realistic large doc (6 layouts × 30 widgets + libraries, ~100 KB; see
 * test/axisWorkbenchPersistCost.test.ts): repair ≈ 1.0 ms + stringify+set
 * ≈ 0.3 ms; ≈ 7 ms at 10× size. The per-dispatch repair (≈ 75% of the cost —
 * the reducer already deep-clones and maintains invariants on every dispatch,
 * repair still runs on load/adopt/restore) is dropped, and the localStorage
 * write is coalesced on a short trailing debounce so gesture streams (drag /
 * resize dispatch bursts) never pay stringify+setItem per step. A pagehide /
 * visibilitychange flush guarantees no edit is lost on tab close.
 */
export const AXIS_WORKBENCH_CACHE_DEBOUNCE_MS = 150;
/** Cloud push trailing debounce (was 400 ms — modest widening, item 3). */
export const AXIS_WORKBENCH_CLOUD_DEBOUNCE_MS = 1500;

let cacheTimer: ReturnType<typeof setTimeout> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let initPromise: Promise<void> | null = null;
/** UI refresh counter (bumped whenever the doc is swapped wholesale) — NOT the persisted doc rev. */
let uiRev = 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeAxisWorkbenchDocument(input: unknown): WorkbenchDocument {
  if (!input || typeof input !== 'object') return createAxisWorkbenchDefaultDocument();
  const raw = input as Record<string, unknown>;
  if (!isRecord(raw.profiles) || !Object.keys(raw.profiles).length || !isRecord(raw.layouts) || !Object.keys(raw.layouts).length) {
    return createAxisWorkbenchDefaultDocument();
  }
  // Normalization chain (must stay idempotent — runs on every load over
  // already-normalized docs):
  //   migrate → ensureSeedPages (ROUND 15 Pages migration) → ensureGridControls →
  //   pruneRetiredRail → ensureMobileBottomNav.
  // ensureAxisSeedPages migrates a pre-Pages persisted doc: the existing dock tree
  // becomes the Grid page and the six other seed pages + full-size Preset Browser
  // page are added per profile, with the nav entries bound to pages. Guarded by a
  // doc-metadata marker so freshly seeded / default docs are untouched.
  return ensureAxisMobileBottomNav(
    pruneAxisRetiredRailWidgets(ensureAxisGridControlWidgets(ensureAxisSeedPages(migrateWorkbenchDocument(input))))
  );
}

/**
 * One-shot migration (V14d): the mobile profile's default navigation is the
 * persistent bottom bar — the hamburger + bottom-sheet drawer pattern is a
 * side-mode affordance and the wrong default on phones. Freshly seeded mobile
 * profiles get `navMode: 'bottom'` from the preset; this flips a persisted
 * pre-V14d mobile profile from 'side' to 'bottom' exactly once, marked in the
 * doc metadata so a user who deliberately switches back to side navigation on
 * mobile is never overridden again.
 */
const AXIS_MOBILE_BOTTOM_NAV_MARKER = 'axisMobileBottomNav';

export function ensureAxisMobileBottomNav(doc: WorkbenchDocument): WorkbenchDocument {
  if (doc.metadata?.[AXIS_MOBILE_BOTTOM_NAV_MARKER]) return doc;
  const mobileProfile = doc.profiles?.[AXIS_MOBILE_PROFILE_ID];
  const layout = mobileProfile ? doc.layouts?.[mobileProfile.layoutId] : undefined;
  if (layout?.navigation && layout.navigation.mode === 'side') {
    layout.navigation.mode = 'bottom';
  }
  doc.metadata = { ...(doc.metadata ?? {}), [AXIS_MOBILE_BOTTOM_NAV_MARKER]: 'v1' };
  return doc;
}

function cacheLoad(): WorkbenchDocument {
  const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
  if (!storage) return createAxisWorkbenchDefaultDocument();
  try {
    const raw = storage.getItem(AXIS_WORKBENCH_CACHE_KEY);
    if (!raw) return createAxisWorkbenchDefaultDocument();
    return normalizeAxisWorkbenchDocument(JSON.parse(raw));
  } catch {
    return createAxisWorkbenchDefaultDocument();
  }
}

function cacheSave(doc: WorkbenchDocument): void {
  const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
  if (!storage) return;
  try {
    storage.setItem(AXIS_WORKBENCH_CACHE_KEY, JSON.stringify(doc));
  } catch {
    /* quota / private mode */
  }
}

/** Write the cache immediately, cancelling any pending debounced write. */
function cacheSaveNow(): void {
  if (cacheTimer) {
    clearTimeout(cacheTimer);
    cacheTimer = null;
  }
  cacheSave(mem);
}

function scheduleCacheSave(): void {
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    cacheTimer = null;
    cacheSave(mem);
  }, AXIS_WORKBENCH_CACHE_DEBOUNCE_MS);
}

/** Push to the cloud immediately, cancelling any pending debounced push. */
function pushCloudNow(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  forgefx.putDoc('config', AXIS_WORKBENCH_CONFIG_DOC, mem).catch(() => {});
  notifyMutation();
}

function scheduleCloudPush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushCloudNow, AXIS_WORKBENCH_CLOUD_DEBOUNCE_MS);
}

// Session-start backup rotation (item 1): the previous session's cached doc
// becomes generation bak1 BEFORE this session writes anything — only when the
// cache parses and differs from bak1, so unchanged sessions don't burn a slot.
rotateAxisWorkbenchBackups();

let mem: WorkbenchDocument = cacheLoad();

function persist(doc: WorkbenchDocument): void {
  // No repair here (measured ≈ 75% of the old per-dispatch persist cost): the
  // reducer deep-clones and maintains invariants on every dispatch, and repair
  // still guards every load/adopt/restore path. Stamp the monotonic revision +
  // timestamp (item 3) on a shallow copy — `doc` is the controller's own
  // freshly-cloned document, never shared with a previous revision.
  mem = { ...doc, rev: (mem.rev ?? 0) + 1, updatedAt: new Date().toISOString() };
  scheduleCacheSave();
  scheduleCloudPush();
}

/** Flush pending debounced writes (tab close / backgrounding — no edit may be lost). */
function flushPendingPersist(): void {
  if (cacheTimer) cacheSaveNow();
  // Best-effort: the fetch may be cancelled by unload; localStorage is authoritative.
  if (pushTimer) pushCloudNow();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingPersist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPersist();
  });
}

export const axisWorkbenchController = createWorkbenchController(mem, {
  onChange: persist
});
// The controller repairs the document it was constructed with; adopt the repaired copy so the
// cache push in axisWorkbenchInit never re-uploads an unrepaired document.
mem = axisWorkbenchController.document;
registerAxisWorkbenchBindings(axisWorkbenchController.bindingRegistry);

export const axisWorkbenchDoc = (): WorkbenchDocument => mem;
export const axisWorkbenchRev = (): number => uiRev;

export function axisWorkbenchApplyRemote(doc: unknown): void {
  // Stale-write protection (item 3): an incoming doc with a LOWER rev than the
  // one already held must not silently overwrite it. Keep the newer doc, stash
  // the older incoming copy as a backup generation, and say so. Docs without a
  // rev read as 0 (never newer); rev ties adopt the incoming doc, preserving
  // the pre-rev normalize-and-adopt behavior.
  if (!shouldAdoptIncomingWorkbenchDoc(doc, mem.rev ?? 0)) {
    stashAxisWorkbenchBackup(doc);
    enqueueToast({
      text: 'Kept your newer workbench layout — an older synced copy was saved to Backups.',
      tone: 'warn'
    });
    // Converge: the source still holds the older copy — push the newer doc so
    // the next fetch doesn't reject (and toast) again.
    scheduleCloudPush();
    return;
  }
  const next = normalizeAxisWorkbenchDocument(doc);
  axisWorkbenchController.setDocument(next, { notify: false });
  // setDocument repairs (dedupes node ids, normalizes shapes) — keep the repaired doc, not `next`,
  // so the cache never re-poisons the next boot with an unrepaired document.
  mem = axisWorkbenchController.document;
  cacheSaveNow();
  uiRev += 1;
}

/** The rolling local backup generations (item 1), newest first. */
export function axisWorkbenchListBackups(): AxisWorkbenchBackupEntry[] {
  return listAxisWorkbenchBackups();
}

/**
 * Restore a backup generation: the current doc is stashed first (so a restore
 * is itself reversible), the backup is adopted through the normal
 * normalize/repair path, and the result is immediately re-persisted with a rev
 * ABOVE the current one so the restored doc wins any later stale-write
 * comparison. Returns false when the slot is empty/unreadable.
 */
export function axisWorkbenchRestoreBackup(slot: number): boolean {
  const raw = readAxisWorkbenchBackup(slot);
  if (!raw) return false;
  const currentRev = mem.rev ?? 0;
  stashAxisWorkbenchBackup(mem);
  const next = normalizeAxisWorkbenchDocument(raw);
  axisWorkbenchController.setDocument(next, { notify: false });
  mem = {
    ...axisWorkbenchController.document,
    rev: Math.max(currentRev, readWorkbenchDocRev(raw)) + 1,
    updatedAt: new Date().toISOString()
  };
  cacheSaveNow();
  scheduleCloudPush();
  uiRev += 1;
  return true;
}

export function axisWorkbenchInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const doc = (await forgefx.getDoc<WorkbenchDocument>('config', AXIS_WORKBENCH_CONFIG_DOC))?.data;
      if (doc && typeof doc === 'object') {
        axisWorkbenchApplyRemote(doc);
        return;
      }
    } catch {
      /* offline / no backend: keep cache */
    }

    if (!isRemoteBuild() && !isRemote()) {
      forgefx.putDoc('config', AXIS_WORKBENCH_CONFIG_DOC, mem).catch(() => {});
    }
  })();
  return initPromise;
}
