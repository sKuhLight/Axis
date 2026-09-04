// Structural sweep of EVERY device page through the board builder.
//
// The per-page fixtures in `deviceLayoutBoard.test.ts` are pinned to pages someone looked at, screenshotted
// and patched — which is precisely why layout bugs kept surfacing one block at a time: a page nobody had
// opened yet was never checked by anything. This runs all ~3000 served pages across all three devices and
// asserts the invariants that make a page readable at all, so a placement change that breaks an unexamined
// page fails here instead of in a screenshot weeks later.
//
// Reads the generated layout data from the sibling `forgefx-midi` checkout (CI's build-stack composite
// checks it out and builds `dist/` before `npm test`). When the sibling is absent — a solo Axis checkout —
// the suite skips rather than failing, and says so.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildDeviceLayoutBoard, type BoardCtl } from './deviceLayoutBoard';
import { controlPx, isPanelCluster } from './deviceGeometry';
import type { DeviceLayout, LayoutControl } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIDI = resolve(HERE, '../../../forgefx-midi/dist/gen3');
const DEVICES = ['axe-fx-iii', 'fm9', 'fm3'] as const;
const available = DEVICES.filter((d) => existsSync(`${MIDI}/${d}/layouts.generated.js`));

/** The generated module is a single `export const <DEV>_LAYOUTS = {…}` object literal — read it directly
 *  rather than importing, so this test needs no build step of its own and no dynamic-import plumbing. */
function loadLayouts(device: string): Record<string, { family: string; variants?: { name?: string; pages?: DeviceLayout['pages'] }[] }> {
  const src = readFileSync(`${MIDI}/${device}/layouts.generated.js`, 'utf8');
  const start = src.indexOf('{', src.indexOf('export const'));
  const end = src.lastIndexOf('}');
  return new Function(`return (${src.slice(start, end + 1)});`)();
}

/** A catalog covering everything the page could bind to, so the sweep exercises PLACEMENT rather than
 *  accidentally testing how the builder degrades when a control has no entry. Widths mirror the real
 *  ControlSurface catalog (select 2 wide, graph 4x2, meter strip 4x1) — those are what make placement
 *  collide, so a narrower stand-in would hide the bugs this is looking for. */
function catalogFor(pages: DeviceLayout['pages']): BoardCtl[] {
  const out = new Map<string, BoardCtl>();
  const add = (c: BoardCtl) => { if (!out.has(c.key)) out.set(c.key, c); };
  for (const pg of pages ?? [])
    for (const row of pg.rows ?? [])
      for (const c of row.controls ?? []) {
        if (c.paramId == null) continue;
        if (c.widget === 'dropdown')
          add({ key: `e${c.paramId}`, kind: 'select', id: c.paramId, w: 2, h: 1, view: 'select', views: ['select'] });
        else if (c.widget === 'toggle')
          add({ key: `e${c.paramId}`, kind: 'toggle', id: c.paramId, w: 1, h: 1, view: 'button', views: ['button', 'switch'] });
        else if (c.widget === 'meter')
          add({ key: `m${c.paramId}`, kind: 'meterH', id: c.paramId, w: 4, h: 1, view: 'meterH', views: ['meterH'] });
        else
          add({ key: `k${c.paramId}`, kind: 'cont', id: c.paramId, w: 1, h: 1, view: 'knob', views: ['knob', 'fader', 'slider', 'number'] });
      }
  add({ key: 'bypass', kind: 'action', id: -2, w: 2, h: 1, view: 'action', views: ['action'] });
  add({ key: 'meter', kind: 'meter', id: -3, w: 1, h: 2, view: 'meter', views: ['meter'] });
  return [...out.values()];
}

type Page = { device: string; family: string; variant: string; page: string; pages: DeviceLayout['pages'] };

function allPages(): Page[] {
  const out: Page[] = [];
  for (const device of available) {
    const layouts = loadLayouts(device);
    for (const block of Object.values(layouts))
      for (const v of block.variants ?? [])
        for (const pg of v.pages ?? [])
          out.push({
            device,
            family: block.family,
            variant: v.name ?? '',
            page: pg.name ?? '',
            // one page at a time, so a failure names the page rather than a whole block
            pages: [pg]
          });
  }
  return out;
}

const COLS = 12;

