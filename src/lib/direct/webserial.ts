// Web Serial transport for Browser Direct mode — the FM3 path. The FM3's USB
// connection is CDC serial (Fractal interface if03), not USB-MIDI, so the
// browser needs Web Serial (Chromium desktop only). Mirrors ForgeFX's Node
// serial transport semantics: byte-stream F0…F7 SysEx reassembly, promise-chain
// request serialization, quiet-window collection, stale-partial-frame drop
// before each request, and paced chunked writes (~64 B / 3 ms) for large
// payloads — the FM3's CDC buffer chokes on unpaced multi-KB bursts.
import type { Transport, RequestOpts } from 'forgefx-server/runtime';

/** Fractal Audio Systems USB vendor id (usb.ids registry: 0x2466). */
export const FRACTAL_USB_VENDOR_ID = 0x2466;

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

export class WebSerialTransport implements Transport {
  readonly kind = 'serial' as const;
  readonly label: string;
  readonly slow = false; // USB CDC is full USB speed

  #port: SerialPort;
  #open = false;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #pump: Promise<void> | null = null;
  #handlers = new Set<(frame: number[]) => void>();
  #chain: Promise<unknown> = Promise.resolve();
  #rx: number[] | null = null; // in-progress SysEx frame (null = between frames)

  constructor(port: SerialPort, label?: string) {
    this.#port = port;
    const info = port.getInfo();
    this.label =
      label ??
      (info.usbVendorId != null
        ? `Serial ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}`
        : 'Web Serial');
  }

  get isOpen(): boolean {
    return this.#open;
  }

  open = async (): Promise<void> => {
    if (this.#open) return;
    await this.#port.open({ baudRate: 115200, bufferSize: 16384 });
    if (!this.#port.readable || !this.#port.writable) throw new Error('Serial port has no streams');
    this.#writer = this.#port.writable.getWriter();
    this.#reader = this.#port.readable.getReader();
    this.#open = true;
    this.#pump = this.#readLoop();
  };

  close = async (): Promise<void> => {
    this.#open = false;
    try { await this.#reader?.cancel(); } catch { /* pump exits on cancel */ }
    try { this.#reader?.releaseLock(); } catch { /* already released by cancel */ }
    try { await this.#writer?.close(); } catch { /* stream may be errored */ }
    try { this.#writer?.releaseLock(); } catch { /* already released */ }
    this.#writer = null;
    this.#reader = null;
    try { await this.#pump; } catch { /* reader cancelled */ }
    try { await this.#port.close(); } catch { /* device may be unplugged */ }
    this.#handlers.clear();
  };

  // Byte-stream framing: accumulate from F0 to F7, drop bytes between frames
  // (matches the Node serial transport's state machine).
  #readLoop = async (): Promise<void> => {
    const reader = this.#reader!;
    for (;;) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try {
        r = await reader.read();
      } catch {
        return; // port gone / cancelled
      }
      if (r.done) return;
      for (const b of r.value ?? []) {
        if (b === SYSEX_START) this.#rx = [b];
        else if (this.#rx) {
          this.#rx.push(b);
          if (b === SYSEX_END) {
            const frame = this.#rx;
            this.#rx = null;
            for (const h of this.#handlers) h(frame);
          }
        }
      }
    }
  };

  #write = async (bytes: readonly number[]): Promise<void> => {
    if (!this.#open || !this.#writer) throw new Error('Serial port not open');
    await this.#writer.write(new Uint8Array(bytes));
  };

  send = (bytes: readonly number[]): void => {
    // Fire-and-forget contract; surface write failures on the next queued op.
    void this.#write(bytes).catch(() => undefined);
  };

  sendQueued = (bytes: readonly number[], settleMs = 20): Promise<void> => {
    const task = this.#chain.then(async () => {
      await this.#write(bytes);
      await delay(settleMs);
    });
    this.#chain = task.catch(() => undefined);
    return task;
  };

  sendPaced = (bytes: readonly number[], chunk = 64, delayMs = 3): Promise<void> => {
    const task = this.#chain.then(async () => {
      for (let i = 0; i < bytes.length; i += chunk) {
        await this.#write(bytes.slice(i, i + chunk));
        await delay(delayMs);
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
          this.#rx = null; // drop any stale partial frame from a previous exchange
          const frames: number[][] = [];
          let quiet: ReturnType<typeof setTimeout> | null = null;
          const done = (err?: Error) => {
            clearTimeout(hard);
            if (quiet) clearTimeout(quiet);
            unsub();
            if (err && frames.length === 0) reject(err);
            else resolve(frames);
          };
          const hard = setTimeout(() => done(new Error(`Serial request timed out after ${timeoutMs}ms`)), timeoutMs);
          const unsub = this.onFrame((frame) => {
            frames.push(frame);
            if (opts?.match?.(frames)) {
              done();
              return;
            }
            if (quiet) clearTimeout(quiet);
            quiet = setTimeout(() => done(), quietMs);
          });
          this.#write(bytes).catch((e) => done(e instanceof Error ? e : new Error(String(e))));
        })
    );
    this.#chain = task.catch(() => undefined);
    return task;
  };
}

/** Prompt the user to pick the FM3's serial port (requires a user gesture). */
export async function requestFractalSerialPort(): Promise<SerialPort> {
  const serial = navigator.serial;
  if (!serial) throw new Error('Web Serial is not supported in this browser');
  return serial.requestPort({ filters: [{ usbVendorId: FRACTAL_USB_VENDOR_ID }] });
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
