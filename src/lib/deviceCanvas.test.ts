// Device-canvas placement: exact, fixture-backed geometry + a corpus sweep over every device page.
//
// Placement is now device-authored: the placer reads the page's resolved `geometry` (PageLayout) and
// each control's `bounds` (component metadata) and reproduces the editor's own coordinates. The old
// suite asserted the flow layer slid past the absolute layer (`pushedRows`) — a metric of the discarded
// packer — and pinned known-bad pages. Both are gone: the sweep now asserts (a) every page `layout`
// reference resolves, (b) every rawWidget resolves to bounds, and (c) placement is a pure function of
// the served geometry (no mutation).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { placePage, placeLayout, parsePositionExact, CANVAS_W, DEVICE_SCALE, type PlacedControl } from './deviceCanvas';
import { widgetBox, dropdownFieldHeight } from './deviceWidgets';
import type { DeviceLayout, LayoutControl, LayoutPage, LayoutPageLayout } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIDI = resolve(HERE, '../../../forgefx-midi/dist/gen3');
const DEVICES = ['axe-fx-iii', 'fm9', 'fm3'] as const;
const available = DEVICES.filter((d) => existsSync(`${MIDI}/${d}/layouts.generated.js`));

function loadJson(device: string, file: string): Record<string, unknown> {
  const src = readFileSync(`${MIDI}/${device}/${file}`, 'utf8');
  const start = src.indexOf('{', src.indexOf('export const'));
  return new Function(`return (${src.slice(start, src.lastIndexOf('}') + 1)});`)();
}

type Renderer = { pageLayouts: Record<string, LayoutPageLayout>; widgetBounds: Record<string, { w: number; h: number }> };
function loadRenderer(device: string): Renderer | null {
  if (!existsSync(`${MIDI}/${device}/renderer.generated.js`)) return null;
  return loadJson(device, 'renderer.generated.js') as unknown as Renderer;
}

/** Mimic ForgeFX's layoutFrom resolution: page.layout → geometry, control.rawWidget → bounds. */
function resolvePage(page: LayoutPage, renderer: Renderer | null): LayoutPage {
  if (!renderer) return page; // legacy device (FM9): no geometry/bounds served
  return {
    ...page,
    ...(page.layout && renderer.pageLayouts[page.layout] ? { geometry: renderer.pageLayouts[page.layout] } : {}),
    rows: page.rows.map((r) => ({
      ...r,
      controls: r.controls.map((c) => ({
        ...c,
        ...(renderer.widgetBounds[c.rawWidget] ? { bounds: renderer.widgetBounds[c.rawWidget] } : {}),
      })),
    })),
  };
}

// ── fixture-backed geometry (the model itself, exact coordinates) ──
const ctl = (o: Partial<LayoutControl>): LayoutControl =>
  ({ label: '', paramName: null, paramId: null, widget: 'unknown', rawWidget: 'knob', ...o }) as LayoutControl;
const LAYOUT_MIXER2: LayoutPageLayout = {
  name: 'LAYOUT_MIXER2', parametersX: 305, parametersY: 50, parametersSpacingX: 85, parametersSpacingY: 180,
  mixerX: 1094, mixerY: 50, mixerSpacingX: 85, mixerSpacingY: 180,
  btnBypassPosition: '1188,360', btnIgnoreScenePosition: '1104,360',
};

