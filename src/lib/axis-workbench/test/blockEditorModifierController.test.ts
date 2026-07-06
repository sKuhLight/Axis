import { describe, expect, it } from 'vitest';
import { AxisBlockEditorModifierController } from '../blockEditor/blockEditorModifierController';
import {
  axisBlockEditorPanelType,
  axisBlockEditorPartFromPanelType,
  parseAxisBlockEditorPart
} from '../blockEditor/types';

describe('Block editor modifier part types', () => {
  it('parses known parts and falls back for unknown values', () => {
    expect(parseAxisBlockEditorPart('modifier')).toBe('modifier');
    expect(parseAxisBlockEditorPart('full')).toBe('full');
    expect(parseAxisBlockEditorPart('nope')).toBe('full');
    expect(parseAxisBlockEditorPart(undefined, 'modifier')).toBe('modifier');
  });

  it('maps parts to panel types and back', () => {
    expect(axisBlockEditorPanelType('full')).toBe('axis.blockEditor');
    expect(axisBlockEditorPanelType('modifier')).toBe('axis.blockEditor.modifier');
    expect(axisBlockEditorPartFromPanelType('axis.blockEditor')).toBe('full');
    expect(axisBlockEditorPartFromPanelType('axis.blockEditor.modifier')).toBe('modifier');
    expect(axisBlockEditorPartFromPanelType('axis.blockEditor.bogus')).toBe('full');
  });
});

describe('Block editor modifier controller (§1 ownership + §3 target binding)', () => {
  it('starts with no target and no mounted parts', () => {
    const c = new AxisBlockEditorModifierController();
    expect(c.snapshot.target).toBeNull();
    expect(c.snapshot.mountedParts).toBe(0);
    expect(c.modPartMounted).toBe(false);
  });

  it('tracks mounted docked parts for the ownership rule', () => {
    const c = new AxisBlockEditorModifierController();
    const unA = c.registerPart();
    expect(c.modPartMounted).toBe(true);
    expect(c.snapshot.mountedParts).toBe(1);
    const unB = c.registerPart();
    expect(c.snapshot.mountedParts).toBe(2);
    unA();
    expect(c.snapshot.mountedParts).toBe(1);
    expect(c.modPartMounted).toBe(true);
    unB();
    expect(c.snapshot.mountedParts).toBe(0);
    expect(c.modPartMounted).toBe(false);
  });

  it('targets a parameter (design modParam/modBlock) and clears it', () => {
    const c = new AxisBlockEditorModifierController();
    c.targetParameter({ label: 'Gain', block: 'Amp 1', targetEffectId: 106, targetParam: 4, slot: 1 });
    expect(c.snapshot.target).toEqual({ label: 'Gain', block: 'Amp 1', targetEffectId: 106, targetParam: 4, slot: 1 });
    c.clearTarget();
    expect(c.snapshot.target).toBeNull();
  });

  it('notifies subscribers on registration and target changes', () => {
    const c = new AxisBlockEditorModifierController();
    const seen: (number | null)[] = [];
    const un = c.subscribe((s) => seen.push(s.target?.targetParam ?? null));
    expect(seen).toEqual([null]); // immediate snapshot on subscribe
    const unPart = c.registerPart();
    c.targetParameter({ label: 'Level', block: 'Amp 1', targetEffectId: 106, targetParam: 9, slot: 1 });
    expect(seen[seen.length - 1]).toBe(9);
    unPart();
    un();
  });
});
