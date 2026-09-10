/**
 * Wires the delegate-backed overlays (see {@link overlays}) to the stores that actually
 * own their state. Kept separate from `overlays.svelte.ts` so that module imports no app
 * code and stays trivially unit-testable.
 *
 * Import this once for its side effect — `src/routes/+page.svelte` does, at module load.
 *
 * Transitional state (M3): every overlay in the historical `+page.svelte` Escape chain is
 * registered here as a delegate reading its current home (`editor.xOpen`, a domain store).
 * As each dialog migrates onto the shared dialog shell and moves its flag into the registry
 * itself, its delegate registration is removed and `overlays` owns the boolean directly.
 */

import { overlays } from './overlays.svelte';
import { editor } from '$lib/editor/editor.svelte';
import { history } from '$lib/editor/history.svelte';
import { convert } from '$lib/convert/convert.svelte';
import { convertScratch } from '$lib/convert/convertScratch.svelte';

let registered = false;

export function registerOverlays(): void {
  if (registered) return;
  registered = true;

  // Device-synced tuner state — closing it also tells the device to stop.
  overlays.register('tuner', {
    isOpen: () => editor.tuner.active,
    close: () => {
      if (editor.tuner.active) void editor.toggleTuner();
    }
  });

  overlays.register('history', {
    isOpen: () => history.panelOpen,
    close: () => {
      history.panelOpen = false;
    }
  });

  overlays.register('cabPicker', {
    isOpen: () => editor.cabPickerOpen,
    close: () => {
      editor.cabPickerOpen = false;
    }
  });

  overlays.register('palette', {
    isOpen: () => editor.paletteOpen,
    close: () => {
      editor.paletteOpen = false;
    }
  });

  overlays.register('quickBuild', {
    isOpen: () => editor.quickBuildOpen,
    close: () => {
      editor.quickBuildOpen = false;
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

  overlays.register('presetPicker', {
    isOpen: () => editor.presetOpen,
    close: () => {
      editor.presetOpen = false;
    }
  });

  overlays.register('presetSearch', {
    isOpen: () => editor.presetSearchOpen,
    close: () => {
      editor.presetSearchOpen = false;
    }
  });

  // Tap-to-connect: Escape disarms the pending source before anything else closes.
  overlays.register('linkArm', {
    isOpen: () => editor.linkFrom !== null,
    close: () => editor.cancelLink()
  });

  // Monolith block-editor drawer (a view flag, like `editor.inLibrary`) — lowest priority.
  overlays.register('blockEditor', {
    isOpen: () => editor.editorOpen,
    close: () => editor.closeEditor()
  });
}

// Auto-register on import so a stray `overlays.escape()` before `+page.svelte` mounts still
// behaves. Idempotent.
registerOverlays();
