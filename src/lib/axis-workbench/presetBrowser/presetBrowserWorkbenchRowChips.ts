// Row anatomy derivation for the docked preset browser list (§4.3 of
// docs/workbench-dc-parity/06-preset-browser.md). Pure, summary-level logic — it turns an
// AxisPresetBrowserEntrySummary into the design's full row form: per-block chips (family-coloured
// "Cat · TYPE").
//
// The block family → [label, colour] map mirrors src/lib/PresetBrowser.svelte's CAT table verbatim so
// docked rows read identically to the monolith surface.
import type { AxisPresetBrowserEntrySummary } from './presetBrowserWorkbenchData';

// block family slug → [label, colour]. Verbatim from PresetBrowser.svelte CAT; unknown slugs fall back.
// Exported as the canonical block-slug set: presetBrowserWorkbenchQuery.ts's `AXIS_PB_FILTERABLE_BLOCKS`
// is a hand-mirrored literal of these keys; its test round-trips every key here through the parser to
// keep the two in step.
export const AXIS_PB_CAT: Record<string, [string, string]> = {
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
  return AXIS_PB_CAT[slug]?.[0] ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Block');
}

export function axisPbCatColor(slug: string): string {
  return AXIS_PB_CAT[slug]?.[1] ?? '#7a7a84';
}

export interface AxisPbRowBlockChip {
  /** The block family slug ("amp", "delay", …) this chip was built from — lets a caller correlate a
   *  chip back to a search condition's `block` field (see presetBrowserWorkbenchChainMatch.ts). */
  slug: string;
  /** Family colour for the chip fill/border/text. */
  color: string;
  /** Category label ("Amp", "Reverb", …). */
  cat: string;
  /** Roster label with the block's instance number ("Amp 1", "Drive 2", …) — what the row's
   *  mini signal-chain strip shows. Falls back to the bare category when no instance is known. */
  instance: string;
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
    // The decoded model name for this family (e.g. "USA Clean") is preferred, mirroring the monolith's
    // blocksOf typeName; `block.name` is only a generic roster instance label ("Amp 1") and is the
    // fallback when nothing was decoded. When it just echoes the category we drop it so the chip stays "Cat".
    const rawType = ((entry.models[slug] ?? [])[0] ?? block.name ?? '').trim();
    const type = rawType && rawType.toLowerCase() !== cat.toLowerCase() ? rawType : null;
    const instance = block.instance != null ? `${cat} ${block.instance}` : cat;
    chips.push({
      slug,
      color: axisPbCatColor(slug),
      cat,
      instance,
      type,
      label: type ? `${cat} · ${type}` : cat,
      title: type ? `${instance} — ${type}` : instance
    });
  }
  return chips;
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
  /** Up to 3 tag pills (§4.3). */
  tagPills: string[];
  sceneCount: number;
}

// The full derived anatomy for one row — everything the list row template needs beyond the raw summary.
export function axisPbRowAnatomy(entry: AxisPresetBrowserEntrySummary): AxisPbRowAnatomy {
  return {
    blockChips: axisPbRowBlockChips(entry),
    tagPills: entry.tags.slice(0, 3),
    sceneCount: entry.sceneCount
  };
}
