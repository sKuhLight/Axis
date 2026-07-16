import { describe, expect, it } from 'vitest';
import {
  panelIdsInPageDock,
  repairWorkbenchDocument,
  validateWorkbenchDocument,
  type DockLayout,
  type WorkbenchDocument
} from '../../workbench/core';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { createAxisLayoutPreset, AXIS_LAYOUT_PRESET_KINDS } from '../axisWorkbenchLayoutPresets';
import {
  AXIS_PAGE_CONTROLLERS,
  AXIS_PAGE_CONVERT,
  AXIS_PAGE_FC,
  AXIS_PAGE_GRID,
  AXIS_PAGE_LIVE,
  AXIS_PAGE_PRESET_BROWSER,
  AXIS_PAGE_SCENES,
  AXIS_PAGE_SETUP,
  AXIS_SEED_PAGES_MARKER,
  AXIS_SEED_PAGE_ORDER,
  ensureAxisSeedPages
} from '../axisWorkbenchPages';

// The seven nav-bound seed pages plus the nav-less converter page (M4), which is seeded on every layout
// so it can be activated on demand but carries no navigation entry.
const ALL_SEED_PAGES = [
  AXIS_PAGE_GRID,
  AXIS_PAGE_PRESET_BROWSER,
  AXIS_PAGE_FC,
  AXIS_PAGE_CONTROLLERS,
  AXIS_PAGE_SCENES,
  AXIS_PAGE_LIVE,
  AXIS_PAGE_SETUP,
  AXIS_PAGE_CONVERT
];

describe('ROUND 15 — default document seed pages', () => {
  const doc = createAxisWorkbenchDefaultDocument();
  const layout = Object.values(doc.layouts)[0];

  it('seeds all seven pages with Grid active and in canonical order', () => {
    expect(Object.keys(layout.pages).sort()).toEqual([...ALL_SEED_PAGES].sort());
    expect(layout.pageOrder).toEqual([...AXIS_SEED_PAGE_ORDER]);
    expect(layout.activePageId).toBe(AXIS_PAGE_GRID);
  });

  it('Grid page docks Signal Grid (main) + Block Editor (bottom) and nothing else', () => {
    const grid = layout.pages[AXIS_PAGE_GRID];
    expect(grid.dock.root.main?.kind).toBe('tabs');
    expect(panelIdsInPageDock(grid).sort()).toEqual(['axis.blockEditor', 'axis.signalGrid']);
    expect(grid.dock.regions.bottom.sizePx).toBe(360);
  });

  it('each secondary page docks its single full-size panel in main', () => {
    const expected: Record<string, string> = {
      [AXIS_PAGE_PRESET_BROWSER]: 'axis.presetBrowser',
      [AXIS_PAGE_FC]: 'axis.fc',
      [AXIS_PAGE_CONTROLLERS]: 'axis.controllers',
      [AXIS_PAGE_SCENES]: 'axis.scenes',
      [AXIS_PAGE_LIVE]: 'axis.live',
      [AXIS_PAGE_SETUP]: 'axis.setup'
    };
    for (const [pageId, panelId] of Object.entries(expected)) {
      const page = layout.pages[pageId];
      expect(panelIdsInPageDock(page)).toEqual([panelId]);
      expect(page.dock.root.main?.kind).toBe('tabs');
      expect(layout.panels[panelId]).toBeDefined();
    }
  });

  it('binds the seven nav entries to their pages and keeps Theme/Account as actions', () => {
    const entries = layout.navigation.entries;
    expect(entries.grid.pageId).toBe(AXIS_PAGE_GRID);
    expect(entries.grid.target).toBeUndefined();
    expect(entries.library.pageId).toBe(AXIS_PAGE_PRESET_BROWSER);
    expect(entries.fc.pageId).toBe(AXIS_PAGE_FC);
    expect(entries.setup.pageId).toBe(AXIS_PAGE_SETUP);
    // Theme + Axis Cloud stay ACTION entries (no page binding).
    expect(entries.theme.pageId).toBeUndefined();
    expect(entries.theme.target?.command).toBe('axis.openTheme');
    expect(entries.account.pageId).toBeUndefined();
    expect(entries.account.target?.command).toBe('axis.openAccount');
    expect(entries.account.fixedSlot).toBe('rail.footer');
  });

  it('validates clean after repair (all pages, layout-wide panel/node uniqueness)', () => {
    expect(validateWorkbenchDocument(repairWorkbenchDocument(doc)).valid).toBe(true);
  });

  it('carries the seed-pages migration marker so migration is a no-op on it', () => {
    expect(doc.metadata?.[AXIS_SEED_PAGES_MARKER]).toBe('v1');
  });
});

describe('ROUND 15 — every preset seeds the full page set', () => {
  for (const kind of AXIS_LAYOUT_PRESET_KINDS) {
    it(`preset "${kind}" has all seven pages, Grid active, nav bound, and validates`, () => {
      const layout = createAxisLayoutPreset(kind, { layoutId: `l.${kind}` });
      expect(Object.keys(layout.pages).sort()).toEqual([...ALL_SEED_PAGES].sort());
      expect(layout.activePageId).toBe(AXIS_PAGE_GRID);
      expect(layout.navigation.entries.library.pageId).toBe(AXIS_PAGE_PRESET_BROWSER);
      // Grid page never docks the Preset Browser or FC (they own their own pages).
      const gridPanels = panelIdsInPageDock(layout.pages[AXIS_PAGE_GRID]);
      expect(gridPanels).not.toContain('axis.presetBrowser');
      expect(gridPanels).not.toContain('axis.fc');
      expect(gridPanels).toContain('axis.signalGrid');

      // Compose into a document and validate the whole thing after repair.
      const doc = createAxisWorkbenchDefaultDocument();
      doc.layouts[layout.id] = layout;
      doc.profiles[doc.activeProfileId].layoutId = layout.id;
      expect(validateWorkbenchDocument(repairWorkbenchDocument(doc)).valid).toBe(true);
    });
  }
});