describe('placePage (exact geometry)', () => {
  it('places a Parameters row at parametersX + col * parametersSpacingX', () => {
    const page: LayoutPage = {
      name: 'P', layout: 'LAYOUT_MIXER2', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'knob', placement: { col: 0 } }), ctl({ rawWidget: 'knob', placement: { col: 2 } })] }],
    };
    const placed = placePage(page);
    const xs = placed.controls.map((c) => c.x / DEVICE_SCALE);
    expect(xs).toEqual([305, 305 + 2 * 85]);
    expect(placed.controls.map((c) => c.y / DEVICE_SCALE)).toEqual([50, 50]);
  });

  it('stacks Parameters rows by parametersSpacingY, in authored order', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [
        { section: 'parameters', controls: [ctl({ rawWidget: 'knob' })] },
        { section: 'parameters', controls: [ctl({ rawWidget: 'knob' })] },
      ],
    };
    const placed = placePage(page);
    expect(placed.controls.map((c) => c.y / DEVICE_SCALE)).toEqual([50, 50 + 180]);
  });

  it('places a Mixer row at mixerX with its own row index and spacing', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [
        { section: 'mixer', controls: [ctl({ rawWidget: 'knob' }), ctl({ rawWidget: 'knob' })] },
        { section: 'mixer', controls: [ctl({ rawWidget: 'knob' })] },
      ],
    };
    const placed = placePage(page);
    expect(placed.controls[0].x / DEVICE_SCALE).toBe(1094);
    expect(placed.controls[1].x / DEVICE_SCALE).toBe(1094 + 85);
    expect(placed.controls[2].y / DEVICE_SCALE).toBe(50 + 180);
  });

  it('spacers consume a flow slot; controls without col use the next slot', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'parameters', controls: [
        ctl({ rawWidget: 'knob' }), ctl({ rawWidget: 'spacer' }), ctl({ rawWidget: 'knob' }),
      ] }],
    };
    const placed = placePage(page);
    expect(placed.controls.map((c) => c.x / DEVICE_SCALE)).toEqual([305, 305 + 85, 305 + 2 * 85]);
  });

  it('positionExact overrides the flow slot; offsetX/offsetY nudge it', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'sectionLabel', placement: { positionExact: '307,29' } })] }],
    };
    const placed = placePage(page);
    expect(placed.controls[0].x / DEVICE_SCALE).toBe(307);
    expect(placed.controls[0].y / DEVICE_SCALE).toBe(29);

    const off: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'toggle', placement: { col: 0, offsetY: -70 } })] }],
    };
    expect(placePage(off).controls[0].y / DEVICE_SCALE).toBe(50 - 70);
  });

  it('btnBypass / btnIgnoreScene use the PageLayout button anchors, not the flow slot', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'mixer', controls: [ctl({ rawWidget: 'btnBypass' }), ctl({ rawWidget: 'btnIgnoreScene' })] }],
    };
    const placed = placePage(page);
    const byp = placed.controls.find((c) => c.control.rawWidget === 'btnBypass')!;
    const ign = placed.controls.find((c) => c.control.rawWidget === 'btnIgnoreScene')!;
    expect([byp.x / DEVICE_SCALE, byp.y / DEVICE_SCALE]).toEqual([1188, 360]);
    expect([ign.x / DEVICE_SCALE, ign.y / DEVICE_SCALE]).toEqual([1104, 360]);
  });

  it('sizes a sectionLabel from sectionSpan.pixels or cols × spacingX', () => {
    const base = { name: 'P', geometry: LAYOUT_MIXER2, rows: [{ section: 'parameters', controls: [] as LayoutControl[] }] } as LayoutPage;
    const px: LayoutPage = { ...base, rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'sectionLabel', placement: { positionExact: '307,29' }, render: { sectionSpan: { pixels: 251 } } })] }] };
    const cols: LayoutPage = { ...base, rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'sectionLabel', placement: { positionExact: '305,209' }, render: { sectionSpan: { cols: 3 } } })] }] };
    expect(placePage(px).controls[0].w / DEVICE_SCALE).toBe(251);
    expect(placePage(cols).controls[0].w / DEVICE_SCALE).toBe(3 * 85);
  });

  it('does not clamp, push, repack, or reorder — output is a pure function of the geometry', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'knob', placement: { col: 3 } }), ctl({ rawWidget: 'knob', placement: { col: 3 } })] }],
    };
    const a = placePage(page);
    const b = placePage(page);
    // Two controls the device authored at the same column stay put (col 3 twice) — no repacking.
    expect(a.controls.map((c) => c.x / DEVICE_SCALE)).toEqual([305 + 3 * 85, 305 + 3 * 85]);
    expect(a.controls).toEqual(b.controls);
  });

  it('a decoration row (all positionExact) does not advance the flow row cursor', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [
        { section: 'parameters', controls: [ctl({ rawWidget: 'sectionLabel', label: 'TONE', placement: { positionExact: '305,209' } })] },
        { section: 'parameters', controls: [ctl({ rawWidget: 'knob', placement: { col: 0 } })] },
      ],
    };
    const knob = placePage(page).controls.find((c) => c.control.rawWidget === 'knob')!;
    expect(knob.y / DEVICE_SCALE).toBe(50);
  });

  it('sizes a zero-width text label to its caption', () => {
    const page: LayoutPage = {
      name: 'P', geometry: LAYOUT_MIXER2,
      rows: [{ section: 'parameters', controls: [ctl({ rawWidget: 'labelBold', label: 'CAB 1', bounds: { w: 0, h: 28 }, placement: { positionExact: '315,63' } })] }],
    };
    const w = placePage(page).controls[0].w / DEVICE_SCALE;
    expect(w).toBeGreaterThan(0);
    expect(w).toBeGreaterThanOrEqual(28);
  });
});

