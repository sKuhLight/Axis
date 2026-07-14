// Cross-device preset-converter store (P4a · META-24 · AXIS-47/48).
//
// This is the P4b SEAM: it holds the converted target IR + the conversion event log so the next phase
// (P4b fake-grid rendering) can consume `result.target` without re-running the conversion. It is a thin
// runes shell — all transitions are the pure reducers in `convertReport.ts` (tested there), applied to
// a single `$state` snapshot exposed through getters:
//
//   { result?: ConvertResponse, status: 'idle'|'running'|'error', error?, lastRequest? }
//
// `run()` is the only impure part (the /api round-trip). Its own module (not an editor flag) because it
// has an independent lifecycle from live device state and must outlive the editor's per-preset reloads
// so P4b can keep the last conversion around.

import { forgefx, ForgeError } from './forgefx';
import type { ConverterDeviceId, ConvertResponse } from './types';
import {
  initialConvertState,
  beginConvert,
  succeedConvert,
  failConvert,
  convertErrorMessage,
  type ConvertState
} from './convertReport';

class ConvertStore {
  /** Convert dialog visibility (mounted unconditionally in +page.svelte, gated on this). */
  open = $state(false);

  // The whole flow state is one snapshot so the reducers can replace it atomically.
  #s = $state<ConvertState>(initialConvertState);

  // ── the P4b-facing surface ──
  get status(): ConvertState['status'] { return this.#s.status; }
  get result(): ConvertResponse | undefined { return this.#s.result; }
  get error(): string | undefined { return this.#s.error; }
  get lastRequest(): ConvertState['lastRequest'] { return this.#s.lastRequest; }
  get running(): boolean { return this.#s.status === 'running'; }
  /** True once a conversion has produced a report (result present). */
  get hasReport(): boolean { return !!this.#s.result; }

  /** Open the dialog. Keeps any prior result so re-opening shows the last report. */
  openDialog = () => { this.open = true; };
  close = () => { this.open = false; };

  /** Clear the flow back to idle (drops the last report) — for "Convert another". */
  reset = () => { this.#s = initialConvertState; };

  /**
   * Run a conversion. `sourceSyx` (base64) converts an imported file; omit it to convert the connected
   * device's current preset. Never throws — failures land in `status:'error'` + `error`.
   */
  run = async (targetDevice: ConverterDeviceId, sourceSyx?: string, sourceName?: string): Promise<void> => {
    this.#s = beginConvert({ targetDevice, hasSource: !!sourceSyx, sourceName });
    try {
      const r = await forgefx.convertPreset(targetDevice, sourceSyx);
      this.#s = succeedConvert(this.#s, r);
    } catch (e) {
      const msg =
        e instanceof ForgeError
          ? convertErrorMessage(e.status, e.message)
          : convertErrorMessage(0, (e as Error)?.message);
      this.#s = failConvert(this.#s, msg);
    }
  };
}

export const convert = new ConvertStore();
