// Browser Direct boot (web build, ?mode=direct): assemble a full in-page ForgeFX runtime — device
// registry over Web MIDI / Web Serial, IndexedDB-backed store, File System Access local folder,
// cloud sync — and install its router as the forgefx transport. The sibling of remote.svelte.ts:
// +page shows DirectGate until phase === 'ready', then starts the normal editor.
//
// Everything device-shaped comes from forgefx-server/runtime (the same code the desktop server runs;
// see docs/browser-direct-runtime-plan.md). This module only supplies the browser adapters.
// Types only at module scope — the runtime itself is dynamic-imported in #assemble() so the desktop
// and remote-mode bundles never carry it (Vite splits it into a chunk loaded on first connect).
import type {
  RegistryDeps,
  RuntimeDeps,
  RouterLocalDeps,
  Conn,
  ConnInfo,
  Transport,
  Store,
  DeviceEvent
} from 'forgefx-server/runtime';
import { setRemoteTransport, type RemoteResponse } from './forgefx';
import { isRemoteBuild, remoteConfigured, webMode } from './cloudBrowser';
import { editor } from './editor.svelte';
import { WebMidiTransport, pairFractalPorts } from './direct/webmidi';
import { WebSerialTransport, requestFractalSerialPort } from './direct/webserial';
import { createIdbStoreBackend, createBrowserCodec } from './direct/idbStore';
import { FsaFolderAdapter, pickLocalFolder, restoreLocalFolder } from './direct/fsaFolder';

type Phase = 'pick' | 'connecting' | 'ready' | 'error';

const PROFILE_KEY = 'axs.direct.profile';

class DirectBoot {
  /** True when this page load is the Browser Direct web mode (?mode=direct). */
  active = $state(isRemoteBuild() && webMode() === 'direct');
  phase = $state<Phase>('pick');
  note = $state<string | null>(null);
  /** Feature support of THIS browser — drives the gate's buttons + hints. */
  support = {
    midi: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    serial: typeof navigator !== 'undefined' && !!navigator.serial,
    folder: typeof window !== 'undefined' && !!window.showDirectoryPicker
  };
  /** Multiple MIDI in/out pairs found — the user picks one. */
  midiChoices = $state<Array<{ label: string; index: number }>>([]);

  #midiPairs: Array<{ input: MIDIInput; output: MIDIOutput; label: string }> = [];
  #store: Store | null = null;
  #folder: FileSystemDirectoryHandle | null = null;
  #sha256: ((b: Uint8Array) => string) | null = null;
  #unsubEvents: (() => void) | null = null;

  /** Connect over Web Serial — the FM3's USB path (Chromium desktop only). */
  connectSerial = async () => {
    this.note = null;
    try {
      const port = await requestFractalSerialPort();
      await this.#assemble(new WebSerialTransport(port), { transport: 'serial', id: 'web-serial' });
    } catch (e) {
      this.#fail(e);
    }
  };

