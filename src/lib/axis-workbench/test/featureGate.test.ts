import { describe, expect, it } from 'vitest';
import { isAxisLayoutEditingEnabled } from '../featureGate';

describe('isAxisLayoutEditingEnabled', () => {
  // Opt-IN: the editing surface is retired from the product and only comes
  // back when asked for by name.
  it('is off unless explicitly enabled', () => {
    expect(isAxisLayoutEditingEnabled({})).toBe(false);
    expect(isAxisLayoutEditingEnabled({ VITE_AXIS_LAYOUT_EDIT: '0' })).toBe(false);
    expect(isAxisLayoutEditingEnabled({ VITE_AXIS_LAYOUT_EDIT: 'true' })).toBe(false);
    expect(isAxisLayoutEditingEnabled({ VITE_AXIS_LAYOUT_EDIT: '1' })).toBe(true);
  });
});
