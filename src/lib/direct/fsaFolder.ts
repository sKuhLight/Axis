// File System Access folder adapter for Browser Direct mode — implements
// ForgeFX's FolderAdapter over a user-picked FileSystemDirectoryHandle, so the
// local storage folder feature (Presets/ library + Sync/ mirror) works in the
// browser exactly like on desktop. Chromium-only (showDirectoryPicker); the
// caller feature-detects and falls back to import/export elsewhere.
//
// The picked handle is persisted in IndexedDB (handles are structured-cloneable)
// so the folder survives reloads; permission is re-requested on boot via a user
// gesture when the browser demands it.
import type { FolderAdapter, FolderEntry } from 'forgefx-server/runtime';
import { idb } from '$lib/idb';

const HANDLE_KEY = 'axs.direct.folder';

/** Split a relative POSIX path into segments ('' = root). Traversal safety is
 *  the shared logic's job (safeRel) — this only navigates. */
const segs = (rel: string) => rel.split('/').filter((s) => s.length > 0);

async function dirAt(root: FileSystemDirectoryHandle, rel: string, create = false): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const s of segs(rel)) dir = await dir.getDirectoryHandle(s, { create });
  return dir;
}

export class FsaFolderAdapter implements FolderAdapter {
  #root: FileSystemDirectoryHandle;
  #rootId: string;

  constructor(root: FileSystemDirectoryHandle, rootId = root.name) {
    this.#root = root;
    this.#rootId = rootId;
  }

  /** Root-scoped cache key (Node uses the absolute path; the browser has no
   *  path, so the picked directory's name scopes the decode cache instead). */
  key = (rel: string): string => `fsa:${this.#rootId}/${rel}`;

  list = async (rel: string): Promise<FolderEntry[]> => {
    const dir = await dirAt(this.#root, rel);
    const out: FolderEntry[] = [];
    for await (const [name, handle] of dir.entries()) {
      try {
        if (handle.kind === 'directory') {
          out.push({ name, dir: true, size: 0, mtimeMs: 0 });
        } else {
          const f = await (handle as FileSystemFileHandle).getFile();
          out.push({ name, dir: false, size: f.size, mtimeMs: f.lastModified });
        }
      } catch {
        // entry vanished mid-iteration — skip, matching the Node adapter's stat-and-skip
      }
    }
    return out;
  };

  exists = async (rel: string): Promise<boolean> => {
    const parts = segs(rel);
    if (parts.length === 0) return true;
    const name = parts.pop()!;
    try {
      const dir = await dirAt(this.#root, parts.join('/'));
      try {
        await dir.getFileHandle(name);
        return true;
      } catch {
        await dir.getDirectoryHandle(name);
        return true;
      }
    } catch {
      return false;
    }
  };

  readFile = async (rel: string): Promise<Uint8Array> => {
    const parts = segs(rel);
    const name = parts.pop()!;
    const dir = await dirAt(this.#root, parts.join('/'));
    const f = await (await dir.getFileHandle(name)).getFile();
    return new Uint8Array(await f.arrayBuffer());
  };

  // createWritable() writes to a temp file that only replaces the target on
  // close() — the File System Access API's native equivalent of tmp+rename.
  writeFile = async (rel: string, bytes: Uint8Array): Promise<void> => {
    const parts = segs(rel);
    const name = parts.pop()!;
    const dir = await dirAt(this.#root, parts.join('/'));
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    try {
      // slice() re-types Uint8Array<ArrayBufferLike> → Uint8Array<ArrayBuffer> (what the stream wants)
      await w.write(bytes.slice());
    } finally {
      await w.close();
    }
  };

  mkdir = async (rel: string): Promise<void> => {
    await dirAt(this.#root, rel, true);
  };

  remove = async (rel: string): Promise<void> => {
    const parts = segs(rel);
    const name = parts.pop()!;
    try {
      const dir = await dirAt(this.#root, parts.join('/'));
      await dir.removeEntry(name, { recursive: true });
    } catch {
      // missing entry is a no-op, matching the Node adapter
    }
  };
}

/** Pick a folder (user gesture required) and persist the handle for reloads. */
export async function pickLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker({ id: 'axis-local', mode: 'readwrite' });
  await idb.set(HANDLE_KEY, handle);
  return handle;
}

/** Restore the persisted folder handle; returns null when none is saved or
 *  permission is gone and can't be re-requested without a gesture. */
export async function restoreLocalFolder(interactive: boolean): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idb.get<FileSystemDirectoryHandle>(HANDLE_KEY);
  if (!handle) return null;
  try {
    const q = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (q === 'granted') return handle;
    if (interactive && (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted') return handle;
  } catch {
    /* stale handle (folder deleted / device gone) */
  }
  return null;
}

export async function forgetLocalFolder(): Promise<void> {
  await idb.del(HANDLE_KEY);
}
