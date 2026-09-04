// Structural sweep of EVERY device page through the canvas placer.
//
// Replaces `deviceLayoutSweep.test.ts`, which swept the same corpus through the widget-grid board
// builder and had to pin five permanently-overlapping pages by name. Placement is now pixel-exact, so
// this suite pins NONE: overlap is prevented by construction (see `placePage`), and the interesting
// question became a different one — how often the flow layer has to slide past the absolute layer,
// which is the number that tells us whether `deviceWidgets.ts`'s metrics are right.
//
// Reads the generated layout data from the sibling `forgefx-midi` checkout, exactly as the sweep it
// replaces did; a solo Axis checkout skips rather than fails.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { placePage, CANVAS_W, DEVICE_SCALE } from './deviceCanvas';
import { widgetBox, widgetView, graphKind, MEASURED_WIDGETS } from './deviceWidgets';
import type { DeviceLayout, LayoutPage } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIDI = resolve(HERE, '../../../forgefx-midi/dist/gen3');
const DEVICES = ['axe-fx-iii', 'fm9', 'fm3'] as const;
const available = DEVICES.filter((d) => existsSync(`${MIDI}/${d}/layouts.generated.js`));

function loadLayouts(device: string): Record<string, { family: string; variants?: { name?: string; pages?: DeviceLayout['pages'] }[] }> {
  const src = readFileSync(`${MIDI}/${device}/layouts.generated.js`, 'utf8');
  const start = src.indexOf('{', src.indexOf('export const'));
  const end = src.lastIndexOf('}');
  return new Function(`return (${src.slice(start, end + 1)});`)();
}

type Case = { id: string; page: LayoutPage };

/** Sweep what Axis is actually SERVED, not the raw corpus. ForgeFX prunes every control gated
 *  `fw.lt` (only applicable below some firmware) before it serves a page — see `pruneControlsByFw`
 *  in the ForgeFX repo's `devices.ts` — which is what collapses the firmware-alternate pairs the
 *  corpus stores at identical coordinates (the cab Align page holds a `graph_cab` for fw < 17 and
 *  another for fw >= 17 both at "305,18"). Sweeping the raw corpus would assert against a page the
 *  device would never draw. Genuinely co-located siblings that share a gate (the same page's
 *  `graph_cab` + `graph_cabZoom`, which the editor toggles between) survive this and are expected. */
const servedPage = (page: LayoutPage): LayoutPage => ({
  ...page,
  rows: (page.rows ?? []).map((r) => ({ ...r, controls: (r.controls ?? []).filter((c) => (c.fw as { lt?: string } | undefined)?.lt == null) }))
});

const cases: Case[] = [];
for (const device of available) {
  const layouts = loadLayouts(device);
  for (const [family, block] of Object.entries(layouts))
    for (const variant of block.variants ?? [])
      for (const page of variant.pages ?? [])
        cases.push({ id: `${device}/${family}/${variant.name ?? '-'}/${page.name}`, page: servedPage(page as LayoutPage) });
}

const suite = available.length ? describe : describe.skip;

suite('device canvas sweep', () => {
  it('has a corpus to sweep', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('never overlaps two controls on any page', () => {
    const bad: string[] = [];
    for (const { id, page } of cases) {
      const placed = placePage(page);
      const cs = placed.controls.filter((c) => c.w > 0 && c.h > 0);
      outer: for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i], b = cs[j];
          // Controls sharing an ANCHOR are device-authored alternates, not a placement bug: the
          // editor draws one at a time and swaps them on another control's value (the PEQ's per-band
          // `Gain` knob vs `Slope` dropdown, both at "396,178"; the cab Align page's `graph_cab` vs
          // `graph_cabZoom`). They differ in size, so the test keys on the anchor, not the box.
          // Only genuine partial overlap — two controls fighting for the same space — is a failure.
          const coincident = a.alternateKey === b.alternateKey;
          if (!coincident && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
            bad.push(`${id} :: ${a.control.label || a.control.rawWidget} x ${b.control.label || b.control.rawWidget}`);
            break outer;
          }
        }
    }
    expect(bad).toEqual([]);
  });

  it('keeps every control inside the fixed canvas width', () => {
    const over: string[] = [];
    for (const { id, page } of cases) {
      const placed = placePage(page);
      for (const c of placed.controls)
        if (c.x + c.w > CANVAS_W * DEVICE_SCALE) { over.push(`${id} :: ${c.control.label || c.control.rawWidget}`); break; }
    }
    expect(over).toEqual([]);
  });

  it('resolves every rawWidget in the corpus against the measured table', () => {
    const unmeasured = new Set<string>();
    for (const { page } of cases)
      for (const row of page.rows ?? [])
        for (const c of row.controls ?? [])
          if (c.rawWidget && !MEASURED_WIDGETS.has(c.rawWidget)) unmeasured.add(c.rawWidget);
    expect([...unmeasured].sort()).toEqual([]);
  });

  it('resolves every rawWidget to a view, and never guesses a graph into a control', () => {
    const tokens = new Set<string>();
    for (const { page } of cases)
      for (const row of page.rows ?? []) for (const c of row.controls ?? []) if (c.rawWidget) tokens.add(c.rawWidget);
    // Every token maps to a view, and the view agrees with the token family: a `graph_*` token must
    // never fall through to a control the user could drag, and nothing else may claim to be a graph.
    for (const t of tokens) {
      const view = widgetView(t);
      expect(view, t).toBeTruthy();
      expect(view === 'graph', t).toBe(t.startsWith('graph'));
    }
    // Every graph token the corpus contains names a kind (the vocabulary is closed). `rta`, `eqMatch`
    // and `modifier` are kinds we deliberately do not draw — they resolve, then render as an empty box.
    const unnamed = [...tokens].filter((t) => t.startsWith('graph') && graphKind(t) == null);
    expect(unnamed.sort()).toEqual([]);
  });

  it('reports how often the flow layer slides past the absolute layer', () => {
    let pushed = 0;
    const worst: { id: string; n: number }[] = [];
    for (const { id, page } of cases) {
      const p = placePage(page);
      pushed += p.pushedRows;
      if (p.pushedRows) worst.push({ id, n: p.pushedRows });
    }
    worst.sort((a, b) => b.n - a.n);
    // Not an assertion about correctness — a visible metric. A jump here means a widget metric moved.
    console.log(`flow rows pushed: ${pushed} across ${worst.length}/${cases.length} pages; worst:`,
      worst.slice(0, 8).map((w) => `${w.id}(${w.n})`).join(', '));
    expect(pushed).toBeGreaterThanOrEqual(0);
  });
});

describe('widgetBox', () => {
  it('falls back by longest prefix, never throws', () => {
    expect(widgetBox('knobCompact').w).toBe(85);
    expect(widgetBox('knobSomethingNew').derived).toBe(true);
    expect(widgetBox('dropdown1p5Whatever').w).toBe(126);
    expect(widgetBox(null).w).toBeGreaterThan(0);
    expect(widgetBox('').w).toBeGreaterThan(0);
  });
});
