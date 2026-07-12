import { describe, expect, it } from 'vitest';
import {
  reduceWorkbenchDocument,
  repairWorkbenchDocument,
  selectActiveLayout,
  validateWorkbenchDocument,
  type WorkbenchLayout
} from '../../workbench/core';
import { createWorkbenchController } from '../../workbench';
import {
  AXIS_LAYOUT_PRESET_KINDS,
  AXIS_LAYOUT_TAB_KINDS,
  createAxisLayoutPreset,
  type AxisLayoutPresetKind
} from '../axisWorkbenchLayoutPresets';
import {
  AXIS_MOBILE_PROFILE_ID,
  AXIS_TABLET_PROFILE_ID,
  applyAxisLayoutPreset,
  copyAxisLayoutToProfile,
  seedAxisProfiles
} from '../axisWorkbenchLayoutActions';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import {
  AXIS_WORKBENCH_WIDGET_TYPES,
  AXIS_WORKBENCH_BASE_PANEL_TYPES
} from '../axisWorkbenchRegistryManifest';

const KNOWN_WIDGET_TYPES = new Set<string>(AXIS_WORKBENCH_WIDGET_TYPES);
const KNOWN_PANEL_TYPES = new Set<string>(AXIS_WORKBENCH_BASE_PANEL_TYPES);

function docWithPreset(kind: AxisLayoutPresetKind) {
  const doc = createAxisWorkbenchDefaultDocument();
  const layout = createAxisLayoutPreset(kind, { layoutId: 'axis.layout.test' });
  doc.layouts[layout.id] = layout;
  doc.profiles[doc.activeProfileId].layoutId = layout.id;
  return { doc, layout };
}

describe('Axis layout presets', () => {
  it('exposes the six design preset kinds', () => {
    expect(AXIS_LAYOUT_PRESET_KINDS).toEqual(['default', 'stage', 'studio', 'compact', 'tablet', 'mobile']);
    expect(AXIS_LAYOUT_TAB_KINDS).toEqual(['default', 'stage', 'studio', 'compact']);
  });

  for (const kind of AXIS_LAYOUT_PRESET_KINDS) {
    describe(`preset "${kind}"`, () => {
      const layout = createAxisLayoutPreset(kind, { layoutId: `axis.layout.${kind}` });

      it('carries the design shell flags in settings', () => {
        const settings = layout.settings ?? {};
        expect(settings.presetKind).toBe(kind);
        expect(['side', 'bottom']).toContain(settings.navMode);
        expect(['fixed', 'pages']).toContain(settings.contentMode);
        expect(['flyout', 'page']).toContain(settings.presetMode);
        expect(typeof settings.rightW).toBe('number');
      });

      it('references only known widget types', () => {
        for (const widget of Object.values(layout.widgets)) {
          expect(KNOWN_WIDGET_TYPES.has(widget.type), `unknown widget type ${widget.type}`).toBe(true);
        }
      });

      it('references only known panel types and keeps singleton keys', () => {
        const singletons = new Map<string, number>();
        for (const panel of Object.values(layout.panels)) {
          expect(KNOWN_PANEL_TYPES.has(panel.type), `unknown panel type ${panel.type}`).toBe(true);
          if (panel.singletonKey) singletons.set(panel.singletonKey, (singletons.get(panel.singletonKey) ?? 0) + 1);
        }
        // The grid panel is always present, locked, and non-closable.
        const grid = layout.panels['axis.signalGrid'];
        expect(grid).toBeDefined();
        expect(grid.locked).toBe(true);
        expect(grid.closable).toBe(false);
        // Every singleton key appears exactly once in the roster.
        for (const [key, count] of singletons) expect(count, `singleton ${key}`).toBe(1);
      });

      it('validates clean as the active layout (after repair, the real load path)', () => {
        // The document is always repaired before use (controller construction /
        // setDocument deep-clone away the template↔layout aliasing that the raw
        // default doc carries), so validate the repaired form — matching runtime.
        const { doc } = docWithPreset(kind);
        const result = validateWorkbenchDocument(repairWorkbenchDocument(doc));
        expect(result.valid, JSON.stringify(result.issues)).toBe(true);
      });

      it('is repair-idempotent', () => {
        const { doc } = docWithPreset(kind);
        const once = repairWorkbenchDocument(doc);
        const twice = repairWorkbenchDocument(once);
        expect(JSON.stringify(twice.layouts['axis.layout.test'])).toBe(
          JSON.stringify(once.layouts['axis.layout.test'])
        );
      });

      it('keeps widget groups with at least two members (repair does not drop them)', () => {
        const { doc } = docWithPreset(kind);
        const repaired = repairWorkbenchDocument(doc);
        const repairedLayout = repaired.layouts['axis.layout.test'] as WorkbenchLayout;
        for (const group of Object.values(repairedLayout.widgetGroups)) {
          expect(group.widgetIds.length).toBeGreaterThanOrEqual(2);
        }
        // No widget points at a missing group.
        for (const widget of Object.values(repairedLayout.widgets)) {
          if (widget.groupId) expect(repairedLayout.widgetGroups[widget.groupId]).toBeDefined();
        }
      });

      it('always keeps the grid visible in the dock', () => {
        const { layout: presetLayout } = docWithPreset(kind);
        const docked = Object.values(presetLayout.pages[presetLayout.activePageId].dock.root)
          .flatMap((node) => (node && node.kind === 'tabs' ? node.panelIds : []));
        expect(docked).toContain('axis.signalGrid');
      });
    });
  }

  it('default preset groups tuner+tempo+cpu (design group:"status")', () => {
    const layout = createAxisLayoutPreset('default', { layoutId: 'axis.layout.status' });
    const groups = Object.values(layout.widgetGroups);
    expect(groups.length).toBe(1);
    expect(groups[0].widgetIds.sort()).toEqual(
      ['axis.widget.cpu', 'axis.widget.tempo', 'axis.widget.tuner'].sort()
    );
  });

  it('stage/tablet/mobile use page preset mode and drop the docked preset browser', () => {
    for (const kind of ['stage', 'tablet', 'mobile'] as const) {
      const layout = createAxisLayoutPreset(kind, { layoutId: `axis.layout.${kind}` });
      expect(layout.settings?.presetMode).toBe('page');
      const docked = Object.values(layout.pages[layout.activePageId].dock.root)
        .flatMap((node) => (node && node.kind === 'tabs' ? node.panelIds : []));
      expect(docked).not.toContain('axis.presetBrowser');
    }
  });

  it('studio docks the block editor to the right region', () => {
    const layout = createAxisLayoutPreset('studio', { layoutId: 'axis.layout.studio' });
    const right = layout.pages[layout.activePageId].dock.root.right;
    expect(right?.kind).toBe('tabs');
    expect(right && right.kind === 'tabs' ? right.panelIds : []).toContain('axis.blockEditor');
  });
});

