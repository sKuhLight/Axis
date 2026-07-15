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
import type { ConvertedPresetDoc } from './convertScratch';
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

  /** A source .syx (base64 + display name) staged for the dialog to pre-seed, set by the preset-browser
   *  "Convert…" entry points (see presetConvertSource.ts). Consumed (cleared) by the dialog on open. */
  pendingSource = $state<{ b64: string; name: string } | null>(null);

  /** The OFFLINE source .syx of the last conversion (base64 + name), retained so the `.syx` export flow
   *  can re-author from the same source. Null when the last conversion had no offline source — either a
   *  connected-device convert (source = the live device) or a re-opened saved doc (no source bytes). */
  lastSource = $state<{ b64: string; name: string } | null>(null);

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

  /** Open the dialog FRESH with NO pre-seeded source — the general "Convert Preset…" entry point in the
   *  preset browser. Drops any prior report and staged/retained source so the dialog lands on the
   *  target-device picker + the "From a .syx file → Choose…" path rather than re-showing the last run. */
  openBlank = () => {
    this.#s = initialConvertState;
    this.pendingSource = null;
    this.lastSource = null;
    this.open = true;
  };

  /** Open the dialog fresh with a pre-seeded source .syx (a preset-browser row / detail "Convert…").
   *  Resets any prior report so the dialog lands on the target-picker step for the new source. */
  openWithSource = (b64: string, name: string) => {
    this.#s = initialConvertState;
    this.pendingSource = { b64, name };
    this.open = true;
  };

  /** Clear the flow back to idle (drops the last report) — for "Convert another". */
  reset = () => { this.#s = initialConvertState; this.lastSource = null; };

  /** Re-seed the flow from a SAVED converted-preset doc (the library "Open in converter" action). Builds a
   *  synthetic, already-resolved result (no events) so `convertScratch.seed()` reconstructs the editable
   *  buffer straight from the persisted target IR — no re-conversion, no device round-trip. */
  seedFromDoc = (doc: ConvertedPresetDoc): void => {
    const res: ConvertResponse = {
      source: { device: doc.sourceDevice, name: doc.name, decodeDepth: doc.preset.decodeDepth ?? 'full' },
      target: doc.preset,
      events: [],
      summary: { total: 0, info: 0, warn: 0, loss: 0 }
    };
    this.#s = succeedConvert(beginConvert({ targetDevice: doc.targetDevice, hasSource: true, sourceName: doc.name }), res);
    // A re-opened saved doc carries no source .syx — the export flow cannot re-author it from source.
    this.lastSource = null;
  };

  /**
   * Run a conversion. `sourceSyx` (base64) converts an imported file; omit it to convert the connected
   * device's current preset. Never throws — failures land in `status:'error'` + `error`.
   */
  run = async (targetDevice: ConverterDeviceId, sourceSyx?: string, sourceName?: string): Promise<void> => {
    this.#s = beginConvert({ targetDevice, hasSource: !!sourceSyx, sourceName });
    // Retain the offline source so the export flow can re-author from it; null = connected-device source.
    this.lastSource = sourceSyx ? { b64: sourceSyx, name: sourceName ?? '' } : null;
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
