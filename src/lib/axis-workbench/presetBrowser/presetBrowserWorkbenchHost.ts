import {
  deviceSession,
  editorNavigation,
  editorNotifications,
  gridEditing,
  presetBuffer
} from '$lib/editor/editorClients.svelte';
import { forgefx } from '$lib/api/forgefx';
import { library } from '$lib/preset/library.svelte';
import { presetRecency } from '$lib/preset/presetRecency.svelte';
import { deviceRealNames } from '$lib/device/deviceRealNames.svelte';
import { loadCabIrsCachedFirst } from '$lib/device/cabIrsCache';
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
    saveBufferToSlot: (slot) => presetBuffer.saveToSlot(slot),
    loadDeviceSlot: presetBuffer.selectPreset,
    deviceEntryBytes: async (presetNumber) => {
      if (deviceSession.isV2) {
        const backup = await forgefx.presetBackup(presetNumber);
        return Uint8Array.from(backup.bytes).buffer;
      }
      const { version } = await forgefx.snapshotPreset(presetNumber);
      return (await forgefx.versionSyx(version.id)).arrayBuffer();
    },
    localPresetFile: forgefx.localPresetFile,
    openBuild: editorNavigation.openBuild,
    reloadEditor: gridEditing.load,
    noteBufferReplaced: presetBuffer.noteBufferReplaced,
    markAudition: (name) => presetBuffer.noteAudition(name),
    setBufferSource: (source) => {
      presetBuffer.bufferSource = source;
    },
    hydrateParams: (entryId) => library.hydrateParams(entryId),
    paramsOf: (entry) => library.paramsOf(entry as Parameters<typeof library.paramsOf>[0]),
    cabIrs: () => loadCabIrsCachedFirst(),
    presetGrid: forgefx.presetGrid,
    versions: (presetNumber) => forgefx.versions(presetNumber).then((result) => result.versions),
    notify: editorNotifications.showToast,
    recordLoad: presetRecency.record,
    applyPresetMove: async (writes, opts) => {
      const activeSlot = deviceSession.preset?.number ?? deviceSession.lastPreset ?? undefined;
      await forgefx.movePresets(writes, { slotCount: opts.slotCount, activeSlot: activeSlot ?? undefined });
    },
    isSlotEmpty: (slot) => library.slotIsEmpty(slot),
    refreshDeviceSlots: async (slots) => {
      for (const slot of slots) await library.refreshSlot(slot);
    }
  };
}

export function createAxisPresetBrowserViewModelHost(): AxisPresetBrowserViewModelHost {
  return {
    get entries() { return library.entries; },
    get filteredEntries() { return library.filtered; },
    get cacheBuilt() { return library.cacheBuilt; },
    get connectionState() { return deviceSession.conn.state; },
    get presetCount() { return deviceSession.presetCount; },
    get canRenamePresets() { return deviceSession.canRenamePresets; },
    tagsOf: library.tagsOf,
    lastLoadedAt: presetRecency.at,
    realNameFor: deviceRealNames.realNameFor,
    selectPreset: presetBuffer.selectPreset,
    renameStoredPreset: presetBuffer.renameStoredPreset,
    clearStoredPreset: presetBuffer.clearStoredPreset,
    persistSavedFilters,
    openConverted: (entryId) => {
      const entry = library.entries.find((candidate) => candidate.id === entryId);
      if (entry?.converted) void openConvertedInConverter(entry.converted);
    }
  };
}