// ── Migration of persisted pre-Pages documents ───────────────────────────────

/** A schema-v1-style Axis doc: one 'main' page (grid + editor + a docked PB), unbound nav. */
function legacyPersistedDoc(mode: 'side' | 'bottom' = 'side'): WorkbenchDocument {
  const dock: DockLayout = {
    regions: {
      left: { collapsed: false, sizePx: 320 },
      right: { collapsed: false },
      top: { collapsed: false },
      bottom: { collapsed: false, sizePx: 300 },
      main: { collapsed: false }
    },
    root: {
      left: { kind: 'tabs', id: 'n.left', panelIds: ['axis.presetBrowser'], activePanelId: 'axis.presetBrowser' },
      right: null,
      top: null,
      bottom: { kind: 'tabs', id: 'n.bottom', panelIds: ['axis.blockEditor'], activePanelId: 'axis.blockEditor' },
      main: { kind: 'tabs', id: 'n.main', panelIds: ['axis.signalGrid'], activePanelId: 'axis.signalGrid' }
    }
  };
  const raw = {
    schemaVersion: 2,
    activeProfileId: 'p',
    profiles: { p: { id: 'p', label: 'P', layoutId: 'l' } },
    layouts: {
      l: {
        id: 'l',
        label: 'L',
        pages: { main: { id: 'main', label: 'Main', dock } },
        pageOrder: ['main'],
        activePageId: 'main',
        panels: {
          'axis.signalGrid': { id: 'axis.signalGrid', type: 'axis.signalGrid', title: 'Signal Grid', locked: true, closable: false, singletonKey: 'axis.signalGrid' },
          'axis.blockEditor': { id: 'axis.blockEditor', type: 'axis.blockEditor', title: 'Block Editor', singletonKey: 'axis.blockEditor' },
          'axis.presetBrowser': { id: 'axis.presetBrowser', type: 'axis.presetBrowser', title: 'Preset Browser', singletonKey: 'axis.presetBrowser' }
        },
        widgets: {},
        widgetGroups: {},
        navigation: {
          mode,
          entries: {
            grid: { id: 'grid', label: 'Grid', target: { command: 'axis.openGrid' } },
            library: { id: 'library', label: 'Preset Browser', target: { command: 'axis.openPresetBrowser' } }
          },
          order: ['grid', 'library']
        },
        zones: {}
      }
    },
    panelLibrary: {},
    widgetLibrary: {},
    metadata: {}
  } as unknown as WorkbenchDocument;
  // Framework repair is the real load path; it wraps the shape into valid pages.
  return repairWorkbenchDocument(raw);
}

describe('ROUND 15 — ensureAxisSeedPages migration', () => {
  it('turns the existing dock into the Grid page and adds the six other pages', () => {
    const migrated = ensureAxisSeedPages(legacyPersistedDoc());
    const layout = Object.values(migrated.layouts)[0];

    expect(Object.keys(layout.pages).sort()).toEqual([...ALL_SEED_PAGES].sort());
    expect(layout.activePageId).toBe(AXIS_PAGE_GRID);

    // The Grid page keeps the grid + editor; the docked Preset Browser was pulled
    // out so it lands cleanly on its own page.
    const gridPanels = panelIdsInPageDock(layout.pages[AXIS_PAGE_GRID]);
    expect(gridPanels).toContain('axis.signalGrid');
    expect(gridPanels).toContain('axis.blockEditor');
    expect(gridPanels).not.toContain('axis.presetBrowser');
    expect(panelIdsInPageDock(layout.pages[AXIS_PAGE_PRESET_BROWSER])).toEqual(['axis.presetBrowser']);
  });

  it('binds nav entries to pages and adds the missing page panels', () => {
    const migrated = ensureAxisSeedPages(legacyPersistedDoc());
    const layout = Object.values(migrated.layouts)[0];
    expect(layout.navigation.entries.grid.pageId).toBe(AXIS_PAGE_GRID);
    expect(layout.navigation.entries.grid.target).toBeUndefined();
    expect(layout.navigation.entries.setup.pageId).toBe(AXIS_PAGE_SETUP);
    // The four page panels that used to be minted on demand now exist.
    for (const panelId of ['axis.setup', 'axis.controllers', 'axis.scenes', 'axis.live']) {
      expect(layout.panels[panelId]).toBeDefined();
    }
  });

  it('preserves the navigation mode', () => {
    const migrated = ensureAxisSeedPages(legacyPersistedDoc('bottom'));
    const layout = Object.values(migrated.layouts)[0];
    expect(layout.navigation.mode).toBe('bottom');
  });

  it('sets the marker and is idempotent (a second pass is a no-op)', () => {
    const once = ensureAxisSeedPages(legacyPersistedDoc());
    expect(once.metadata?.[AXIS_SEED_PAGES_MARKER]).toBe('v1');
    const beforePages = JSON.stringify(Object.values(once.layouts)[0].pages);
    const twice = ensureAxisSeedPages(once);
    expect(JSON.stringify(Object.values(twice.layouts)[0].pages)).toBe(beforePages);
  });

  it('produces a document that validates clean after repair', () => {
    const migrated = repairWorkbenchDocument(ensureAxisSeedPages(legacyPersistedDoc()));
    expect(validateWorkbenchDocument(migrated).valid).toBe(true);
  });

  it('leaves an already-seeded document untouched (marker present)', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const before = JSON.stringify(doc.layouts);
    const after = ensureAxisSeedPages(doc);
    expect(JSON.stringify(after.layouts)).toBe(before);
  });
});
