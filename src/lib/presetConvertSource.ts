// Shared "start a cross-device conversion for a library entry" flow (M4 · META-24 · AXIS-47/48).
//
// Both preset-browser shells (monolith PresetBrowser.svelte + the workbench part panel) surface a
// "Convert…" entry point. This module is the ONE place that turns a LibEntry into raw .syx bytes and
// hands them to the convert store as the pre-seeded source, so the two shells stay in lock-step (the
// monolith↔workbench mirror rule). The byte matrix mirrors PresetBrowser.svelte's entryBytes():
// imported file → cached bytes, local folder → disk read, cloud-only → latest cloud version, device
// slot → v2 backup dump or v1 snapshot-then-download.

import { forgefx } from './forgefx';
import { cloud } from './cloud.svelte';
import { editor } from './editor.svelte';
import { library, type LibEntry } from './library.svelte';
import { convert } from './convert.svelte';
import { convertScratch } from './convertScratch.svelte';
import type { ConvertedPresetDoc } from './convertScratch';
import { isAxisWorkbenchFeatureEnabled } from './axis-workbench/featureGate';

/** Raw .syx bytes for a DEVICE entry: v2 dumps the slot directly; v1 snapshots then downloads. */
async function deviceEntryBytes(n: number): Promise<ArrayBuffer> {
  if (editor.isV2) {
    const b = await forgefx.presetBackup(n);
    return Uint8Array.from(b.bytes).buffer;
  }
  const { version } = await forgefx.snapshotPreset(n);
  return (await forgefx.versionSyx(version.id)).arrayBuffer();
}

/** Raw .syx bytes for ANY entry kind (imported file / local folder / cloud / device slot). */
export async function entrySyxBytes(e: LibEntry): Promise<ArrayBuffer> {
  if (e.source === 'file') {
    const bytes = library.fileBytes(e.id);
    if (!bytes) throw new Error('Preset bytes unavailable — re-import the file.');
    return bytes.buffer as ArrayBuffer;
  }
  if (e.source === 'local') return forgefx.localPresetFile(library.localPath(e.id));
  if (e.id.startsWith('cloud:')) {
    const cv = cloud.latestCloud(e.summary.number);
    if (!cv) throw new Error('No cloud version to convert.');
    return (await forgefx.versionSyx(cv.id)).arrayBuffer();
  }
  return deviceEntryBytes(e.summary.number);
}

/** Base64-encode raw bytes (chunked to stay under the String.fromCharCode argument limit). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Read an entry's .syx and open the Convert dialog pre-seeded with it as the source. The user then
 * picks the target device and hits Convert; the review hop routes to the real SignalGrid (workbench
 * convert page) or the legacy fake grid (monolith fallback). Returns false on a read failure (a toast
 * is shown). Never throws.
 */
export async function startCrossConvert(e: LibEntry): Promise<boolean> {
  try {
    const buf = await entrySyxBytes(e);
    convert.openWithSource(bytesToBase64(new Uint8Array(buf)), e.summary.name || 'preset');
    return true;
  } catch (err) {
    editor.showToast((err as Error)?.message || 'Could not read that preset', '#d6543f');
    return false;
  }
}

/** Open the converter surface — the workbench real-grid page, or the legacy monolith fake-grid view when
 *  the workbench shell is off. Mirrors ConvertDialog.openInGrid so both entry points behave identically. */
async function openConverterSurface(): Promise<void> {
  if (isAxisWorkbenchFeatureEnabled(import.meta.env)) {
    if (!convertScratch.seed()) return;
    const [{ axisWorkbenchController }, { AXIS_PAGE_CONVERT }] = await Promise.all([
      import('./axis-workbench/axisWorkbenchStore.svelte'),
      import('./axis-workbench/axisWorkbenchPages')
    ]);
    axisWorkbenchController.activatePage(AXIS_PAGE_CONVERT);
  } else {
    convertScratch.openView();
  }
}

/** Re-open a SAVED converted preset (a `conv:` library entry) back in the converter, rehydrated straight
 *  from its stored doc — no re-conversion. Used by both preset-browser shells' "Open in converter" action. */
export async function openConvertedInConverter(doc: ConvertedPresetDoc): Promise<void> {
  convert.seedFromDoc(doc);
  await openConverterSurface();
}
