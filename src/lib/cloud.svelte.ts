// Cloud sync-state model. Cross-references three sources to tell each preset's story:
//   • device entries (library `dev:<n>` with summary.crc) — what's physically on the unit
//   • local version snapshots (forgefx.versions) — every captured revision, on disk
//   • the cloud index (forgefx.cloudIndex) — which versions are actually backed up
// Version ids are deterministic (location+crc+ts), so a local version is "in cloud" iff its id is in
// the cloud index. Everything the browser renders (badges, the detail sync box, version-history dots,
// cloud-only entries) is derived from here — no server round-trip per preset.
import type { CloudVersion, PresetSummary, SyncState, VersionInfo } from './types';
import type { IconName } from './Icon.svelte';
import { forgefx } from './forgefx';
import { library, type LibEntry } from './library.svelte';

/** Display metadata for each sync state — icon/label/colour, matching the design's badge palette. */
export const SYNC_META: Record<SyncState, { icon: IconName; short: string; label: string; col: string }> = {
  synced: { icon: 'cloudCheck', short: 'Synced', label: 'Synced', col: '#33c46b' },
  modified: { icon: 'cloudUp', short: 'Local edit', label: 'Local edits not uploaded', col: '#f5a623' },
  outdated: { icon: 'cloudDown', short: 'Update', label: 'Newer version in cloud', col: '#4a82e0' },
  cloudOnly: { icon: 'cloud', short: 'Cloud', label: 'Cloud only · not on this device', col: '#9b8cf0' },
  deviceOnly: { icon: 'device', short: 'Device', label: 'Not backed up to cloud', col: '#6e6e78' },
  unknown: { icon: 'device', short: 'Device', label: 'On this device · cloud comparison unavailable', col: '#6e6e78' },
  none: { icon: 'cloud', short: '', label: '', col: '#6e6e78' }
};

class CloudStore {
  /** The cloud's view of all backed-up versions (refreshed on login + after each sync). */
  index = $state<CloudVersion[]>([]);
  /** Cloud version ids — fast "is this local version backed up?" lookups. */
  ids = $derived(new Set(this.index.map((v) => v.id)));
  /** Cloud versions grouped by slot, latest first. */
  byLocation = $derived.by(() => {
    const m = new Map<number, CloudVersion[]>();
    for (const v of this.index) (m.get(v.location) ?? m.set(v.location, []).get(v.location)!).push(v);
    for (const list of m.values()) list.sort((a, b) => b.capturedAt - a.capturedAt);
    return m;
  });

  async refresh(): Promise<void> {
    try { this.index = (await forgefx.cloudIndex()).versions; } catch { /* not logged in / cloud off */ }
  }
  clear(): void { this.index = []; }

  /** Latest cloud version for a slot, or null. */
  latestCloud = (location: number): CloudVersion | null => this.byLocation.get(location)?.[0] ?? null;

  /** Sync state of a device slot. `onDevice` is authoritative (a `dev:` library entry came from a
   *  device scan — it IS on the unit even when its cached summary carries no CRC to compare, e.g.
   *  name-scan devices or stale cache rows); it defaults to "has a CRC" for back-compat. */
  stateOf(location: number, deviceCrc: number | undefined, onDevice: boolean = deviceCrc != null): SyncState {
    const cloud = this.byLocation.get(location) ?? [];
    const latest = cloud[0] ?? null;
    if (!onDevice) return latest ? 'cloudOnly' : 'none';
    if (!latest) return 'deviceOnly';
    if (deviceCrc == null) return 'unknown'; // on device + cloud version exists, but nothing to compare
    if (deviceCrc === latest.crc) return 'synced';
    if (cloud.some((v) => v.crc === deviceCrc)) return 'outdated'; // device matches an older cloud rev
    return 'modified'; // device content was never uploaded
  }

  /** Cloud-only presets (a cloud slot with no device entry) as synthesized library entries, so they
   *  appear in the browser and can be loaded straight to the edit buffer. Blocks/params are empty until
   *  a sync pulls + decodes the blob, but name + load work immediately. */
  cloudOnlyEntries(deviceLocations: Set<number>): LibEntry[] {
    const out: LibEntry[] = [];
    for (const [location, list] of this.byLocation) {
      if (deviceLocations.has(location)) continue;
      const v = list[0];
      const summary: PresetSummary = {
        number: location, name: v.name, model: v.model, crcValid: true, crc: v.crc,
        scenes: [], blocks: [], models: {}, amps: []
      };
      out.push({ id: `cloud:${location}`, source: 'device', summary, fav: false });
    }
    return out;
  }

  /** Per-version badges for the version-history panel: is this revision on the device now / in the cloud? */
  versionBadges(v: VersionInfo, deviceCrc: number | undefined): { onDevice: boolean; inCloud: boolean } {
    return { onDevice: deviceCrc != null && v.crc === deviceCrc, inCloud: this.ids.has(v.id) };
  }
}

export const cloud = new CloudStore();

/** Library entries plus cloud-only presets merged in — the full browseable set. */
export function browseEntries(): LibEntry[] {
  const deviceLocs = new Set(library.entries.filter((e) => e.id.startsWith('dev:')).map((e) => e.summary.number));
  return [...library.entries, ...cloud.cloudOnlyEntries(deviceLocs)];
}
