import { describe, expect, it } from 'vitest';
import {
  isAxisControlArrangeEnabled,
  isAxisLayoutEditingEnabled,
  isAxisWorkbenchFeatureEnabled
} from '../featureGate';

describe('isAxisWorkbenchFeatureEnabled', () => {
  // Opt-OUT: the workbench shell is the default, '0' is the escape hatch.
  it('is on unless explicitly disabled', () => {
    expect(isAxisWorkbenchFeatureEnabled({})).toBe(true);
    expect(isAxisWorkbenchFeatureEnabled({ VITE_AXIS_WORKBENCH: '1' })).toBe(true);
    expect(isAxisWorkbenchFeatureEnabled({ VITE_AXIS_WORKBENCH: 'yes' })).toBe(true);
    expect(isAxisWorkbenchFeatureEnabled({ VITE_AXIS_WORKBENCH: '0' })).toBe(false);
  });
});

describe('isAxisLayoutEditingEnabled', () => {
  // Opt-IN, the opposite polarity to the shell gate above: the editing surface
  // is retired from the product and only comes back when asked for by name.
  it('is off unless explicitly enabled', () => {
    expect(isAxisLayoutEditingEnabled({})).toBe(false);
    expect(isAxisLayoutEditingEnabled({ VITE_AXIS_LAYOUT_EDIT: '0' })).toBe(false);
    expect(isAxisLayoutEditingEnabled({ VITE_AXIS_LAYOUT_EDIT: 'true' })).toBe(false);
    expect(isAxisLayoutEditingEnabled({ VITE_AXIS_LAYOUT_EDIT: '1' })).toBe(true);
  });
});

describe('isAxisControlArrangeEnabled', () => {
  it('is off unless explicitly enabled', () => {
    expect(isAxisControlArrangeEnabled({})).toBe(false);
    expect(isAxisControlArrangeEnabled({ VITE_AXIS_CONTROL_ARRANGE: '0' })).toBe(false);
    expect(isAxisControlArrangeEnabled({ VITE_AXIS_CONTROL_ARRANGE: 'true' })).toBe(false);
    expect(isAxisControlArrangeEnabled({ VITE_AXIS_CONTROL_ARRANGE: '1' })).toBe(true);
  });
});

describe('the three gates are independent', () => {
  it('does not let one env var move another gate', () => {
    const env = { VITE_AXIS_WORKBENCH: '0', VITE_AXIS_LAYOUT_EDIT: '1' };
    expect(isAxisWorkbenchFeatureEnabled(env)).toBe(false);
    expect(isAxisLayoutEditingEnabled(env)).toBe(true);
    expect(isAxisControlArrangeEnabled(env)).toBe(false);
  });
});
