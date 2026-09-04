// The alternate gate: is the closed set still closed, and does each gate answer the device's answer?
//
// The census test is the important one. `deviceAlternates.ts` only works because the corpus contains a
// SMALL, KNOWN set of co-anchored control groups; if a fourth shape appears (a new firmware, a new
// device), the module would silently draw index 0 and the page would be wrong in a way nothing else
// catches. So the census is asserted, not documented.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pickAlternate, resolveAlternates, isVisible, NO_ALTERNATE_CONTEXT, type AlternateContext } from './deviceAlternates';
import type { LayoutControl, LayoutPage } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIDI = resolve(HERE, '../../../forgefx-midi/dist/gen3');
const DEVICES = ['axe-fx-iii', 'fm9', 'fm3'] as const;
const available = DEVICES.filter((d) => existsSync(`${MIDI}/${d}/layouts.generated.js`));

function loadLayouts(device: string): Record<string, { variants?: { name?: string; pages?: LayoutPage[] }[] }> {
  const src = readFileSync(`${MIDI}/${device}/layouts.generated.js`, 'utf8');
  const start = src.indexOf('{', src.indexOf('export const'));
  return new Function(`return (${src.slice(start, src.lastIndexOf('}') + 1)});`)();
}

const ctl = (o: Partial<LayoutControl>): LayoutControl =>
  ({ label: '', paramName: null, paramId: null, widget: 'unknown', rawWidget: 'knob', ...o }) as LayoutControl;

const ctxOf = (values: Record<string, number>, labels: Record<string, string> = {}): AlternateContext => ({
  valueOf: (s) => values[s],
  labelOf: (s) => labels[s]
});

describe('pickAlternate', () => {
  it('leaves a lone control alone', () => {
    expect(pickAlternate([ctl({ rawWidget: 'knob' })], NO_ALTERNATE_CONTEXT)).toBe(0);
  });

  it('shows the plain cab graph until CABINET_ZOOM is on', () => {
    const group = [
      ctl({ rawWidget: 'graph_cab', paramName: null }),
      ctl({ rawWidget: 'graph_cabZoom', paramName: null })
    ];
    expect(pickAlternate(group, NO_ALTERNATE_CONTEXT)).toBe(0);
    expect(pickAlternate(group, ctxOf({ CABINET_ZOOM: 1 }))).toBe(1);
    expect(pickAlternate(group, ctxOf({ CABINET_ZOOM: 0 }))).toBe(0);
  });

  it('picks the zoomed graph whichever order the editor authored the pair in', () => {
    const group = [ctl({ rawWidget: 'graph_cabZoom_mm' }), ctl({ rawWidget: 'graph_cab_mm' })];
    expect(pickAlternate(group, ctxOf({ CABINET_ZOOM: 1 }))).toBe(0);
    expect(pickAlternate(group, ctxOf({ CABINET_ZOOM: 0 }))).toBe(1);
  });

  it('swaps a PEQ band between Gain and Slope on its filter type', () => {
    const group = [
      ctl({ label: 'Gain 1', paramName: 'PEQ_GAIN1', rawWidget: 'knobCompact' }),
      ctl({ label: 'Slope 1', paramName: 'PEQ_LOWSLOPE', rawWidget: 'dropdownCompact3' })
    ];
    expect(pickAlternate(group, ctxOf({}, { PEQ_TYPE1: 'Peaking' }))).toBe(0);
    expect(pickAlternate(group, ctxOf({}, { PEQ_TYPE1: 'Shelving' }))).toBe(1);
    expect(pickAlternate(group, ctxOf({}, { PEQ_TYPE1: 'Blocking' }))).toBe(1);
    // type not live → the gain knob, not a blank
    expect(pickAlternate(group, NO_ALTERNATE_CONTEXT)).toBe(0);
  });

  it('falls through to the first-authored control for an ungated pair', () => {
    // FM3 GLOBAL out 2: Boost/Pad vs Output Level, gated on a hardware setting the block protocol
    // does not expose. Documented in deviceAlternates.ts; asserted here so a future "fix" is deliberate.
    const group = [
      ctl({ label: 'Boost/Pad', paramName: 'GLOBAL_OUT2_PAD', rawWidget: 'dropdown1' }),
      ctl({ label: 'Output Level', paramName: 'GLOBAL_OUT2_LINE', rawWidget: 'dropdown1' })
    ];
    expect(pickAlternate(group, ctxOf({ GLOBAL_OUT2_PAD: 1 }, { GLOBAL_OUT2_PAD: 'Pad' }))).toBe(0);
  });
});

