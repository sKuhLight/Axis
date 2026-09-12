// Native MIDI transport for the mobile shell (Capacitor / iOS CoreMIDI) — implements ForgeFX's
// Transport interface over the AxisMidi native plugin, so the in-page runtime drives the device
// exactly like the Web MIDI transport does in the browser and the Node transport does on desktop:
// same request serialization (promise chain), same quiet-window frame collection, same defaults
// (1500 ms timeout / 90 ms quiet / 20 ms settle).
//
// CONTRACT WITH THE NATIVE PLUGIN: the native side MUST reassemble each SysEx message to a complete
// F0…F7 frame before emitting the 'sysex' event. CoreMIDI delivers SysEx split across MIDIPackets
// (especially over BLE/DIN) — request()'s quiet-window collection assumes whole frames, exactly as
// Web MIDI guarantees them. Fragment leakage silently corrupts reads.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Transport, RequestOpts } from 'forgefx-server/runtime';

/** A connectable, already-paired MIDI endpoint as enumerated by the native side. USB-MIDI exposes
 *  input and output as separate CoreMIDI endpoints; the native plugin pairs them and hands back one
 *  unit with a stable `id`. */
export interface AxisMidiEndpoint {
  /** Stable native identifier for the paired endpoint (passed back to connect). */
  id: string;
  /** Display name (CoreMIDI endpoint/display name). */
  name: string;
  hasInput: boolean;
  hasOutput: boolean;
  /** Name looks like a Fractal unit (drives ordering + the fast/slow default). */
  fractal: boolean;
  /** Physical link, best-effort from CoreMIDI properties. `usb` is full-speed; `ble`/`din` are the
   *  bandwidth-constrained 5-pin path that can't sustain live meter polling. */
  link: 'usb' | 'ble' | 'din' | 'virtual';
}

export interface AxisMidiPlugin {
  /** Enumerate paired, connectable endpoints (USB / already-paired BLE / DIN interfaces). */
  listEndpoints(): Promise<{ endpoints: AxisMidiEndpoint[] }>;
  /** Open the given endpoint's input+output for send/receive. */
  connect(options: { id: string }): Promise<void>;
  disconnect(): Promise<void>;
  /** Send one complete SysEx frame on the native serialized send queue (MIDISendSysex). */
  send(options: { data: number[] }): Promise<void>;
  /** Present CoreAudioKit's CABTMIDICentralViewController for BLE MIDI pairing. Resolves when the
   *  sheet is dismissed; call listEndpoints() afterwards to pick up the newly-paired device. */
  presentBluetoothSetup(): Promise<void>;
  /** Every inbound COMPLETE SysEx frame (F0…F7), reassembled natively. */
  addListener(
    eventName: 'sysex',
    listenerFunc: (event: { frame: number[] }) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const AxisMidi = registerPlugin<AxisMidiPlugin>('AxisMidi');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class NativeMidiTransport implements Transport {
  readonly kind = 'midi' as const;
  readonly label: string;
  /** A device's own USB-MIDI endpoint is full USB speed; BLE and a generic interface into 5-pin DIN
   *  (≈31.25 kbaud) can't sustain meter polling. Only USB into a Fractal unit is treated as fast. */
  readonly slow: boolean;

  #ep: AxisMidiEndpoint;
  #open = false;
  #handlers = new Set<(frame: number[]) => void>();
  #chain: Promise<unknown> = Promise.resolve();
  #listener: PluginListenerHandle | null = null;

  constructor(endpoint: AxisMidiEndpoint) {
    this.#ep = endpoint;
    this.label = endpoint.name;
    this.slow = !(endpoint.link === 'usb' && endpoint.fractal);
  }

  get isOpen(): boolean {
    return this.#open;
  }

  open = async (): Promise<void> => {
    if (this.#open) return;
    // Subscribe BEFORE connecting so the device's boot/handshake frames aren't missed.
    this.#listener = await AxisMidi.addListener('sysex', (e) => {
      const frame = e.frame;
      if (!frame || frame.length === 0) return;
      for (const h of this.#handlers) h(frame);
    });
    await AxisMidi.connect({ id: this.#ep.id });
    this.#open = true;
  };

  close = async (): Promise<void> => {
    this.#open = false;
    this.#handlers.clear();
    try {
      await this.#listener?.remove();
    } catch {
      /* already removed */
    }
    this.#listener = null;
    try {
      await AxisMidi.disconnect();
    } catch {
      /* already disconnected */
    }
  };

  send = (bytes: readonly number[]): void => {
    if (!this.#open) throw new Error('MIDI port not open');
    // Fire-and-forget: the native send queue serializes; we don't await here (matches Web MIDI's
    // synchronous out.send()). Errors surface on the next serialized request().
    void AxisMidi.send({ data: [...bytes] });
  };

  sendQueued = (bytes: readonly number[], settleMs = 20): Promise<void> => {
    const task = this.#chain.then(async () => {
      await AxisMidi.send({ data: [...bytes] });
      await delay(settleMs);
    });
    this.#chain = task.catch(() => undefined);
    return task;
  };

  /** Paced chunked send for big payloads (preset-dump → edit buffer). Bandwidth-constrained BLE/DIN
   *  links need this to avoid overrunning the device's input buffer; USB can rely on sendQueued. */
  sendPaced = (bytes: readonly number[], chunk = 256, delayMs = 8): Promise<void> => {
    const all = [...bytes];
    const task = this.#chain.then(async () => {
      for (let i = 0; i < all.length; i += chunk) {
        await AxisMidi.send({ data: all.slice(i, i + chunk) });
        if (i + chunk < all.length) await delay(delayMs);
      }
    });
    this.#chain = task.catch(() => undefined);
    return task;
  };

  onFrame = (handler: (frame: number[]) => void): (() => void) => {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  };

  request = (bytes: readonly number[], opts?: RequestOpts): Promise<number[][]> => {
    const timeoutMs = opts?.timeoutMs ?? 1500;
    const quietMs = opts?.quietMs ?? 90;
    const task = this.#chain.then(
      () =>
        new Promise<number[][]>((resolve, reject) => {
          const frames: number[][] = [];
          let quiet: ReturnType<typeof setTimeout> | null = null;
          const done = (err?: Error) => {
            clearTimeout(hard);
            if (quiet) clearTimeout(quiet);
            unsub();
            if (err && frames.length === 0) reject(err);
            else resolve(frames);
          };
          const hard = setTimeout(
            () => done(new Error(`MIDI request timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
          const unsub = this.onFrame((frame) => {
            frames.push(frame);
            if (opts?.match?.(frames)) {
              done();
              return;
            }
            if (quiet) clearTimeout(quiet);
            quiet = setTimeout(() => done(), quietMs);
          });
          void AxisMidi.send({ data: [...bytes] }).catch((e) =>
            done(e instanceof Error ? e : new Error(String(e)))
          );
        })
    );
    this.#chain = task.catch(() => undefined);
    return task;
  };
}
