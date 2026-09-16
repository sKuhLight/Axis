import { describe, expect, it } from 'vitest';
import {
  reduceWorkbenchDocument,
  repairWorkbenchDocument,
  validateWorkbenchDocument,
  type WorkbenchLayout
} from '../../workbench/core';
import { createWorkbenchController, selectActiveLayout } from '../../workbench';
import {
  AXIS_LAYOUT_PRESET_KINDS,
  createAxisLayoutPreset,
  type AxisLayoutPresetKind
} from '../axisWorkbenchLayoutPresets';
import {
  AXIS_MOBILE_PROFILE_ID,
  AXIS_TABLET_PROFILE_ID,
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
  it('exposes a single default preset kind', () => {
    expect(AXIS_LAYOUT_PRESET_KINDS).toEqual(['default']);
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

  it('seeds the same top bar as the default document, so it cannot differ by screen size', () => {
    const topBar = (layout: WorkbenchLayout) =>
      Object.fromEntries(
        Object.values(layout.widgets)
          .filter((widget) => widget.zone.startsWith('top.'))
          .map((widget) => [
            widget.id,
            { type: widget.type, zone: widget.zone, size: widget.size, state: widget.state ?? null }
          ])
      );

    const defaultLayout = selectActiveLayout(createAxisWorkbenchDefaultDocument()) as WorkbenchLayout;
    const presetLayout = createAxisLayoutPreset('default', { layoutId: 'axis.layout.topbar' });

    expect(topBar(presetLayout)).toEqual(topBar(defaultLayout));
    // The canonical bar is ungrouped (the retired `status` group wrapped the desktop
    // status chips in chrome the desktop bar never had).
    expect(Object.keys(presetLayout.widgetGroups)).toHaveLength(0);
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
    const layout = createAxisLayoutPreset('default', { layoutId: 'axis.layout.roundtrip' });
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
