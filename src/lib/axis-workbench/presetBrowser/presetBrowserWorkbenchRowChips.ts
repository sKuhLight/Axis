// Row anatomy derivation for the docked preset browser list (§4.3 of
// docs/workbench-dc-parity/06-preset-browser.md). Pure, summary-level logic — it turns an
// AxisPresetBrowserEntrySummary into the design's full row form: per-block chips (family-coloured
// "Cat · TYPE"), a CPU meter (estimate + colour thresholds), and the cloud/device presence chip.
//
// The block family → [label, colour] map mirrors src/lib/PresetBrowser.svelte's CAT table verbatim so
// docked rows read identically to the monolith surface. The CPU estimate reuses the query module's
// estimateCpu (blockCount-derived) — it is a complexity indicator, NOT the device's live meter (which
// isn't stored in a preset), hence the "~" prefix everywhere it renders.
import type { AxisPresetBrowserEntrySummary } from './presetBrowserWorkbenchData';
import { estimateCpu } from './presetBrowserWorkbenchQuery';
import type { SyncState } from '../../types';

// block family slug → [label, colour]. Verbatim from PresetBrowser.svelte CAT; unknown slugs fall back.
const CAT: Record<string, [string, string]> = {
  input: ['Input', '#4f6bed'],
  output: ['Output', '#2fa15f'],
  amp: ['Amp', '#d98a2b'],
  cab: ['Cab', '#6b6d76'],
  drive: ['Drive', '#d6543f'],
  comp: ['Comp', '#b3a52b'],
  geq: ['GEQ', '#7fae4a'],
  peq: ['PEQ', '#7fae4a'],
  chorus: ['Chorus', '#2fb0c9'],
  flanger: ['Flanger', '#c95bc0'],
  phaser: ['Phaser', '#8a6fd6'],
  filter: ['Filter', '#d65b9e'],
  enhancer: ['Enhancer', '#9b8cf0'],
  wah: ['Wah', '#d6a23f'],
  delay: ['Delay', '#4a82e0'],
  reverb: ['Reverb', '#3fa890'],
  pitch: ['Pitch', '#6f8fd6'],
  synth: ['Synth', '#c98a3f'],
  gate: ['Gate', '#9a9aa3'],
  ringmod: ['RingMod', '#c95b7a'],
  tremolo: ['Tremolo', '#b08fd6'],
  rotary: ['Rotary', '#3fa890'],
  volume: ['Volume', '#9a9aa3'],
  formant: ['Formant', '#c95bc0'],
  multitap: ['MultiTap', '#4a82e0'],
  megatap: ['MegaTap', '#4a82e0']
};

// IO blocks are excluded from the row chip strip (design §4.3: "one per non-IO block").
const IO_SLUGS = new Set(['input', 'output', 'in', 'out']);

export function axisPbCatLabel(slug: string): string {
  return CAT[slug]?.[0] ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Block');
}

export function axisPbCatColor(slug: string): string {
  return CAT[slug]?.[1] ?? '#7a7a84';
}

export interface AxisPbRowBlockChip {
  /** Family colour for the chip fill/border/text. */
  color: string;
  /** Category label ("Amp", "Reverb", …). */
  cat: string;
  /** Model / type name when the summary carries one, else null (chip shows just the category). */
  type: string | null;
  /** Full label for the chip: "Cat · TYPE" or "Cat". */
  label: string;
  /** title attr — instance name — TYPE (mirrors the monolith row chip title). */
  title: string;
}

