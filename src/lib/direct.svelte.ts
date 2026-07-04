// Browser Direct boot (web build, ?mode=direct): assemble a full in-page ForgeFX runtime — device
// registry over Web MIDI / Web Serial, IndexedDB-backed store, File System Access local folder,
// cloud sync — and install its router as the forgefx transport. The sibling of remote.svelte.ts:
// +page shows DirectGate until phase === 'ready', then starts the normal editor.
//
// Everything device-shaped comes from forgefx-server/runtime (the same code the desktop server runs;
// see docs/browser-direct-runtime-plan.md). This module only supplies the browser adapters.
// Types only at module scope — the runtime itself is dynamic-imported in #assemble() so the desktop
// and remote-mode bundles never carry it (Vite splits it into a chunk loaded on first connect).
import type { Conn, Transport, Store } from 'forgefx-server/runtime';
import { isRemoteBuild, webMode } from './cloudBrowser';
import { editor } from './editor.svelte';
import { WebMidiTransport, pairFractalPorts } from './direct/webmidi';
import { WebSerialTransport, requestFractalSerialPort } from './direct/webserial';
import { pickLocalFolder, restoreLocalFolder } from './direct/fsaFolder';
import { assembleRuntime } from './direct/runtime';

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

  /** Build store + registry + router around the chosen transport and install it. Web-specific bits
   *  (restore the FSA folder handle, phase transitions) live here; the transport-agnostic assembly
   *  is shared with the native mobile boot via assembleRuntime(). */
  #assemble = async (transport: Transport, conn: Conn) => {
    this.phase = 'connecting';

    // Restore a previously-picked local folder silently (Chromium only); the Storage tab's picker
    // sets a new one. The adapter is handle-bound — assembleRuntime reads it live via getFolder().
    this.#folder = this.support.folder ? await restoreLocalFolder(false) : null;

    const { store, sha256Hex, unsub } = await assembleRuntime({
      transport,
      conn,
      support: this.support,
      profileKey: PROFILE_KEY,
      getFolder: () => this.#folder,
      onEvent: (e) => editor.applyDeviceEvent(e)
    });
    this.#store = store;
    this.#sha256 = sha256Hex;
    this.#unsubEvents = unsub;

    this.phase = 'ready';
  };
}

export const directBoot = new DirectBoot();
