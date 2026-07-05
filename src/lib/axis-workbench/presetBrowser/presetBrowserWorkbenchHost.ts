import { cloud } from '../../cloud.svelte';
import { editor } from '../../editor.svelte';
import { forgefx } from '../../forgefx';
import { library } from '../../library.svelte';
import type { AxisPresetBrowserRuntimeHost } from './presetBrowserWorkbenchRuntime';

export function createAxisPresetBrowserWorkbenchHost(): AxisPresetBrowserRuntimeHost {
  return {
    findEntry: (entryId) => library.entries.find((entry) => entry.id === entryId) ?? null,
    fileBytes: (entryId) => library.fileBytes(entryId),
    localPath: (entryId) => library.localPath(entryId),
    latestCloudVersionId: (presetNumber) => cloud.latestCloud(presetNumber)?.id ?? null,
    loadCloudVersion: async (versionId) => {
      await forgefx.loadVersion(versionId);
    },
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
    notify: editor.showToast
  };
}