// Build the per-block chip list for a row (§4.3). One chip per non-IO block, family-coloured, "Cat · TYPE".
export function axisPbRowBlockChips(entry: AxisPresetBrowserEntrySummary): AxisPbRowBlockChip[] {
  const chips: AxisPbRowBlockChip[] = [];
  for (const block of entry.blocks) {
    const slug = (block.slug ?? '').toLowerCase();
    if (!slug || IO_SLUGS.has(slug)) continue;
    const cat = axisPbCatLabel(slug);
    // The summary block "name" is the model/type name for that slot when decoded (e.g. "USA Clean");
    // when it just echoes the category we drop it so the chip stays "Cat".
    const rawType = (block.name ?? '').trim();
    const type = rawType && rawType.toLowerCase() !== cat.toLowerCase() ? rawType : null;
    const instance = block.instance != null ? `${cat} ${block.instance}` : cat;
    chips.push({
      color: axisPbCatColor(slug),
      cat,
      type,
      label: type ? `${cat} · ${type}` : cat,
      title: type ? `${instance} — ${type}` : instance
    });
  }
  return chips;
}

export interface AxisPbCpuMeter {
  /** Estimated DSP load percentage (0–99). */
  pct: number;
  /** Threshold colour: >=80 red, >=62 amber, else green (§4.3 / visual table). */
  color: string;
}

export function axisPbCpuColor(pct: number): string {
  return pct >= 80 ? '#e87b6a' : pct >= 62 ? '#f5a623' : '#33c46b';
}

// CPU meter derivation for a row (§4.3). Uses the summary-level estimate (blockCount-derived).
export function axisPbRowCpuMeter(entry: AxisPresetBrowserEntrySummary): AxisPbCpuMeter {
  const pct = estimateCpu(entry);
  return { pct, color: axisPbCpuColor(pct) };
}

export interface AxisPbCloudChip {
  short: string;
  label: string;
  color: string;
  glyph: string;
}

// Cloud/device presence chip vocabulary (§5.1 / §6 table). Mirrors cloud.svelte SYNC_META short/colour;
// duplicated here (glyph included) so the pure layer stays store-free and unit-testable. 'none' (signed
// out / no comparison) yields null so the row simply omits the chip.
const CLOUD_META: Record<Exclude<SyncState, 'none'>, AxisPbCloudChip> = {
  synced: { short: 'Synced', label: 'Synced', color: '#33c46b', glyph: '☁' },
  modified: { short: 'Local edit', label: 'Local edits not uploaded', color: '#f5a623', glyph: '↑' },
  outdated: { short: 'Update', label: 'Newer version in cloud', color: '#4a82e0', glyph: '↓' },
  cloudOnly: { short: 'Cloud', label: 'Cloud only · not on this device', color: '#9b8cf0', glyph: '☁' },
  deviceOnly: { short: 'Device', label: 'Not backed up to cloud', color: '#6e6e78', glyph: '▪' },
  unknown: { short: 'Device', label: 'On this device · cloud comparison unavailable', color: '#6e6e78', glyph: '▪' }
};

export function axisPbCloudChip(state: SyncState): AxisPbCloudChip | null {
  if (state === 'none') return null;
  return CLOUD_META[state];
}

// Device chip colour by device family (§4.3 right column). Derived from the entry model/source; falls
// back to the neutral tint used by the monolith device chips.
export function axisPbDeviceColor(model: string | null | undefined): string {
  const m = (model ?? '').toLowerCase();
  if (m.includes('axe-fx iii') || m.includes('axe fx iii') || m.includes('axefx iii')) return '#4f6bed';
  if (m.includes('fm9')) return '#2fb0c9';
  if (m.includes('fm3')) return '#d98a2b';
  return '#8a8a94';
}

export interface AxisPbRowAnatomy {
  blockChips: AxisPbRowBlockChip[];
  cpu: AxisPbCpuMeter;
  cloud: AxisPbCloudChip | null;
  /** Up to 3 tag pills (§4.3). */
  tagPills: string[];
  sceneCount: number;
}

// The full derived anatomy for one row — everything the list row template needs beyond the raw summary.
export function axisPbRowAnatomy(entry: AxisPresetBrowserEntrySummary): AxisPbRowAnatomy {
  return {
    blockChips: axisPbRowBlockChips(entry),
    cpu: axisPbRowCpuMeter(entry),
    cloud: axisPbCloudChip(entry.syncState),
    tagPills: entry.tags.slice(0, 3),
    sceneCount: entry.sceneCount
  };
}