describe('applyAxisLayoutPreset', () => {
  it('replaces the active profile layout and preserves rightW', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    // Give the active layout a known rightW.
    const activeLayoutId = controller.activeProfile!.layoutId;
    controller.document.layouts[activeLayoutId].settings = { rightW: 512 };

    const result = applyAxisLayoutPreset(controller, 'studio');
    expect(result.success).toBe(true);
    const layout = selectActiveLayout(controller.document);
    expect(layout?.id).toBe(result.layoutId);
    // studio's default rightW is 400, but the active 512 is preserved.
    expect(layout?.settings?.rightW).toBe(512);
    expect(layout?.settings?.presetKind).toBe('studio');
  });

  it('produces a valid document after applying every layout tab', () => {
    for (const kind of AXIS_LAYOUT_TAB_KINDS) {
      const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
      const result = applyAxisLayoutPreset(controller, kind);
      expect(result.success, `apply ${kind}`).toBe(true);
      expect(validateWorkbenchDocument(controller.document).valid, `valid after ${kind}`).toBe(true);
    }
  });

  it('mints a fresh layout id that never collides with existing layouts', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    const before = new Set(Object.keys(controller.document.layouts));
    const result = applyAxisLayoutPreset(controller, 'compact');
    expect(before.has(result.layoutId!)).toBe(false);
  });
});

describe('seedAxisProfiles', () => {
  it('creates tablet and mobile profiles once, idempotently', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    seedAxisProfiles(controller);
    expect(controller.document.profiles[AXIS_TABLET_PROFILE_ID]).toBeDefined();
    expect(controller.document.profiles[AXIS_MOBILE_PROFILE_ID]).toBeDefined();
    expect(controller.document.profiles[AXIS_TABLET_PROFILE_ID].breakpoint).toBe('tablet');
    expect(controller.document.profiles[AXIS_MOBILE_PROFILE_ID].breakpoint).toBe('phone');

    const layoutCount = Object.keys(controller.document.layouts).length;
    seedAxisProfiles(controller);
    expect(Object.keys(controller.document.layouts).length).toBe(layoutCount);
    expect(validateWorkbenchDocument(controller.document).valid).toBe(true);
  });

  it('each seeded profile points at an existing layout', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    seedAxisProfiles(controller);
    for (const id of [AXIS_TABLET_PROFILE_ID, AXIS_MOBILE_PROFILE_ID]) {
      const profile = controller.document.profiles[id];
      expect(controller.document.layouts[profile.layoutId]).toBeDefined();
    }
  });
});

describe('copyAxisLayoutToProfile', () => {
  it('clones the active layout into a target profile under a fresh id', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    seedAxisProfiles(controller);
    const sourceLayoutId = controller.activeProfile!.layoutId;
    const result = copyAxisLayoutToProfile(controller, AXIS_TABLET_PROFILE_ID);
    expect(result.success).toBe(true);
    expect(result.layoutId).not.toBe(sourceLayoutId);
    expect(controller.document.profiles[AXIS_TABLET_PROFILE_ID].layoutId).toBe(result.layoutId);
    expect(validateWorkbenchDocument(controller.document).valid).toBe(true);
  });
});

describe('preset reducer round-trip', () => {
  it('layout.save + profile.setLayout accept a preset without error', () => {
    let doc = createAxisWorkbenchDefaultDocument();
    const layout = createAxisLayoutPreset('stage', { layoutId: 'axis.layout.roundtrip' });
    const saved = reduceWorkbenchDocument(doc, { type: 'layout.save', layout });
    expect(saved.success).toBe(true);
    doc = saved.next;
    const applied = reduceWorkbenchDocument(doc, {
      type: 'profile.setLayout',
      profileId: doc.activeProfileId,
      layoutId: layout.id
    });
    expect(applied.success).toBe(true);
    expect(validateWorkbenchDocument(repairWorkbenchDocument(applied.next)).valid).toBe(true);
  });
});