describe.skipIf(!available.length)(
  `device layout sweep (${available.length ? available.join(', ') : 'sibling forgefx-midi not checked out — SKIPPED'})`,
  () => {
    const pages = allPages();

    it('has real pages to sweep', () => {
      expect(pages.length).toBeGreaterThan(500);
    });

    /** Pages the device composed in pixels rather than columns — see `isPanelCluster`. The column grid
     *  cannot express them (their controls sit closer together than half a column), so they are held to a
     *  weaker invariant here and pinned by name in the test below: a change to the classifier that quietly
     *  moved a page in or out of this set would otherwise go unnoticed. */
    const panelPages = new Set<string>();
    for (const p of pages)
      for (const row of p.pages![0].rows ?? []) {
        if (row.section === 'mixer') continue;
        const xs = (row.controls ?? [])
          .filter((c: LayoutControl) => c.widget !== 'spacer' && c.placement?.positionExact)
          .map((c: LayoutControl) => controlPx(c, 0));
        if (isPanelCluster(xs, COLS)) panelPages.add(`${p.device}/${p.family}/${p.page}`);
      }

    const overlapsOf = (p: Page): string[] => {
      const board = buildDeviceLayoutBoard({ family: p.family, pages: p.pages } as DeviceLayout, catalogFor(p.pages), COLS);
      if (!board) return [];
      const bad: string[] = [];
      for (const [name, ws] of Object.entries(board.boards)) {
        const seen = new Map<string, string>();
        for (const w of ws) {
          if (w.rail) continue;
          for (let y = w.y; y < w.y + w.h; y++)
            for (let x = w.x; x < w.x + w.w; x++) {
              const cell = `${x},${y}`;
              const prev = seen.get(cell);
              if (prev) bad.push(`${p.device} ${p.family}/${p.page} [${name}] ${prev} ∩ ${w.key} @ ${cell}`);
              else seen.set(cell, w.key);
            }
        }
      }
      return bad;
    };

    it('never overlaps two controls on any grid-shaped page of any device', () => {
      const bad: string[] = [];
      for (const p of pages) {
        if (panelPages.has(`${p.device}/${p.family}/${p.page}`)) continue;
        bad.push(...overlapsOf(p));
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });

    it('pins exactly which pages the column grid cannot lay out without overlap', () => {
      // Every page here is pixel-composed, so this is a statement of the grid's limit, not a tolerated bug —
      // and the list is short and named, so a regression that adds an ordinary page to it fails loudly.
      const overlapping = [...new Set(pages.filter((p) => overlapsOf(p).length).map((p) => `${p.family}/${p.page}`))].sort();
      expect(overlapping).toEqual([
        'CONTROLLERS/CS per Scene',
        'FC/Devices',
        'MIDIBLOCK/One Scene',
        'VOCODER/Level',
        'VOCODER/Pan'
      ]);
      for (const p of pages)
        if (overlapsOf(p).length) expect(panelPages.has(`${p.device}/${p.family}/${p.page}`)).toBe(true);
    });

    it('never places a control past the right edge of the grid', () => {
      const bad: string[] = [];
      for (const p of pages) {
        const board = buildDeviceLayoutBoard({ family: p.family, pages: p.pages } as DeviceLayout, catalogFor(p.pages), COLS);
        if (!board) continue;
        for (const [name, ws] of Object.entries(board.boards))
          for (const w of ws)
            if (!w.rail && w.x + w.w > COLS) bad.push(`${p.device} ${p.family}/${p.page} [${name}] ${w.key} ends at ${w.x + w.w} > ${COLS}`);
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });

    it('never sweeps a control the page itself placed onto the trailing "More" page', () => {
      // "More" exists to catch catalog entries the LAYOUT never mentioned. A control the layout does place
      // landing there means placement silently dropped it — the failure mode that hid INPUT BOOST,
      // SATURATION and the cab headings for as long as it did.
      const bad: string[] = [];
      for (const p of pages) {
        const board = buildDeviceLayoutBoard({ family: p.family, pages: p.pages } as DeviceLayout, catalogFor(p.pages), COLS);
        if (!board) continue;
        // The sweep page is whatever the builder APPENDED — several devices ship a real page of their own
        // literally named "More" (MEGATAP, PHASER), which `uniqName` keeps and suffixes the synthetic one
        // instead. Since exactly one device page goes in, anything past index 0 is the sweep.
        const morePage = board.pageOrder[1];
        if (!morePage) continue;
        const authored = new Set<number>();
        for (const row of p.pages![0].rows ?? []) for (const c of row.controls ?? []) if (c.paramId != null) authored.add(c.paramId);
        for (const w of board.boards[morePage] ?? []) {
          const id = Number(w.key.slice(1));
          if (/^[kem]\d+$/.test(w.key) && authored.has(id)) bad.push(`${p.device} ${p.family}/${p.page} swept ${w.key} to "${morePage}"`);
        }
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });

    it('reports how many pages are pixel-composed rather than grid-shaped (the panel tier census)', () => {
      // Not a threshold — a census. It documents how much of the catalog the grid genuinely cannot express,
      // and turns a silent change in that number into a visible diff.
      const panels = new Set<string>();
      const total = new Set<string>();
      for (const p of pages) {
        total.add(`${p.device}/${p.family}/${p.page}`);
        for (const row of p.pages![0].rows ?? []) {
          if (row.section === 'mixer') continue;
          const xs = (row.controls ?? [])
            .filter((c: LayoutControl) => c.widget !== 'spacer' && c.placement?.positionExact)
            .map((c: LayoutControl) => controlPx(c, 0));
          if (isPanelCluster(xs, COLS)) panels.add(`${p.device}/${p.family}/${p.page}`);
        }
      }
      const pct = Math.round((panels.size / total.size) * 100);
      expect({ pages: total.size, pixelComposed: panels.size, pct }).toMatchObject({ pages: total.size });
      expect(pct).toBeLessThan(40); // a sanity bound: most pages are grid-shaped, and must stay so
    });
  }
);