  /** Connect over Web MIDI — FM9 / Axe-Fx III / AM4 (or an FM3 via a MIDI interface). */
  connectMidi = async () => {
    this.note = null;
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true });
      this.#midiPairs = pairFractalPorts(access);
      if (this.#midiPairs.length === 0) {
        this.note = 'No MIDI in/out pair found. Plug the device in (and power it on), then try again.';
        return;
      }
      if (this.#midiPairs.length > 1) {
        // Offer the choice; connectMidiPair() finishes the job.
        this.midiChoices = this.#midiPairs.map((p, index) => ({ label: p.label, index }));
        return;
      }
      await this.connectMidiPair(0);
    } catch (e) {
      this.#fail(e, 'MIDI access was denied. Allow MIDI (with SysEx) for this site and retry.');
    }
  };

  connectMidiPair = async (index: number) => {
    const pair = this.#midiPairs[index];
    if (!pair) return;
    this.midiChoices = [];
    try {
      await this.#assemble(new WebMidiTransport(pair.input, pair.output), {
        transport: 'midi',
        id: pair.label,
        inId: pair.input.name ?? pair.label,
        outId: pair.output.name ?? pair.label
      });
    } catch (e) {
      this.#fail(e);
    }
  };

  /** Pick (or re-grant) the local storage folder — Chromium only; needs a user gesture. */
  pickFolder = async (): Promise<string | null> => {
    const handle = await pickLocalFolder();
    if (!handle) return null;
    this.#folder = handle;
    return handle.name;
  };
  regrantFolder = async (): Promise<boolean> => {
    const handle = await restoreLocalFolder(true);
    if (handle) this.#folder = handle;
    return !!handle;
  };

  retry = () => {
    this.phase = 'pick';
    this.note = null;
  };

  #fail = (e: unknown, friendly?: string) => {
    const msg = e instanceof Error ? e.message : String(e);
    // A dismissed picker is not an error — stay on the pick screen silently.
    if (/abort|cancel|NotFoundError/i.test(msg) && !/denied/i.test(msg)) return;
    this.phase = 'error';
    this.note = friendly && /denied|security/i.test(msg) ? friendly : msg;
  };

  /** Build store + registry + router around the chosen transport and install it. */
  #assemble = async (transport: Transport, conn: Conn) => {
    this.phase = 'connecting';
    const rt = await import('forgefx-server/runtime');

    // 1. Persistent store: IndexedDB mirror + brotli/sha256 codec (desktop-compatible blob format).
    const [backend, codec] = await Promise.all([createIdbStoreBackend(), createBrowserCodec()]);
    const store = rt.createStore(backend, codec);
    this.#store = store;
    this.#sha256 = codec.sha256Hex;

    // 2. Registry: the ONE transport is the one the user just granted; detection (fn 0x00 handshake)
    //    runs over it exactly like on desktop. Overrides live in localStorage.
    let connOverride: Conn | null = null;
    const connInfo: ConnInfo[] = [
      { transport: conn.transport, id: conn.id, label: transport.label, fractal: true, ...(conn.transport === 'midi' ? { dir: 'input' as const } : {}) }
    ];
    const deps: RegistryDeps = {
      resolveConn: async () => connOverride ?? conn,
      openConn: () => transport,
      listConnections: async () => connInfo,
      getConnOverride: () => connOverride,
      setConnOverride: (c) => { connOverride = c; },
      getProfileOverride: () => localStorage.getItem(PROFILE_KEY),
      setProfileOverride: (key) => {
        if (key) localStorage.setItem(PROFILE_KEY, key);
        else localStorage.removeItem(PROFILE_KEY);
      },
      autoDetectPath: () => null,
      midiAvailable: () => this.support.midi
    };
    const registry = rt.createRegistry(deps);

    // 3. Local storage folder (File System Access, Chromium): restore a previously-picked handle
    //    silently; the Storage tab's picker sets a new one. The adapter is handle-bound — the
    //    config's `root` string is display-only in the browser.
    this.#folder = this.support.folder ? await restoreLocalFolder(false) : null;
    const local: RouterLocalDeps | undefined = this.support.folder
      ? {
          adapterFor: () => {
            if (!this.#folder) throw new Error('no folder granted');
            return new FsaFolderAdapter(this.#folder);
          },
          isAbsolute: () => true, // browser roots are handles, not paths — any label is acceptable
          resolveRoot: (root) => root,
          scanCache: {
            load: () => backend.getJSON('localScan', {}),
            save: (cache) => backend.putJSON('localScan', cache)
          },
          sha256Hex: codec.sha256Hex
        }
      : undefined;

    // 4. Cloud sync — same Supabase project as the desktop build (publishable anon key).
    const cloud = remoteConfigured()
      ? rt.createCloud(
          {
            url: import.meta.env.VITE_SUPABASE_URL as string,
            anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string
          },
          store
        )
      : undefined;

    // 5. Router in, SSE out: install as the forgefx transport, events via subscription.
    const router = rt.createRouter({ registry, store, local, cloud } satisfies RuntimeDeps);
    setRemoteTransport(async (rq): Promise<RemoteResponse> => {
      const r = await router.handle(rq.method, rq.path, rq.body);
      return {
        status: r.status,
        contentType: r.contentType,
        body: typeof r.body === 'string' ? r.body : (r.body.slice().buffer as ArrayBuffer)
      };
    }, 'direct');
    this.#unsubEvents = router.subscribe((e: DeviceEvent) => editor.applyDeviceEvent(e));

    // 6. Probe the device before declaring ready — a wrong port fails here, not in the editor.
    const detect = await router.handle('GET', '/device/detect');
    if (detect.status >= 500) throw new Error('The device did not answer. Check the connection and try again.');

    this.phase = 'ready';
  };
}

export const directBoot = new DirectBoot();
