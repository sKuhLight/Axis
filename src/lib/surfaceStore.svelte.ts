// Control-Surface persistence — unified into the ONE config store.
//
// The Control Surface used to scatter its state across many localStorage keys
// (`axs.surface2.grid`, `axs.surface3meta.<slug>`, `axs.surface3.<slug>.<profile>`) and never mirrored
// them to the cloud. That's why arrange/layout changes never reached the remote. This module folds ALL of
// that into a single `config/surface` document (the same config store that holds tags/layouts/swipe), with
// localStorage kept only as an offline cache for instant, no-flash loads on the host.
//
// - Host: `mem` seeds synchronously from the localStorage cache at import (so the surface renders instantly),
//   then `surfInit()` folds any legacy scattered keys into the doc and publishes/refreshes against the store.
// - Remote: the cache is empty; `surfInit()` (awaited in hydrateRemoteConfig, after the relay is live) pulls
//   `config/surface` from the host over the relay so the remote shows the EXACT same boards/quick-actions.
//
// The public surfGet/surfSet/surfRemove keep the string key/value shape the ControlSurface already used, so
// migrating it is a mechanical getItem→surfGet swap.
import { forgefx, isRemote } from './forgefx';
import { isRemoteBuild } from './cloudBrowser';
import { notifyMutation } from './syncBus';

const DOC = 'surface'; // config/surface — the single doc holding the whole control-surface state
const CACHE = 'axs.surface.doc'; // localStorage cache of that doc (offline / instant host load)
// keys this module owns (everything the ControlSurface scattered): the global grid + per-slug meta + boards
const OWNED = /^(axs\.surface2\.grid|axs\.surface3meta\.|axs\.surface3\.)/;

function cacheLoad(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE) || '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// key → JSON string (mirrors what localStorage held). Reactive so the surface updates if the store refresh
// lands changes (e.g. the initial remote pull).
let mem = $state<Record<string, string>>(cacheLoad());
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let initPromise: Promise<void> | null = null;
// Bumped whenever a REMOTE config write lands, so an open Control Surface knows to reload the board from the
// new `mem` (its own load is otherwise guarded to run once per slug).
let rev = $state(0);
/** Reactive revision — read it inside a Control Surface effect to reload when a remote surface edit lands. */
export const surfRev = (): number => rev;

function persist(): void {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(CACHE, JSON.stringify(mem)); } catch { /* quota / private mode */ }
  }
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    forgefx.putDoc('config', DOC, mem).catch(() => {});
    notifyMutation(); // nudge debounced cloud auto-sync
  }, 400);
}

export function surfGet(key: string): string | null {
  return mem[key] ?? null;
}
export function surfSet(key: string, val: string): void {
  mem = { ...mem, [key]: val };
  persist();
}
export function surfRemove(key: string): void {
  if (!(key in mem)) return;
  const m = { ...mem };
  delete m[key];
  mem = m;
  persist();
}

/** Apply the whole surface doc pushed live by another UI (host↔remote), WITHOUT re-publishing it (that would
 *  loop). Updates the cache and bumps `rev` so an open Control Surface reloads its board. */
export function surfApplyRemote(doc: unknown): void {
  if (!doc || typeof doc !== 'object') return;
  mem = { ...(doc as Record<string, string>) };
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(CACHE, JSON.stringify(mem)); } catch { /* */ }
  }
  rev += 1;
}

/** Load the surface config from the store (source of truth). Idempotent; the same promise is shared so the
 *  host's fire-and-forget call and the remote's awaited call resolve together. */
export function surfInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Host only: fold any legacy scattered localStorage keys into the doc (so existing boards migrate in).
    if (!isRemoteBuild() && typeof localStorage !== 'undefined') {
      let migrated = false;
      const next = { ...mem };
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k === CACHE || !OWNED.test(k)) continue;
        if (!(k in next)) {
          const v = localStorage.getItem(k);
          if (v != null) { next[k] = v; migrated = true; }
        }
      }
      if (migrated) { mem = next; }
    }
    // Refresh from the store. On the remote this IS the host's live config (pulled over the relay).
    try {
      const doc = (await forgefx.getDoc<Record<string, string>>('config', DOC))?.data;
      if (doc && typeof doc === 'object') {
        // remote: store wins outright; host: keep newer local edits, fill any gaps from the store.
        mem = isRemoteBuild() ? { ...doc } : { ...doc, ...mem };
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem(CACHE, JSON.stringify(mem)); } catch { /* */ }
        }
      }
    } catch { /* offline / no backend — keep the cache */ }
    // Host: publish the (possibly migrated / cache-only) state so the store reflects this PC for the remote.
    if (!isRemoteBuild() && !isRemote() && Object.keys(mem).length) {
      forgefx.putDoc('config', DOC, mem).catch(() => {});
    }
  })();
  return initPromise;
}
