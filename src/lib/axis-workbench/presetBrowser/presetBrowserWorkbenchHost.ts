import { editor } from '$lib/editor/editor.svelte';
import { forgefx } from '$lib/api/forgefx';
import { library } from '$lib/preset/library.svelte';
import { presetRecency } from '$lib/preset/presetRecency.svelte';
import { deviceRealNames } from '$lib/device/deviceRealNames.svelte';
import { openConvertedInConverter } from '$lib/preset/presetConvertSource';
import { persistSavedFilters } from './presetBrowserWorkbenchSavedFilters';
import type { AxisPresetBrowserRuntimeHost } from './presetBrowserWorkbenchRuntime';
import type { AxisPresetBrowserViewModelHost } from './presetBrowserWorkbenchViewModel';

export function createAxisPresetBrowserWorkbenchHost(): AxisPresetBrowserRuntimeHost {
  return {
    findEntry: (entryId) => library.entries.find((entry) => entry.id === entryId) ?? null,
    fileBytes: (entryId) => library.fileBytes(entryId),
    localPath: (entryId) => library.localPath(entryId),
    loadBytes: async (bytes) => {
      await forgefx.loadBytes(bytes);
    },
    loadDeviceSlot: editor.selectPreset,
    deviceEntryBytes: async (presetNumber) => {
      if (editor.isV2) {
        const backup = await forgefx.presetBackup(presetNumber);
        return Uint8Array.from(backup.bytes).buffer;
      }
      const { version } = await forgefx.snapshotPreset(presetNumber);
      return (await forgefx.versionSyx(version.id)).arrayBuffer();
    },
    localPresetFile: forgefx.localPresetFile,
    openBuild: editor.openBuild,
    reloadEditor: editor.load,
    noteBufferReplaced: editor.noteBufferReplaced,
    setBufferSource: (source) => {
      editor.bufferSource = source;
    },
    hydrateParams: (entryId) => library.hydrateParams(entryId),
    paramsOf: (entry) => library.paramsOf(entry as Parameters<typeof library.paramsOf>[0]),
    presetGrid: forgefx.presetGrid,
    versions: (presetNumber) => forgefx.versions(presetNumber).then((result) => result.versions),
    notify: editor.showToast,
    recordLoad: presetRecency.record
  };
}

export function createAxisPresetBrowserViewModelHost(): AxisPresetBrowserViewModelHost {
  return {
    get entries() { return library.entries; },
    get filteredEntries() { return library.filtered; },
    get cacheBuilt() { return library.cacheBuilt; },
    get connectionState() { return editor.conn.state; },
    get presetCount() { return editor.presetCount; },
    get canRenamePresets() { return editor.canRenamePresets; },
    tagsOf: library.tagsOf,
    lastLoadedAt: presetRecency.at,
    realNameFor: deviceRealNames.realNameFor,
    selectPreset: editor.selectPreset,
    renameStoredPreset: editor.renameStoredPreset,
    persistSavedFilters,
    openConverted: (entryId) => {
      const entry = library.entries.find((candidate) => candidate.id === entryId);
      if (entry?.converted) void openConvertedInConverter(entry.converted);
    }
  };
}
