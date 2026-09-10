import { describe, it, expect } from 'vitest';
import { boundTargetKeys, modifierTargetKey, type ModSlotBinding } from './modifierBindings';

describe('modifierBindings', () => {
  it('keys a target by effectId:paramId', () => {
    expect(modifierTargetKey(106, 4)).toBe('106:4');
  });

  it('folds only ACTIVE (source > 0) bindings into the target set', () => {
    const slots: ModSlotBinding[] = [
      { source: 3, targetEffectId: 106, targetParam: 4 },
      { source: 1, targetEffectId: 106, targetParam: 9 },
      { source: 0, targetEffectId: 106, targetParam: 12 }, // cleared — source empty
      { source: 0, targetEffectId: 0, targetParam: 0 } // free slot
    ];
    const bound = boundTargetKeys(slots);
    expect(bound.has('106:4')).toBe(true);
    expect(bound.has('106:9')).toBe(true);
    expect(bound.has('106:12')).toBe(false);
    expect(bound.size).toBe(2);
  });

  it('ignores a non-zero source whose target effectId is empty', () => {
    const bound = boundTargetKeys([{ source: 2, targetEffectId: 0, targetParam: 4 }]);
    expect(bound.size).toBe(0);
  });
});
