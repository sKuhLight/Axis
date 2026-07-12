import type { Page, Route } from '@playwright/test';

// A self-contained, in-memory ForgeFX grid backend for e2e. The dev :5056 backend is the operator's
// LIVE FM3, so routing e2e MUST NOT reach it — this intercepts every /api call and answers from a
// synthetic grid, capturing the mutation requests (cell placements + cable edits) so a spec can assert
// what a drag committed WITHOUT any write leaving the browser.

export interface GridMock {
  /** Captured `PUT /preset/grid/cell` bodies (1-indexed row/col; blockId 0 = clear). */
  cellWrites: { row: number; col: number; blockId: number }[];
  /** Captured `POST /preset/grid/cable` bodies (1-indexed). */
  cableWrites: { srcRow: number; srcCol: number; destRow: number; connect: boolean }[];
  reset(): void;
}

/** One occupied cell of the synthetic grid (0-indexed, like the decoded /preset/grid). */
interface Cell {
  row: number;
  col: number;
  effectId: number;
  name: string;
  slug: string | null;
  isShunt: boolean;
  fromRows: number[];
}

// A compact FM3-like grid (4 rows × 6 cols) with two independent chains:
//   row 0: PEQ 1 → PEQ 2 → (empty) → (empty)      — the multi-column connect subject
//   row 2: Drive → SHUNT → Delay                  — the drop-on-shunt subject
//   row 1: Comp (isolated)                        — a block to drag onto the shunt
const SHUNT_BASE = 1024;
function seedCells(): Cell[] {
  return [
    { row: 0, col: 0, effectId: 100, name: 'PEQ 1', slug: 'PEQ', isShunt: false, fromRows: [] },
    { row: 0, col: 1, effectId: 101, name: 'PEQ 2', slug: 'PEQ', isShunt: false, fromRows: [0] },
    { row: 1, col: 0, effectId: 300, name: 'Comp 1', slug: 'Comp', isShunt: false, fromRows: [] },
    { row: 2, col: 0, effectId: 200, name: 'Drive 1', slug: 'Drive', isShunt: false, fromRows: [] },
    { row: 2, col: 1, effectId: SHUNT_BASE, name: 'Shunt', slug: null, isShunt: true, fromRows: [2] },
    { row: 2, col: 2, effectId: 201, name: 'Delay 1', slug: 'Delay', isShunt: false, fromRows: [2] },
  ];
}

const CAPS = {
  slotModel: 'grid',
  slotCount: 512,
  grid: { rows: 4, cols: 6 },
  hasScenes: false,
  sceneCount: 0,
  hasChannels: false,
  channelNames: [],
  channelBlocks: [],
  supportsSave: true,
  gridRouting: true,
  gridCursorSelect: false,
  shuntBase: SHUNT_BASE,
};

const DEVICE = {
  model: 'FM3',
  modelByte: '0x0A',
  modelId: 10,
  apiVersion: 2,
  capabilities: CAPS,
  firmware: null,
  port: 'mock',
};

const DETECT = { connected: true, modelId: 10, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };

function gridPayload(cells: Cell[]) {
  return {
    model: 'FM3',
    name: 'MOCK ROUTE',
    crcValid: true,
    rows: 4,
    cols: 6,
    scenes: [],
    cells: cells.map((c) => ({
      row: c.row,
      col: c.col,
      effectId: c.effectId,
      name: c.name,
      slug: c.slug,
      isShunt: c.isShunt,
      routeFlag: c.fromRows.reduce((m, r) => m | (1 << r), 0),
      fromRows: c.fromRows,
    })),
  };
}

/** Install the mock on a page. Call BEFORE navigation (bootCleanWorkbench). */
export async function installGridMock(page: Page): Promise<GridMock> {
  const cells = seedCells();
  const mock: GridMock = {
    cellWrites: [],
    cableWrites: [],
    reset() {
      this.cellWrites.length = 0;
      this.cableWrites.length = 0;
    },
  };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();

    // ── reads the boot + load path depends on ──
    if (path === '/device') return json(route, DEVICE);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset/grid' && method === 'GET') return json(route, gridPayload(cells));
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });

    // ── mutations: CAPTURE, never forward to a device ──
    if (path === '/preset/grid/cell' && method === 'PUT') {
      const b = req.postDataJSON() as { row: number; col: number; blockId: number };
      mock.cellWrites.push(b);
      return json(route, { ok: true });
    }
    if (path === '/preset/grid/cable' && method === 'POST') {
      const b = req.postDataJSON() as { srcRow: number; srcCol: number; destRow: number; connect: boolean };
      mock.cableWrites.push(b);
      return json(route, { ok: true });
    }
    if (path === '/preset/grid/select') return json(route, { ok: true });

    // ── everything else: benign empty object (all boot reads are try/catch-guarded) ──
    return json(route, {});
  });

  // The live event stream would hang; keep it from reaching the dev backend.
  await page.route('**/api/events', (route) => route.abort());

  return mock;
}
