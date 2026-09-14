/**
 * Wires the delegate-backed overlays (see {@link overlays}) to the stores that actually
 * own their state. Kept separate from `overlays.svelte.ts` so that module imports no app
 * code and stays trivially unit-testable.
 *
 * Import this once for its side effect — `src/routes/+page.svelte` does, at module load.
 *
 * Only the overlays whose state genuinely lives elsewhere need an entry here. The former
 * `editor.xOpen` booleans (palette, cabPicker, quickBuild, presetPicker, presetSearch,
 * deviceTools, axisHub, theme) are owned by the registry directly. `editor` exposes thin
 * accessors delegating to `overlays.open/close/isOpen` where compatibility call sites need them.
 */

import { overlays } from './overlays.svelte';
import {
  editorOverlays,
  gridEditing,
  paramEditing,
  telemetry
} from '$lib/editor/editorClients.svelte';
import { history } from '$lib/editor/history.svelte';
import { convert } from '$lib/convert/convert.svelte';
import { convertScratch } from '$lib/convert/convertScratch.svelte';

let registered = false;

export function registerOverlays(): void {
  if (registered) return;
  registered = true;

  // Device-synced tuner state — closing it also tells the device to stop.
  overlays.register('tuner', {
    isOpen: () => telemetry.tuner.active,
    close: () => {
      if (telemetry.tuner.active) void telemetry.toggleTuner();
    }
  });

  overlays.register('history', {
    isOpen: () => history.panelOpen,
    close: () => {
      history.panelOpen = false;
    }
  });

  // The converter carries a whole flow state machine; the dialogs just reflect `.open`.
  overlays.register('convertScratch', {
    isOpen: () => convertScratch.open,
    close: () => convertScratch.close()
  });
  overlays.register('convert', {
    isOpen: () => convert.open,
    close: () => convert.close()
  });

  // Tap-to-connect: Escape disarms the pending source before anything else closes.
  overlays.register('linkArm', {
    isOpen: () => gridEditing.linkFrom !== null,
    close: () => gridEditing.cancelLink()
  });

  // Monolith block-editor drawer (a view flag, like `editor.inLibrary`) — lowest priority.
  overlays.register('blockEditor', {
    isOpen: () => paramEditing.editorOpen,
    close: () => paramEditing.closeEditor()
  });

  overlays.register('consentPrompt', {
    isOpen: () => telemetry.consentPromptOpen,
    close: () => {},
    escDismiss: false,
    escBlock: true
  });
  overlays.register('reportPrompt', {
    isOpen: () => telemetry.reportPrompt !== null,
    close: () => telemetry.dismissReportPrompt()
  });

  overlays.onClose('presetPicker', () => {
    editorOverlays.presetPick = null;
  });
}

// Auto-register on import so a stray `overlays.escape()` before `+page.svelte` mounts still
// behaves. Idempotent.
registerOverlays();
