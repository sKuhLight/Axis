// The alternate gate: co-anchored controls are swapped on another control's value. The gate now comes
// from the device's own `render.controllingParamName`/`controllingParamValue` visibility metadata; the
// only shape the layout does NOT carry is the PEQ gain/slope pair (a property of the filter TYPE value).
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

  it('uses the controllingParam visibility gate for a graph pair', () => {
    const group = [
      ctl({ rawWidget: 'graph_cab', render: { controllingParamName: 'CABINET_ZOOM', controllingParamValue: '0' } }),
      ctl({ rawWidget: 'graph_cabZoom', render: { controllingParamName: 'CABINET_ZOOM', controllingParamValue: '1' } })
    ];
    expect(pickAlternate(group, NO_ALTERNATE_CONTEXT)).toBe(0); // gate not live → first
    expect(pickAlternate(group, ctxOf({ CABINET_ZOOM: 1 }))).toBe(1);
    expect(pickAlternate(group, ctxOf({ CABINET_ZOOM: 0 }))).toBe(0);
  });

  it('picks the gated control whichever order the pair is authored in', () => {
    const group = [
      ctl({ rawWidget: 'graph_cabZoom_mm', render: { controllingParamName: 'CABINET_ZOOM', controllingParamValue: '1' } }),
      ctl({ rawWidget: 'graph_cab_mm', render: { controllingParamName: 'CABINET_ZOOM', controllingParamValue: '0' } })
    ];
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

  it('uses the controllingParam gate for the GLOBAL out-2 pair', () => {
    const group = [
      ctl({ label: 'Boost/Pad', paramName: 'GLOBAL_OUT2_PAD', rawWidget: 'dropdown1', render: { controllingParamName: 'GLOBAL_OUT2_TYPE', controllingParamValue: '0' } }),
      ctl({ label: 'Output Level', paramName: 'GLOBAL_OUT2_LINE', rawWidget: 'dropdown1', render: { controllingParamName: 'GLOBAL_OUT2_TYPE', controllingParamValue: '1,2' } })
    ];
    expect(pickAlternate(group, ctxOf({ GLOBAL_OUT2_TYPE: 0 }))).toBe(0);
    expect(pickAlternate(group, ctxOf({ GLOBAL_OUT2_TYPE: 2 }))).toBe(1);
  });
});

describe('resolveAlternates / isVisible', () => {
  const placed = [
    { control: ctl({ rawWidget: 'graph_cab', render: { controllingParamName: 'CABINET_ZOOM', controllingParamValue: '0' } }), alternateKey: '305,18', alternateIndex: 0 },
    { control: ctl({ rawWidget: 'graph_cabZoom', render: { controllingParamName: 'CABINET_ZOOM', controllingParamValue: '1' } }), alternateKey: '305,18', alternateIndex: 1 },
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

  const isSlope = (c: LayoutControl) => /SLOPE$/.test(c.paramName ?? '');
  const gainSym = (c: LayoutControl) => /^(.*)_GAIN(\d+)$/.test(c.paramName ?? '');

  it('every co-anchored group is gated by controllingParam metadata or is a PEQ gain/slope pair', () => {
    const ungated: string[] = [];
    for (const g of groups) {
      const isSlopePair = g.controls.some(isSlope) && g.controls.some(gainSym);
      const allGated = g.controls.every((c) => c.render?.controllingParamName != null);
      if (!isSlopePair && !allGated) ungated.push(g.id);
    }
    expect(ungated).toEqual([]);
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

  it('resolves every gated graph pair to the zoomed graph when the cab is zoomed', () => {
    const zoomed = ctxOf({ CABINET_ZOOM: 1 });
    for (const g of groups) {
      if (!g.controls.some((c) => c.render?.controllingParamName === 'CABINET_ZOOM')) continue;
      const i = pickAlternate(g.controls, zoomed);
      expect(/Zoom/.test(g.controls[i].rawWidget), g.id).toBe(true);
    }
  });
});
