// Web MIDI transport for Browser Direct mode — implements ForgeFX's Transport
// interface over a MIDIInput/MIDIOutput pair, so the in-page runtime drives the
// device exactly like the Node `@julusian/midi` transport does on the desktop:
// same request serialization (promise chain), same quiet-window frame
// collection, same defaults (1500 ms timeout / 90 ms quiet / 20 ms settle).
// Web MIDI delivers each F0…F7 SysEx message whole (no fragment reassembly
// needed — the browser does what the Node transport's SysEx assembler did).
import type { Transport, RequestOpts } from 'forgefx-server/runtime';

const FRACTAL_NAME = /fractal|axe[ -]?fx|fm[ -]?3|fm[ -]?9|am[ -]?4|vp[ -]?4/i;

export class WebMidiTransport implements Transport {
  readonly kind = 'midi' as const;
  readonly label: string;
  /** A device's own USB-MIDI endpoint is full USB speed; a generic MIDI
   *  interface into 5-pin DIN (~31.25 kbaud) can't sustain meter polling. Port
   *  names that don't look like a Fractal device are assumed to be interfaces. */
  readonly slow: boolean;

  #in: MIDIInput;
  #out: MIDIOutput;
  #open = false;
  #handlers = new Set<(frame: number[]) => void>();
  #chain: Promise<unknown> = Promise.resolve();

  constructor(input: MIDIInput, output: MIDIOutput) {
    this.#in = input;
    this.#out = output;
    this.label = input.name ?? output.name ?? 'Web MIDI';
    this.slow = !FRACTAL_NAME.test(this.label);
  }

  get isOpen(): boolean {
    return this.#open;
  }

  open = async (): Promise<void> => {
    if (this.#open) return;
    await this.#in.open();
    await this.#out.open();
    this.#in.onmidimessage = (e: MIDIMessageEvent) => {
      if (!e.data || e.data.length === 0) return;
      const frame = Array.from(e.data);
      for (const h of this.#handlers) h(frame);
    };
    this.#open = true;
  };

  close = async (): Promise<void> => {
    this.#open = false;
    this.#in.onmidimessage = null;
    this.#handlers.clear();
    try { await this.#in.close(); } catch { /* already closed */ }
    try { await this.#out.close(); } catch { /* already closed */ }
  };

  send = (bytes: readonly number[]): void => {
    if (!this.#open) throw new Error('Web MIDI port not open');
    this.#out.send([...bytes]);
  };

  sendQueued = (bytes: readonly number[], settleMs = 20): Promise<void> => {
    const task = this.#chain.then(async () => {
      this.send(bytes);
      await delay(settleMs);
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
          const hard = setTimeout(() => done(new Error(`MIDI request timed out after ${timeoutMs}ms`)), timeoutMs);
          const unsub = this.onFrame((frame) => {
            frames.push(frame);
            if (opts?.match?.(frames)) {
              done();
              return;
            }
            if (quiet) clearTimeout(quiet);
            quiet = setTimeout(() => done(), quietMs);
          });
          try {
            this.send(bytes);
          } catch (e) {
            done(e instanceof Error ? e : new Error(String(e)));
          }
        })
    );
    this.#chain = task.catch(() => undefined);
    return task;
  };
}

/**
 * Enumerate paired Fractal-looking input/output ports from a MIDIAccess.
 * USB-MIDI devices expose input and output as independent endpoints with
 * near-identical names — pair by normalized stem, preferring exact matches.
 */
export function pairFractalPorts(access: MIDIAccess): Array<{ input: MIDIInput; output: MIDIOutput; label: string }> {
  const stem = (n: string | null) =>
    (n ?? '')
      .toLowerCase()
      .replace(/\b(in|out|input|output|rx|tx)\b/g, '')
      .replace(/\s+\d+:\d+$/, '') // ALSA seq-id suffix (Linux)
      .replace(/\s+/g, ' ')
      .trim();
  const outs = [...access.outputs.values()];
  const pairs: Array<{ input: MIDIInput; output: MIDIOutput; label: string }> = [];
  for (const input of access.inputs.values()) {
    const s = stem(input.name);
    const output = outs.find((o) => stem(o.name) === s);
    if (output) pairs.push({ input, output, label: input.name ?? s });
  }
  // Fractal-looking pairs first, then everything else (user may connect via a generic interface).
  return pairs.sort((a, b) => Number(FRACTAL_NAME.test(b.label)) - Number(FRACTAL_NAME.test(a.label)));
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
