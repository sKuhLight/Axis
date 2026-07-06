import { forgefx, isRemote } from '../forgefx';
import { isRemoteBuild } from '../cloudBrowser';
import { notifyMutation } from '../syncBus';
import { createWorkbenchController, migrateWorkbenchDocument, repairWorkbenchDocument, type WorkbenchDocument } from '../workbench';
import { registerAxisWorkbenchBindings } from './axisWorkbenchBindings';
import { createAxisWorkbenchDefaultDocument } from './axisWorkbenchDefaults';

export const AXIS_WORKBENCH_CONFIG_DOC = 'workbench';
export const AXIS_WORKBENCH_CACHE_KEY = 'axs.workbench.doc';

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let initPromise: Promise<void> | null = null;
let rev = 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeAxisWorkbenchDocument(input: unknown): WorkbenchDocument {
  if (!input || typeof input !== 'object') return createAxisWorkbenchDefaultDocument();
  const raw = input as Record<string, unknown>;
  if (!isRecord(raw.profiles) || !Object.keys(raw.profiles).length || !isRecord(raw.layouts) || !Object.keys(raw.layouts).length) {
    return createAxisWorkbenchDefaultDocument();
  }
  return migrateWorkbenchDocument(input);
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

let mem: WorkbenchDocument = cacheLoad();

function persist(doc: WorkbenchDocument): void {
  mem = repairWorkbenchDocument(doc);
  cacheSave(mem);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    forgefx.putDoc('config', AXIS_WORKBENCH_CONFIG_DOC, mem).catch(() => {});
    notifyMutation();
  }, 400);
}

export const axisWorkbenchController = createWorkbenchController(mem, {
  onChange: persist
});
// The controller repairs the document it was constructed with; adopt the repaired copy so the
// cache push in axisWorkbenchInit never re-uploads an unrepaired document.
mem = axisWorkbenchController.document;
registerAxisWorkbenchBindings(axisWorkbenchController.bindingRegistry);

export const axisWorkbenchDoc = (): WorkbenchDocument => mem;
export const axisWorkbenchRev = (): number => rev;

export function axisWorkbenchApplyRemote(doc: unknown): void {
  const next = normalizeAxisWorkbenchDocument(doc);
  axisWorkbenchController.setDocument(next, { notify: false });
  // setDocument repairs (dedupes node ids, normalizes shapes) — keep the repaired doc, not `next`,
  // so the cache never re-poisons the next boot with an unrepaired document.
  mem = axisWorkbenchController.document;
  cacheSave(mem);
  rev += 1;
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