describe('resolveAlternates / isVisible', () => {
  const placed = [
    { control: ctl({ rawWidget: 'graph_cab' }), alternateKey: '305,18', alternateIndex: 0 },
    { control: ctl({ rawWidget: 'graph_cabZoom' }), alternateKey: '305,18', alternateIndex: 1 },
    { control: ctl({ rawWidget: 'knob' }), alternateKey: '10,10', alternateIndex: 0 }
  ];

  it('hides exactly one of a pair and never the singleton', () => {
    const r = resolveAlternates(placed, ctxOf({ CABINET_ZOOM: 1 }));
    expect(placed.map((p) => isVisible(p, r))).toEqual([false, true, true]);
  });

  it('leaves everything visible when there is nothing to decide', () => {
    const r = resolveAlternates([placed[2]], NO_ALTERNATE_CONTEXT);
    expect(r.size).toBe(0);
    expect(isVisible(placed[2], r)).toBe(true);
  });
});

const suite = available.length ? describe : describe.skip;

suite('alternate census', () => {
  /** Every co-anchored group ForgeFX would actually serve (firmware alternates already pruned). */
  const groups: { id: string; controls: LayoutControl[] }[] = [];
  for (const device of available) {
    for (const [family, block] of Object.entries(loadLayouts(device)))
      for (const variant of block.variants ?? [])
        for (const page of variant.pages ?? []) {
          const byAnchor = new Map<string, LayoutControl[]>();
          for (const row of page.rows ?? [])
            for (const c of row.controls ?? []) {
              if ((c.fw as { lt?: string } | undefined)?.lt != null) continue; // ForgeFX prunes these
              const p = c.placement;
              if (!p?.positionExact) continue;
              const k = `${p.positionExact}|${p.offsetX ?? 0}|${p.offsetY ?? 0}`;
              byAnchor.set(k, [...(byAnchor.get(k) ?? []), c]);
            }
          for (const [k, cs] of byAnchor)
            if (cs.length > 1) groups.push({ id: `${device}/${family}/${variant.name ?? '-'}/${page.name}@${k}`, controls: cs });
        }
  }

  it('still contains only the three shapes this module names', () => {
    const shapes = new Map<string, number>();
    for (const g of groups) {
      const s = g.controls.map((c) => c.rawWidget).join(' | ');
      shapes.set(s, (shapes.get(s) ?? 0) + 1);
    }
    expect(Object.fromEntries([...shapes].sort())).toEqual({
      'graph_cab | graph_cabZoom': 5,
      'graph_cab_mm | graph_cabZoom_mm': 4,
      'knobCompact | dropdownCompact3': 6,
      'dropdown1 | dropdown1': 1,
      'dropdownThin1Line | dropdownThin1Line': 1
    });
  });

  it('never has an anchor with more than two occupants', () => {
    expect(groups.filter((g) => g.controls.length > 2).map((g) => g.id)).toEqual([]);
  });

  it('picks an in-range index for every group in the corpus, live or not', () => {
    for (const g of groups) {
      const i = pickAlternate(g.controls, NO_ALTERNATE_CONTEXT);
      expect(i, g.id).toBeGreaterThanOrEqual(0);
      expect(i, g.id).toBeLessThan(g.controls.length);
    }
  });

  it('resolves every graph pair to the zoomed graph when the cab is zoomed', () => {
    const zoomed = ctxOf({ CABINET_ZOOM: 1 });
    for (const g of groups) {
      if (!g.controls.some((c) => /Zoom/.test(c.rawWidget))) continue;
      expect(/Zoom/.test(g.controls[pickAlternate(g.controls, zoomed)].rawWidget), g.id).toBe(true);
    }
  });
});
