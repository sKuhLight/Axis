// Starting a fresh preset in the edit buffer — "start from zero". Loads the codec's clean model
// scaffold (a blank preset) through the same /preset/load path template and file loads use, so the
// buffer-replacement behavior is identical everywhere.
import { forgefx } from '$lib/api/forgefx';
import { editorNotifications, gridEditing, presetBuffer } from '$lib/editor/editorClients.svelte';

/** Replace the edit buffer with a clean, blank preset for the connected device. Returns success. */
export async function startBlankPreset(): Promise<boolean> {
  try {
    const bytes = await forgefx.blankPresetSyx();
    await forgefx.loadBytes(bytes);
    presetBuffer.noteBufferReplaced('Started a blank preset');
    await gridEditing.load();
    editorNotifications.showToast('Started a blank preset — Save to store it on a slot', '#f5a623');
    return true;
  } catch (e) {
    editorNotifications.showToast((e as Error)?.message || 'Could not start a blank preset', '#d6543f');
    return false;
  }
}
