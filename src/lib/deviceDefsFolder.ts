// Browser folder access for device definitions (AXIS-44, Chromium only).
//
// Firefox/Safari lack the File System Access API — callers gate on `hasDirectoryPicker()` and fall back
// to drag-drop. When available, the user picks an editor folder ONCE; we persist its
// FileSystemDirectoryHandle in IndexedDB and re-scan it silently on later connects (after re-checking
// permission). Scanning walks the chosen directory and its immediate subdirectories (one level) for an
// `effectDefinitions_*.cache` matching the connected model+firmware, then returns its bytes for the
// octet-stream import endpoint. All pure filename parsing/matching lives in `deviceDefs.ts`.

import { idb } from './idb';
import { matchEditorCacheFile } from './deviceDefs';

// Minimal typings — the DOM lib doesn't always ship the File System Access API surface we use.
type PermState = 'granted' | 'denied' | 'prompt';
interface FsHandlePermission {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermState>;
}
interface FsFileHandle extends FsHandlePermission {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
}
interface FsDirHandle extends FsHandlePermission {
  kind: 'directory';
  name: string;
  values: () => AsyncIterableIterator<FsFileHandle | FsDirHandle>;
}

const HANDLE_KEY = 'deviceDefs.editorFolder';

/** Chromium-only File System Access API present? */
export function hasDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/** Prompt the user to pick a folder and persist its handle. Returns the handle, or null if cancelled. */
export async function pickEditorFolder(): Promise<FsDirHandle | null> {
  if (!hasDirectoryPicker()) return null;
  try {
    const picker = (window as unknown as { showDirectoryPicker: (o?: unknown) => Promise<FsDirHandle> }).showDirectoryPicker;
    const handle = await picker({ id: 'axis-editor-defs', mode: 'read' });
    await idb.set(HANDLE_KEY, handle);
    return handle;
  } catch {
    return null; // user cancelled / not allowed
  }
}

/** The persisted folder handle (or null). Does not check/request permission. */
export async function persistedEditorFolder(): Promise<FsDirHandle | null> {
  if (!idb.available()) return null;
  return (await idb.get<FsDirHandle>(HANDLE_KEY)) ?? null;
}

/** Forget the persisted folder handle. */
export async function forgetEditorFolder(): Promise<void> {
  await idb.del(HANDLE_KEY);
}

/** Re-check read permission on a stored handle, requesting it if `interactive` (a user gesture is
 *  active). Returns true when reading is allowed. */
export async function ensureReadPermission(handle: FsHandlePermission, interactive: boolean): Promise<boolean> {
  try {
    const q = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (q === 'granted') return true;
    if (!interactive) return false;
    const r = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
    return r === 'granted';
  } catch {
    return false;
  }
}

/** A matched editor-cache file, ready to import. */
export interface FoundEditorCache {
  file: string;
  bytes: ArrayBuffer;
}

/** Scan a directory (+ immediate subdirectories, one level) for the first cache file matching the
 *  connected model+firmware. Returns null when nothing matches or permission is missing. */
export async function scanEditorFolder(
  handle: FsDirHandle,
  target: { modelHex: string; fw: { major: number; minor: number } | null },
  opts: { interactive?: boolean } = {}
): Promise<FoundEditorCache | null> {
  if (!(await ensureReadPermission(handle, !!opts.interactive))) return null;
  const dirs: FsDirHandle[] = [handle];
  // Collect one level of subdirectories first, then scan files across the root + those subdirs.
  const subdirs: FsDirHandle[] = [];
  try {
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') subdirs.push(entry);
    }
  } catch {
    /* iteration failed — fall through with just the root */
  }
  dirs.push(...subdirs);
  for (const dir of dirs) {
    try {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && matchEditorCacheFile(entry.name, target)) {
          const file = await entry.getFile();
          return { file: entry.name, bytes: await file.arrayBuffer() };
        }
      }
    } catch {
      /* skip a directory we can't read */
    }
  }
  return null;
}
