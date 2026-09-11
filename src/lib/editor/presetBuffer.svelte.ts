// The preset-buffer slice of the editor store (M4c of the architecture refactor).
//
// Everything about WHICH preset is in the edit buffer and where it can be put: navigating to a
// stored slot, renaming the buffer or a stored preset, the destructive slot save, the version
// store (snapshots / restore into the buffer), and the local storage folder that mirrors it all
// to disk (Presets/ + Sync/). Also the preset-watch tick that notices a device-side slot change.
//
// The CONTENTS of the buffer — the decoded grid, the open block and its params — stay on
// `EditorStore` for now (they belong to `gridEditing` / `paramEditing`, M4d); this slice asks for
// them to be re-read through `PresetBufferHost.load` / `reloadOpenParams`.
//
// `EditorStore` owns an instance and re-exposes every member below by delegation, so the ~44
// modules that import `editor` keep working unchanged. Call-site migration (importing this store
// directly) is a separate, later change — see `src/lib/CLAUDE.md` (Store pattern § slices).
//
// This store must NEVER import `editor.svelte.ts`, nor another slice — both are cycles, and the
// second one rebuilds the god object under new filenames. Everything it needs from the rest of
// the store arrives through the injected `PresetBufferHost`. (`library`, `history`,
// `presetRecency`, `deviceDefs` and `overlays` are peer STORES, not slices — direct imports, as
// in the two slices extracted before this one.)
import { forgefx, ForgeError } from '$lib/api/forgefx';
import { deviceDefs } from '$lib/device/deviceDefs.svelte';
import { history } from './history.svelte';
import { library } from '$lib/preset/library.svelte';
import { presetRecency } from '$lib/preset/presetRecency.svelte';
import { onMutation } from './syncBus';
import { overlays } from '$lib/overlay/overlays.svelte';

const LOCAL_AUTOSYNC_KEY = 'axs.local.autosync';
const loadLocalAutoSync = (): boolean => { try { return localStorage.getItem(LOCAL_AUTOSYNC_KEY) !== '0'; } catch { return true; } }; // default on

/** The device's current preset REFERENCE (slot number + name) — owned by the `deviceSession`
 *  slice, reached from here through the host. */
export type PresetRef = { number: number; name: string };

/** The narrow view of the rest of the editor store that the preset-buffer slice needs. Getters
 *  (not snapshots) so every read stays live — `EditorStore` implements this with `get` accessors.
 *  Keep it minimal: everything added here is coupling the next extraction has to carry.
 *
 *  The `deviceSession` members below are deliberately NOT a direct import of that slice: slices
 *  are siblings, never a stack (`src/lib/CLAUDE.md`, Store pattern § slices, rule 2). */
export interface PresetBufferHost {
  /** Re-read the grid + blocks. The decoded layout is grid state, still on `EditorStore`. */
  load: () => Promise<void>;
  /** Re-read the OPEN block's params; no-op when nothing is open. Every preset switch needs it —
   *  `load()` only refreshes the grid, so without this the open block keeps the old preset's arcs. */
  reloadOpenParams: () => Promise<void>;
  showToast: (text: string, accent?: string) => void;
  /** Point the undo/redo history at the active device+slot (it keys off `detected`/`layout.model`,
   *  both still on `EditorStore`). */
  histSwitch: (n: number) => void;
  // ── device-session reads (through the host, per rule 2) ──
  readonly status: 'loading' | 'ready' | 'offline';
  /** Device answers the live current-preset query — without it `watchPreset` would just time out. */
  readonly presetLiveQuery: boolean;
  /** 5-pin MIDI or otherwise slow link → throttle the background preset watch. */
  readonly slowLink: boolean;
  /** Legacy v1 server talking to an AM4: the unified /preset/* routes don't exist, so nav and save
   *  fall back to the AM4's own codec routes. */
  readonly legacyAm4: boolean;
  readonly canRenamePresets: boolean;
  /** Device supports full preset dumps — gates the store-after-rename and the library reconcile. */
  readonly canDeepScan: boolean;
  readonly preset: PresetRef | null;
  setPreset: (p: PresetRef | null) => void;
  readonly lastPreset: number | null;
  setLastPreset: (n: number) => void;
  /** Re-read the preset reference from the device (confirms a rename/save landed). */
  poll: () => Promise<void>;
}

