import { describe, expect, it } from 'vitest';
import {
  WORKBENCH_SCHEMA_VERSION,
  WORKBENCH_PACKAGE_VERSION,
  canDeleteProfile,
  createBoundWidgetCommand,
  createCustomPanelCommands,
  createEmptyWorkbenchDocument,
  createParameterWidgetCommand,
  createLayoutSnapshot,
  createFailedActionPanelCommand,
  createMissingActionPanelCommand,
  createWorkbenchBindingRegistry,
  createWorkbenchPackage,
  createWorkbenchController,
  createWorkbenchRenderRegistry,
  PANEL_REGION_MOVE_OPTIONS,
  pickWidgetSize,
  workbenchThemeStyle
} from '../index';

describe('workbench public exports', () => {
  it('exposes core and Svelte foundation APIs from the top-level barrel', () => {
    expect(WORKBENCH_SCHEMA_VERSION).toBe(2);
    expect(WORKBENCH_PACKAGE_VERSION).toBe(1);
    expect(canDeleteProfile).toBeTypeOf('function');
    expect(createBoundWidgetCommand).toBeTypeOf('function');
    expect(createCustomPanelCommands).toBeTypeOf('function');
    expect(createEmptyWorkbenchDocument).toBeTypeOf('function');
    expect(createParameterWidgetCommand).toBeTypeOf('function');
    expect(createLayoutSnapshot).toBeTypeOf('function');
    expect(createFailedActionPanelCommand).toBeTypeOf('function');
    expect(createMissingActionPanelCommand).toBeTypeOf('function');
    expect(createWorkbenchBindingRegistry).toBeTypeOf('function');
    expect(createWorkbenchPackage).toBeTypeOf('function');
    expect(createWorkbenchController).toBeTypeOf('function');
    expect(createWorkbenchRenderRegistry).toBeTypeOf('function');
    expect(PANEL_REGION_MOVE_OPTIONS.map((option) => option.id)).toContain('main');
    expect(pickWidgetSize(160)).toBe('default');
    expect(workbenchThemeStyle({ name: 'Test', vars: { '--aw-bg': '#000' } })).toBe('--aw-bg: #000');
  });
});
