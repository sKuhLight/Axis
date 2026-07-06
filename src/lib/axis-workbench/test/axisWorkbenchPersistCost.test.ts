import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { repairWorkbenchDocument } from '../../workbench/core/invariants';
import type { JsonObject, WidgetInstance, WorkbenchDocument, WorkbenchLayout } from '../../workbench/core/schema';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';

/**
 * Persist-cost measurement (storage hardening item 2).
 *
 * `persist()` used to run `repairWorkbenchDocument` (a full JSON deep clone +
 * document traversal) + `JSON.stringify` + a sync `localStorage.setItem` on
 * EVERY controller dispatch — including every step of a drag/resize gesture
 * stream. This test builds a realistic large document (6 layouts × 30 widgets
 * + 10 panel templates + 10 widget templates) and a 10× stress variant
 * (6 × 300 widgets), times each persist stage, and prints the numbers. The
 * decisions taken on the numbers are documented in axisWorkbenchStore.svelte.ts.
 *
 * `setItem` is approximated with a Map-backed store (the node test env has no
 * real localStorage); real browser localStorage adds a synchronous engine/disk
 * cost on top, so the measured stringify+set numbers are a LOWER bound.
 */

function makeWidget(layoutIdx: number, i: number): WidgetInstance {
  const zones = ['top.left', 'top.center', 'top.right', 'rail', 'bottom', 'gridbar'];
  return {
    id: `bench.widget.${layoutIdx}.${i}`,
    type: `bench.type.${i % 12}`,
    zone: zones[i % zones.length],
    order: i,
    size: (['default', 'compact', 'mini'] as const)[i % 3],
    binding: { kind: 'bench.binding', version: 1, target: { effectId: i, paramId: i * 3 } },
    state: { label: `Widget ${layoutIdx}/${i}`, overflowPriority: i % 5, custom: { a: i, b: `v${i}` } } as JsonObject
  };
}

function buildLargeDocument(widgetsPerLayout: number): WorkbenchDocument {
  const doc = createAxisWorkbenchDefaultDocument();
  const baseLayout = Object.values(doc.layouts)[0];
  for (let l = 0; l < 6; l += 1) {
    const layout = JSON.parse(JSON.stringify(baseLayout)) as WorkbenchLayout;
    layout.id = `bench.layout.${l}`;
    layout.label = `Bench Layout ${l}`;
    for (let i = 0; i < widgetsPerLayout; i += 1) {
      const widget = makeWidget(l, i);
      layout.widgets[widget.id] = widget;
    }
    doc.layouts[layout.id] = layout;
  }
  for (let t = 0; t < 10; t += 1) {
    doc.panelLibrary[`bench.paneltpl.${t}`] = {
      id: `bench.paneltpl.${t}`,
      title: `Panel Template ${t}`,
      panels: { [`bench.tplpanel.${t}`]: { id: `bench.tplpanel.${t}`, type: 'bench.panel', title: `Tpl ${t}` } }
    };
    doc.widgetLibrary[`bench.widgettpl.${t}`] = {
      id: `bench.widgettpl.${t}`,
      title: `Widget Template ${t}`,
      widgets: { [`bench.tplwidget.${t}`]: makeWidget(99, t) }
    };
  }
  return doc;
}

function timeAvgMs(iterations: number, run: () => void): number {
  // Warm-up so JIT/shape effects don't dominate the first sample.
  for (let i = 0; i < 3; i += 1) run();
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) run();
  return (performance.now() - start) / iterations;
}

function measure(label: string, widgetsPerLayout: number, iterations: number) {
  const doc = buildLargeDocument(widgetsPerLayout);
  const bytes = JSON.stringify(doc).length;
  const store = new Map<string, string>();

  const repairMs = timeAvgMs(iterations, () => void repairWorkbenchDocument(doc));
  const stringifyMs = timeAvgMs(iterations, () => void JSON.stringify(doc));
  const setItemMs = timeAvgMs(iterations, () => store.set('axs.workbench.doc', JSON.stringify(doc)));

  // eslint-disable-next-line no-console
  console.info(
    `[persist-cost] ${label}: ${bytes.toLocaleString('en')} bytes | ` +
      `repair ${repairMs.toFixed(3)} ms | stringify ${stringifyMs.toFixed(3)} ms | ` +
      `stringify+set(Map) ${setItemMs.toFixed(3)} ms | full persist ≈ ${(repairMs + setItemMs).toFixed(3)} ms/dispatch`
  );

  return { bytes, repairMs, stringifyMs, setItemMs };
}

describe('axis workbench persist cost (measurement, item 2)', () => {
  it('measures repair + stringify + setItem on a realistic large document', () => {
    const realistic = measure('6 layouts × 30 widgets + libraries', 30, 50);
    const stress = measure('10× stress: 6 layouts × 300 widgets + libraries', 300, 20);

    // Sanity only — no flaky perf assertions. The printed numbers are the deliverable.
    expect(realistic.bytes).toBeGreaterThan(50_000);
    expect(stress.bytes).toBeGreaterThan(realistic.bytes * 5);
    expect(realistic.repairMs).toBeGreaterThan(0);
    // Repair deep-clones the whole document; it must cost at least as much as a
    // bare stringify (it stringifies AND parses AND traverses). This documents
    // why dropping the per-dispatch repair is the meaningful trim.
    expect(stress.repairMs).toBeGreaterThan(stress.stringifyMs);
  });
});
