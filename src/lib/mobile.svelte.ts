// Mobile shell boot (Capacitor build, VITE_AXIS_MOBILE=1): assemble the same in-page ForgeFX runtime
// as Browser Direct, but over the native CoreMIDI transport instead of Web MIDI (which doesn't exist
// in WKWebView). Sibling of direct.svelte.ts / remote.svelte.ts: +page shows MobileGate until
// phase === 'ready', then starts the normal editor.
//
// The device is reached three ways, in order of directness: USB MIDI (Camera/USB-C), BLE MIDI
// (paired via the native Bluetooth sheet), or — when neither is available — Axis Remote, which relays
// to the user's PC exactly like the web remote build (we hand off to remoteBoot).
import type { Conn, Transport, Store, DeviceEvent } from 'forgefx-server/runtime';
import { isMobileBuild } from './cloudBrowser';
import { editor } from './editor.svelte';
import { assembleRuntime, type RuntimeSupport } from './direct/runtime';
import { AxisMidi, NativeMidiTransport, type AxisMidiEndpoint } from './direct/nativeMidi';
import { remoteBoot } from './remote.svelte';

type Phase = 'pick' | 'connecting' | 'ready' | 'error';

const PROFILE_KEY = 'axs.mobile.profile';

// WKWebView has no File System Access and no Web Serial; MIDI comes from the native plugin.
const SUPPORT: RuntimeSupport = { midi: true, serial: false, folder: false };

class MobileBoot {
  /** True when this build is the native mobile shell. */
  active = $state(isMobileBuild());
  phase = $state<Phase>('pick');
  note = $state<string | null>(null);
  /** More than one connectable endpoint found — the user picks one. */
  endpointChoices = $state<AxisMidiEndpoint[]>([]);

  #store: Store | null = null;
  #sha256: ((b: Uint8Array) => string) | null = null;
  #unsubEvents: (() => void) | null = null;

  /** Enumerate native endpoints (USB / already-paired BLE / DIN interfaces) and connect. */
  connectMidi = async () => {
    this.note = null;
    try {
      const { endpoints } = await AxisMidi.listEndpoints();
      const usable = endpoints.filter((e) => e.hasInput && e.hasOutput);
      if (usable.length === 0) {
        this.note = 'No MIDI device found. Connect it over USB (or pair Bluetooth MIDI) and try again.';
        return;
      }
      if (usable.length > 1) {
        // Fractal-looking devices first (native already sorts, but be defensive).
        this.endpointChoices = [...usable].sort(
          (a, b) => Number(b.fractal) - Number(a.fractal)
        );
        return;
      }
      await this.connectEndpoint(usable[0].id);
    } catch (e) {
      this.#fail(e, 'Could not access MIDI. Grant the app MIDI/Bluetooth access and retry.');
    }
  };

  /** Present the native BLE MIDI pairing sheet, then re-scan so the newly-paired device shows up. */
  pairBluetooth = async () => {
    this.note = null;
    try {
      await AxisMidi.presentBluetoothSetup();
      await this.connectMidi();
    } catch (e) {
      this.#fail(e);
    }
  };

  connectEndpoint = async (id: string) => {
    this.endpointChoices = [];
    try {
      const { endpoints } = await AxisMidi.listEndpoints();
      const ep = endpoints.find((e) => e.id === id);
      if (!ep) {
        this.note = 'That device is no longer available. Try scanning again.';
        return;
      }
      await this.#assemble(new NativeMidiTransport(ep), {
        transport: 'midi',
        id: ep.name,
        inId: ep.name,
        outId: ep.name
      });
    } catch (e) {
      this.#fail(e);
    }
  };

  /** Fall back to Axis Remote (relay to the user's PC) — hand off to the existing remote boot. */
  useRemote = async () => {
    remoteBoot.active = true;
    this.active = false; // yield the gate to RemoteGate
    await remoteBoot.init();
  };

  retry = () => {
    this.phase = 'pick';
    this.note = null;
    this.endpointChoices = [];
  };

  #fail = (e: unknown, friendly?: string) => {
    const msg = e instanceof Error ? e.message : String(e);
    // A dismissed picker/sheet is not an error — stay on the pick screen silently.
    if (/abort|cancel|dismiss/i.test(msg) && !/denied/i.test(msg)) return;
    this.phase = 'error';
    this.note = friendly && /denied|security|permission/i.test(msg) ? friendly : msg;
  };

  /** Build the runtime around the native transport and install it. */
  #assemble = async (transport: Transport, conn: Conn) => {
    this.phase = 'connecting';
    const { store, sha256Hex, unsub } = await assembleRuntime({
      transport,
      conn,
      support: SUPPORT,
      profileKey: PROFILE_KEY,
      getFolder: () => null, // no File System Access on mobile — IndexedDB library/history only
      onEvent: (e: DeviceEvent) => editor.applyDeviceEvent(e)
    });
    this.#store = store;
    this.#sha256 = sha256Hex;
    this.#unsubEvents = unsub;
    this.phase = 'ready';
  };
}

export const mobileBoot = new MobileBoot();
