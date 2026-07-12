import { describe, expect, it } from 'vitest';
import { clampWidgetSize, pickWidgetSize } from '../sizing';

describe('widget sizing policy', () => {
  it('picks the largest size that fits within the widget ceiling', () => {
    expect(pickWidgetSize(180, 'default')).toBe('default');
    expect(pickWidgetSize(100, 'default')).toBe('compact');
    expect(pickWidgetSize(52, 'default')).toBe('mini');
    expect(pickWidgetSize(180, 'compact')).toBe('compact');
  });

  it('clamps requested sizes to a maximum size state', () => {
    expect(clampWidgetSize('default', 'compact')).toBe('compact');
    expect(clampWidgetSize('mini', 'compact')).toBe('mini');
  });
});