// ── corpus sweep ──
type Case = { id: string; device: string; page: LayoutPage; renderer: Renderer | null };
const cases: Case[] = [];
for (const device of available) {
  const layouts = loadJson(device, 'layouts.generated.js') as Record<string, { variants?: { name?: string; pages?: LayoutPage[] }[] }>;
  const renderer = loadRenderer(device);
  for (const [family, block] of Object.entries(layouts))
    for (const variant of block.variants ?? [])
      for (const raw of variant.pages ?? []) {
        const page = raw as LayoutPage;
        cases.push({ id: `${device}/${family}/${variant.name ?? '-'}/${page.name}`, device, page, renderer });
      }
}

const suite = available.length ? describe : describe.skip;

suite('device canvas sweep', () => {
  it('has a corpus to sweep', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('every page layout reference resolves to a PageLayout (devices with a renderer)', () => {
    const bad: string[] = [];
    for (const { id, page, renderer } of cases) {
      if (!renderer || page.layout == null) continue;
      if (!renderer.pageLayouts[page.layout]) bad.push(`${id} :: ${page.layout}`);
    }
    expect(bad).toEqual([]);
  });

  it('every rawWidget needed for geometry resolves to widget bounds (devices with a renderer)', () => {
    const missing = new Set<string>();
    for (const { page, renderer } of cases) {
      if (!renderer) continue;
      for (const row of page.rows) for (const c of row.controls) if (c.rawWidget && !renderer.widgetBounds[c.rawWidget]) missing.add(c.rawWidget);
    }
    expect([...missing].sort()).toEqual([]);
  });

  it('places every page without throwing, at served geometry (no placement mutation)', () => {
    for (const { id, page, renderer } of cases) {
      const resolved = resolvePage(page, renderer);
      const placed = placePage(resolved);
      // Deterministic + pure: two placements are identical (no random/pushed/mutated output).
      expect(placePage(resolved).controls, id).toEqual(placed.controls);
      for (const c of placed.controls) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.w) && Number.isFinite(c.h), id).toBe(true);
      }
    }
  });

  it('keeps every placed control within the fixed canvas width (devices with a renderer)', () => {
    const over: string[] = [];
    for (const { id, page, renderer } of cases) {
      if (!renderer) continue; // FM9 has no resolved geometry — placement is a documented degradation
      const placed = placePage(resolvePage(page, renderer));
      for (const c of placed.controls) if (c.x + c.w > CANVAS_W * DEVICE_SCALE) { over.push(`${id} :: ${c.control.label || c.control.rawWidget}`); break; }
    }
    expect(over).toEqual([]);
  });
});

describe('widgetBox (legacy fallback)', () => {
  it('falls back by longest prefix, never throws', () => {
    expect(widgetBox('knobCompact').w).toBeGreaterThan(0);
    expect(widgetBox(null).w).toBeGreaterThan(0);
    expect(widgetBox('').w).toBeGreaterThan(0);
  });
});

describe('dropdownFieldHeight', () => {
  it('caps a labelled slot to the field height, preserves short field-only tokens', () => {
    expect(dropdownFieldHeight(136)).toBe(28);
    expect(dropdownFieldHeight(85)).toBe(28);
    expect(dropdownFieldHeight(28)).toBe(28);
    expect(dropdownFieldHeight(24)).toBe(24);
    expect(dropdownFieldHeight(25)).toBe(25);
  });
});

describe('placeLayout', () => {
  it('returns [] for a missing layout', () => {
    expect(placeLayout(null)).toEqual([]);
    expect(placeLayout({ family: 'X', pages: [] })).toEqual([]);
  });
  it('places every page in order', () => {
    const layout: DeviceLayout = { family: 'X', pages: [
      { name: 'A', rows: [], geometry: LAYOUT_MIXER2 },
      { name: 'B', rows: [], geometry: LAYOUT_MIXER2 },
    ] };
    expect(placeLayout(layout).map((p) => p.name)).toEqual(['A', 'B']);
  });
});