export class PresetBufferStore {
  #host: PresetBufferHost;
  constructor(host: PresetBufferHost) {
    this.#host = host;
  }

  // ── preset versions / backup ──
  /** Snapshot the given device preset into the version store. */
  backupPreset = async (n: number) => {
    try { await forgefx.snapshotPreset(n); this.#host.showToast(`Backed up preset ${n}`, '#33c46b'); library.refreshSlot(n); this.scheduleAutoSync(); }
    catch (e) { this.#host.showToast('Backup failed: ' + (e as Error).message, '#d6543f'); }
  };
  /** Load a stored version straight into the edit buffer (plays it without occupying a slot). */
  loadVersion = async (id: string) => {
    try {
      await forgefx.loadVersion(id);
      this.noteBufferReplaced('Loaded snapshot into edit buffer'); // barrier — undo stops here
      await this.#host.load();
      this.#host.showToast('Loaded into edit buffer — Save to keep it on a slot', '#f5a623');
    } catch (e) {
      this.#host.showToast('Load failed: ' + (e as Error).message, '#d6543f');
    }
  };

  // ── local folder sync ──
  #autoSyncT: ReturnType<typeof setTimeout> | null = null;
  /** Register the sync-bus hook. Called from `editor.init()`; separate from `initLocal()` so the
   *  boot order of the two engine probes is exactly what it was before the extraction. */
  initSync = () => {
    // Any local config/version mutation (tags, collections, layouts, snapshots…) nudges a debounced sync
    // of the local Sync/ folder.
    onMutation(() => this.scheduleAutoSync());
  };
  /** Debounced background sync after a local change — batches rapid edits, skips if off/in-flight.
   *  Drives the local Sync/ folder mirror (configured + auto). */
  scheduleAutoSync = () => {
    const doLocal = this.local.configured && this.local.exists && this.local.autoSync;
    if (!doLocal) return;
    if (this.#autoSyncT) clearTimeout(this.#autoSyncT);
    this.#autoSyncT = setTimeout(() => {
      if (!this.local.syncing) this.localSync();
    }, 8000);
  };

  // ── local storage folder (Presets/ library + Sync/ version mirror) ──
  /** Local storage folder (ForgeFX /local/*): a user-picked root with Presets/ (library) + Sync/
   *  (plain-syx version mirror, unlimited). `available` = the engine serves the routes (404 = old
   *  engine → feature hidden); `exists` = the configured root is still mounted. */
  local = $state<{
    available: boolean;
    configured: boolean;
    root: string | null;
    exists: boolean;
    syncing: boolean;
    lastSync: number | null;
    note: string | null;
    autoSync: boolean;
  }>({ available: false, configured: false, root: null, exists: true, syncing: false, lastSync: null, note: null, autoSync: loadLocalAutoSync() });
  /** Probe the engine for the local-folder routes on boot. Called from `editor.init()`. */
  initLocal = async () => {
    try {
      const s = await forgefx.localConfig();
      this.local = { ...this.local, available: true, configured: s.configured, root: s.root, exists: s.exists, lastSync: s.lastSync };
      if (s.configured && s.exists) void library.refreshLocal();
    } catch { /* 404 = older engine → feature hidden (available stays false) */ }
  };
  /** Set (or clear with null) the local root. Native picker in AxisPanel feeds this an absolute path. */
  setLocalRoot = async (root: string | null) => {
    try {
      const s = await forgefx.setLocalRoot(root);
      this.local = { ...this.local, configured: s.configured, root: s.root, exists: s.exists, lastSync: s.lastSync, note: null };
      void library.refreshLocal(); // populates or clears the `local:` entries
      if (s.configured) { this.#host.showToast('Local folder set — Presets/ & Sync/ ready', '#33c46b'); void this.localSync(); }
      else this.#host.showToast('Local folder cleared', '#9a9aa3');
    } catch (e) {
      this.#host.showToast('Could not set folder: ' + (e as Error).message, '#d6543f');
    }
  };
  /** Mirror the version store → the local Sync/ folder (incremental; never deletes user files). */
  localSync = async () => {
    if (!this.local.configured || this.local.syncing) return;
    this.local = { ...this.local, syncing: true, note: null };
    try {
      const r = await forgefx.localSync();
      this.local = { ...this.local, exists: true, lastSync: Date.now(), note: r.written ? `Synced ↓${r.written} to folder` : null };
    } catch (e) {
      const status = e instanceof ForgeError ? e.status : 0;
      if (status === 409) this.local = { ...this.local, exists: false, note: 'Folder missing — remount the drive or pick a new folder' };
      else this.local = { ...this.local, note: (e as Error).message || 'Local sync failed' };
    } finally {
      this.local = { ...this.local, syncing: false };
    }
  };
  /** Re-import versions from the Sync/ folder into the version store (fresh machine / recovery). */
  localRestore = async () => {
    if (this.local.syncing) return;
    this.local = { ...this.local, syncing: true, note: null };
    try {
      const r = await forgefx.localRestore();
      this.#host.showToast(r.imported ? `Restored ${r.imported} version(s) from folder` : 'Nothing new to restore', '#33c46b');
    } catch (e) {
      this.#host.showToast('Restore failed: ' + (e as Error).message, '#d6543f');
    } finally {
      this.local = { ...this.local, syncing: false };
    }
  };
  setLocalAutoSync = (on: boolean) => {
    this.local = { ...this.local, autoSync: on };
    try { localStorage.setItem(LOCAL_AUTOSYNC_KEY, on ? '1' : '0'); } catch { /* */ }
    if (on) this.scheduleAutoSync();
  };
  /** Full device backup → the LOCAL version store, then mirror into the Sync/ folder when configured.
   *  Minutes on a full unit (the client override raises the request timeout accordingly). */
  fullDeviceBackup = async () => {
    if (this.local.syncing) return;
    this.#host.showToast('Backing up the whole device — this can take a few minutes…', '#f5a623');
    try {
      const r = await forgefx.backupDevice();
      this.#host.showToast(`Backed up ${r.count} presets`, '#33c46b');
      if (this.local.configured) void this.localSync(); // land the backup in the local folder immediately
    } catch (e) {
      this.#host.showToast('Backup failed: ' + ((e as Error).message || ''), '#d6543f');
    }
  };

  // ── edit-buffer identity (which local file, if any, the buffer came from) ──
  /** When the edit buffer was loaded from a local Presets/ file, this remembers which one — so Save
   *  can offer writing the edits back to that file (save-to-disk) instead of a device slot. */
  bufferSource = $state<{ path: string; name: string } | null>(null);
  /** The edit buffer was wholesale replaced (audition / snapshot / file load) — undo can't cross this,
   *  and any local-file link is stale (the local load path re-sets it right after). */
  noteBufferReplaced = (label: string) => {
    this.bufferSource = null;
    history.checkpoint(label, /*barrier*/ true);
  };
  /** Save the CURRENT edit buffer back to the local file it was loaded from — no device slot touched. */
  saveLocalFile = async () => {
    const src = this.bufferSource;
    if (!src) return;
    try {
      const b = await forgefx.presetBackup(); // dump the active edit buffer (caps backupDump)
      const r = await forgefx.saveLocalPreset(src.name, b.bytes, { path: src.path, overwrite: true });
      this.saveOpen = false;
      history.checkpoint(`Saved to Presets/${r.path}`, false); // marker — undo continues past it, like a slot save
      this.#host.showToast(`Saved to Presets/${r.path}`, '#33c46b');
      void library.refreshLocal();
    } catch (e) {
      this.#host.showToast('Save to disk failed: ' + (e as Error).message, '#d6543f');
    }
  };

  // ── preset watch (device-side slot changes) ──
  #watching = false;
  #contentCheckAt = 0; // last time the current slot's stored content was re-decoded (external-edit catch)
  #watchTick = 0;
  watchPreset = async () => {
    if (!this.#host.presetLiveQuery) return; // no live current-preset query on this device — polling would just time out
    if (this.#watching) return; // skip a tick rather than queue behind an in-flight watch
    // A definitions walk/import owns the exclusive transport — interleaved preset reads during the
    // 3ms-paced query stream have frozen an FM3 (FORGEFX-32). Skip ticks until it finishes.
    if (deviceDefs.building || deviceDefs.importing) return;
    // On a slow MIDI link, background preset-watch polling competes with edits and inflates latency —
    // run it only every 4th tick (~16s instead of ~4s) so the link stays free for what the user is doing.
    if (this.#host.slowLink && this.#watchTick++ % 4 !== 0) return;
    this.#watching = true;
    try {
      const n = (await forgefx.currentPreset()).number;
      // 0x0D is flaky on a modified edit buffer (returns -1); ignore so a transient
      // failure doesn't masquerade as a preset change (= reload flicker).
      if (n >= 0 && n !== this.#host.lastPreset) {
        this.#host.setLastPreset(n);
        this.bufferSource = null; // slot load replaced the buffer — it no longer holds a local file
        this.#host.histSwitch(n); // device-side preset change → swap the history context
        await this.#host.load();
        await this.#host.reloadOpenParams();
        if (library.cacheBuilt) library.refreshSlot(n); // CRC-gated sync of the navigated-to slot (catches external edits)
        this.#contentCheckAt = Date.now();
      } else if (this.#host.status === 'offline') {
        await this.#host.load();
      } else if (n >= 0 && library.cacheBuilt && Date.now() - this.#contentCheckAt > 60000) {
        // Same slot number, but its stored content could change under us (e.g. another editor overwrote
        // this slot while the unit stayed on it). This is a RARE safety net — device-side edits are
        // already pushed via ForgeFX's edit-watch (SSE 'changed'/'param'), and a slot switch is caught
        // by the number change above. refreshSlot re-dumps the whole preset, so keep it INFREQUENT
        // (every 60s, not 11s) to stay off the serial link; CRC-gated so an unchanged preset writes nothing.
        this.#contentCheckAt = Date.now();
        library.refreshSlot(n);
      }
    } catch {
      /* keep showing the last good grid */
    } finally {
      this.#watching = false;
    }
  };

  // ── preset rename actions ──
  /** Rename the working-buffer preset, then re-read to confirm the device took it. Optimistic; reverts on
   *  failure. Not persisted to flash — Save (store) writes it to the slot. */
  renamePreset = async (name: string) => {
    const prev = this.#host.preset;
    if (!this.#host.canRenamePresets || !prev) return;
    const clean = name.replace(/[^\x20-\x7e]/g, '').slice(0, 32).trimEnd();
    this.#host.setPreset({ ...prev, name: clean }); // optimistic
    try {
      const r = await forgefx.setPresetName(clean);
      if (!r.ok) throw new Error('rejected');
      if (prev.name !== clean) history.record({ kind: 'presetName', from: prev.name, to: clean });
      if (typeof prev.number === 'number' && prev.number >= 0) library.applySlotName(prev.number, clean); // keep the library list in sync
      await this.#host.poll(); // re-read preset ref → verifies the device stored the name
    } catch {
      this.#host.setPreset(prev); // revert
      this.#host.showToast('Preset rename failed', '#d6543f');
    }
  };
  /** Library rename: rename a STORED device preset by slot and persist it. Loads the slot into the edit
   *  buffer first if it isn't active (device switches to it), renames the working buffer, then stores it
   *  back — content-safe (same preset, new name). Returns true on success. */
  renameStoredPreset = async (slot: number, name: string): Promise<boolean> => {
    if (!this.#host.canRenamePresets || slot < 0) return false;
    const clean = name.replace(/[^\x20-\x7e]/g, '').slice(0, 32).trimEnd();
    if (!clean) return false;
    const prevSlot = this.#host.preset?.number ?? -1; // where the user was — we return here afterwards
    const switched = prevSlot !== slot;
    try {
      if (switched) await this.selectPreset(slot, { recency: false }); // load into edit buffer (switches device)
      const r1 = await forgefx.setPresetName(clean);
      if (!r1.ok) throw new Error('name rejected');
      const cur = this.#host.preset;
      if (cur) this.#host.setPreset({ ...cur, name: clean });
      // Deep-dump devices (gen-3) rename the EDIT BUFFER, so a store persists it to the slot. Name-scan
      // devices (AM4) rename the STORED location directly — a store here would re-save the buffer (old
      // name) over it and clobber the rename, so skip it.
      if (this.#host.canDeepScan) {
        const r2 = await forgefx.store(slot); // persist the renamed buffer to the slot
        if (!r2.ok) throw new Error('store rejected');
      }
      library.applySlotName(slot, clean); // reflect the rename in the list immediately (no racy re-scan)
      if (this.#host.canDeepScan) library.refreshSlot(slot); // deep-scan: reconcile the full summary/CRC
      // return to the preset the user was on before the rename
      if (switched && prevSlot >= 0) await this.selectPreset(prevSlot, { recency: false });
      else await this.#host.poll();
      this.#host.showToast(`Renamed & saved preset ${String(slot).padStart(3, '0')}`, '#33c46b');
      return true;
    } catch {
      if (switched && prevSlot >= 0) { try { await this.selectPreset(prevSlot, { recency: false }); } catch { /* */ } } // restore on failure too
      this.#host.showToast('Rename failed', '#d6543f');
      return false;
    }
  };

  // ── preset nav ──
  /** `recency: false` marks an internal slot hop (the rename round-trip) that must not count as a user
   *  load — see renameStoredPreset. Optional so every existing single-arg call site is unchanged. */
  selectPreset = async (n: number, opts?: { recency?: boolean }) => {
    if (this.#host.legacyAm4) return this.loadAm4Preset(n, opts); // legacy v1 fallback: AM4's own codec route
    try {
      await forgefx.selectPreset(n); // API v2: unified for every device (AM4 number = stored location)
      this.#host.setLastPreset(n);
      if (opts?.recency !== false) presetRecency.record(`dev:${n}`);
      this.bufferSource = null; // slot load replaced the buffer — it no longer holds a local file
      this.#host.histSwitch(n);
      overlays.close('presetPicker');
      await this.#host.poll();
      await this.#host.load();
      // no live current-preset query → watchPreset can't refresh the open block after the switch
      if (!this.#host.presetLiveQuery) await this.#host.reloadOpenParams();
    } catch {
      /* */
    }
  };
  stepPreset = (dir: number) => {
    const cur = this.#host.preset?.number ?? this.#host.lastPreset ?? 0;
    const n = Math.max(0, cur + dir);
    return this.selectPreset(n);
  };
  /** @deprecated legacy v1 fallback — AM4: load a stored location (0..103) into the edit buffer,
   *  then re-read the 4-slot grid. API v2 goes through the unified selectPreset(). */
  loadAm4Preset = async (location: number, opts?: { recency?: boolean }) => {
    try {
      await forgefx.am4SwitchPreset(location);
      if (opts?.recency !== false) presetRecency.record(`dev:${location}`);
      overlays.close('presetPicker');
      await this.#host.load();
      await this.#host.reloadOpenParams();
    } catch {
      this.#host.showToast('Load failed', '#d6543f');
    }
  };

  // ── save (DESTRUCTIVE: overwrites a preset slot) ──
  get saveOpen() { return overlays.isOpen('save'); }
  set saveOpen(v: boolean) { if (v) overlays.open('save'); else overlays.close('save'); }
  saveTarget = $state<number>(0);
  openSave = () => {
    this.saveTarget = this.#host.preset?.number ?? this.#host.lastPreset ?? 0;
    this.saveOpen = true;
  };
  save = async (n: number) => {
    try {
      // API v2: the unified /preset/store saves every device (AM4 number = stored location; the
      // response additionally carries its bank-letter code). Legacy v1 AM4 uses its own codec route.
      const r = this.#host.legacyAm4 ? await forgefx.am4StorePreset(n) : await forgefx.store(n);
      this.saveOpen = false;
      if (r.ok) {
        history.checkpoint(`Saved to preset ${'code' in r && r.code ? r.code : n}`, false); // marker — undo continues past it
        this.#host.showToast(`Saved to preset ${'code' in r && r.code ? r.code : n}`, '#f5a623');
        await this.#host.poll();
        if (this.#host.canDeepScan) library.refreshSlot(n); // library cache sync (name-scan devices re-scan on open)
      } else {
        this.#host.showToast('Save rejected by device', '#d6543f');
      }
    } catch {
      this.#host.showToast('Save failed', '#d6543f');
    }
  };
}
