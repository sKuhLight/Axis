// Shared in-page ForgeFX runtime assembly — the transport-agnostic core extracted from
// direct.svelte.ts's #assemble(). Both Browser Direct (Web MIDI / Web Serial) and the native
// mobile shell (Capacitor CoreMIDI, VITE_AXIS_MOBILE) build the SAME runtime around whatever
// Transport they granted; only the transport and the environment probes differ.
//
// It creates the IndexedDB store + browser codec, the ForgeFX registry (fn 0x00 detection over
// the one granted transport), an optional File System Access local-folder adapter, an optional
// cloud client, and installs the router via setRemoteTransport(..., 'direct') so the entire
// existing editor UI drives the device with no other changes. It then probes the device once so a
// wrong port fails here, not in the editor.
//
// The runtime itself (forgefx-server/runtime) is dynamic-imported so the desktop and remote-mode
// bundles never carry it — Vite splits it into a chunk loaded on first connect.
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
import { setRemoteTransport, type RemoteResponse } from '../forgefx';
import { remoteConfigured } from '../cloudBrowser';
import { FsaFolderAdapter } from './fsaFolder';
import { createIdbStoreBackend, createBrowserCodec } from './idbStore';

/** Environment probes that shape the runtime. Web computes these from `navigator`; mobile hard-codes
 *  them (midi via the native plugin, no serial/folder in WKWebView). */
export interface RuntimeSupport {
  midi: boolean;
  serial: boolean;
  /** File System Access local-folder sync. Chromium desktop only — false on mobile & non-Chromium. */
  folder: boolean;
}

export interface AssembleOpts {
  /** The transport the user just granted (Web MIDI/Serial, or native CoreMIDI). */
  transport: Transport;
  /** Its selectable-connection descriptor (resolveConn returns this to the registry). */
  conn: Conn;
  support: RuntimeSupport;
  /** localStorage key holding the forced profile override (per boot mode, so modes don't clash). */
  profileKey: string;
  /** Live accessor for the granted FSA folder handle (null when support.folder is false). The caller
   *  owns the handle so the Storage tab's picker can swap it after assembly. */
  getFolder: () => FileSystemDirectoryHandle | null;
  /** Where device events (SSE-equivalent) are delivered — normally editor.applyDeviceEvent. */
  onEvent: (e: DeviceEvent) => void;
}

export interface AssembledRuntime {
  store: Store;
  sha256Hex: (b: Uint8Array) => string;
  /** Detach the event subscription (call on teardown / reconnect). */
  unsub: () => void;
}

/**
 * Build store + registry + router around `transport` and install it as the forgefx transport.
 * Throws if the device does not answer detection (>= 500) — surface that to the gate as a connect
 * failure, not a runtime error mid-edit.
 */
export async function assembleRuntime(opts: AssembleOpts): Promise<AssembledRuntime> {
  const { transport, conn, support, profileKey, getFolder, onEvent } = opts;
  const rt = await import('forgefx-server/runtime');

  // 1. Persistent store: IndexedDB mirror + brotli/sha256 codec (desktop-compatible blob format).
  const [backend, codec] = await Promise.all([createIdbStoreBackend(), createBrowserCodec()]);
  const store = rt.createStore(backend, codec);

  // 2. Registry: the ONE transport is the one the user just granted; detection (fn 0x00 handshake)
  //    runs over it exactly like on desktop. Overrides live in localStorage.
  let connOverride: Conn | null = null;
  const connInfo: ConnInfo[] = [
    {
      transport: conn.transport,
      id: conn.id,
      label: transport.label,
      fractal: true,
      ...(conn.transport === 'midi' ? { dir: 'input' as const } : {})
    }
  ];
  const deps: RegistryDeps = {
    resolveConn: async () => connOverride ?? conn,
    openConn: () => transport,
    listConnections: async () => connInfo,
    getConnOverride: () => connOverride,
    setConnOverride: (c) => {
      connOverride = c;
    },
    getProfileOverride: () => localStorage.getItem(profileKey),
    setProfileOverride: (key) => {
      if (key) localStorage.setItem(profileKey, key);
      else localStorage.removeItem(profileKey);
    },
    autoDetectPath: () => null,
    midiAvailable: () => support.midi
  };
  const registry = rt.createRegistry(deps);

  // 3. Local storage folder (File System Access, Chromium only). Absent on mobile & non-Chromium —
  //    `local` stays undefined and the router serves the IndexedDB library/history without it.
  const local: RouterLocalDeps | undefined = support.folder
    ? {
        adapterFor: () => {
          const folder = getFolder();
          if (!folder) throw new Error('no folder granted');
          return new FsaFolderAdapter(folder);
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
  const unsub = router.subscribe((e: DeviceEvent) => onEvent(e));

  // 6. Probe the device before declaring ready — a wrong port fails here, not in the editor.
  const detect = await router.handle('GET', '/device/detect');
  if (detect.status >= 500) {
    unsub();
    throw new Error('The device did not answer. Check the connection and try again.');
  }

  return { store, sha256Hex: codec.sha256Hex, unsub };
}
